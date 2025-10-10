const BaseModel = require('./BaseModel');

class Agente extends BaseModel {
  constructor() {
    super('agentes');
  }

  // Buscar agentes por unidade (para ADMIN)
  async findByUnidade(unidadeId) {
    return await this.db(this.tableName)
      .where('unidade_id', unidadeId)
      .select('*');
  }

  // Buscar agentes por usuário (através das unidades)
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .join('unidades', 'agentes.unidade_id', 'unidades.id')
      .where('unidades.usuario_id', usuarioId)
      .select(
        'agentes.*',
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agente com dados completos (para edição)
  async findByIdComplete(agenteId) {
    const agente = await this.db(this.tableName)
      .leftJoin('unidades', 'agentes.unidade_id', 'unidades.id')
      .where('agentes.id', agenteId)
      .select(
        'agentes.*',
        'unidades.nome as unidade_nome',
        'unidades.usuario_id'
      )
      .first();

    if (!agente) return null;

    // Buscar serviços do agente
    const servicos = await this.db('agente_servicos')
      .join('servicos', 'agente_servicos.servico_id', 'servicos.id')
      .where('agente_servicos.agente_id', agenteId)
      .select('servicos.id', 'servicos.nome');

    // Buscar horários de funcionamento
    const horarios = await this.db('horarios_funcionamento')
      .where('agente_id', agenteId)
      .orderBy('dia_semana')
      .select('*');

    return {
      ...agente,
      servicos_oferecidos: servicos,
      horarios_funcionamento: horarios
    };
  }

  // Buscar agentes com dados calculados (para grid)
  async findWithCalculatedData(usuarioId) {
    const agentes = await this.findByUsuario(usuarioId);
    
    // Para cada agente, calcular dados adicionais
    const agentesComDados = await Promise.all(
      agentes.map(async (agente) => {
        // Contar agendamentos
        const agendamentosCount = await this.db('agendamentos')
          .where('agente_id', agente.id)
          .where('status', 'Aprovado')
          .count('* as total')
          .first();

        // Buscar horários de hoje
        const hoje = new Date().getDay(); // 0=Domingo, 1=Segunda, etc.
        const horariosHoje = await this.db('horarios_funcionamento')
          .where('agente_id', agente.id)
          .where('dia_semana', hoje)
          .where('ativo', true)
          .first();

        // Buscar disponibilidade semanal
        const disponibilidadeSemanal = await this.db('horarios_funcionamento')
          .where('agente_id', agente.id)
          .where('ativo', true)
          .select('dia_semana', 'periodos');

        return {
          ...agente,
          reservations: parseInt(agendamentosCount.total) || 0,
          todayHours: this.formatarHorariosHoje(horariosHoje),
          availability: this.formatarDisponibilidadeSemanal(disponibilidadeSemanal)
        };
      })
    );

    return agentesComDados;
  }

  // Método auxiliar para formatar horários de hoje
  formatarHorariosHoje(horarios) {
    if (!horarios || !horarios.periodos) return 'Não disponível';
    
    const periodos = horarios.periodos;
    return periodos.map(p => `${p.start} - ${p.end}`).join('  ');
  }

  // Método auxiliar para formatar disponibilidade semanal
  formatarDisponibilidadeSemanal(horarios) {
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const disponibilidade = [];

    for (let i = 0; i < 7; i++) {
      const horarioDia = horarios.find(h => h.dia_semana === i);
      disponibilidade.push({
        day: diasSemana[i],
        available: !!horarioDia && horarioDia.periodos.length > 0
      });
    }

    return disponibilidade;
  }

  // Criar agente com transação
  async createWithTransaction(agenteData, servicosIds, horariosData) {
    return await this.db.transaction(async (trx) => {
      // 1. Criar o agente
      const [agenteId] = await trx(this.tableName)
        .insert(agenteData)
        .returning('id');

      const finalAgenteId = agenteId.id || agenteId;

      // 2. Associar serviços
      if (servicosIds && servicosIds.length > 0) {
        const servicosData = servicosIds.map(servicoId => ({
          agente_id: finalAgenteId,
          servico_id: servicoId
        }));
        
        await trx('agente_servicos').insert(servicosData);
      }

      // 3. Criar horários de funcionamento (se agenda personalizada)
      if (agenteData.agenda_personalizada && horariosData && horariosData.length > 0) {
        const horariosFormatados = horariosData.map(horario => ({
          agente_id: finalAgenteId,
          dia_semana: horario.dia_semana,
          periodos: JSON.stringify(horario.periodos),
          ativo: true
        }));
        
        await trx('horarios_funcionamento').insert(horariosFormatados);
      }

      return finalAgenteId;
    });
  }

  // Atualizar agente com transação
  async updateWithTransaction(agenteId, agenteData, servicosIds, horariosData) {
    return await this.db.transaction(async (trx) => {
      // 1. Atualizar dados do agente
      await trx(this.tableName)
        .where('id', agenteId)
        .update(agenteData);

      // 2. Atualizar serviços (remover antigos e inserir novos)
      await trx('agente_servicos').where('agente_id', agenteId).del();
      
      if (servicosIds && servicosIds.length > 0) {
        const servicosData = servicosIds.map(servicoId => ({
          agente_id: agenteId,
          servico_id: servicoId
        }));
        
        await trx('agente_servicos').insert(servicosData);
      }

      // 3. Atualizar horários de funcionamento
      await trx('horarios_funcionamento').where('agente_id', agenteId).del();
      
      if (agenteData.agenda_personalizada && horariosData && horariosData.length > 0) {
        const horariosFormatados = horariosData.map(horario => ({
          agente_id: agenteId,
          dia_semana: horario.dia_semana,
          periodos: JSON.stringify(horario.periodos),
          ativo: true
        }));
        
        await trx('horarios_funcionamento').insert(horariosFormatados);
      }

      return agenteId;
    });
  }
}

module.exports = Agente;

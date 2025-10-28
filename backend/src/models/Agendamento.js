const BaseModel = require('./BaseModel');

class Agendamento extends BaseModel {
  constructor() {
    super('agendamentos');
  }

  // Buscar agendamentos por usuário (através das unidades)
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
      .join('agentes', 'agendamentos.agente_id', 'agentes.id')
      .where('unidades.usuario_id', usuarioId)
      .select(
        'agendamentos.*',
        this.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
        'clientes.telefone as cliente_telefone',
        this.db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome"),
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agendamentos por data
  async findByData(data, usuarioId) {
    return await this.db(this.tableName)
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
      .join('agentes', 'agendamentos.agente_id', 'agentes.id')
      .where('unidades.usuario_id', usuarioId)
      .where('agendamentos.data_agendamento', data)
      .select(
        'agendamentos.*',
        this.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
        'clientes.telefone as cliente_telefone',
        this.db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome"),
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agendamentos por agente
  async findByAgente(agenteId) {
    return await this.db(this.tableName)
      .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .where('agendamentos.agente_id', agenteId)
      .select(
        'agendamentos.*',
        this.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
        'clientes.telefone as cliente_telefone',
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agendamentos por cliente
  async findByCliente(clienteId) {
    return await this.db(this.tableName)
      .join('agentes', 'agendamentos.agente_id', 'agentes.id')
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .where('agendamentos.cliente_id', clienteId)
      .select(
        'agendamentos.*',
        'agentes.nome as agente_nome',
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agendamentos com serviços
  async findWithServicos(id) {
    const agendamento = await this.findById(id);
    if (!agendamento) return null;

    // Buscar serviços do agendamento
    const servicos = await this.db('agendamento_servicos')
      .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
      .where('agendamento_servicos.agendamento_id', id)
      .select(
        'servicos.id',
        'servicos.nome',
        'servicos.preco',
        'servicos.duracao_minutos',
        'agendamento_servicos.preco_aplicado'
      );

    // Buscar extras do agendamento
    const extras = await this.db('agendamento_servicos_extras')
      .join('servicos_extras', 'agendamento_servicos_extras.servico_extra_id', 'servicos_extras.id')
      .where('agendamento_servicos_extras.agendamento_id', id)
      .select(
        'servicos_extras.id',
        'servicos_extras.nome',
        'servicos_extras.preco',
        'servicos_extras.duracao_minutos',
        'agendamento_servicos_extras.preco_aplicado'
      );

    // Buscar dados do cliente
    let cliente = null;
    if (agendamento.cliente_id) {
      cliente = await this.db('clientes')
        .where('id', agendamento.cliente_id)
        .select('id', 'primeiro_nome', 'ultimo_nome', 'telefone')
        .first();

      // Combinar primeiro_nome e ultimo_nome em nome_completo
      if (cliente) {
        cliente.nome_completo = `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();
      }
    }

    // Buscar dados do agente
    let agente = null;
    if (agendamento.agente_id) {
      agente = await this.db('agentes')
        .where('id', agendamento.agente_id)
        .select('id', 'nome', 'email', 'telefone')
        .first();
    }

    // Extrair IDs dos serviços e extras
    const servico_ids = servicos.map(s => s.id);
    const servico_extra_ids = extras.map(e => e.id);

    console.log('🔍 [Agendamento.findWithServicos] agendamento.data_agendamento:', agendamento.data_agendamento);
    console.log('🔍 [Agendamento.findWithServicos] typeof agendamento.data_agendamento:', typeof agendamento.data_agendamento);

    return {
      ...agendamento,
      servicos,
      extras,
      cliente: cliente || {
        nome_completo: agendamento.cliente_nome || '',
        telefone: agendamento.cliente_telefone || ''
      },
      agente: agente || {
        nome: 'Agente não encontrado'
      },
      servico_ids,
      servico_extra_ids
    };
  }

  // Verificar conflito de horário
  async checkConflict(agenteId, data, horaInicio, horaFim, excludeId = null) {
    let query = this.db(this.tableName)
      .where('agente_id', agenteId)
      .where('data_agendamento', data)
      .where('status', '!=', 'Cancelado')
      .where(function() {
        this.where(function() {
          this.where('hora_inicio', '<=', horaInicio)
            .where('hora_fim', '>', horaInicio);
        })
        .orWhere(function() {
          this.where('hora_inicio', '<', horaFim)
            .where('hora_fim', '>=', horaFim);
        })
        .orWhere(function() {
          this.where('hora_inicio', '>=', horaInicio)
            .where('hora_fim', '<=', horaFim);
        });
      });

    if (excludeId) {
      query = query.where('id', '!=', excludeId);
    }

    const conflicts = await query.select('*');
    return conflicts.length > 0;
  }
}

module.exports = Agendamento;

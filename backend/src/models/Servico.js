const BaseModel = require('./BaseModel');

class Servico extends BaseModel {
  constructor() {
    super('servicos');
  }

  // Buscar serviços por usuário
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .leftJoin('categorias_servicos', 'servicos.categoria_id', 'categorias_servicos.id')
      .where('servicos.usuario_id', usuarioId)
      .select(
        'servicos.*',
        'categorias_servicos.nome as categoria_nome'
      );
  }

  // Buscar serviços por usuário com associações (para listagem)
  async findByUsuarioWithAssociations(usuarioId) {
    const servicos = await this.db(this.tableName)
      .leftJoin('categorias_servicos', 'servicos.categoria_id', 'categorias_servicos.id')
      .where('servicos.usuario_id', usuarioId)
      .select(
        'servicos.*',
        'categorias_servicos.nome as categoria_nome'
      )
      .orderBy('servicos.created_at', 'desc');

    // Para cada serviço, buscar agentes e extras associados
    const servicosCompletos = await Promise.all(
      servicos.map(async (servico) => {
        // Buscar agentes associados
        const agentesAssociados = await this.db('agente_servicos')
          .join('agentes', 'agente_servicos.agente_id', 'agentes.id')
          .where('agente_servicos.servico_id', servico.id)
          .select('agentes.id', 'agentes.nome', 'agentes.sobrenome');

        // Buscar extras associados
        const extrasAssociados = await this.db('servico_servicos_extras')
          .join('servicos_extras', 'servico_servicos_extras.servico_extra_id', 'servicos_extras.id')
          .where('servico_servicos_extras.servico_id', servico.id)
          .select('servicos_extras.id', 'servicos_extras.nome');

        return {
          ...servico,
          // Garantir que campos numéricos sejam Numbers
          preco: parseFloat(servico.preco) || 0,
          duracao_minutos: parseInt(servico.duracao_minutos) || 0,
          comissao_percentual: parseFloat(servico.comissao_percentual) || 0,
          agentes_associados: agentesAssociados,
          agentes_atuais_ids: agentesAssociados.map(a => a.id),
          extras_associados: extrasAssociados,
          extras_atuais_ids: extrasAssociados.map(e => e.id)
        };
      })
    );

    return servicosCompletos;
  }

  // Buscar serviços ativos por usuário
  async findActiveByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .leftJoin('categorias_servicos', 'servicos.categoria_id', 'categorias_servicos.id')
      .where('servicos.usuario_id', usuarioId)
      .where('servicos.status', 'Ativo')
      .select(
        'servicos.*',
        'categorias_servicos.nome as categoria_nome'
      );
  }

  // Buscar serviços por categoria
  async findByCategoria(categoriaId, usuarioId) {
    return await this.db(this.tableName)
      .where('categoria_id', categoriaId)
      .where('usuario_id', usuarioId)
      .select('*');
  }

  // Buscar serviços por agente
  async findByAgente(agenteId) {
    return await this.db(this.tableName)
      .join('agente_servicos', 'servicos.id', 'agente_servicos.servico_id')
      .where('agente_servicos.agente_id', agenteId)
      .where('servicos.status', 'Ativo')
      .select('servicos.*');
  }

  // Buscar serviços com estatísticas
  async findWithStats(usuarioId) {
    return await this.db(this.tableName)
      .leftJoin('agendamento_servicos', 'servicos.id', 'agendamento_servicos.servico_id')
      .leftJoin('categorias_servicos', 'servicos.categoria_id', 'categorias_servicos.id')
      .where('servicos.usuario_id', usuarioId)
      .select(
        'servicos.*',
        'categorias_servicos.nome as categoria_nome'
      )
      .count('agendamento_servicos.id as total_agendamentos')
      .sum('agendamento_servicos.preco_aplicado as receita_total')
      .groupBy('servicos.id', 'categorias_servicos.id');
  }

  // Criar serviço com transação (incluindo associações com agentes e extras)
  async createWithTransaction(servicoData, agentesIds, extrasIds) {
    return await this.db.transaction(async (trx) => {
      // 1. Criar o serviço
      const [servicoId] = await trx(this.tableName)
        .insert(servicoData)
        .returning('id');

      const finalServicoId = servicoId.id || servicoId;

      // 2. Associar agentes (se fornecidos)
      if (agentesIds && agentesIds.length > 0) {
        const agentesAssociacoes = agentesIds.map(agenteId => ({
          agente_id: agenteId,
          servico_id: finalServicoId,
          created_at: new Date()
        }));

        await trx('agente_servicos').insert(agentesAssociacoes);
      }

      // 3. Associar serviços extras (se fornecidos)
      if (extrasIds && extrasIds.length > 0) {
        const extrasAssociacoes = extrasIds.map(extraId => ({
          servico_id: finalServicoId,
          servico_extra_id: extraId,
          created_at: new Date()
        }));

        await trx('servico_servicos_extras').insert(extrasAssociacoes);
      }

      return finalServicoId;
    });
  }

  // Buscar serviço com associações completas (para edição)
  async findByIdComplete(servicoId) {
    const servico = await this.db(this.tableName)
      .where('id', servicoId)
      .first();

    if (!servico) return null;

    // Buscar agentes associados
    const agentesAssociados = await this.db('agente_servicos')
      .join('agentes', 'agente_servicos.agente_id', 'agentes.id')
      .where('agente_servicos.servico_id', servicoId)
      .select('agentes.id', 'agentes.nome', 'agentes.sobrenome');

    // Buscar extras associados
    const extrasAssociados = await this.db('servico_servicos_extras')
      .join('servicos_extras', 'servico_servicos_extras.servico_extra_id', 'servicos_extras.id')
      .where('servico_servicos_extras.servico_id', servicoId)
      .select('servicos_extras.id', 'servicos_extras.nome');

    return {
      ...servico,
      // Garantir que campos numéricos sejam Numbers
      preco: parseFloat(servico.preco) || 0,
      duracao_minutos: parseInt(servico.duracao_minutos) || 0,
      comissao_percentual: parseFloat(servico.comissao_percentual) || 0,
      agentes_associados: agentesAssociados,
      agentes_atuais_ids: agentesAssociados.map(a => a.id),
      extras_associados: extrasAssociados,
      extras_atuais_ids: extrasAssociados.map(e => e.id)
    };
  }

  // Atualizar serviço com transação (incluindo associações)
  async updateWithTransaction(servicoId, servicoData, agentesIds, extrasIds) {
    return await this.db.transaction(async (trx) => {
      // 1. Atualizar dados do serviço
      await trx(this.tableName)
        .where('id', servicoId)
        .update({
          ...servicoData,
          updated_at: new Date()
        });

      // 2. Remover associações existentes com agentes
      await trx('agente_servicos')
        .where('servico_id', servicoId)
        .del();

      // 3. Remover associações existentes com extras
      await trx('servico_servicos_extras')
        .where('servico_id', servicoId)
        .del();

      // 4. Criar novas associações com agentes (se fornecidas)
      if (agentesIds && agentesIds.length > 0) {
        const agentesAssociacoes = agentesIds.map(agenteId => ({
          agente_id: agenteId,
          servico_id: servicoId,
          created_at: new Date()
        }));

        await trx('agente_servicos').insert(agentesAssociacoes);
      }

      // 5. Criar novas associações com extras (se fornecidas)
      if (extrasIds && extrasIds.length > 0) {
        const extrasAssociacoes = extrasIds.map(extraId => ({
          servico_id: servicoId,
          servico_extra_id: extraId,
          created_at: new Date()
        }));

        await trx('servico_servicos_extras').insert(extrasAssociacoes);
      }

      return servicoId;
    });
  }
}

module.exports = Servico;

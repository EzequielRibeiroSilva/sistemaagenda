const BaseModel = require('./BaseModel');

class ServicoExtra extends BaseModel {
  constructor() {
    super('servicos_extras');
  }

  // Buscar serviços extras por usuário
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .select('*')
      .orderBy('nome');
  }

  // Buscar serviços extras ativos por usuário (para listas)
  async findActiveByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .where('status', 'Ativo')
      .select('*')
      .orderBy('nome');
  }

  // Buscar serviço extra com serviços conectados (para edição)
  async findByIdComplete(servicoExtraId) {
    const servicoExtra = await this.db(this.tableName)
      .where('id', servicoExtraId)
      .first();

    if (!servicoExtra) return null;

    // Buscar serviços conectados
    const servicosConectados = await this.db('servico_servicos_extras')
      .join('servicos', 'servico_servicos_extras.servico_id', 'servicos.id')
      .where('servico_servicos_extras.servico_extra_id', servicoExtraId)
      .select('servicos.id', 'servicos.nome');

    return {
      ...servicoExtra,
      servicos_conectados: servicosConectados,
      servicos_conectados_ids: servicosConectados.map(s => s.id)
    };
  }

  // Criar serviço extra com transação (incluindo associações)
  async createWithTransaction(servicoExtraData, servicosIds) {
    return await this.db.transaction(async (trx) => {
      // 1. Criar o serviço extra
      const [servicoExtraId] = await trx(this.tableName)
        .insert(servicoExtraData)
        .returning('id');

      const finalServicoExtraId = servicoExtraId.id || servicoExtraId;

      // 2. Associar serviços (se fornecidos)
      if (servicosIds && servicosIds.length > 0) {
        const associacoes = servicosIds.map(servicoId => ({
          servico_extra_id: finalServicoExtraId,
          servico_id: servicoId,
          created_at: new Date()
        }));

        await trx('servico_servicos_extras').insert(associacoes);
      }

      return finalServicoExtraId;
    });
  }

  // Atualizar serviço extra com transação (incluindo associações)
  async updateWithTransaction(servicoExtraId, servicoExtraData, servicosIds) {
    return await this.db.transaction(async (trx) => {
      // 1. Atualizar dados do serviço extra
      await trx(this.tableName)
        .where('id', servicoExtraId)
        .update({
          ...servicoExtraData,
          updated_at: new Date()
        });

      // 2. Remover associações existentes
      await trx('servico_servicos_extras')
        .where('servico_extra_id', servicoExtraId)
        .del();

      // 3. Criar novas associações (se fornecidas)
      if (servicosIds && servicosIds.length > 0) {
        const associacoes = servicosIds.map(servicoId => ({
          servico_extra_id: servicoExtraId,
          servico_id: servicoId,
          created_at: new Date()
        }));

        await trx('servico_servicos_extras').insert(associacoes);
      }

      return servicoExtraId;
    });
  }

  // Buscar serviços extras por serviço principal
  async findByServico(servicoId) {
    return await this.db(this.tableName)
      .join('servico_servicos_extras', 'servicos_extras.id', 'servico_servicos_extras.servico_extra_id')
      .where('servico_servicos_extras.servico_id', servicoId)
      .where('servicos_extras.status', 'Ativo')
      .select('servicos_extras.*');
  }

  // Buscar com estatísticas de uso
  async findWithStats(usuarioId) {
    return await this.db(this.tableName)
      .leftJoin('agendamento_servicos_extras', 'servicos_extras.id', 'agendamento_servicos_extras.servico_extra_id')
      .where('servicos_extras.usuario_id', usuarioId)
      .select(
        'servicos_extras.*'
      )
      .count('agendamento_servicos_extras.id as total_agendamentos')
      .sum('agendamento_servicos_extras.preco_aplicado as receita_total')
      .groupBy('servicos_extras.id');
  }
}

module.exports = ServicoExtra;

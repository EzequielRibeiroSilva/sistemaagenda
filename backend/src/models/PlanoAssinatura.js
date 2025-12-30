const BaseModel = require('./BaseModel');

class PlanoAssinatura extends BaseModel {
  constructor() {
    super('planos_assinatura');
  }

  async findByUsuarioWithClientCount(usuarioId) {
    const planos = await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .orderBy('created_at', 'desc');

    if (!planos || planos.length === 0) return [];

    const planoIds = planos.map(p => p.id);

    const counts = await this.db('clientes')
      .join('unidades', 'clientes.unidade_id', 'unidades.id')
      .where('unidades.usuario_id', usuarioId)
      .whereIn('clientes.assinatura_plano_id', planoIds)
      .groupBy('clientes.assinatura_plano_id')
      .select('clientes.assinatura_plano_id')
      .count('* as total');

    const countByPlanoId = counts.reduce((acc, row) => {
      acc[String(row.assinatura_plano_id)] = parseInt(row.total);
      return acc;
    }, {});

    return planos.map(p => ({
      ...p,
      valor: parseFloat(p.valor) || 0,
      client_count: countByPlanoId[String(p.id)] || 0
    }));
  }

  async findByUnidadeWithClientCount(unidadeId) {
    const planos = await this.db(this.tableName)
      .where('unidade_id', unidadeId)
      .orderBy('created_at', 'desc');

    if (!planos || planos.length === 0) return [];

    const planoIds = planos.map(p => p.id);

    const counts = await this.db('clientes')
      .where('unidade_id', unidadeId)
      .whereIn('assinatura_plano_id', planoIds)
      .groupBy('assinatura_plano_id')
      .select('assinatura_plano_id')
      .count('* as total');

    const countByPlanoId = counts.reduce((acc, row) => {
      acc[String(row.assinatura_plano_id)] = parseInt(row.total);
      return acc;
    }, {});

    return planos.map(p => ({
      ...p,
      valor: parseFloat(p.valor) || 0,
      client_count: countByPlanoId[String(p.id)] || 0
    }));
  }

  async findItens(planoId) {
    const itens = await this.db('planos_assinatura_itens')
      .where('plano_id', planoId)
      .orderBy('id', 'asc');

    return itens.map(i => ({
      ...i,
      quantidade_por_ciclo: i.quantidade_por_ciclo === null || i.quantidade_por_ciclo === undefined
        ? null
        : parseInt(i.quantidade_por_ciclo)
    }));
  }

  async replaceItens(planoId, itens, trx = null) {
    const db = trx || this.db;

    await db('planos_assinatura_itens').where('plano_id', planoId).del();

    if (!Array.isArray(itens) || itens.length === 0) return;

    const payload = itens.map(item => ({
      plano_id: planoId,
      tipo: item.tipo,
      servico_id: item.servico_id || null,
      servico_extra_id: item.servico_extra_id || null,
      quantidade_por_ciclo: item.quantidade_por_ciclo === undefined ? null : item.quantidade_por_ciclo,
      created_at: new Date(),
      updated_at: new Date()
    }));

    await db('planos_assinatura_itens').insert(payload);
  }
}

module.exports = PlanoAssinatura;

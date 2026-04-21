const logger = require('../utils/logger');
const InventoryService = require('./InventoryService');

class AgendamentoConclusaoService {
  constructor({ db }) {
    this.db = db;
    this.inventoryService = new InventoryService(db);
  }

  async reconcileEstoque({ agendamentoId, triggeredByUserId, trx: trxExternal }) {
    const agendamentoIdNum = parseInt(agendamentoId, 10);
    if (!Number.isFinite(agendamentoIdNum)) {
      const err = new Error('agendamentoId inválido');
      err.code = 'INVALID_AGENDAMENTO_ID';
      throw err;
    }

    const run = async (trx) => {
      await trx('agendamentos')
        .where('id', agendamentoIdNum)
        .forUpdate()
        .select('id')
        .first();

      const agendamento = await trx('agendamentos')
        .where('id', agendamentoIdNum)
        .select('id', 'unidade_id', 'cliente_id', 'status')
        .first();

      if (!agendamento) {
        const err = new Error('Agendamento não encontrado');
        err.code = 'AGENDAMENTO_NOT_FOUND';
        throw err;
      }

      const unidade = await trx('unidades')
        .where('id', agendamento.unidade_id)
        .select('id', 'usuario_id')
        .first();

      if (!unidade?.usuario_id) {
        const err = new Error('Unidade inválida');
        err.code = 'UNIDADE_INVALID';
        throw err;
      }

      // Desejado: se não estiver concluído => consumo desejado = 0
      const desiredRows = agendamento.status === 'Concluído'
        ? await trx('agendamento_servicos as ags')
          .join('servico_insumos as si', 'ags.servico_id', 'si.servico_id')
          .join('produtos as p', 'si.produto_id', 'p.id')
          .where('ags.agendamento_id', agendamentoIdNum)
          .where('p.usuario_id', unidade.usuario_id)
          .whereNull('p.deleted_at')
          .groupBy('si.produto_id')
          .select('si.produto_id')
          .sum({ quantidade_total: 'si.quantidade' })
        : [];

      const desiredByProduto = new Map();
      for (const row of desiredRows) {
        const produtoId = Number(row?.produto_id);
        const qtd = Number(row?.quantidade_total);
        if (!Number.isFinite(produtoId) || !Number.isFinite(qtd) || qtd <= 0) continue;
        desiredByProduto.set(produtoId, Number(qtd.toFixed(3)));
      }

      const currentRows = await trx('estoque_movimentacoes')
        .where('origem_id', String(agendamentoIdNum))
        .whereIn('tipo', ['CONSUMO', 'ESTORNO'])
        .groupBy('produto_id')
        .select('produto_id')
        .sum({ consumo_total: trx.raw("CASE WHEN tipo = 'CONSUMO' THEN quantidade ELSE 0 END") })
        .sum({ estorno_total: trx.raw("CASE WHEN tipo = 'ESTORNO' THEN quantidade ELSE 0 END") });

      const currentNetByProduto = new Map();
      for (const row of currentRows) {
        const produtoId = Number(row?.produto_id);
        const consumo = Number(row?.consumo_total);
        const estorno = Number(row?.estorno_total);
        if (!Number.isFinite(produtoId)) continue;
        const net = Number(((Number.isFinite(consumo) ? consumo : 0) - (Number.isFinite(estorno) ? estorno : 0)).toFixed(3));
        currentNetByProduto.set(produtoId, net);
      }

      const allProdutoIds = new Set([...
        Array.from(desiredByProduto.keys()),
        ...Array.from(currentNetByProduto.keys())
      ]);

      const movimentos = [];
      for (const produtoId of allProdutoIds) {
        const desired = desiredByProduto.get(produtoId) || 0;
        const currentNet = currentNetByProduto.get(produtoId) || 0;
        const delta = Number((desired - currentNet).toFixed(3));

        if (!Number.isFinite(delta) || delta === 0) continue;

        const tipo = delta > 0 ? 'CONSUMO' : 'ESTORNO';
        const quantidade = Math.abs(delta);
        const motivo = tipo === 'CONSUMO'
          ? `CONSUMO AUTOMÁTICO - Agendamento ${agendamentoIdNum}`
          : `ESTORNO AUTOMÁTICO - Agendamento ${agendamentoIdNum}`;

        const mov = await this.inventoryService.movimentarEstoque({
          usuario_id: unidade.usuario_id,
          unidade_id: agendamento.unidade_id,
          produto_id: Number(produtoId),
          tipo,
          quantidade,
          motivo,
          origem_id: String(agendamentoIdNum),
          created_by: triggeredByUserId || null,
          trx
        });

        movimentos.push(mov);
      }

      logger.log(`✅ [AgendamentoConclusaoService] Reconciliação de estoque concluída: agendamento_id=${agendamentoIdNum}, movimentos=${movimentos.length}`);

      return { ok: true, movimentos };
    };

    if (trxExternal) {
      return await run(trxExternal);
    }

    return await this.db.transaction(run);
  }

  async handleConcluido({ agendamentoId, triggeredByUserId, trx }) {
    return await this.reconcileEstoque({ agendamentoId, triggeredByUserId, trx });
  }

  async scheduleConviteRetorno({ agendamentoId }) {
    const agendamentoIdNum = parseInt(agendamentoId, 10);
    if (!Number.isFinite(agendamentoIdNum)) {
      return;
    }

    const agendamento = await this.db('agendamentos')
      .where('id', agendamentoIdNum)
      .select('id', 'unidade_id', 'cliente_id')
      .first();

    if (!agendamento) return;

    const servicosElegiveis = await this.db('agendamento_servicos as ags')
      .join('servicos as s', 'ags.servico_id', 's.id')
      .where('ags.agendamento_id', agendamentoIdNum)
      .where('s.convite_retorno_ativo', true)
      .whereNotNull('s.convite_retorno_dias')
      .select('s.id', 's.nome', 's.convite_retorno_dias');

    if (!servicosElegiveis || servicosElegiveis.length === 0) return;

    const diasMin = servicosElegiveis
      .map(s => parseInt(s.convite_retorno_dias, 10))
      .filter(n => !Number.isNaN(n) && n > 0)
      .sort((a, b) => a - b)[0];

    if (!diasMin) return;

    const cliente = await this.db('clientes')
      .where('id', agendamento.cliente_id)
      .select('telefone')
      .first();

    if (!cliente?.telefone) return;

    const enviarEm = new Date();
    enviarEm.setDate(enviarEm.getDate() + diasMin);
    enviarEm.setHours(10, 0, 0, 0);

    try {
      await this.db('lembretes_enviados')
        .insert({
          agendamento_id: agendamentoIdNum,
          unidade_id: agendamento.unidade_id,
          tipo_lembrete: null,
          tipo_notificacao: 'convite_retorno',
          status: 'programado',
          telefone_destino: cliente.telefone,
          enviar_em: enviarEm,
          tentativas: 0,
          created_at: this.db.fn.now(),
          updated_at: this.db.fn.now()
        });
    } catch (error) {
      if (error && (error.code === '23505' || error.constraint === 'uk_lembretes_agendamento_tipo_notificacao')) {
        return;
      }
      throw error;
    }
  }
}

module.exports = AgendamentoConclusaoService;

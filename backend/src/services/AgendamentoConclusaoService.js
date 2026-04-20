const logger = require('../utils/logger');
const InventoryService = require('./InventoryService');

class AgendamentoConclusaoService {
  constructor({ db }) {
    this.db = db;
    this.inventoryService = new InventoryService(db);
  }

  async handleConcluido({ agendamentoId, triggeredByUserId }) {
    const agendamentoIdNum = parseInt(agendamentoId, 10);
    if (!Number.isFinite(agendamentoIdNum)) {
      const err = new Error('agendamentoId inválido');
      err.code = 'INVALID_AGENDAMENTO_ID';
      throw err;
    }

    return await this.db.transaction(async (trx) => {
      const agendamento = await trx('agendamentos')
        .where('id', agendamentoIdNum)
        .select('id', 'unidade_id', 'cliente_id', 'status')
        .first();

      if (!agendamento) {
        const err = new Error('Agendamento não encontrado');
        err.code = 'AGENDAMENTO_NOT_FOUND';
        throw err;
      }

      if (agendamento.status !== 'Concluído') {
        return { ok: true, skipped: true };
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

      const insumosConsolidados = await trx('agendamento_servicos as ags')
        .join('servico_insumos as si', 'ags.servico_id', 'si.servico_id')
        .join('produtos as p', 'si.produto_id', 'p.id')
        .where('ags.agendamento_id', agendamentoIdNum)
        .where('p.usuario_id', unidade.usuario_id)
        .groupBy('si.produto_id')
        .select('si.produto_id')
        .sum({ quantidade_total: 'si.quantidade' });

      if (!insumosConsolidados || insumosConsolidados.length === 0) {
        return { ok: true, skipped: true };
      }

      const movimentos = [];
      for (const row of insumosConsolidados) {
        const produtoId = Number(row.produto_id);
        const quantidadeTotal = Number(row.quantidade_total);

        if (!Number.isFinite(produtoId) || !Number.isFinite(quantidadeTotal) || quantidadeTotal <= 0) {
          continue;
        }

        try {
          const mov = await this.inventoryService.movimentarEstoque({
            usuario_id: unidade.usuario_id,
            unidade_id: agendamento.unidade_id,
            produto_id: produtoId,
            tipo: 'CONSUMO',
            quantidade: quantidadeTotal,
            motivo: `CONSUMO AUTOMÁTICO - Agendamento ${agendamentoIdNum}`,
            origem_id: String(agendamentoIdNum),
            created_by: triggeredByUserId || null,
            trx
          });

          movimentos.push(mov);
        } catch (error) {
          if (error && error.code === '23505') {
            logger.log(`♻️ [AgendamentoConclusaoService] Consumo já registrado (idempotente): agendamento_id=${agendamentoIdNum}, produto_id=${produtoId}`);
            continue;
          }
          throw error;
        }
      }

      logger.log(`✅ [AgendamentoConclusaoService] Baixa automática concluída: agendamento_id=${agendamentoIdNum}, itens=${movimentos.length}`);

      return {
        ok: true,
        skipped: false,
        movimentos
      };
    });
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

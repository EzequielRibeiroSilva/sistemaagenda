const logger = require('../utils/logger');

class InventoryService {
  constructor(db) {
    this.db = db;
  }

  // Ledger é sagrado: este service é append-only para estoque_movimentacoes.
  // Não implemente métodos de update/delete para o ledger.

  /**
   * movimentarEstoque
   * Regra: SEMPRE transacional.
   *
   * @param {Object} params
   * @param {number} params.usuario_id
   * @param {number} params.unidade_id
   * @param {number} params.produto_id
   * @param {'ENTRADA'|'SAIDA'|'AJUSTE'|'CONSUMO'|'ESTORNO'} params.tipo
   * @param {number|string} params.quantidade
   * @param {string} [params.motivo]
   * @param {string} [params.origem_id] UUID
   * @param {number|null} [params.created_by]
   * @param {any} [params.trx] transação externa opcional (knex transaction)
   * @returns {Promise<{ movimentacao: any, saldo_atual: number }>} 
   */
  async movimentarEstoque(params) {
    const {
      usuario_id,
      unidade_id,
      produto_id,
      tipo,
      quantidade,
      motivo,
      origem_id,
      created_by,
      trx: trxExternal
    } = params;

    if (!usuario_id || !unidade_id || !produto_id) {
      const err = new Error('Parâmetros obrigatórios ausentes');
      err.code = 'INVALID_PARAMS';
      throw err;
    }

    if (!['ENTRADA', 'SAIDA', 'AJUSTE', 'CONSUMO', 'ESTORNO'].includes(tipo)) {
      const err = new Error('Tipo de movimentação inválido');
      err.code = 'INVALID_TIPO';
      throw err;
    }

    const qty = Number(quantidade);
    if (Number.isNaN(qty) || qty <= 0) {
      const err = new Error('Quantidade inválida');
      err.code = 'INVALID_QUANTIDADE';
      throw err;
    }

    const delta = (tipo === 'ENTRADA' || tipo === 'ESTORNO') ? qty : -qty;

    const run = async (trx) => {
      // 1) Segurança multi-tenant: produto precisa pertencer ao usuario_id
      const produto = await trx('produtos')
        .where({ id: produto_id, usuario_id })
        .select('id')
        .first();

      if (!produto) {
        const err = new Error('Produto não encontrado ou acesso negado');
        err.code = 'PRODUTO_NOT_FOUND';
        throw err;
      }

      // 2) Segurança multi-tenant: unidade precisa pertencer ao usuario_id
      const unidade = await trx('unidades')
        .where({ id: unidade_id, usuario_id })
        .select('id')
        .first();

      if (!unidade) {
        const err = new Error('Unidade não encontrada ou acesso negado');
        err.code = 'UNIDADE_NOT_FOUND';
        throw err;
      }

      // 3) Garantir existência do snapshot (idempotente)
      await trx('estoque_unidades')
        .insert({
          produto_id,
          unidade_id,
          saldo_atual: 0,
          estoque_minimo: null,
          estoque_maximo: null
        })
        .onConflict(['produto_id', 'unidade_id'])
        .ignore();

      // 4) Atualizar snapshot de saldo (com lock otimista via update)
      // Observação: Para alta concorrência, ideal é SELECT ... FOR UPDATE, mas Knex tem suporte via .forUpdate().
      const snapshotBefore = await trx('estoque_unidades')
        .where({ produto_id, unidade_id })
        .forUpdate()
        .select('saldo_atual')
        .first();

      const saldoAntes = snapshotBefore ? Number(snapshotBefore.saldo_atual) : 0;
      const saldoDepois = Number((saldoAntes + delta).toFixed(3));

      if (saldoDepois < 0) {
        const err = new Error('Saldo insuficiente para esta movimentação');
        err.code = 'SALDO_INSUFICIENTE';
        err.details = { saldoAntes, delta };
        throw err;
      }

      await trx('estoque_unidades')
        .where({ produto_id, unidade_id })
        .update({
          saldo_atual: saldoDepois
        });

      // 5) Registrar no ledger (imutável)
      const [movRow] = await trx('estoque_movimentacoes')
        .insert({
          usuario_id,
          unidade_id,
          produto_id,
          tipo,
          quantidade: qty,
          motivo: motivo || null,
          origem_id: origem_id || null,
          created_by: created_by || null,
          created_at: new Date()
        })
        .returning('*');

      const movimentacao = movRow || null;

      logger.log(`📦 [InventoryService] Movimentação registrada: produto_id=${produto_id}, unidade_id=${unidade_id}, tipo=${tipo}, qty=${qty}, saldo=${saldoDepois}`);

      return {
        movimentacao,
        saldo_atual: saldoDepois
      };
    };

    if (trxExternal) {
      return await run(trxExternal);
    }

    return await this.db.transaction(run);
  }
}

module.exports = InventoryService;

/**
 * Migration: Adicionar índice composto de idempotência para estoque_movimentacoes
 * Task 2.1 - Protocolo de Auditoria Tally (Elite)
 *
 * Este índice otimiza as verificações de duplicidade (idempotência) no ledger de movimentações.
 * A ordem dos campos segue o padrão de busca mais restritivo → menos restritivo (B-Tree optimization).
 *
 * Query alvo (InventoryService.js, linha ~446):
 * ```
 * SELECT id, quantidade FROM estoque_movimentacoes
 * WHERE usuario_id = ? AND unidade_id = ? AND produto_id = ? AND tipo = ? AND origem_id = ?
 * ```
 *
 * Performance esperada:
 * - Antes: O(n) - full table scan em milhões de registros (~5-10s)
 * - Depois: O(log n) - busca indexada (~5-50ms)
 */

exports.up = function (knex) {
  return knex.schema.alterTable('estoque_movimentacoes', function (table) {
    table.index(
      ['usuario_id', 'unidade_id', 'produto_id', 'tipo', 'origem_id'],
      'idx_est_mov_idempotency'
    );
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('estoque_movimentacoes', function (table) {
    table.dropIndex(
      ['usuario_id', 'unidade_id', 'produto_id', 'tipo', 'origem_id'],
      'idx_est_mov_idempotency'
    );
  });
};

/**
 * Migration: adicionar preco_unitario_entrada ao ledger estoque_movimentacoes
 */

exports.up = function (knex) {
  return knex.schema.alterTable('estoque_movimentacoes', function (table) {
    table.decimal('preco_unitario_entrada', 14, 6).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('estoque_movimentacoes', function (table) {
    table.dropColumn('preco_unitario_entrada');
  });
};

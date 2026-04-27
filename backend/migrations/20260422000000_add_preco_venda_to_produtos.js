/**
 * Migration: Adicionar preco_venda em produtos
 */

exports.up = function (knex) {
  return knex.schema.alterTable('produtos', function (table) {
    table.decimal('preco_venda', 10, 2).notNullable().defaultTo(0.0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('produtos', function (table) {
    table.dropColumn('preco_venda');
  });
};

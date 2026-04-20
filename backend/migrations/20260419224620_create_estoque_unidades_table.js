/**
 * Migration: Criar tabela estoque_unidades (snapshot de saldo por unidade)
 * Sprint 1 - Estoque ELITE
 *
 * Esta tabela mantém o saldo atual por (produto_id, unidade_id) para performance.
 */

exports.up = function (knex) {
  return knex.schema.createTable('estoque_unidades', function (table) {
    table.increments('id').primary();

    table
      .integer('produto_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('produtos')
      .onDelete('CASCADE');

    table
      .integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE');

    table.decimal('saldo_atual', 14, 3).notNullable().defaultTo(0);
    table.decimal('estoque_minimo', 14, 3).nullable();
    table.decimal('estoque_maximo', 14, 3).nullable();

    // Constraint única para garantir 1 snapshot por produto+unidade
    table.unique(['produto_id', 'unidade_id'], 'uk_estoque_unidades_produto_unidade');

    // Índices para filtros comuns
    table.index(['unidade_id'], 'idx_estoque_unidades_unidade');
    table.index(['produto_id'], 'idx_estoque_unidades_produto');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('estoque_unidades');
};

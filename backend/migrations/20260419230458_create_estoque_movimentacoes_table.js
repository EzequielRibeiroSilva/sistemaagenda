/**
 * Migration: Criar tabela estoque_movimentacoes (ledger imutável)
 * Sprint 2 - Estoque ELITE
 */

exports.up = function (knex) {
  return knex.schema.createTable('estoque_movimentacoes', function (table) {
    table.increments('id').primary();

    table
      .integer('usuario_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('CASCADE');

    table
      .integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE');

    table
      .integer('produto_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('produtos')
      .onDelete('CASCADE');

    table
      .enu('tipo', ['ENTRADA', 'SAIDA', 'AJUSTE', 'CONSUMO', 'ESTORNO'])
      .notNullable();

    table.decimal('quantidade', 14, 3).notNullable();

    table.string('motivo', 255).nullable();

    // UUID para linkar com agendamento/compra etc no futuro
    table.uuid('origem_id').nullable();

    table
      .integer('created_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('SET NULL');

    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    // Índices para consulta rápida
    table.index(['usuario_id', 'created_at'], 'idx_est_mov_usuario_data');
    table.index(['unidade_id', 'created_at'], 'idx_est_mov_unidade_data');
    table.index(['produto_id', 'created_at'], 'idx_est_mov_produto_data');
    table.index(['tipo', 'created_at'], 'idx_est_mov_tipo_data');
    table.index(['origem_id'], 'idx_est_mov_origem');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('estoque_movimentacoes');
};

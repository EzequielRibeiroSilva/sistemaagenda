/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('venda_pagamentos', function (table) {
    table.increments('id').primary();

    table
      .integer('venda_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('vendas')
      .onDelete('CASCADE');

    table.string('metodo', 50).notNullable();

    table.decimal('valor', 10, 2).notNullable();

    table
      .enu('status', ['PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'CANCELLED'])
      .notNullable()
      .defaultTo('CAPTURED');

    table.string('provider', 50).nullable();
    table.string('transaction_reference', 120).nullable();

    table.timestamp('paid_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index(['venda_id'], 'idx_venda_pagamentos_venda');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('venda_pagamentos');
};

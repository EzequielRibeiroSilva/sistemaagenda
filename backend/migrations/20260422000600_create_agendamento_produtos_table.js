/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('agendamento_produtos', function (table) {
    table.increments('id').primary();

    table
      .integer('agendamento_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('agendamentos')
      .onDelete('CASCADE');

    table
      .integer('produto_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('produtos')
      .onDelete('RESTRICT');

    table.decimal('quantidade', 14, 3).notNullable().defaultTo(1);

    table.decimal('preco_aplicado', 10, 2).notNullable().defaultTo(0);

    table
      .integer('agente_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('agentes')
      .onDelete('SET NULL');

    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index(['agendamento_id'], 'idx_agendamento_produtos_agendamento');
    table.index(['produto_id'], 'idx_agendamento_produtos_produto');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('agendamento_produtos');
};

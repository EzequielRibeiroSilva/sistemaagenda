/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('agendamentos', function (table) {
    table
      .integer('venda_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('vendas')
      .onDelete('SET NULL');
  });

  await knex.schema.alterTable('agendamentos', function (table) {
    table.index(['venda_id'], 'idx_agendamentos_venda_id');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('agendamentos', function (table) {
    table.dropIndex(['venda_id'], 'idx_agendamentos_venda_id');
    table.dropColumn('venda_id');
  });
};

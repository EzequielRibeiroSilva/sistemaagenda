/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('venda_itens', function (table) {
    table.decimal('preco_custo_medio_snapshot', 10, 2).notNullable().defaultTo(0);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('venda_itens', function (table) {
    table.dropColumn('preco_custo_medio_snapshot');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('servicos', (table) => {
    table.boolean('exige_sinal').notNullable().defaultTo(false);
    table.decimal('valor_sinal', 10, 2).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('servicos', (table) => {
    table.dropColumn('valor_sinal');
    table.dropColumn('exige_sinal');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('agendamento_servicos', function(table) {
    table.text('observacao_pagamento');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('agendamento_servicos', function(table) {
    table.dropColumn('observacao_pagamento');
  });
};

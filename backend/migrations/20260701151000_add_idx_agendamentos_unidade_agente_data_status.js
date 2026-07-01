/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('agendamentos', function(table) {
    table.index(
      ['unidade_id', 'agente_id', 'data_agendamento', 'status'],
      'idx_agendamentos_unidade_agente_data_status'
    );
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('agendamentos', function(table) {
    table.dropIndex(
      ['unidade_id', 'agente_id', 'data_agendamento', 'status'],
      'idx_agendamentos_unidade_agente_data_status'
    );
  });
};

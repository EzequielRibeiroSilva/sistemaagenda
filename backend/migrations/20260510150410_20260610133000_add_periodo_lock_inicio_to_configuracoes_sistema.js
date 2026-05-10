/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('configuracoes_sistema', function(table) {
    if (!table) return;
    table.date('periodo_lock_inicio').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('configuracoes_sistema', function(table) {
    table.dropColumn('periodo_lock_inicio');
  });
};

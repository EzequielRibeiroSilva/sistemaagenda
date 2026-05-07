/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('servicos', function(table) {
    table.timestamp('deleted_at').nullable();
    table.index(['usuario_id', 'deleted_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('servicos', function(table) {
    table.dropIndex(['usuario_id', 'deleted_at']);
    table.dropColumn('deleted_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('usuarios', function(table) {
    // Adicionar coluna role com valores MASTER, ADMIN, AGENTE
    table.enu('role', ['MASTER', 'ADMIN', 'AGENTE']).nullable();

    // Adicionar coluna unidade_id para ligar usuários às unidades
    table.integer('unidade_id').unsigned().nullable();
    table.foreign('unidade_id').references('id').inTable('unidades').onDelete('SET NULL');

    // Adicionar índices para performance
    table.index('role');
    table.index('unidade_id');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('usuarios', function(table) {
    table.dropForeign('unidade_id');
    table.dropIndex('role');
    table.dropIndex('unidade_id');
    table.dropColumn('role');
    table.dropColumn('unidade_id');
  });
};

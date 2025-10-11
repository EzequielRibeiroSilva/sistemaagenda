/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('servicos_extras', function(table) {
    // Adicionar campos que faltam
    table.text('descricao').nullable();
    table.enu('status', ['Ativo', 'Inativo']).defaultTo('Ativo');
    
    // Índices para performance
    table.index('status');
    table.index(['usuario_id', 'status']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('servicos_extras', function(table) {
    table.dropColumn('descricao');
    table.dropColumn('status');
  });
};

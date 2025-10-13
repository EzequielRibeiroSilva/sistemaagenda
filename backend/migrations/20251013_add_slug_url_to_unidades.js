/**
 * Migração: Adicionar campo slug_url na tabela unidades
 * 
 * Adiciona campo slug_url para URLs amigáveis de agendamento
 * Formato: /Barbearia-Dudu/booking/40
 * 
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = function(knex) {
  return knex.schema.alterTable('unidades', function(table) {
    // Adicionar campo slug_url (único e nullable inicialmente)
    table.string('slug_url', 255).nullable().unique();
    
    // Adicionar índice para performance
    table.index('slug_url');
  });
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = function(knex) {
  return knex.schema.alterTable('unidades', function(table) {
    table.dropIndex('slug_url');
    table.dropColumn('slug_url');
  });
};

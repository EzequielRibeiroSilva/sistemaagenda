/**
 * Migration: Adicionar coluna slug_url na tabela unidades
 * Data: 03/12/2025
 * Descrição: Adiciona campo slug_url para gerar links de booking personalizados
 */

exports.up = function(knex) {
  return knex.schema.table('unidades', function(table) {
    // Adicionar coluna slug_url (URL amigável para booking)
    table.string('slug_url', 255).nullable();
    
    // Adicionar índice para busca rápida por slug
    table.index('slug_url');
  });
};

exports.down = function(knex) {
  return knex.schema.table('unidades', function(table) {
    // Remover índice
    table.dropIndex('slug_url');
    
    // Remover coluna
    table.dropColumn('slug_url');
  });
};

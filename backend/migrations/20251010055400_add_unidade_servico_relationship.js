/**
 * Migração para adicionar relacionamento entre Unidades e Serviços
 * Adiciona campo unidade_id na tabela servicos para relacionamento N:1
 * Permite que serviços sejam associados a unidades específicas
 */

exports.up = function(knex) {
  return knex.schema.alterTable('servicos', function(table) {
    // Adicionar campo unidade_id (nullable para permitir serviços sem unidade)
    table.integer('unidade_id').unsigned().nullable();
    
    // Adicionar foreign key constraint
    table.foreign('unidade_id').references('id').inTable('unidades').onDelete('SET NULL');
    
    // Adicionar índice para performance
    table.index('unidade_id');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('servicos', function(table) {
    // Remover foreign key constraint
    table.dropForeign('unidade_id');
    
    // Remover índice
    table.dropIndex('unidade_id');
    
    // Remover coluna
    table.dropColumn('unidade_id');
  });
};

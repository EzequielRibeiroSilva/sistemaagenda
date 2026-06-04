/**
 * Migration: Adicionar flag de controle da IA por usuário
 * Feature: SaaS - Controle de ativação da Recepcionista IA por plano/usuário
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('usuarios', function(table) {
    // Adicionar coluna ia_enabled (boolean, default true, not null)
    // Default TRUE para retrocompatibilidade (usuários existentes mantêm IA ativa)
    table.boolean('ia_enabled').notNullable().defaultTo(true);
    
    // Criar índice para performance (Worker consulta esta flag frequentemente)
    table.index('ia_enabled', 'idx_usuarios_ia_enabled');
  });
};

/**
 * Reverter migration: Remover coluna e índice
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('usuarios', function(table) {
    // Remover índice primeiro (ordem inversa)
    table.dropIndex('ia_enabled', 'idx_usuarios_ia_enabled');
    
    // Remover coluna
    table.dropColumn('ia_enabled');
  });
};

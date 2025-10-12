/**
 * Migration: Remover campo email da tabela clientes
 * Data: 2025-10-12
 * Descrição: Remove completamente o campo email da entidade clientes
 * Justificativa: Clientes não precisam de email - comunicação será 100% via WhatsApp
 */

exports.up = function(knex) {
  return knex.schema.alterTable('clientes', function(table) {
    // Remove a coluna email da tabela clientes
    table.dropColumn('email');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('clientes', function(table) {
    // Rollback: Adiciona novamente a coluna email (caso necessário)
    table.string('email').nullable();
  });
};

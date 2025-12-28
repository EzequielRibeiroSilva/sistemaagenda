/**
 * Migration: Adicionar campos de Convite de Retorno na tabela servicos
 * Descrição: Permite configurar envio de convite de retorno por serviço (toggle + dias)
 * Data: 2025-12-28
 */

exports.up = function(knex) {
  return knex.schema.alterTable('servicos', function(table) {
    table.boolean('convite_retorno_ativo').notNullable().defaultTo(false);
    table.integer('convite_retorno_dias').nullable();

    table.index('convite_retorno_ativo', 'idx_servicos_convite_retorno_ativo');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('servicos', function(table) {
    table.dropIndex('convite_retorno_ativo', 'idx_servicos_convite_retorno_ativo');
    table.dropColumn('convite_retorno_dias');
    table.dropColumn('convite_retorno_ativo');
  });
};

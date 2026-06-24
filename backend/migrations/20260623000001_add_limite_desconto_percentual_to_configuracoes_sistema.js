/**
 * Migration: Adicionar limite de desconto percentual à tabela configuracoes_sistema
 * Descrição: Adiciona campo para controlar o percentual máximo de desconto permitido usando pontos
 * Data: 2026-06-23
 */

exports.up = function(knex) {
  return knex.schema.table('configuracoes_sistema', function(table) {
    // Limite de desconto percentual - controla quantos % do valor pode ser pago com pontos
    table.decimal('limite_desconto_percentual', 5, 2).defaultTo(100.00).comment('Percentual máximo do valor do serviço que pode ser pago com pontos (0-100%)');
  });
};

exports.down = function(knex) {
  return knex.schema.table('configuracoes_sistema', function(table) {
    table.dropColumn('limite_desconto_percentual');
  });
};
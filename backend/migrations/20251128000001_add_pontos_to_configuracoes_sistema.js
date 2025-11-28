/**
 * Migration: Adicionar campos de pontos à tabela configuracoes_sistema
 * Descrição: Adiciona configurações do sistema de pontos e descontos
 * Data: 2025-11-28
 */

exports.up = function(knex) {
  return knex.schema.table('configuracoes_sistema', function(table) {
    // Sistema de Pontos - Ativação
    table.boolean('pontos_ativo').defaultTo(false).comment('Sistema de pontos ativado/desativado');
    
    // Regra de Ganho: "A cada R$ 1,00 gasto, o cliente ganha X pontos"
    table.decimal('pontos_por_real', 10, 2).defaultTo(1.00).comment('Quantos pontos o cliente ganha a cada R$ 1,00 gasto');
    
    // Regra de Queima: "A cada X pontos, o cliente ganha R$ 1,00 de desconto"
    table.decimal('reais_por_pontos', 10, 2).defaultTo(10.00).comment('Quantos pontos são necessários para gerar R$ 1,00 de desconto');
    
    // Validade dos pontos (em meses)
    table.integer('pontos_validade_meses').defaultTo(12).comment('Validade dos pontos em meses (padrão: 12 meses)');
  });
};

exports.down = function(knex) {
  return knex.schema.table('configuracoes_sistema', function(table) {
    table.dropColumn('pontos_ativo');
    table.dropColumn('pontos_por_real');
    table.dropColumn('reais_por_pontos');
    table.dropColumn('pontos_validade_meses');
  });
};

/**
 * Migration: Adicionar coluna saldo_pontos materializado na tabela clientes
 * 
 * CONTEXTO - AÇÃO 3.1: MATERIALIZAÇÃO DE SALDO
 * - Eliminar gargalo de performance do SUM() em tempo real
 * - Materializar saldo de pontos diretamente na tabela clientes
 * - Saldo será atualizado transacionalmente em cada INSERT em pontos_historico
 * 
 * ESTRATÉGIA:
 * - Coluna saldo_pontos (INTEGER, NOT NULL, DEFAULT 0)
 * - Índice para otimizar queries de filtro por saldo
 * - Script de sincronização inicial rodará o SUM() uma última vez
 */

exports.up = function(knex) {
  return knex.schema.table('clientes', function(table) {
    table.integer('saldo_pontos')
      .notNullable()
      .defaultTo(0)
      .comment('Saldo materializado de pontos disponíveis (atualizado transacionalmente)');
    
    table.index('saldo_pontos', 'idx_clientes_saldo_pontos');
  });
};

exports.down = function(knex) {
  return knex.schema.table('clientes', function(table) {
    table.dropIndex('saldo_pontos', 'idx_clientes_saldo_pontos');
    table.dropColumn('saldo_pontos');
  });
};

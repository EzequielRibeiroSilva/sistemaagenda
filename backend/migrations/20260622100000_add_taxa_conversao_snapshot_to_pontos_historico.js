/**
 * Migration: Adiciona snapshot da taxa de conversão no histórico de pontos
 * 
 * CONTEXTO:
 * - Blindar cliente contra alterações futuras de configuração
 * - Garantir imutabilidade do valor nominal do ponto no momento da compra
 * - Permitir auditoria precisa do ledger com taxas históricas
 * 
 * ESTRATÉGIA:
 * - Coluna NULLABLE para compatibilidade com registros legados
 * - Índice para otimizar queries de auditoria por taxa
 */

exports.up = function(knex) {
  return knex.schema.table('pontos_historico', function(table) {
    table.decimal('taxa_conversao_snapshot', 10, 2)
      .nullable()
      .comment('Snapshot da taxa reais_por_pontos no momento do crédito/débito');
    
    table.index('taxa_conversao_snapshot', 'idx_pontos_historico_taxa_conversao');
  });
};

exports.down = function(knex) {
  return knex.schema.table('pontos_historico', function(table) {
    table.dropIndex('taxa_conversao_snapshot', 'idx_pontos_historico_taxa_conversao');
    table.dropColumn('taxa_conversao_snapshot');
  });
};

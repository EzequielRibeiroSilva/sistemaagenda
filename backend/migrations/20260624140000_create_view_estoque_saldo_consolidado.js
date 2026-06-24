/**
 * Migration: Criar VIEW estoque_saldo_consolidado (Ponto Único de Verdade)
 * Task 3.2 - Protocolo de Auditoria Tally (Elite)
 *
 * Esta VIEW elimina a redundância do saldo_atual (legado) e fornece uma camada de abstração
 * que desacopla o frontend da estrutura física do banco de dados.
 *
 * Benefícios:
 * 1. Saldo sempre consistente (computado em tempo real)
 * 2. Preparação para deprecação do saldo_atual
 * 3. Ponto único de verdade para queries de estoque
 * 4. Mudanças de regra de negócio afetam apenas a VIEW (sem refactor de código)
 *
 * Roadmap de Deprecação:
 * - Fase 1 (ATUAL): Criar VIEW, manter saldo_atual por retrocompatibilidade
 * - Fase 2: Migrar frontend e backend para consumir a VIEW
 * - Fase 3: Remover coluna saldo_atual (breaking change controlado)
 */

exports.up = async function (knex) {
  await knex.raw(`
    CREATE OR REPLACE VIEW estoque_saldo_consolidado AS
    SELECT
      id,
      produto_id,
      unidade_id,
      saldo_venda,
      saldo_consumo,
      (COALESCE(saldo_venda, 0) + COALESCE(saldo_consumo, 0)) AS saldo_total,
      estoque_minimo,
      estoque_maximo,
      -- Indicadores de alerta (business logic na VIEW)
      CASE
        WHEN estoque_minimo IS NOT NULL 
          AND (COALESCE(saldo_venda, 0) + COALESCE(saldo_consumo, 0)) <= estoque_minimo
        THEN true
        ELSE false
      END AS alerta_estoque_baixo,
      CASE
        WHEN estoque_maximo IS NOT NULL 
          AND (COALESCE(saldo_venda, 0) + COALESCE(saldo_consumo, 0)) >= estoque_maximo
        THEN true
        ELSE false
      END AS alerta_estoque_excesso
    FROM estoque_unidades;
  `);

  // Criar índice na VIEW para performance de queries
  // (PostgreSQL permite índices em VIEWs materializadas, mas esta é uma VIEW comum)
  // Os índices da tabela base (estoque_unidades) serão utilizados automaticamente

  // Opcional: Comentário no banco de dados para documentação
  await knex.raw(`
    COMMENT ON VIEW estoque_saldo_consolidado IS 
    'Ponto único de verdade para consultas de saldo de estoque. Saldo total é computado dinamicamente a partir de saldo_venda + saldo_consumo. Inclui indicadores de alerta para estoque baixo/excesso.';
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP VIEW IF EXISTS estoque_saldo_consolidado;');
};

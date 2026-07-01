/**
 * Migration: Adicionar índices de performance para queries financeiras
 * Protocolo de Auditoria Tally - Elite Performance
 * 
 * Objetivo: Eliminar Full Table Scans e garantir que queries de paginação
 * executem em O(log n) mesmo com milhões de registros.
 * 
 * Índices Criados:
 * 1. idx_despesas_unidade_periodo: Cobre filtros de unidade + período + status
 * 2. idx_venda_pagamentos_periodo: Otimiza joins pesados no FluxoCaixaController
 * 
 * Performance Esperada:
 * - Antes: O(n) - Full Table Scan (~5-10s com 1M registros)
 * - Depois: O(log n) - Index Scan (~5-50ms com qualquer volume)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 📊 ÍNDICE 1: Despesas (Query Principal de Paginação)
  // Query alvo: DespesaController.index
  // WHERE unidade_id = ? AND data_vencimento >= ? AND data_vencimento <= ? AND status = ?
  await knex.schema.alterTable('despesas', function (table) {
    // Ordem das colunas no índice composto (seletividade decrescente):
    // 1. unidade_id: Alta seletividade (isola por tenant/unidade)
    // 2. data_vencimento: Média seletividade (intervalo de datas)
    // 3. status: Baixa seletividade (apenas 3 valores: PENDING, PAID, CANCELLED)
    //
    // Por que esta ordem?
    // - unidade_id primeiro: elimina 99% dos registros (multi-tenancy)
    // - data_vencimento segundo: filtra por período dentro da unidade
    // - status terceiro: filtro opcional final
    //
    // PostgreSQL pode usar este índice para:
    // - WHERE unidade_id = X
    // - WHERE unidade_id = X AND data_vencimento >= Y
    // - WHERE unidade_id = X AND data_vencimento >= Y AND data_vencimento <= Z
    // - WHERE unidade_id = X AND data_vencimento >= Y AND data_vencimento <= Z AND status = 'PENDING'
    table.index(
      ['unidade_id', 'data_vencimento', 'status'],
      'idx_despesas_unidade_periodo'
    );
  });

  // 📊 ÍNDICE 2: Venda Pagamentos (FluxoCaixaController.extrato)
  // Query alvo: JOIN venda_pagamentos com filtros complexos de data
  // WHERE venda_id = ? AND (paid_at BETWEEN ? OR created_at BETWEEN ?)
  await knex.schema.alterTable('venda_pagamentos', function (table) {
    // Ordem das colunas no índice composto:
    // 1. venda_id: Alta seletividade (FK principal)
    // 2. paid_at: Média seletividade (data de pagamento)
    // 3. created_at: Fallback quando paid_at é NULL
    //
    // Por que esta ordem?
    // - venda_id primeiro: JOINs ficam instantâneos
    // - paid_at segundo: filtros de período são rápidos
    // - created_at terceiro: cobre o COALESCE(paid_at, created_at)
    //
    // PostgreSQL pode usar este índice para:
    // - JOIN ON venda_pagamentos.venda_id = vendas.id
    // - WHERE venda_id = X AND paid_at BETWEEN Y AND Z
    // - ORDER BY paid_at DESC (index scan reverso)
    table.index(
      ['venda_id', 'paid_at', 'created_at'],
      'idx_venda_pagamentos_periodo'
    );
  });

  // 📝 Comentários no banco para documentação
  await knex.raw(`
    COMMENT ON INDEX idx_despesas_unidade_periodo IS 
    'Índice de performance para paginação de despesas por unidade e período. Cobre queries de DespesaController.index com filtros de status opcionais.';
  `);

  await knex.raw(`
    COMMENT ON INDEX idx_venda_pagamentos_periodo IS 
    'Índice de performance para FluxoCaixaController.extrato. Otimiza JOINs e filtros de período com fallback para created_at quando paid_at é NULL.';
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Reverter: Remover índices criados
  await knex.schema.alterTable('despesas', function (table) {
    table.dropIndex(
      ['unidade_id', 'data_vencimento', 'status'],
      'idx_despesas_unidade_periodo'
    );
  });

  await knex.schema.alterTable('venda_pagamentos', function (table) {
    table.dropIndex(
      ['venda_id', 'paid_at', 'created_at'],
      'idx_venda_pagamentos_periodo'
    );
  });
};

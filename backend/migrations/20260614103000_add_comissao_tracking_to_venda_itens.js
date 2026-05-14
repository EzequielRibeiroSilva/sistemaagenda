/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('venda_itens');
  if (!hasTable) return;

  const hasComissaoPaga = await knex.schema.hasColumn('venda_itens', 'comissao_paga');
  const hasDataPagamento = await knex.schema.hasColumn('venda_itens', 'data_pagamento_comissao');
  const hasObservacao = await knex.schema.hasColumn('venda_itens', 'observacao_pagamento');

  if (!hasComissaoPaga || !hasDataPagamento || !hasObservacao) {
    await knex.schema.alterTable('venda_itens', function (table) {
      if (!hasComissaoPaga) table.boolean('comissao_paga').notNullable().defaultTo(false);
      if (!hasDataPagamento) table.timestamp('data_pagamento_comissao').nullable();
      if (!hasObservacao) table.text('observacao_pagamento').nullable();
    });
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_venda_itens_comissao_paga ON venda_itens (comissao_paga)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_venda_itens_agente_comissao_paga ON venda_itens (agente_id, comissao_paga)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_venda_itens_data_pag_comissao ON venda_itens (data_pagamento_comissao)');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('venda_itens');
  if (!hasTable) return;

  await knex.raw('DROP INDEX IF EXISTS idx_venda_itens_data_pag_comissao');
  await knex.raw('DROP INDEX IF EXISTS idx_venda_itens_agente_comissao_paga');
  await knex.raw('DROP INDEX IF EXISTS idx_venda_itens_comissao_paga');

  const hasComissaoPaga = await knex.schema.hasColumn('venda_itens', 'comissao_paga');
  const hasDataPagamento = await knex.schema.hasColumn('venda_itens', 'data_pagamento_comissao');
  const hasObservacao = await knex.schema.hasColumn('venda_itens', 'observacao_pagamento');

  if (hasComissaoPaga || hasDataPagamento || hasObservacao) {
    await knex.schema.alterTable('venda_itens', function (table) {
      if (hasObservacao) table.dropColumn('observacao_pagamento');
      if (hasDataPagamento) table.dropColumn('data_pagamento_comissao');
      if (hasComissaoPaga) table.dropColumn('comissao_paga');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasComissaoPaga = await knex.schema.hasColumn('agendamento_servicos', 'comissao_paga');
  const hasDataPagamento = await knex.schema.hasColumn('agendamento_servicos', 'data_pagamento_comissao');

  if (!hasComissaoPaga || !hasDataPagamento) {
    await knex.schema.alterTable('agendamento_servicos', (table) => {
      if (!hasComissaoPaga) {
        table.boolean('comissao_paga').notNullable().defaultTo(false);
      }
      if (!hasDataPagamento) {
        table.timestamp('data_pagamento_comissao').nullable();
      }
    });
  }

  // Performance indexes (safe / idempotent)
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_comissao_paga ON agendamento_servicos (comissao_paga)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_data_pag_comissao ON agendamento_servicos (data_pagamento_comissao)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_agendamento_comissao_paga ON agendamento_servicos (agendamento_id, comissao_paga)');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_agendamento_servicos_agendamento_comissao_paga');
  await knex.raw('DROP INDEX IF EXISTS idx_agendamento_servicos_data_pag_comissao');
  await knex.raw('DROP INDEX IF EXISTS idx_agendamento_servicos_comissao_paga');

  const hasComissaoPaga = await knex.schema.hasColumn('agendamento_servicos', 'comissao_paga');
  const hasDataPagamento = await knex.schema.hasColumn('agendamento_servicos', 'data_pagamento_comissao');

  if (hasComissaoPaga || hasDataPagamento) {
    await knex.schema.alterTable('agendamento_servicos', (table) => {
      if (hasComissaoPaga) table.dropColumn('comissao_paga');
      if (hasDataPagamento) table.dropColumn('data_pagamento_comissao');
    });
  }
};

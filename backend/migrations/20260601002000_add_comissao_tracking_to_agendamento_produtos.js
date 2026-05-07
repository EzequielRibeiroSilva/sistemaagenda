/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('agendamento_produtos');
  if (!hasTable) return;

  const hasComissaoPaga = await knex.schema.hasColumn('agendamento_produtos', 'comissao_paga');
  if (!hasComissaoPaga) {
    await knex.schema.alterTable('agendamento_produtos', function (table) {
      table.boolean('comissao_paga').notNullable().defaultTo(false);
      table.timestamp('data_pagamento_comissao').nullable();
      table.text('observacao_pagamento').nullable();

      table.index(['comissao_paga'], 'idx_agendamento_produtos_comissao_paga');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable('agendamento_produtos');
  if (!hasTable) return;

  const hasComissaoPaga = await knex.schema.hasColumn('agendamento_produtos', 'comissao_paga');
  if (hasComissaoPaga) {
    await knex.schema.alterTable('agendamento_produtos', function (table) {
      table.dropIndex(['comissao_paga'], 'idx_agendamento_produtos_comissao_paga');
      table.dropColumn('observacao_pagamento');
      table.dropColumn('data_pagamento_comissao');
      table.dropColumn('comissao_paga');
    });
  }
};

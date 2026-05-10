/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('venda_itens', function (table) {
    table.decimal('comissao_percentual_snapshot', 10, 2).nullable();
    table.decimal('comissao_valor_snapshot', 10, 2).nullable();

    table.index(['comissao_percentual_snapshot'], 'idx_venda_itens_comissao_percentual_snapshot');
  });

  await knex.schema.alterTable('agendamento_produtos', function (table) {
    table.decimal('comissao_percentual_snapshot', 10, 2).nullable();
    table.decimal('comissao_valor_snapshot', 10, 2).nullable();

    table.index(['comissao_percentual_snapshot'], 'idx_agendamento_produtos_comissao_percentual_snapshot');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('agendamento_produtos', function (table) {
    table.dropIndex(['comissao_percentual_snapshot'], 'idx_agendamento_produtos_comissao_percentual_snapshot');
    table.dropColumn('comissao_percentual_snapshot');
    table.dropColumn('comissao_valor_snapshot');
  });

  await knex.schema.alterTable('venda_itens', function (table) {
    table.dropIndex(['comissao_percentual_snapshot'], 'idx_venda_itens_comissao_percentual_snapshot');
    table.dropColumn('comissao_percentual_snapshot');
    table.dropColumn('comissao_valor_snapshot');
  });
};

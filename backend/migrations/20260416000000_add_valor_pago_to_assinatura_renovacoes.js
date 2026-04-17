exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('assinatura_renovacoes');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('assinatura_renovacoes', 'valor_pago');
  if (!hasColumn) {
    await knex.schema.alterTable('assinatura_renovacoes', (table) => {
      table.decimal('valor_pago', 10, 2).nullable();
      table.index(['data_renovacao']);
    });
  }
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('assinatura_renovacoes');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('assinatura_renovacoes', 'valor_pago');
  if (hasColumn) {
    await knex.schema.alterTable('assinatura_renovacoes', (table) => {
      table.dropColumn('valor_pago');
    });
  }
};

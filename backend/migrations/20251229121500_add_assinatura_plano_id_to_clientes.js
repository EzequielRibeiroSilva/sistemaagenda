exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('clientes', 'assinatura_plano_id');
  if (!hasColumn) {
    await knex.schema.alterTable('clientes', function (table) {
      table
        .integer('assinatura_plano_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('planos_assinatura')
        .onDelete('SET NULL');

      table.index(['unidade_id', 'assinatura_plano_id'], 'idx_clientes_unidade_assinatura_plano');
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('clientes', 'assinatura_plano_id');
  if (hasColumn) {
    await knex.schema.alterTable('clientes', function (table) {
      table.dropIndex(['unidade_id', 'assinatura_plano_id'], 'idx_clientes_unidade_assinatura_plano');
      table.dropColumn('assinatura_plano_id');
    });
  }
};

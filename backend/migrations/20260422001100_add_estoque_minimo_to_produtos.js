exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('produtos', 'estoque_minimo');
  if (!hasColumn) {
    await knex.schema.alterTable('produtos', (table) => {
      table.decimal('estoque_minimo', 10, 2).notNullable().defaultTo(0.0);
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('produtos', 'estoque_minimo');
  if (hasColumn) {
    await knex.schema.alterTable('produtos', (table) => {
      table.dropColumn('estoque_minimo');
    });
  }
};

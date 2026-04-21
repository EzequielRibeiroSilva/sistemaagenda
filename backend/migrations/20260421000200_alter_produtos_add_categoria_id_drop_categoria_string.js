exports.up = async function (knex) {
  const hasCategoriaId = await knex.schema.hasColumn('produtos', 'categoria_id');
  if (!hasCategoriaId) {
    await knex.schema.alterTable('produtos', function (table) {
      table
        .integer('categoria_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categorias')
        .onDelete('SET NULL');

      table.index(['categoria_id'], 'idx_produtos_categoria_id');
    });
  }

  const hasCategoriaString = await knex.schema.hasColumn('produtos', 'categoria');
  if (hasCategoriaString) {
    await knex.schema.alterTable('produtos', function (table) {
      table.dropColumn('categoria');
    });
  }
};

exports.down = async function (knex) {
  const hasCategoriaString = await knex.schema.hasColumn('produtos', 'categoria');
  if (!hasCategoriaString) {
    await knex.schema.alterTable('produtos', function (table) {
      table.string('categoria', 255).nullable();
    });
  }

  const hasCategoriaId = await knex.schema.hasColumn('produtos', 'categoria_id');
  if (hasCategoriaId) {
    await knex.schema.alterTable('produtos', function (table) {
      table.dropIndex(['categoria_id'], 'idx_produtos_categoria_id');
      table.dropColumn('categoria_id');
    });
  }
};

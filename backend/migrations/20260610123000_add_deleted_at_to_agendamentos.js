exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('agendamentos', 'deleted_at');
  if (!hasColumn) {
    await knex.schema.alterTable('agendamentos', function(table) {
      table.timestamp('deleted_at').nullable();
    });
  }

  const indexName = 'agendamentos_deleted_at_index';
  const indexExists = await knex
    .raw(
      `select 1
       from pg_indexes
       where schemaname = current_schema()
         and tablename = 'agendamentos'
         and indexname = ?
       limit 1`,
      [indexName]
    )
    .then((r) => (Array.isArray(r?.rows) ? r.rows.length > 0 : false))
    .catch(() => false);

  if (!indexExists) {
    await knex.schema.alterTable('agendamentos', function(table) {
      table.index(['deleted_at'], indexName);
    });
  }
};

exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('agendamentos', 'deleted_at');
  if (hasColumn) {
    await knex.schema.alterTable('agendamentos', function(table) {
      table.dropIndex(['deleted_at'], 'agendamentos_deleted_at_index');
      table.dropColumn('deleted_at');
    });
  }
};

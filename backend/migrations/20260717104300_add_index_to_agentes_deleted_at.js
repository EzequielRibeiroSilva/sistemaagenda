async function indexExists(knex, tableName, indexName) {
  const result = await knex.raw(
    `
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = ?
        AND indexname = ?
    ) as exists
  `,
    [tableName, indexName]
  );

  return Boolean(result.rows?.[0]?.exists);
}

exports.up = async function (knex) {
  const indexName = 'idx_agentes_deleted_at';
  const exists = await indexExists(knex, 'agentes', indexName);

  if (exists) {
    console.log(`⏭️  Índice já existe: ${indexName}`);
    return;
  }

  await knex.schema.table('agentes', (table) => {
    table.index(['deleted_at'], indexName);
  });

  console.log(`✅ Índice criado: ${indexName}`);
};

exports.down = async function (knex) {
  const indexName = 'idx_agentes_deleted_at';
  const exists = await indexExists(knex, 'agentes', indexName);

  if (!exists) {
    console.log(`⏭️  Índice não existe: ${indexName}`);
    return;
  }

  await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  console.log(`✅ Índice removido: ${indexName}`);
};

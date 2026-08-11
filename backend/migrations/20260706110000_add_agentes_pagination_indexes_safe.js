/**
 * Migration: Add additional indexes for agentes list/grid performance (Safe)
 *
 * Objetivo: Acelerar listagens paginadas e filtros mais comuns (usuario/unidade/soft delete + ordenação por nome).
 * Segurança: verifica se índice já existe antes de criar.
 */

async function indexExists(knex, tableName, indexName) {
  const result = await knex.raw(
    `
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = ? AND indexname = ?
    ) as exists
  `,
    [tableName, indexName]
  );
  return result.rows[0].exists;
}

async function createIndexIfNotExists(knex, tableName, columns, indexName) {
  const exists = await indexExists(knex, tableName, indexName);
  if (exists) {
    console.log(`      ⏭️  Já existe: ${indexName}`);
    return false;
  }

  await knex.schema.table(tableName, (table) => {
    table.index(columns, indexName);
  });

  console.log(`      ✅ Criado: ${indexName}`);
  return true;
}

exports.up = async function (knex) {
  console.log('\n🚀 [Migration] Índices adicionais para listagem de agentes (paginada)\n');

  let totalCreated = 0;
  let totalSkipped = 0;

  // =====================================================
  // agentes
  // =====================================================
  console.log('📊 Tabela: agentes');

  // Busca por unidade com soft delete
  if (await createIndexIfNotExists(knex, 'agentes', ['unidade_id', 'deleted_at'], 'idx_agentes_unidade_deleted_at')) totalCreated++; else totalSkipped++;

  // Ordenação/busca por nome dentro do tenant (usuario) com soft delete
  if (await createIndexIfNotExists(knex, 'agentes', ['usuario_id', 'deleted_at', 'nome'], 'idx_agentes_usuario_deleted_nome')) totalCreated++; else totalSkipped++;

  // Paginação/ordenção por created_at dentro do tenant (usuario) com soft delete
  if (await createIndexIfNotExists(knex, 'agentes', ['usuario_id', 'deleted_at', 'created_at'], 'idx_agentes_usuario_deleted_created')) totalCreated++; else totalSkipped++;

  console.log('');

  console.log('========================================');
  console.log('✅ MIGRATION CONCLUÍDA');
  console.log(`📊 Índices verificados: ${totalCreated + totalSkipped}`);
  console.log(`   ✅ Criados: ${totalCreated}`);
  console.log(`   ⏭️  Já existiam: ${totalSkipped}`);
  console.log('========================================\n');
};

exports.down = async function (knex) {
  const indexes = [
    { table: 'agentes', name: 'idx_agentes_unidade_deleted_at' },
    { table: 'agentes', name: 'idx_agentes_usuario_deleted_nome' },
    { table: 'agentes', name: 'idx_agentes_usuario_deleted_created' }
  ];

  let removed = 0;
  for (const idx of indexes) {
    const exists = await indexExists(knex, idx.table, idx.name);
    if (exists) {
      await knex.raw(`DROP INDEX IF EXISTS ${idx.name}`);
      removed++;
    }
  }

  console.log(`✅ [Rollback] Índices removidos: ${removed}`);
};

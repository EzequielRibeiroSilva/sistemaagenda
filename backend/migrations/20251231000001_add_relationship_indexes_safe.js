/**
 * Migration: Add Relationship Indexes (Safe)
 * Descrição: Adiciona índices para tabelas de relacionamento usadas em whereIn/EXISTS
 * Data: 2025-12-31
 */

async function indexExists(knex, tableName, indexName) {
  const result = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = ? AND indexname = ?
    ) as exists
  `, [tableName, indexName]);

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

exports.up = async function(knex) {
  console.log('\n🚀 [Migration] Iniciando criação de índices de relacionamento...\n');

  let totalCreated = 0;
  let totalSkipped = 0;

  // ========================================
  // 1) agendamento_servicos
  // ========================================
  console.log('📊 [1/4] Tabela: agendamento_servicos');

  if (await createIndexIfNotExists(knex, 'agendamento_servicos', 'agendamento_id', 'idx_agendamento_servicos_agendamento')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamento_servicos', 'servico_id', 'idx_agendamento_servicos_servico')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamento_servicos', ['agendamento_id', 'servico_id'], 'idx_agendamento_servicos_agendamento_servico')) totalCreated++; else totalSkipped++;

  console.log('');

  // ========================================
  // 2) agendamento_servicos_extras
  // ========================================
  console.log('📊 [2/4] Tabela: agendamento_servicos_extras');

  if (await createIndexIfNotExists(knex, 'agendamento_servicos_extras', 'agendamento_id', 'idx_agendamento_servicos_extras_agendamento')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamento_servicos_extras', 'servico_extra_id', 'idx_agendamento_servicos_extras_extra')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamento_servicos_extras', ['agendamento_id', 'servico_extra_id'], 'idx_agendamento_servicos_extras_agendamento_extra')) totalCreated++; else totalSkipped++;

  console.log('');

  // ========================================
  // 3) agente_servicos
  // ========================================
  console.log('📊 [3/4] Tabela: agente_servicos');

  if (await createIndexIfNotExists(knex, 'agente_servicos', 'agente_id', 'idx_agente_servicos_agente')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agente_servicos', 'servico_id', 'idx_agente_servicos_servico')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agente_servicos', ['agente_id', 'servico_id'], 'idx_agente_servicos_agente_servico')) totalCreated++; else totalSkipped++;

  console.log('');

  // ========================================
  // 4) agente_unidades
  // ========================================
  console.log('📊 [4/4] Tabela: agente_unidades');

  if (await createIndexIfNotExists(knex, 'agente_unidades', 'agente_id', 'idx_agente_unidades_agente')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agente_unidades', 'unidade_id', 'idx_agente_unidades_unidade')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agente_unidades', ['agente_id', 'unidade_id'], 'idx_agente_unidades_agente_unidade')) totalCreated++; else totalSkipped++;

  console.log('');

  console.log('========================================');
  console.log('✅ MIGRATION CONCLUÍDA COM SUCESSO!');
  console.log('========================================');
  console.log(`📊 Total de índices verificados: ${totalCreated + totalSkipped}`);
  console.log(`   ✅ Criados: ${totalCreated}`);
  console.log(`   ⏭️  Já existiam: ${totalSkipped}`);
  console.log('========================================\n');
};

exports.down = async function(knex) {
  console.log('⏪ [Rollback] Removendo índices de relacionamento...\n');

  const indexes = [
    { name: 'idx_agendamento_servicos_agendamento' },
    { name: 'idx_agendamento_servicos_servico' },
    { name: 'idx_agendamento_servicos_agendamento_servico' },

    { name: 'idx_agendamento_servicos_extras_agendamento' },
    { name: 'idx_agendamento_servicos_extras_extra' },
    { name: 'idx_agendamento_servicos_extras_agendamento_extra' },

    { name: 'idx_agente_servicos_agente' },
    { name: 'idx_agente_servicos_servico' },
    { name: 'idx_agente_servicos_agente_servico' },

    { name: 'idx_agente_unidades_agente' },
    { name: 'idx_agente_unidades_unidade' },
    { name: 'idx_agente_unidades_agente_unidade' }
  ];

  let removed = 0;
  for (const idx of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${idx.name}`);
    removed++;
  }

  console.log('');
  console.log('========================================');
  console.log('✅ ROLLBACK CONCLUÍDO');
  console.log(`📊 Total de índices removidos: ${removed}`);
  console.log('========================================\n');
};

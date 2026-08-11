/**
 * Migration: Índices Compostos de Performance para Agentes
 * Fase 3 - Otimização para 100k+ registros
 * 
 * OBJETIVO:
 * - Criar índices compostos essenciais para queries de listagem
 * - Garantir performance em queries com filtros de unidade e soft delete
 * - Suportar ordenação por nome com índice
 * 
 * ÍNDICES CRIADOS:
 * 1. idx_agentes_unidade_deleted_nome: (unidade_id, deleted_at, nome)
 *    - Usado em: Listagem de agentes por unidade (com soft delete)
 *    - Benefício: Query otimizada para WHERE unidade_id = X AND deleted_at IS NULL ORDER BY nome
 * 
 * 2. idx_agentes_usuario_deleted: (usuario_id, deleted_at)
 *    - Usado em: Listagem de agentes por admin/master
 *    - Benefício: Query otimizada para WHERE usuario_id = X AND deleted_at IS NULL
 * 
 * 3. idx_agentes_email_unique_active: (email) WHERE deleted_at IS NULL
 *    - Usado em: Validação de unicidade de email (apenas registros ativos)
 *    - Benefício: Evita duplicidade de email em agentes ativos
 */

exports.up = async function(knex) {
  console.log('🚀 [MIGRATION] Criando índices compostos de performance para agentes...');

  // Helper para verificar se índice existe
  const indexExists = async (indexName) => {
    const result = await knex.raw(`
      SELECT 1 
      FROM pg_indexes 
      WHERE tablename = 'agentes' 
      AND indexname = ?
    `, [indexName]);
    return result.rows.length > 0;
  };

  // ===================================================================
  // ÍNDICE 1: (unidade_id, deleted_at, nome)
  // Usado em: Listagem de agentes por unidade com soft delete
  // ===================================================================
  const idx1Name = 'idx_agentes_unidade_deleted_nome';
  
  if (!(await indexExists(idx1Name))) {
    await knex.schema.alterTable('agentes', (table) => {
      table.index(['unidade_id', 'deleted_at', 'nome'], idx1Name);
    });
    console.log(`✅ Índice composto criado: ${idx1Name} (unidade_id, deleted_at, nome)`);
  } else {
    console.log(`⚠️  Índice já existe: ${idx1Name}`);
  }

  // ===================================================================
  // ÍNDICE 2: (usuario_id, deleted_at)
  // Usado em: Listagem de agentes por admin (RBAC)
  // ===================================================================
  const idx2Name = 'idx_agentes_usuario_deleted';
  
  if (!(await indexExists(idx2Name))) {
    await knex.schema.alterTable('agentes', (table) => {
      table.index(['usuario_id', 'deleted_at'], idx2Name);
    });
    console.log(`✅ Índice composto criado: ${idx2Name} (usuario_id, deleted_at)`);
  } else {
    console.log(`⚠️  Índice já existe: ${idx2Name}`);
  }

  // ===================================================================
  // ÍNDICE 3: Email único (apenas registros ativos)
  // Usado em: Validação de unicidade de email
  // PostgreSQL suporta índices parciais (WHERE deleted_at IS NULL)
  // ===================================================================
  const idx3Name = 'idx_agentes_email_unique_active';

  if (!(await indexExists(idx3Name))) {
    await knex.raw(`
      CREATE UNIQUE INDEX ${idx3Name}
      ON agentes (email) 
      WHERE deleted_at IS NULL
    `);
    console.log(`✅ Índice parcial criado: ${idx3Name} (email WHERE deleted_at IS NULL)`);
  } else {
    console.log(`⚠️  Índice já existe: ${idx3Name}`);
  }

  // ===================================================================
  // ÍNDICE 4: Status (para queries de filtro por status)
  // ===================================================================
  const idx4Name = 'idx_agentes_status_deleted';
  
  if (!(await indexExists(idx4Name))) {
    await knex.schema.alterTable('agentes', (table) => {
      table.index(['status', 'deleted_at'], idx4Name);
    });
    console.log(`✅ Índice composto criado: ${idx4Name} (status, deleted_at)`);
  } else {
    console.log(`⚠️  Índice já existe: ${idx4Name}`);
  }

  console.log('✅ [MIGRATION] Índices de performance criados com sucesso!');
};

exports.down = async function(knex) {
  console.log('🔄 [MIGRATION] Removendo índices compostos de performance...');

  // Remover índices criados (em ordem reversa)
  await knex.schema.alterTable('agentes', (table) => {
    table.dropIndex(['status', 'deleted_at'], 'idx_agentes_status_deleted');
  });

  await knex.raw(`DROP INDEX IF EXISTS idx_agentes_email_unique_active`);

  await knex.schema.alterTable('agentes', (table) => {
    table.dropIndex(['usuario_id', 'deleted_at'], 'idx_agentes_usuario_deleted');
  });

  await knex.schema.alterTable('agentes', (table) => {
    table.dropIndex(['unidade_id', 'deleted_at', 'nome'], 'idx_agentes_unidade_deleted_nome');
  });

  console.log('✅ [MIGRATION] Índices removidos com sucesso!');
};

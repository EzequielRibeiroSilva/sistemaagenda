/**
 * Migration: Add Performance Indexes (Safe Version)
 * Descrição: Adiciona índices otimizados para queries críticas do sistema
 * Data: 2025-12-12
 * 
 * OBJETIVO: Melhorar performance de queries mais usadas
 * SEGURANÇA: Verifica se índice já existe antes de criar
 * 
 * ÍNDICES CRIADOS:
 * 1. Agendamentos - Queries de listagem e filtros
 * 2. Agentes - Busca por usuário e status
 * 3. Unidades - Busca por usuário e slug
 * 4. Clientes - Busca por telefone e unidade
 * 5. Serviços - Busca por usuário e status
 * 6. Horários Funcionamento - Busca por agente e unidade
 */

/**
 * Helper: Verificar se índice existe
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

/**
 * Helper: Criar índice se não existir
 */
async function createIndexIfNotExists(knex, tableName, columns, indexName) {
  const exists = await indexExists(knex, tableName, indexName);
  if (!exists) {
    if (Array.isArray(columns)) {
      await knex.schema.table(tableName, (table) => {
        table.index(columns, indexName);
      });
    } else {
      await knex.schema.table(tableName, (table) => {
        table.index(columns, indexName);
      });
    }
    console.log(`      ✅ Criado: ${indexName}`);
    return true;
  } else {
    console.log(`      ⏭️  Já existe: ${indexName}`);
  }
  return false;
}

exports.up = async function(knex) {
  console.log('\n🚀 [Migration] Iniciando criação de índices de performance...\n');
  
  let totalCreated = 0;
  let totalSkipped = 0;
  
  // ========================================
  // 1. TABELA: agendamentos
  // ========================================
  console.log('📊 [1/6] Tabela: agendamentos');
  
  if (await createIndexIfNotExists(knex, 'agendamentos', ['data_agendamento', 'hora_inicio'], 'idx_agendamentos_data_hora')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamentos', 'unidade_id', 'idx_agendamentos_unidade')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamentos', 'agente_id', 'idx_agendamentos_agente')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamentos', 'cliente_id', 'idx_agendamentos_cliente')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamentos', 'status', 'idx_agendamentos_status')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamentos', ['unidade_id', 'data_agendamento', 'status'], 'idx_agendamentos_unidade_data_status')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamentos', ['agente_id', 'data_agendamento'], 'idx_agendamentos_agente_data')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agendamentos', 'created_at', 'idx_agendamentos_created')) totalCreated++; else totalSkipped++;
  
  console.log('');
  
  // ========================================
  // 2. TABELA: agentes
  // ========================================
  console.log('📊 [2/6] Tabela: agentes');
  
  if (await createIndexIfNotExists(knex, 'agentes', 'usuario_id', 'idx_agentes_usuario')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agentes', 'status', 'idx_agentes_status')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agentes', ['usuario_id', 'status'], 'idx_agentes_usuario_status')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'agentes', 'email', 'idx_agentes_email')) totalCreated++; else totalSkipped++;
  
  console.log('');
  
  // ========================================
  // 3. TABELA: unidades
  // ========================================
  console.log('📊 [3/6] Tabela: unidades');
  
  if (await createIndexIfNotExists(knex, 'unidades', 'usuario_id', 'idx_unidades_usuario')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'unidades', 'slug_url', 'idx_unidades_slug')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'unidades', 'status', 'idx_unidades_status')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'unidades', ['usuario_id', 'status'], 'idx_unidades_usuario_status')) totalCreated++; else totalSkipped++;
  
  console.log('');
  
  // ========================================
  // 4. TABELA: clientes
  // ========================================
  console.log('📊 [4/6] Tabela: clientes');
  
  if (await createIndexIfNotExists(knex, 'clientes', 'telefone', 'idx_clientes_telefone')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'clientes', 'telefone_limpo', 'idx_clientes_telefone_limpo')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'clientes', 'unidade_id', 'idx_clientes_unidade')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'clientes', 'created_at', 'idx_clientes_created')) totalCreated++; else totalSkipped++;
  
  console.log('');
  
  // ========================================
  // 5. TABELA: servicos
  // ========================================
  console.log('📊 [5/6] Tabela: servicos');
  
  if (await createIndexIfNotExists(knex, 'servicos', 'usuario_id', 'idx_servicos_usuario')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'servicos', 'status', 'idx_servicos_status')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'servicos', ['usuario_id', 'status'], 'idx_servicos_usuario_status')) totalCreated++; else totalSkipped++;
  
  console.log('');
  
  // ========================================
  // 6. TABELA: horarios_funcionamento
  // ========================================
  console.log('📊 [6/6] Tabela: horarios_funcionamento');
  
  if (await createIndexIfNotExists(knex, 'horarios_funcionamento', 'agente_id', 'idx_horarios_agente')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'horarios_funcionamento', 'unidade_id', 'idx_horarios_unidade')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'horarios_funcionamento', ['agente_id', 'dia_semana'], 'idx_horarios_agente_dia')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'horarios_funcionamento', ['unidade_id', 'dia_semana'], 'idx_horarios_unidade_dia')) totalCreated++; else totalSkipped++;
  if (await createIndexIfNotExists(knex, 'horarios_funcionamento', 'ativo', 'idx_horarios_ativo')) totalCreated++; else totalSkipped++;
  
  console.log('');
  
  // ========================================
  // RESUMO
  // ========================================
  console.log('========================================');
  console.log('✅ MIGRATION CONCLUÍDA COM SUCESSO!');
  console.log('========================================');
  console.log(`📊 Total de índices verificados: ${totalCreated + totalSkipped}`);
  console.log(`   ✅ Criados: ${totalCreated}`);
  console.log(`   ⏭️  Já existiam: ${totalSkipped}`);
  console.log('');
  console.log('📋 Distribuição por tabela:');
  console.log('   • agendamentos: 8 índices');
  console.log('   • agentes: 4 índices');
  console.log('   • unidades: 4 índices');
  console.log('   • clientes: 4 índices');
  console.log('   • servicos: 3 índices');
  console.log('   • horarios_funcionamento: 5 índices');
  console.log('');
  console.log('🚀 Performance otimizada para:');
  console.log('   ✅ Listagem de agendamentos (paginada)');
  console.log('   ✅ Filtros por data, agente, unidade, status');
  console.log('   ✅ Calendário e timeline');
  console.log('   ✅ RBAC (controle de acesso)');
  console.log('   ✅ Busca de clientes por telefone');
  console.log('   ✅ Verificação de disponibilidade');
  console.log('========================================\n');
};

exports.down = async function(knex) {
  console.log('⏪ [Rollback] Removendo índices de performance...\n');
  
  const indexes = [
    // agendamentos
    { table: 'agendamentos', name: 'idx_agendamentos_data_hora' },
    { table: 'agendamentos', name: 'idx_agendamentos_unidade' },
    { table: 'agendamentos', name: 'idx_agendamentos_agente' },
    { table: 'agendamentos', name: 'idx_agendamentos_cliente' },
    { table: 'agendamentos', name: 'idx_agendamentos_status' },
    { table: 'agendamentos', name: 'idx_agendamentos_unidade_data_status' },
    { table: 'agendamentos', name: 'idx_agendamentos_agente_data' },
    { table: 'agendamentos', name: 'idx_agendamentos_created' },
    
    // agentes
    { table: 'agentes', name: 'idx_agentes_usuario' },
    { table: 'agentes', name: 'idx_agentes_status' },
    { table: 'agentes', name: 'idx_agentes_usuario_status' },
    { table: 'agentes', name: 'idx_agentes_email' },
    
    // unidades
    { table: 'unidades', name: 'idx_unidades_usuario' },
    { table: 'unidades', name: 'idx_unidades_slug' },
    { table: 'unidades', name: 'idx_unidades_status' },
    { table: 'unidades', name: 'idx_unidades_usuario_status' },
    
    // clientes
    { table: 'clientes', name: 'idx_clientes_telefone' },
    { table: 'clientes', name: 'idx_clientes_telefone_limpo' },
    { table: 'clientes', name: 'idx_clientes_unidade' },
    { table: 'clientes', name: 'idx_clientes_created' },
    
    // servicos
    { table: 'servicos', name: 'idx_servicos_usuario' },
    { table: 'servicos', name: 'idx_servicos_status' },
    { table: 'servicos', name: 'idx_servicos_usuario_status' },
    
    // horarios_funcionamento
    { table: 'horarios_funcionamento', name: 'idx_horarios_agente' },
    { table: 'horarios_funcionamento', name: 'idx_horarios_unidade' },
    { table: 'horarios_funcionamento', name: 'idx_horarios_agente_dia' },
    { table: 'horarios_funcionamento', name: 'idx_horarios_unidade_dia' },
    { table: 'horarios_funcionamento', name: 'idx_horarios_ativo' },
  ];
  
  let removed = 0;
  for (const index of indexes) {
    const exists = await indexExists(knex, index.table, index.name);
    if (exists) {
      await knex.raw(`DROP INDEX IF EXISTS ${index.name}`);
      console.log(`   ✅ Removido: ${index.name}`);
      removed++;
    }
  }
  
  console.log('');
  console.log('========================================');
  console.log('✅ ROLLBACK CONCLUÍDO');
  console.log(`📊 Total de índices removidos: ${removed}`);
  console.log('========================================\n');
};

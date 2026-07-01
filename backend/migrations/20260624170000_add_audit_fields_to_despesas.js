/**
 * Migration: Adicionar campos de auditoria à tabela despesas
 * 
 * Objetivo: Garantir rastreabilidade completa de todas as operações financeiras
 * 
 * Campos Adicionados:
 * - criado_por: ID do usuário que criou o registro
 * - atualizado_por: ID do usuário que fez a última atualização
 * 
 * Estratégia de Migração:
 * 1. Adicionar colunas como nullable
 * 2. Preencher registros legados com usuário do sistema (usuario_id existente)
 * 3. Tornar criado_por obrigatório
 * 4. Manter atualizado_por opcional (será preenchido no primeiro UPDATE)
 */

exports.up = async function (knex) {
  // Verificar se a tabela existe
  const tableExists = await knex.schema.hasTable('despesas');
  
  if (!tableExists) {
    throw new Error('❌ Tabela "despesas" não encontrada. Execute as migrations anteriores primeiro.');
  }

  // Verificar se a tabela usuarios existe
  const usersTableExists = await knex.schema.hasTable('usuarios');
  
  if (!usersTableExists) {
    throw new Error('❌ Tabela "usuarios" não encontrada. Necessária para foreign key.');
  }

  await knex.schema.table('despesas', function (table) {
    // ✅ ETAPA 1: Adicionar colunas como NULLABLE inicialmente
    console.log('📝 Adicionando coluna criado_por (nullable)...');
    table
      .integer('criado_por')
      .nullable()
      .comment('ID do usuário que criou o registro');

    console.log('📝 Adicionando coluna atualizado_por (nullable)...');
    table
      .integer('atualizado_por')
      .nullable()
      .comment('ID do usuário que fez a última atualização');

    // 📋 Índice para performance em consultas de auditoria
    table.index(['criado_por'], 'idx_despesas_criado_por');
    table.index(['atualizado_por'], 'idx_despesas_atualizado_por');
  });

  // ✅ ETAPA 2: Preencher registros legados
  console.log('🔄 Verificando registros existentes...');
  
  const despesasExistentes = await knex('despesas')
    .select('id', 'usuario_id')
    .whereNull('criado_por');

  if (despesasExistentes.length > 0) {
    console.log(`📦 Encontrados ${despesasExistentes.length} registros legados. Preenchendo campos de auditoria...`);
    
    // Preencher criado_por com o usuario_id existente (proprietário da despesa)
    await knex('despesas')
      .whereNull('criado_por')
      .update({
        criado_por: knex.raw('usuario_id'),
        // atualizado_por permanece NULL (será preenchido no primeiro UPDATE)
      });

    console.log(`✅ ${despesasExistentes.length} registros legados atualizados com sucesso.`);
  } else {
    console.log('✅ Nenhum registro legado encontrado. Tabela está limpa.');
  }

  // ✅ ETAPA 3: Tornar criado_por obrigatório e adicionar Foreign Keys
  await knex.schema.table('despesas', function (table) {
    console.log('🔒 Aplicando constraint NOT NULL em criado_por...');
    table.integer('criado_por').notNullable().alter();

    console.log('🔗 Adicionando Foreign Key para criado_por...');
    table
      .foreign('criado_por', 'fk_despesas_criado_por')
      .references('id')
      .inTable('usuarios')
      .onDelete('RESTRICT'); // Previne deleção de usuário com despesas

    console.log('🔗 Adicionando Foreign Key para atualizado_por...');
    table
      .foreign('atualizado_por', 'fk_despesas_atualizado_por')
      .references('id')
      .inTable('usuarios')
      .onDelete('SET NULL'); // Se usuário for deletado, mantém histórico mas remove referência
  });

  console.log('✅ Migration concluída com sucesso!');
  console.log('📊 Resumo:');
  console.log('   - Campo criado_por: OBRIGATÓRIO');
  console.log('   - Campo atualizado_por: OPCIONAL');
  console.log('   - Foreign Keys: CONFIGURADAS');
  console.log('   - Registros legados: PREENCHIDOS');
};

exports.down = async function (knex) {
  console.log('⚠️  Revertendo migration de auditoria...');
  
  await knex.schema.table('despesas', function (table) {
    // Remover Foreign Keys primeiro
    console.log('🔗 Removendo Foreign Key fk_despesas_criado_por...');
    table.dropForeign('criado_por', 'fk_despesas_criado_por');
    
    console.log('🔗 Removendo Foreign Key fk_despesas_atualizado_por...');
    table.dropForeign('atualizado_por', 'fk_despesas_atualizado_por');

    // Remover índices
    console.log('📋 Removendo índices...');
    table.dropIndex([], 'idx_despesas_criado_por');
    table.dropIndex([], 'idx_despesas_atualizado_por');

    // Remover colunas
    console.log('🗑️  Removendo coluna criado_por...');
    table.dropColumn('criado_por');
    
    console.log('🗑️  Removendo coluna atualizado_por...');
    table.dropColumn('atualizado_por');
  });

  console.log('✅ Migration revertida com sucesso.');
};

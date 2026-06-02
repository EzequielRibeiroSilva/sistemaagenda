/**
 * Migration: Adicionar campo notifica_crise à tabela agentes
 * 
 * CONTEXTO:
 * Este campo permite marcar membros da equipe que devem receber notificações
 * de emergência via WhatsApp quando a IA detectar situações de crise.
 * 
 * DECISÕES DE DESIGN:
 * - Nome: notifica_crise (mais semântico que is_gerente)
 * - Tipo: boolean
 * - Default: false (todos começam sem notificações)
 * - Not Null: true (campo obrigatório)
 * - Índice: combinado com unidade_id e status para otimizar busca do Worker
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Verificar se a coluna já existe (idempotência)
  const hasColumn = await knex.schema.hasColumn('agentes', 'notifica_crise');
  
  if (!hasColumn) {
    await knex.schema.alterTable('agentes', function(table) {
      // Adicionar coluna notifica_crise
      table.boolean('notifica_crise')
        .defaultTo(false)
        .notNullable()
        .comment('Indica se o agente recebe notificações de crise via WhatsApp');
      
      // Criar índice composto para otimizar query do WhatsappWorker
      // Query típica: WHERE unidade_id = X AND notifica_crise = true AND status = 'Ativo'
      table.index(
        ['unidade_id', 'notifica_crise', 'status'], 
        'idx_agentes_notifica_crise'
      );
    });
    
    console.log('✅ Coluna notifica_crise adicionada à tabela agentes');
    console.log('✅ Índice idx_agentes_notifica_crise criado');
  } else {
    console.log('⚠️  Coluna notifica_crise já existe, pulando alteração');
  }
};

/**
 * Rollback: Remover campo notifica_crise
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('agentes', 'notifica_crise');
  
  if (hasColumn) {
    await knex.schema.alterTable('agentes', function(table) {
      // Remover índice primeiro (ordem importante)
      table.dropIndex(
        ['unidade_id', 'notifica_crise', 'status'], 
        'idx_agentes_notifica_crise'
      );
      
      // Depois remover coluna
      table.dropColumn('notifica_crise');
    });
    
    console.log('✅ Rollback: Índice e coluna notifica_crise removidos');
  } else {
    console.log('⚠️  Coluna notifica_crise não existe, nada a remover');
  }
};

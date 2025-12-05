/**
 * Migration: Add Scheduled Reminders Support
 * Descrição: Adiciona campo enviar_em e status 'programado' para suportar lembretes programados
 * Data: 2025-12-04
 */

exports.up = function(knex) {
  return knex.schema.table('lembretes_enviados', function(table) {
    // 1. Adicionar coluna enviar_em (horário programado para envio)
    table.timestamp('enviar_em').nullable();
    
    // 2. Adicionar índice para otimizar busca de lembretes programados
    table.index(['status', 'enviar_em'], 'idx_lembretes_programados');
    
    console.log('✅ Migration: Campo enviar_em adicionado à tabela lembretes_enviados');
    console.log('✅ Migration: Índice idx_lembretes_programados criado');
  })
  .then(() => {
    // 3. Atualizar constraint de status para incluir 'programado'
    return knex.raw(`
      ALTER TABLE lembretes_enviados 
      DROP CONSTRAINT IF EXISTS lembretes_enviados_status_check;
      
      ALTER TABLE lembretes_enviados 
      ADD CONSTRAINT lembretes_enviados_status_check 
      CHECK (status IN ('programado', 'pendente', 'enviado', 'falha', 'falha_permanente'));
    `);
  })
  .then(() => {
    console.log('✅ Migration: Constraint de status atualizada para incluir "programado"');
  });
};

exports.down = function(knex) {
  return knex.schema.table('lembretes_enviados', function(table) {
    // Remover índice
    table.dropIndex(['status', 'enviar_em'], 'idx_lembretes_programados');
    
    // Remover coluna
    table.dropColumn('enviar_em');
    
    console.log('⏪ Rollback: Campo enviar_em removido');
    console.log('⏪ Rollback: Índice idx_lembretes_programados removido');
  })
  .then(() => {
    // Restaurar constraint original
    return knex.raw(`
      ALTER TABLE lembretes_enviados 
      DROP CONSTRAINT IF EXISTS lembretes_enviados_status_check;
      
      ALTER TABLE lembretes_enviados 
      ADD CONSTRAINT lembretes_enviados_status_check 
      CHECK (status IN ('pendente', 'enviado', 'falha', 'falha_permanente'));
    `);
  })
  .then(() => {
    console.log('⏪ Rollback: Constraint de status restaurada');
  });
};

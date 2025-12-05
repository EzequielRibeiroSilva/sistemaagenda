/**
 * Migration: Migrar dados de tipo_lembrete para tipo_notificacao
 * Descrição: Copia dados da coluna antiga para a nova e ajusta nomenclatura
 * Data: 2025-12-03
 */

exports.up = async function(knex) {
  // Migrar dados existentes
  await knex.raw(`
    UPDATE lembretes_enviados 
    SET tipo_notificacao = CASE 
      WHEN tipo_lembrete = '24h' THEN 'lembrete_24h'
      WHEN tipo_lembrete = '2h' THEN 'lembrete_1h'
      ELSE tipo_lembrete
    END
    WHERE tipo_notificacao IS NULL
  `);
  
  console.log('✅ [Migration] Dados migrados de tipo_lembrete para tipo_notificacao');
};

exports.down = async function(knex) {
  // Reverter migração
  await knex.raw(`
    UPDATE lembretes_enviados 
    SET tipo_notificacao = NULL
  `);
  
  console.log('✅ [Migration] Dados revertidos');
};

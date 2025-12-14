/**
 * Data Archive Job - Arquivamento Automático de Dados
 * 
 * Este job move dados antigos para tabelas de arquivo:
 * - Agendamentos > 1 ano → agendamentos_arquivo
 * - Audit logs > 6 meses → audit_logs_arquivo
 * - Lembretes > 3 meses → lembretes_arquivo
 * 
 * EXECUÇÃO: Recomendado rodar diariamente às 3:00 AM
 * 
 * USO:
 *   const { runArchiveJob } = require('./jobs/dataArchiveJob');
 *   await runArchiveJob();
 */

const { db: knex } = require('../config/knex');
const logger = require('../utils/logger');

/**
 * Arquiva dados de uma tabela específica
 */
async function archiveTable(config) {
  const { table_name, archive_table, retention_days } = config;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retention_days);
  
  const trx = await knex.transaction();
  
  try {
    // Determinar coluna de data baseado na tabela
    let dateColumn = 'created_at';
    if (table_name === 'agendamentos') {
      dateColumn = 'data_agendamento';
    }
    
    // Contar registros a serem arquivados
    const countResult = await trx(table_name)
      .where(dateColumn, '<', cutoffDate)
      .count('id as count')
      .first();
    
    const recordCount = parseInt(countResult.count);
    
    if (recordCount === 0) {
      await trx.commit();
      return { table_name, archived: 0, message: 'Nenhum registro para arquivar' };
    }
    
    // Mover dados para tabela de arquivo
    // Usar INSERT ... SELECT para eficiência
    const columns = await getTableColumns(trx, table_name);
    const columnList = columns.join(', ');
    
    await trx.raw(`
      INSERT INTO ${archive_table} (${columnList}, archived_at)
      SELECT ${columnList}, NOW()
      FROM ${table_name}
      WHERE ${dateColumn} < ?
    `, [cutoffDate]);
    
    // Deletar dados da tabela principal
    await trx(table_name)
      .where(dateColumn, '<', cutoffDate)
      .delete();
    
    // Atualizar configuração de retenção
    await trx('data_retention_config')
      .where('table_name', table_name)
      .update({
        last_archive_run: new Date(),
        last_archive_count: recordCount,
        updated_at: new Date()
      });
    
    await trx.commit();
    
    logger.log(`✅ Arquivados ${recordCount} registros de ${table_name}`);
    return { table_name, archived: recordCount, message: 'Sucesso' };
    
  } catch (error) {
    await trx.rollback();
    logger.error(`❌ Erro ao arquivar ${table_name}:`, error.message);
    throw error;
  }
}

/**
 * Obter colunas de uma tabela (exceto colunas auto-geradas)
 */
async function getTableColumns(trx, tableName) {
  const result = await trx.raw(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = ? 
    AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [tableName]);
  
  return result.rows.map(r => r.column_name);
}

/**
 * Limpar dados muito antigos das tabelas de arquivo
 */
async function cleanupOldArchives() {
  const configs = await knex('data_retention_config')
    .where('auto_delete_archive', true)
    .whereNotNull('delete_archive_after_days');
  
  for (const config of configs) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.delete_archive_after_days);
    
    const deleted = await knex(config.archive_table)
      .where('archived_at', '<', cutoffDate)
      .delete();
    
    if (deleted > 0) {
      logger.log(`🗑️ Removidos ${deleted} registros antigos de ${config.archive_table}`);
    }
  }
}

/**
 * Executar job de arquivamento completo
 */
async function runArchiveJob() {
  logger.log('🗄️ Iniciando job de arquivamento de dados...');
  const startTime = Date.now();
  const results = [];
  
  try {
    // Buscar configurações ativas
    const configs = await knex('data_retention_config')
      .where('auto_archive', true);
    
    // Arquivar cada tabela
    for (const config of configs) {
      try {
        const result = await archiveTable(config);
        results.push(result);
      } catch (error) {
        results.push({
          table_name: config.table_name,
          archived: 0,
          error: error.message
        });
      }
    }
    
    // Limpar arquivos muito antigos
    await cleanupOldArchives();
    
    const duration = Date.now() - startTime;
    const totalArchived = results.reduce((sum, r) => sum + (r.archived || 0), 0);
    
    logger.log(`✅ Job de arquivamento concluído em ${duration}ms`);
    logger.log(`📊 Total arquivado: ${totalArchived} registros`);
    
    return { success: true, duration, results, totalArchived };
    
  } catch (error) {
    logger.error('❌ Erro no job de arquivamento:', error.message);
    return { success: false, error: error.message, results };
  }
}

module.exports = {
  runArchiveJob,
  archiveTable,
  cleanupOldArchives
};


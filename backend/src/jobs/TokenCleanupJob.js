const cron = require('node-cron');
const { db } = require('../config/knex');
const logger = require('../utils/logger');

/**
 * TASK 3.3 - FASE 2: "A VASSOURA"
 * 
 * Job responsável por manter a janela móvel de 30 dias na tabela uso_tokens_diario,
 * removendo registros antigos para evitar acúmulo desnecessário de dados.
 * 
 * Execução: Diariamente às 03:00 AM (horário de Brasília)
 * Estratégia: DELETE simples de registros com data < (hoje - 30 dias)
 */
class TokenCleanupJob {
  constructor() {
    // Executa todos os dias às 03:00 AM (horário de menor atividade)
    this.cronExpression = '0 3 * * *';
    this.isRunning = false;
    this.lastExecution = null;
    this.executionCount = 0;
    this.job = null;
    this.retentionDays = 30; // Janela móvel de 30 dias
  }

  /**
   * Executa a limpeza de registros antigos da tabela uso_tokens_diario
   */
  async execute() {
    if (this.isRunning) {
      logger.log('⚠️ [TokenCleanupJob] Job já está em execução. Pulando esta iteração.');
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    try {
      logger.info(`🧹 [TokenCleanup] Iniciando limpeza #${this.executionCount} (janela: ${this.retentionDays} dias)`);

      // ⚡ QUERY DE LIMPEZA: Remove registros com data < (hoje - 30 dias)
      // PostgreSQL: data < (CURRENT_DATE - INTERVAL '30 days')
      const deletedCount = await db('uso_tokens_diario')
        .where('data', '<', db.raw('CURRENT_DATE - INTERVAL \'30 days\''))
        .del();

      this.lastExecution = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // 📊 LOG DE AUDITORIA
      logger.info(`✅ [TokenCleanup] Execução #${this.executionCount} concluída em ${duration}s`, {
        registros_removidos: deletedCount,
        janela_dias: this.retentionDays,
        data_corte: this._getDataCorte(),
        duracao_segundos: parseFloat(duration)
      });

      // Log adicional se muitos registros foram removidos (possível problema)
      if (deletedCount > 1000) {
        logger.warn(`⚠️ [TokenCleanup] Alto volume de registros removidos: ${deletedCount}. Verificar se está normal.`);
      }

    } catch (error) {
      logger.error(`❌ [TokenCleanup] Erro na execução #${this.executionCount}:`, {
        error: error?.message,
        stack: error?.stack,
        duracao_ate_erro: ((Date.now() - startTime) / 1000).toFixed(2)
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Inicia o agendamento do job
   */
  start() {
    logger.log('\n' + '='.repeat(80));
    logger.log('🧹 [TokenCleanup] INICIANDO JOB DE LIMPEZA DE TOKENS');
    logger.log(`📅 Expressão Cron: ${this.cronExpression} (todos os dias às 03:00)`);
    logger.log(`📊 Retenção: ${this.retentionDays} dias`);
    logger.log(`🗑️ Data de corte atual: < ${this._getDataCorte()}`);
    logger.log('='.repeat(80) + '\n');

    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.log('✅ [TokenCleanup] Job iniciado com sucesso!\n');
  }

  /**
   * Para o agendamento do job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.log('🛑 [TokenCleanup] Job parado.');
    }
  }

  /**
   * Retorna a data de corte para limpeza (hoje - retention dias)
   * @returns {string} Data no formato YYYY-MM-DD
   * @private
   */
  _getDataCorte() {
    const hoje = new Date();
    const dataCorte = new Date(hoje.getTime() - (this.retentionDays * 24 * 60 * 60 * 1000));
    return dataCorte.toISOString().split('T')[0];
  }

  /**
   * Execução manual para testes (não agendada)
   * @returns {Promise<Object>} Resultado da execução
   */
  async executeManual() {
    const startTime = Date.now();
    
    try {
      logger.info('🧪 [TokenCleanup] Executando limpeza manual (teste)...');

      const deletedCount = await db('uso_tokens_diario')
        .where('data', '<', db.raw('CURRENT_DATE - INTERVAL \'30 days\''))
        .del();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      const resultado = {
        sucesso: true,
        registros_removidos: deletedCount,
        duracao_segundos: parseFloat(duration),
        data_corte: this._getDataCorte(),
        janela_dias: this.retentionDays
      };

      logger.info('✅ [TokenCleanup] Execução manual concluída:', resultado);
      return resultado;

    } catch (error) {
      const resultado = {
        sucesso: false,
        erro: error?.message,
        duracao_segundos: ((Date.now() - startTime) / 1000).toFixed(2)
      };

      logger.error('❌ [TokenCleanup] Erro na execução manual:', resultado);
      return resultado;
    }
  }

  /**
   * Retorna estatísticas do job
   */
  getStats() {
    return {
      cronExpression: this.cronExpression,
      isRunning: this.isRunning,
      executionCount: this.executionCount,
      lastExecution: this.lastExecution,
      retentionDays: this.retentionDays,
      dataCorte: this._getDataCorte()
    };
  }
}

const tokenCleanupJob = new TokenCleanupJob();
module.exports = tokenCleanupJob;
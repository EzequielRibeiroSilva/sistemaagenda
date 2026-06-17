const cron = require('node-cron');
const { db } = require('../config/knex');
const logger = require('./../utils/logger');

class ReactivateSessionsJob {
  constructor() {
    this.cronExpression = '0 * * * *';
    this.isRunning = false;
    this.lastExecution = null;
    this.executionCount = 0;
    this.job = null;
  }

  async execute() {
    if (this.isRunning) {
      logger.log('⚠️ [ReactivateSessionsJob] Job já está em execução. Pulando esta iteração.');
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    try {
      // ⏱️ Higiene de sessões: reativar após 60min sem interação.
      // Permite override via env.
      const timeoutMinutes = parseInt(process.env.SESSION_HYGIENE_TIMEOUT_MINUTES, 10);
      const defaultTimeout = 60;
      const parsedTimeout = isNaN(timeoutMinutes) ? defaultTimeout : timeoutMinutes;
      const safeTimeout = Math.max(1, Math.min(parsedTimeout, 1440));
      
      if (safeTimeout !== parsedTimeout) {
        logger.warn(`[ReactivateSessionsJob] Timeout ajustado de ${parsedTimeout} para ${safeTimeout} minutos (limite: 1-1440)`);
      }

      const updated = await db('chat_sessions')
        .where('status', 'paused_by_human')
        .andWhere('last_interaction_at', '<', db.raw('NOW() - INTERVAL ?? minute', [safeTimeout]))
        .update({
          status: 'active',
          updated_at: db.fn.now()
        });

      this.lastExecution = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`✅ [Higiene] Execução #${this.executionCount} concluída em ${duration}s | sessoes_reativadas=${updated} | timeout=${safeTimeout}min`);
    } catch (error) {
      logger.error(`❌ [Higiene] Erro na execução #${this.executionCount}:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    logger.log('\n' + '='.repeat(80));
    logger.log('🧹 [Higiene] INICIANDO JOB DE HIGIENE DE SESSÕES');
    logger.log(`📅 Expressão Cron: ${this.cronExpression}`);
    logger.log('='.repeat(80) + '\n');

    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.log('✅ [Higiene] Job iniciado com sucesso!\n');
  }

  stop() {
    if (this.job) {
      this.job.stop();
      logger.log('🛑 [Higiene] Job parado.');
    }
  }
}

const reactivateSessionsJob = new ReactivateSessionsJob();
module.exports = reactivateSessionsJob;

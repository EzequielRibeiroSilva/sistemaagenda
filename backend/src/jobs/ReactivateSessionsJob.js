const cron = require('node-cron');
const { db } = require('../config/knex');
const logger = require('./../utils/logger');

class ReactivateSessionsJob {
  constructor() {
    this.cronExpression = '*/10 * * * *';
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
      const updated = await db('chat_sessions')
        .where('status', 'paused_by_human')
        .andWhere('last_interaction_at', '<', db.raw("NOW() - INTERVAL '30 minutes'"))
        .update({
          status: 'active',
          updated_at: db.fn.now()
        });

      this.lastExecution = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.log(`✅ [ReactivateSessionsJob] Execução #${this.executionCount} concluída em ${duration}s | reativadas=${updated}`);
    } catch (error) {
      logger.error(`❌ [ReactivateSessionsJob] Erro na execução #${this.executionCount}:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    logger.log('\n' + '='.repeat(80));
    logger.log('🚀 [ReactivateSessionsJob] INICIANDO JOB DE REATIVAÇÃO DE SESSÕES');
    logger.log(`📅 Expressão Cron: ${this.cronExpression}`);
    logger.log('='.repeat(80) + '\n');

    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.log('✅ [ReactivateSessionsJob] Job iniciado com sucesso!\n');
  }

  stop() {
    if (this.job) {
      this.job.stop();
      logger.log('🛑 [ReactivateSessionsJob] Job parado.');
    }
  }
}

const reactivateSessionsJob = new ReactivateSessionsJob();
module.exports = reactivateSessionsJob;

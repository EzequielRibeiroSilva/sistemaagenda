/**
 * Job: pendingPaymentCleanupJob
 * Descrição: Expira pagamentos Pix pendentes e cancela agendamentos vinculados
 * Frequência: A cada 2 minutos
 */

const cron = require('node-cron');
const { db } = require('../config/knex');
const logger = require('../utils/logger');

class PendingPaymentCleanupJob {
  constructor() {
    this.cronExpression = '*/2 * * * *'; // a cada 2 minutos
    this.isRunning = false;
    this.lastExecution = null;
    this.executionCount = 0;
    this.stats = {
      totalExpiredPayments: 0,
      totalCancelledAppointments: 0,
      totalIterationsSkipped: 0
    };
    this.job = null;
  }

  async execute() {
    if (this.isRunning) {
      this.stats.totalIterationsSkipped++;
      logger.log('⚠️ [PendingPaymentCleanupJob] Job já está em execução. Pulando esta iteração.');
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    let expiredCount = 0;
    let cancelledCount = 0;

    try {
      logger.log(`\n🧹 [PendingPaymentCleanupJob] Execução #${this.executionCount} iniciada (${new Date().toLocaleString('pt-BR')})`);

      await db.transaction(async (trx) => {
        // Selecionar um lote para evitar transações longas
        const rows = await trx('agendamento_pagamentos')
          .where('status', 'PENDING')
          .andWhere('expires_at', '<=', trx.fn.now())
          .select('id', 'agendamento_id')
          .forUpdate()
          .skipLocked()
          .limit(50);

        if (!rows || rows.length === 0) {
          return;
        }

        for (const row of rows) {
          const pagamentoId = row.id;
          const agendamentoId = row.agendamento_id;

          const updatedPayments = await trx('agendamento_pagamentos')
            .where({ id: pagamentoId, status: 'PENDING' })
            .update({ status: 'EXPIRED', updated_at: trx.fn.now() });

          if (updatedPayments > 0) {
            expiredCount++;
          }

          // Cancelar agendamento vinculado (libera o horário)
          // Importante: só cancelar se ainda não foi cancelado/deletado
          const updatedAg = await trx('agendamentos')
            .where({ id: agendamentoId })
            .whereNull('deleted_at')
            .whereNot('status', 'Cancelado')
            .update({ status: 'Cancelado', updated_at: trx.fn.now() });

          if (updatedAg > 0) {
            cancelledCount++;
          }
        }
      });

      this.stats.totalExpiredPayments += expiredCount;
      this.stats.totalCancelledAppointments += cancelledCount;
      this.lastExecution = new Date();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.log(`✅ [PendingPaymentCleanupJob] Execução #${this.executionCount} concluída em ${duration}s | expirados=${expiredCount} | agendamentos_cancelados=${cancelledCount}`);

    } catch (error) {
      logger.error(`❌ [PendingPaymentCleanupJob] Erro na execução #${this.executionCount}:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    logger.log('\n' + '='.repeat(80));
    logger.log('🚀 [PendingPaymentCleanupJob] INICIANDO JOB DE LIMPEZA DE PAGAMENTOS PENDENTES');
    logger.log(`📅 Expressão Cron: ${this.cronExpression} (a cada 2 minutos)`);
    logger.log('='.repeat(80) + '\n');

    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.log('✅ [PendingPaymentCleanupJob] Job iniciado com sucesso!\n');
  }

  stop() {
    if (this.job) {
      this.job.stop();
      logger.log('🛑 [PendingPaymentCleanupJob] Job parado.');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      executionCount: this.executionCount,
      lastExecution: this.lastExecution,
      stats: this.stats,
      cronExpression: this.cronExpression
    };
  }
}

const pendingPaymentCleanupJob = new PendingPaymentCleanupJob();
module.exports = pendingPaymentCleanupJob;

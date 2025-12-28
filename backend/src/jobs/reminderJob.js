/**
 * Job: reminderJob
 * Descrição: Cron job para envio automático de lembretes de agendamentos
 * Frequência: A cada 30 minutos
 * Horário permitido: 06:00 - 23:00
 */

const cron = require('node-cron');
const ReminderService = require('../services/ReminderService');
const logger = require('./../utils/logger');

class ReminderJob {
  constructor() {
    this.reminderService = new ReminderService();
    this.cronExpression = '*/30 * * * *'; // A cada 30 minutos
    this.isRunning = false;
    this.lastExecution = null;
    this.executionCount = 0;
    this.stats = {
      totalProcessed: 0,
      totalSent: 0,
      totalFailed: 0,
      totalSkipped: 0
    };
  }

  /**
   * Executar o job de lembretes
   */
  async execute() {
    // Prevenir execuções simultâneas
    if (this.isRunning) {
      logger.log('⚠️ [ReminderJob] Job já está em execução. Pulando esta iteração.');
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    try {
      logger.log('\n' + '='.repeat(80));
      logger.log(`🎯 [ReminderJob] EXECUÇÃO #${this.executionCount} INICIADA`);
      logger.log(`⏰ Horário: ${new Date().toLocaleString('pt-BR')}`);
      logger.log('='.repeat(80) + '\n');

      // Processar todos os lembretes (24h e 2h)
      const results = await this.reminderService.processAllReminders();

      // Atualizar estatísticas
      this.stats.totalProcessed += (results.reminders24h.processed + results.reminders2h.processed + (results.birthdays?.processed || 0));
      this.stats.totalSent += (results.reminders24h.sent + results.reminders2h.sent + (results.birthdays?.sent || 0));
      this.stats.totalFailed += (results.reminders24h.failed + results.reminders2h.failed + (results.birthdays?.failed || 0));
      this.stats.totalSkipped += results.reminders24h.skipped + results.reminders2h.skipped;

      this.lastExecution = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      logger.log('\n' + '='.repeat(80));
      logger.log(`✅ [ReminderJob] EXECUÇÃO #${this.executionCount} CONCLUÍDA`);
      logger.log(`⏱️ Duração: ${duration}s`);
      logger.log(`📊 Lembretes 24h: ${results.reminders24h.sent}/${results.reminders24h.processed} enviados`);
      logger.log(`📊 Lembretes 1h: ${results.reminders2h.sent}/${results.reminders2h.processed} enviados`);
      if (results.birthdays) {
        logger.log(`🎂 Aniversários: ${results.birthdays.sent}/${results.birthdays.processed} enviados`);
      }
      logger.log('='.repeat(80) + '\n');

    } catch (error) {
      logger.error('\n' + '='.repeat(80));
      logger.error(`❌ [ReminderJob] ERRO NA EXECUÇÃO #${this.executionCount}`);
      logger.error('❌ Erro:', error);
      logger.error('='.repeat(80) + '\n');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Iniciar o cron job
   */
  start() {
    logger.log('\n' + '='.repeat(80));
    logger.log('🚀 [ReminderJob] INICIANDO CRON JOB DE LEMBRETES');
    logger.log(`📅 Expressão Cron: ${this.cronExpression} (a cada 30 minutos)`);
    logger.log(`⏰ Horário permitido: 06:00 - 23:00`);
    logger.log(`🔄 Retry: 3 tentativas por lembrete`);
    logger.log(`📱 Canal: WhatsApp via Evolution API`);
    logger.log('='.repeat(80) + '\n');

    // Criar o cron job
    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.log('✅ [ReminderJob] Cron job iniciado com sucesso!');
    logger.log(`⏰ Próxima execução: ${this.getNextExecutionTime()}\n`);

    // Executar imediatamente na inicialização (opcional - comentar se não quiser)
    // this.execute();
  }

  /**
   * Parar o cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.log('\n🛑 [ReminderJob] Cron job parado.');
      this.printStats();
    }
  }

  /**
   * Obter horário da próxima execução
   */
  getNextExecutionTime() {
    const now = new Date();
    const next = new Date(now);
    // Próxima execução: arredondar para o próximo múltiplo de 30 minutos
    const minutes = now.getMinutes();
    if (minutes < 30) {
      next.setMinutes(30, 0, 0);
    } else {
      next.setHours(now.getHours() + 1, 0, 0, 0);
    }
    return next.toLocaleString('pt-BR');
  }

  /**
   * Imprimir estatísticas do job
   */
  printStats() {
    logger.log('\n' + '='.repeat(80));
    logger.log('📊 [ReminderJob] ESTATÍSTICAS GERAIS');
    logger.log('='.repeat(80));
    logger.log(`🔢 Total de execuções: ${this.executionCount}`);
    logger.log(`📤 Total de lembretes processados: ${this.stats.totalProcessed}`);
    logger.log(`✅ Total de lembretes enviados: ${this.stats.totalSent}`);
    logger.log(`❌ Total de falhas: ${this.stats.totalFailed}`);
    logger.log(`⏭️ Total de execuções puladas: ${this.stats.totalSkipped}`);
    if (this.lastExecution) {
      logger.log(`⏰ Última execução: ${this.lastExecution.toLocaleString('pt-BR')}`);
    }
    logger.log('='.repeat(80) + '\n');
  }

  /**
   * Obter status do job
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      executionCount: this.executionCount,
      lastExecution: this.lastExecution,
      nextExecution: this.getNextExecutionTime(),
      stats: this.stats,
      cronExpression: this.cronExpression
    };
  }
}

// Exportar instância única (singleton)
const reminderJob = new ReminderJob();

module.exports = reminderJob;

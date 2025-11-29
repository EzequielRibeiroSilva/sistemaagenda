/**
 * Job: reminderJob
 * Descrição: Cron job para envio automático de lembretes de agendamentos
 * Frequência: A cada 60 minutos
 * Horário permitido: 06:00 - 23:00
 */

const cron = require('node-cron');
const ReminderService = require('../services/ReminderService');

class ReminderJob {
  constructor() {
    this.reminderService = new ReminderService();
    this.cronExpression = '0 * * * *'; // A cada hora (minuto 0)
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
      console.log('⚠️ [ReminderJob] Job já está em execução. Pulando esta iteração.');
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    try {
      console.log('\n' + '='.repeat(80));
      console.log(`🎯 [ReminderJob] EXECUÇÃO #${this.executionCount} INICIADA`);
      console.log(`⏰ Horário: ${new Date().toLocaleString('pt-BR')}`);
      console.log('='.repeat(80) + '\n');

      // Processar todos os lembretes (24h e 2h)
      const results = await this.reminderService.processAllReminders();

      // Atualizar estatísticas
      this.stats.totalProcessed += results.reminders24h.processed + results.reminders2h.processed;
      this.stats.totalSent += results.reminders24h.sent + results.reminders2h.sent;
      this.stats.totalFailed += results.reminders24h.failed + results.reminders2h.failed;
      this.stats.totalSkipped += results.reminders24h.skipped + results.reminders2h.skipped;

      this.lastExecution = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n' + '='.repeat(80));
      console.log(`✅ [ReminderJob] EXECUÇÃO #${this.executionCount} CONCLUÍDA`);
      console.log(`⏱️ Duração: ${duration}s`);
      console.log(`📊 Lembretes 24h: ${results.reminders24h.sent}/${results.reminders24h.processed} enviados`);
      console.log(`📊 Lembretes 2h: ${results.reminders2h.sent}/${results.reminders2h.processed} enviados`);
      console.log('='.repeat(80) + '\n');

    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error(`❌ [ReminderJob] ERRO NA EXECUÇÃO #${this.executionCount}`);
      console.error('❌ Erro:', error);
      console.error('='.repeat(80) + '\n');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Iniciar o cron job
   */
  start() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 [ReminderJob] INICIANDO CRON JOB DE LEMBRETES');
    console.log(`📅 Expressão Cron: ${this.cronExpression} (a cada 60 minutos)`);
    console.log(`⏰ Horário permitido: 06:00 - 23:00`);
    console.log(`🔄 Retry: 3 tentativas por lembrete`);
    console.log(`📱 Canal: WhatsApp via Evolution API`);
    console.log('='.repeat(80) + '\n');

    // Criar o cron job
    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    console.log('✅ [ReminderJob] Cron job iniciado com sucesso!');
    console.log(`⏰ Próxima execução: ${this.getNextExecutionTime()}\n`);

    // Executar imediatamente na inicialização (opcional - comentar se não quiser)
    // this.execute();
  }

  /**
   * Parar o cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      console.log('\n🛑 [ReminderJob] Cron job parado.');
      this.printStats();
    }
  }

  /**
   * Obter horário da próxima execução
   */
  getNextExecutionTime() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(now.getHours() + 1, 0, 0, 0);
    return next.toLocaleString('pt-BR');
  }

  /**
   * Imprimir estatísticas do job
   */
  printStats() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 [ReminderJob] ESTATÍSTICAS GERAIS');
    console.log('='.repeat(80));
    console.log(`🔢 Total de execuções: ${this.executionCount}`);
    console.log(`📤 Total de lembretes processados: ${this.stats.totalProcessed}`);
    console.log(`✅ Total de lembretes enviados: ${this.stats.totalSent}`);
    console.log(`❌ Total de falhas: ${this.stats.totalFailed}`);
    console.log(`⏭️ Total de execuções puladas: ${this.stats.totalSkipped}`);
    if (this.lastExecution) {
      console.log(`⏰ Última execução: ${this.lastExecution.toLocaleString('pt-BR')}`);
    }
    console.log('='.repeat(80) + '\n');
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

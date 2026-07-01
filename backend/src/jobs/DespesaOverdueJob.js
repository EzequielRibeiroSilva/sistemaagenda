/**
 * Job: DespesaOverdueJob
 * Descrição: Atualiza automaticamente o status de despesas pendentes para OVERDUE quando a data de vencimento passa
 * Frequência: Diariamente às 00:00 (meia-noite)
 * 
 * Best Practice: Persistir status OVERDUE no banco permite:
 * - Relatórios históricos sem recalcular datas
 * - Performance otimizada (índice simples vs cálculo de data)
 * - Auditoria e governança financeira
 */

const cron = require('node-cron');
const { db } = require('../config/knex');
const logger = require('../utils/logger');

class DespesaOverdueJob {
  constructor() {
    this.cronExpression = '0 0 * * *'; // Diariamente às 00:00 (meia-noite)
    this.isRunning = false;
    this.lastExecution = null;
    this.executionCount = 0;
    this.stats = {
      totalUpdatedExpenses: 0,
      totalIterationsSkipped: 0
    };
    this.job = null;
  }

  async execute() {
    if (this.isRunning) {
      this.stats.totalIterationsSkipped++;
      logger.log('⚠️ [DespesaOverdueJob] Job já está em execução. Pulando esta iteração.');
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    let updatedCount = 0;
    let totalValorVencido = 0;

    try {
      logger.log(`\n🧹 [DespesaOverdueJob] Execução #${this.executionCount} iniciada (${new Date().toLocaleString('pt-BR')})`);

      await db.transaction(async (trx) => {
        // Buscar despesas pendentes vencidas em lote para evitar transações longas
        const rows = await trx('despesas')
          .where('status', 'PENDING')
          .andWhere('data_vencimento', '<', trx.fn.now())
          .select('id', 'descricao', 'valor', 'data_vencimento', 'unidade_id')
          .forUpdate()
          .skipLocked()
          .limit(500); // Processar até 500 registros por execução

        if (!rows || rows.length === 0) {
          logger.log('ℹ️  [DespesaOverdueJob] Nenhuma despesa vencida encontrada.');
          return;
        }

        logger.log(`📊 [DespesaOverdueJob] ${rows.length} despesas vencidas encontradas. Atualizando status...`);

        // 💰 AUDITORIA FINANCEIRA: Calcular valor total vencido
        totalValorVencido = rows.reduce((acc, row) => {
          const valor = Number(row.valor) || 0;
          return acc + valor;
        }, 0);

        // Atualizar em batch para melhor performance
        const despesaIds = rows.map(r => r.id);
        
        const updated = await trx('despesas')
          .whereIn('id', despesaIds)
          .andWhere('status', 'PENDING') // Double-check para evitar race conditions
          .update({
            status: 'OVERDUE',
            updated_at: trx.fn.now()
          });

        updatedCount = updated || 0;

        // 📋 LOG DE AUDITORIA DETALHADA: Registrar amostra das despesas atualizadas
        if (updatedCount > 0) {
          logger.log('📝 [DespesaOverdueJob] AUDITORIA - Despesas marcadas como OVERDUE:');
          rows.slice(0, 10).forEach((row, idx) => {
            const valorFormatado = new Intl.NumberFormat('pt-BR', { 
              style: 'currency', 
              currency: 'BRL' 
            }).format(Number(row.valor) || 0);
            
            logger.log(`   ${idx + 1}. ID ${row.id} | Unidade ${row.unidade_id} | Vencimento: ${row.data_vencimento} | Valor: ${valorFormatado} | ${row.descricao}`);
          });
          if (rows.length > 10) {
            logger.log(`   ... e mais ${rows.length - 10} despesas.`);
          }
        }
      });

      this.stats.totalUpdatedExpenses += updatedCount;
      this.lastExecution = new Date();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      // 💰 LOG CONSOLIDADO DE IMPACTO FINANCEIRO (Governança)
      const totalVencidoFormatado = new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }).format(totalValorVencido);
      
      logger.log(`✅ [DespesaOverdueJob] Execução #${this.executionCount} concluída em ${duration}s`);
      logger.log(`📊 [DespesaOverdueJob] Resultado: ${updatedCount} despesas atualizadas | Total vencido: ${totalVencidoFormatado}`);
      logger.log(`📈 [DespesaOverdueJob] Total acumulado desde inicialização: ${this.stats.totalUpdatedExpenses} despesas`);

    } catch (error) {
      logger.error(`❌ [DespesaOverdueJob] Erro na execução #${this.executionCount}:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    logger.log('\n' + '='.repeat(80));
    logger.log('🚀 [DespesaOverdueJob] INICIANDO JOB DE ATUALIZAÇÃO DE DESPESAS VENCIDAS');
    logger.log(`📅 Expressão Cron: ${this.cronExpression} (Diariamente às 00:00)`);
    logger.log(`🌎 Timezone: America/Sao_Paulo`);
    logger.log('='.repeat(80) + '\n');

    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.log('✅ [DespesaOverdueJob] Job registrado e agendado com sucesso!');
    logger.log('ℹ️  [DespesaOverdueJob] Próxima execução: 00:00 (meia-noite)\n');
  }

  /**
   * Execução manual para testes (não aguarda o cron)
   */
  async runNow() {
    logger.log('🔧 [DespesaOverdueJob] Execução manual solicitada...');
    await this.execute();
  }

  stop() {
    if (this.job) {
      this.job.stop();
      logger.log('🛑 [DespesaOverdueJob] Job parado.');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      executionCount: this.executionCount,
      lastExecution: this.lastExecution,
      stats: this.stats,
      cronExpression: this.cronExpression,
      nextExecution: '00:00 (meia-noite)'
    };
  }
}

const despesaOverdueJob = new DespesaOverdueJob();
module.exports = despesaOverdueJob;

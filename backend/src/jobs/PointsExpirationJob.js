const cron = require('node-cron');
const { db } = require('../config/knex');
const logger = require('../utils/logger');

/**
 * AÇÃO 1.3 - MOTOR AUTOMÁTICO DE EXPIRAÇÃO
 * 
 * Job responsável por expirar pontos de crédito vencidos automaticamente,
 * evitando que pontos expirados continuem inflando o saldo do cliente.
 * 
 * Execução: Diariamente às 03:00 AM (horário de Brasília)
 * Estratégia: UPDATE transacional de registros CREDITO com data_validade expirada
 * 
 * REGRAS DE NEGÓCIO:
 * - Apenas pontos do tipo CREDITO podem expirar
 * - Pontos já marcados como expirados (expirado = true) são ignorados
 * - Apenas pontos com data_validade < hoje são expirados
 * - Operação é transacional e atômica
 */
class PointsExpirationJob {
  constructor() {
    // Executa todos os dias às 03:00 AM (horário de menor atividade)
    this.cronExpression = '0 3 * * *';
    this.isRunning = false;
    this.lastExecution = null;
    this.executionCount = 0;
    this.job = null;
  }

  /**
   * Executa a expiração de pontos vencidos
   */
  async execute() {
    if (this.isRunning) {
      logger.log('⚠️ [PointsExpiration] Job já está em execução. Pulando esta iteração.');
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    let trx;
    try {
      logger.info(`⏰ [PointsExpiration] Iniciando varredura #${this.executionCount} de expiração de pontos`);

      trx = await db.transaction();

      // ⚡ QUERY DE EXPIRAÇÃO: Marcar pontos vencidos como expirados
      // Condições:
      // 1. tipo = 'CREDITO' (apenas créditos podem expirar)
      // 2. expirado = false (ignorar pontos já expirados)
      // 3. data_validade < CURRENT_DATE (comparação em nível de banco para precisão)
      const result = await trx('pontos_historico')
        .where('tipo', 'CREDITO')
        .where('expirado', false)
        .whereRaw('data_validade < CURRENT_DATE')
        .update({
          expirado: true
        });

      // Commit da transação
      await trx.commit();

      this.lastExecution = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // 📊 LOG DE AUDITORIA
      logger.info(`✅ [PointsExpiration] Execução #${this.executionCount} concluída em ${duration}s`, {
        pontos_expirados: result,
        data_referencia: this._getDataAtual(),
        duracao_segundos: parseFloat(duration)
      });

      // Log de alerta se muitos pontos foram expirados (possível anomalia ou primeiro run)
      if (result > 1000) {
        logger.warn(`⚠️ [PointsExpiration] Alto volume de pontos expirados: ${result}. Verificar se está normal ou é primeiro run.`);
      }

      // Log informativo se nenhum ponto foi expirado
      if (result === 0) {
        logger.info('ℹ️ [PointsExpiration] Nenhum ponto vencido encontrado nesta varredura.');
      }

    } catch (error) {
      // Rollback em caso de erro
      if (trx) {
        await trx.rollback();
      }

      logger.error(`❌ [PointsExpiration] Erro na execução #${this.executionCount}:`, {
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
    logger.log('⏰ [PointsExpiration] INICIANDO JOB DE EXPIRAÇÃO AUTOMÁTICA DE PONTOS');
    logger.log(`📅 Expressão Cron: ${this.cronExpression} (todos os dias às 03:00)`);
    logger.log(`📊 Data de referência: ${this._getDataAtual()}`);
    logger.log(`🎯 Alvo: Pontos CREDITO com expirado=false e data_validade < hoje`);
    logger.log('='.repeat(80) + '\n');

    this.job = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    logger.log('✅ [PointsExpiration] Job iniciado com sucesso!\n');
  }

  /**
   * Para o agendamento do job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.log('🛑 [PointsExpiration] Job parado.');
    }
  }

  /**
   * Retorna a data atual no formato YYYY-MM-DD
   * @returns {string} Data no formato YYYY-MM-DD
   * @private
   */
  _getDataAtual() {
    const hoje = new Date();
    return hoje.toISOString().split('T')[0];
  }

  /**
   * Execução manual para testes (não agendada)
   * @returns {Promise<Object>} Resultado da execução
   */
  async executeManual() {
    const startTime = Date.now();
    let trx;
    
    try {
      logger.info('🧪 [PointsExpiration] Executando expiração manual (teste)...');

      trx = await db.transaction();

      const result = await trx('pontos_historico')
        .where('tipo', 'CREDITO')
        .where('expirado', false)
        .whereRaw('data_validade < CURRENT_DATE')
        .update({
          expirado: true
        });

      await trx.commit();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      const resultado = {
        sucesso: true,
        pontos_expirados: result,
        duracao_segundos: parseFloat(duration),
        data_referencia: this._getDataAtual()
      };

      logger.info('✅ [PointsExpiration] Execução manual concluída:', resultado);
      return resultado;

    } catch (error) {
      if (trx) {
        await trx.rollback();
      }

      const resultado = {
        sucesso: false,
        erro: error?.message,
        duracao_segundos: ((Date.now() - startTime) / 1000).toFixed(2)
      };

      logger.error('❌ [PointsExpiration] Erro na execução manual:', resultado);
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
      dataReferencia: this._getDataAtual()
    };
  }
}

const pointsExpirationJob = new PointsExpirationJob();
module.exports = pointsExpirationJob;

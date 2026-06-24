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
    this.batchSize = 500;
    this.isRunning = false;
    this.lastExecution = null;
    this.executionCount = 0;
    this.job = null;
  }

  async _processBatch(trx) {
    const sql = `
      WITH to_expire AS (
        SELECT id, cliente_id, unidade_id, pontos
        FROM pontos_historico
        WHERE tipo = 'CREDITO_VENDAS'
          AND expirado = false
          AND data_validade < CURRENT_DATE
        ORDER BY id
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      ),
      marked AS (
        UPDATE pontos_historico ph
        SET expirado = true
        FROM to_expire te
        WHERE ph.id = te.id
        RETURNING te.cliente_id, te.unidade_id, te.pontos
      ),
      inserted_debits AS (
        INSERT INTO pontos_historico (
          cliente_id,
          unidade_id,
          usuario_id,
          agendamento_id,
          tipo,
          pontos,
          valor_real,
          descricao,
          data_validade,
          expirado,
          taxa_conversao_snapshot,
          created_at
        )
        SELECT
          m.cliente_id,
          m.unidade_id,
          -1 AS usuario_id,
          NULL AS agendamento_id,
          'EXPIRACAO' AS tipo,
          m.pontos,
          NULL AS valor_real,
          'Expiração automática de pontos vencidos' AS descricao,
          NULL AS data_validade,
          false AS expirado,
          NULL AS taxa_conversao_snapshot,
          NOW() AS created_at
        FROM marked m
        RETURNING id
      ),
      agg AS (
        SELECT cliente_id, unidade_id, SUM(pontos) AS total_pontos
        FROM marked
        GROUP BY cliente_id, unidade_id
      ),
      updated_clients AS (
        UPDATE clientes c
        SET saldo_pontos = c.saldo_pontos - agg.total_pontos
        FROM agg
        WHERE c.id = agg.cliente_id AND c.unidade_id = agg.unidade_id
        RETURNING agg.total_pontos
      )
      SELECT
        (SELECT COUNT(*)::int FROM to_expire) AS rows_expired,
        COALESCE((SELECT SUM(total_pontos) FROM updated_clients), 0) AS pontos_debitados_total;
    `;

    const result = await trx.raw(sql, [this.batchSize]);
    const row = result?.rows?.[0] || {};

    return {
      rows_expired: Number(row.rows_expired) || 0,
      pontos_debitados_total: Number(row.pontos_debitados_total) || 0
    };
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

    try {
      logger.info(`⏰ [PointsExpiration] Iniciando varredura #${this.executionCount} de expiração de pontos`);

      let totalRowsExpired = 0;
      let totalPontosDebitados = 0;
      let batchCount = 0;

      while (true) {
        const batchResult = await db.transaction(async (trx) => {
          return await this._processBatch(trx);
        });

        if (!batchResult?.rows_expired) {
          break;
        }

        batchCount += 1;
        totalRowsExpired += batchResult.rows_expired;
        totalPontosDebitados += batchResult.pontos_debitados_total;

        // Evitar loop infinito em caso de comportamento inesperado
        if (batchResult.rows_expired < this.batchSize) {
          break;
        }
      }

      if (totalRowsExpired === 0) {
        this.lastExecution = new Date();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info('ℹ️ [PointsExpiration] Nenhum ponto vencido encontrado nesta varredura.');
        this.isRunning = false;
        return;
      }

      this.lastExecution = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // 📊 LOG DE AUDITORIA
      logger.info(`✅ [PointsExpiration] Execução #${this.executionCount} concluída em ${duration}s`, {
        pontos_expirados: totalRowsExpired,
        batches: batchCount,
        pontos_debitados_total: totalPontosDebitados,
        data_referencia: this._getDataAtual(),
        duracao_segundos: parseFloat(duration)
      });

      // Log de alerta se muitos pontos foram expirados (possível anomalia ou primeiro run)
      if (totalRowsExpired > 1000) {
        logger.warn(`⚠️ [PointsExpiration] Alto volume de pontos expirados: ${totalRowsExpired}. Verificar se está normal ou é primeiro run.`);
      }

      // Log informativo se nenhum ponto foi expirado
      if (totalRowsExpired === 0) {
        logger.info('ℹ️ [PointsExpiration] Nenhum ponto vencido encontrado nesta varredura.');
      }

    } catch (error) {
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
    
    try {
      logger.info('🧪 [PointsExpiration] Executando expiração manual (teste)...');

      let totalRowsExpired = 0;
      let totalPontosDebitados = 0;
      let batchCount = 0;

      while (true) {
        const batchResult = await db.transaction(async (trx) => {
          return await this._processBatch(trx);
        });

        if (!batchResult?.rows_expired) {
          break;
        }

        batchCount += 1;
        totalRowsExpired += batchResult.rows_expired;
        totalPontosDebitados += batchResult.pontos_debitados_total;

        if (batchResult.rows_expired < this.batchSize) {
          break;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      const resultado = {
        sucesso: true,
        pontos_expirados: totalRowsExpired,
        batches: batchCount,
        pontos_debitados_total: totalPontosDebitados,
        duracao_segundos: parseFloat(duration),
        data_referencia: this._getDataAtual()
      };

      logger.info('✅ [PointsExpiration] Execução manual concluída:', resultado);
      return resultado;

    } catch (error) {
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

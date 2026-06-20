/**
 * DistributedLockService.js
 * 
 * TASK 1.2 - LOCK DISTRIBUÍDO (RACE CONDITIONS)
 * Sprint de Hardening - Due Diligence
 * 
 * Responsabilidade: Implementar bloqueio distribuído via Redis para prevenir race conditions
 * em operações críticas (principalmente agendamentos concorrentes).
 * 
 * Casos de Uso:
 * - Dois clientes tentam agendar o mesmo horário simultaneamente
 * - Múltiplas requisições do mesmo cliente (duplo clique, retry automático)
 * - Race condition em ambiente de múltiplas instâncias/workers
 * 
 * Arquitetura:
 * - Redis SET NX EX (SET if Not Exists com EXpiration)
 * - Locks auto-expiram após TTL (fail-safe contra deadlocks)
 * - Chaves únicas por recurso (agente + data + hora)
 */

const logger = require('../utils/logger');

class DistributedLockService {
  
  /**
   * TTL padrão do lock: 10 segundos
   * 
   * Justificativa:
   * - Agendamento leva ~2-5 segundos em média
   * - 10 segundos é margem segura para operações lentas
   * - Auto-libera em caso de crash/erro sem finally
   */
  static DEFAULT_LOCK_TTL_SECONDS = 10;

  /**
   * Prefixo para chaves de lock de agendamento
   */
  static BOOKING_LOCK_PREFIX = 'booking_lock';

  /**
   * Tenta adquirir um lock distribuído no Redis.
   * 
   * @param {object} redis - Cliente Redis (ioredis)
   * @param {string} lockKey - Chave única do lock
   * @param {number} [ttlSeconds] - TTL do lock em segundos (padrão: 10)
   * @returns {Promise<boolean>} true se lock foi adquirido, false se já existe
   */
  static async acquireLock(redis, lockKey, ttlSeconds = this.DEFAULT_LOCK_TTL_SECONDS) {
    if (!redis) {
      logger.error('[DistributedLockService] Redis não fornecido - operação bloqueada por segurança');
      // Sem Redis, BLOQUEAR operação (consistência > disponibilidade)
      throw new Error('LOCK_UNAVAILABLE: Sistema de bloqueio indisponível. Tente novamente em instantes.');
    }

    if (!lockKey || typeof lockKey !== 'string') {
      logger.error('[DistributedLockService] lockKey inválida', { lockKey });
      throw new Error('INVALID_LOCK_KEY: Chave de bloqueio inválida');
    }

    try {
      // SET lockKey "locked" NX EX ttlSeconds
      // NX = Only set if Not eXists
      // EX = set EXpiry time in seconds
      const result = await redis.set(lockKey, 'locked', 'EX', ttlSeconds, 'NX');
      
      const acquired = result === 'OK';

      if (acquired) {
        logger.info('[DistributedLockService] Lock adquirido', {
          lock_key: lockKey,
          ttl_seconds: ttlSeconds
        });
      } else {
        logger.warn('[DistributedLockService] Lock NÃO adquirido (recurso já bloqueado)', {
          lock_key: lockKey
        });
      }

      return acquired;

    } catch (error) {
      logger.error('[DistributedLockService] Erro ao adquirir lock (bloqueando por segurança)', {
        error: error.message,
        lock_key: lockKey
      });
      
      // Em caso de erro de conexão Redis, BLOQUEAR operação
      // Preferimos consistência (evitar double booking) a disponibilidade
      throw new Error('LOCK_ERROR: Falha ao adquirir bloqueio. Tente novamente em instantes.');
    }
  }

  /**
   * Libera um lock distribuído no Redis.
   * 
   * @param {object} redis - Cliente Redis (ioredis)
   * @param {string} lockKey - Chave única do lock
   * @returns {Promise<boolean>} true se liberou, false se não existia
   */
  static async releaseLock(redis, lockKey) {
    if (!redis || !lockKey) {
      return false;
    }

    try {
      const deleted = await redis.del(lockKey);
      
      if (deleted === 1) {
        logger.info('[DistributedLockService] Lock liberado', {
          lock_key: lockKey
        });
        return true;
      } else {
        logger.debug('[DistributedLockService] Lock não existia (já expirou ou foi liberado)', {
          lock_key: lockKey
        });
        return false;
      }

    } catch (error) {
      logger.error('[DistributedLockService] Erro ao liberar lock (não-crítico)', {
        error: error.message,
        lock_key: lockKey
      });
      // Erro ao liberar não é crítico: lock expira automaticamente
      return false;
    }
  }

  /**
   * Gera chave de lock para agendamento.
   * 
   * Formato: booking_lock:{unidadeId}:{agenteId}:{data}:{hora}
   * 
   * Exemplo: booking_lock:1:5:2026-06-18:14:00
   * 
   * Garante que apenas UM agendamento por vez pode ser criado
   * para o mesmo agente, na mesma data e hora.
   * 
   * @param {object} params
   * @param {number} params.unidadeId - ID da unidade
   * @param {number} params.agenteId - ID do agente/profissional
   * @param {string} params.dataAgendamento - Data no formato YYYY-MM-DD
   * @param {string} params.horaInicio - Hora no formato HH:MM
   * @returns {string} Chave única do lock
   */
  static generateBookingLockKey({ unidadeId, agenteId, dataAgendamento, horaInicio }) {
    // Validação de parâmetros
    if (!unidadeId || !agenteId || !dataAgendamento || !horaInicio) {
      throw new Error('INVALID_LOCK_PARAMS: Parâmetros de lock inválidos');
    }

    // Normalizar hora (remover segundos se houver)
    const horaNormalizada = String(horaInicio).substring(0, 5); // "14:00:00" -> "14:00"

    return `${this.BOOKING_LOCK_PREFIX}:${unidadeId}:${agenteId}:${dataAgendamento}:${horaNormalizada}`;
  }

  /**
   * Executa uma função dentro de um lock distribuído (pattern: with-lock).
   * 
   * Adquire o lock, executa a função, libera o lock (com garantia via try-finally).
   * 
   * @param {object} redis - Cliente Redis
   * @param {string} lockKey - Chave do lock
   * @param {Function} fn - Função a ser executada dentro do lock (pode ser async)
   * @param {number} [ttlSeconds] - TTL do lock (padrão: 10s)
   * @returns {Promise<any>} Retorno da função executada
   */
  static async withLock(redis, lockKey, fn, ttlSeconds = this.DEFAULT_LOCK_TTL_SECONDS) {
    // Tentar adquirir lock
    const acquired = await this.acquireLock(redis, lockKey, ttlSeconds);

    if (!acquired) {
      // Lock não adquirido: outro processo está usando este recurso
      const error = new Error('Desculpe, este horário acabou de ser reservado. Por favor, escolha outro.');
      error.code = 'LOCK_CONFLICT';
      error.httpStatus = 409; // Conflict
      throw error;
    }

    // Lock adquirido: executar função e garantir liberação
    try {
      return await fn();
    } finally {
      // Liberar lock (sempre executa, mesmo se fn() lançar erro)
      await this.releaseLock(redis, lockKey);
    }
  }

  /**
   * Verifica se um lock existe (sem tentar adquirir).
   * 
   * Útil para debugging/monitoramento.
   * 
   * @param {object} redis - Cliente Redis
   * @param {string} lockKey - Chave do lock
   * @returns {Promise<boolean>} true se lock existe, false caso contrário
   */
  static async isLocked(redis, lockKey) {
    if (!redis || !lockKey) {
      return false;
    }

    try {
      const exists = await redis.exists(lockKey);
      return exists === 1;
    } catch (error) {
      logger.error('[DistributedLockService] Erro ao verificar lock', {
        error: error.message,
        lock_key: lockKey
      });
      return false;
    }
  }

  /**
   * Obtém TTL restante de um lock.
   * 
   * @param {object} redis - Cliente Redis
   * @param {string} lockKey - Chave do lock
   * @returns {Promise<number>} TTL em segundos (-2 se não existe, -1 se sem expiração)
   */
  static async getLockTTL(redis, lockKey) {
    if (!redis || !lockKey) {
      return -2;
    }

    try {
      const ttl = await redis.ttl(lockKey);
      return ttl;
    } catch (error) {
      logger.error('[DistributedLockService] Erro ao obter TTL do lock', {
        error: error.message,
        lock_key: lockKey
      });
      return -2;
    }
  }
}

module.exports = DistributedLockService;

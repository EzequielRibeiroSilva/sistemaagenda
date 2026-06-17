const logger = require('../utils/logger');

class CircuitBreakerService {
  static FAIL_TTL_SECONDS = parseInt(process.env.CIRCUIT_BREAKER_FAIL_TTL_SECONDS || '300', 10);

  static OPEN_TTL_SECONDS = parseInt(process.env.CIRCUIT_BREAKER_OPEN_TTL_SECONDS || '900', 10);

  static FAIL_THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_FAIL_THRESHOLD || '3', 10);

  static getFailsKey(unidadeId) {
    return `circuit_breaker:ia_fails:${unidadeId}`;
  }

  static getOpenKey(unidadeId) {
    return `circuit_breaker:ia_open:${unidadeId}`;
  }

  static async isOpen(redis, unidadeId) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) {
      return { open: false };
    }

    try {
      const ttl = await redis.ttl(this.getOpenKey(uid));
      return { open: ttl > 0, ttlSeconds: ttl };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on isOpen (fail-open):', err?.message);
      return { open: false };
    }
  }

  static async recordSuccess(redis, unidadeId) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) return { ok: false };

    try {
      await redis.del(this.getFailsKey(uid));
      return { ok: true };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on recordSuccess:', err?.message);
      return { ok: false };
    }
  }

  static async recordFailure(redis, unidadeId) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) {
      return { ok: false, openedNow: false, open: false };
    }

    const failsKey = this.getFailsKey(uid);
    const openKey = this.getOpenKey(uid);

    try {
      const count = await redis.incr(failsKey);
      await redis.expire(failsKey, this.FAIL_TTL_SECONDS);

      if (count >= this.FAIL_THRESHOLD) {
        const setResult = await redis.set(openKey, '1', 'EX', this.OPEN_TTL_SECONDS, 'NX');
        const openedNow = setResult === 'OK';
        return {
          ok: true,
          count,
          open: true,
          openedNow,
          openTtlSeconds: this.OPEN_TTL_SECONDS,
        };
      }

      return { ok: true, count, open: false, openedNow: false };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on recordFailure (fail-open):', err?.message);
      return { ok: false, openedNow: false, open: false };
    }
  }
}

module.exports = CircuitBreakerService;

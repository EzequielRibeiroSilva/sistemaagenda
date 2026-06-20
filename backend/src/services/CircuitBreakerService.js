const logger = require('../utils/logger');

class CircuitBreakerService {
  static FAIL_TTL_SECONDS = parseInt(process.env.CIRCUIT_BREAKER_FAIL_TTL_SECONDS || '300', 10);

  static OPEN_TTL_SECONDS = parseInt(process.env.CIRCUIT_BREAKER_OPEN_TTL_SECONDS || '300', 10);

  static FAIL_THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_FAIL_THRESHOLD || '3', 10);

  static HALF_OPEN_LOCK_TTL_SECONDS = parseInt(process.env.CIRCUIT_BREAKER_HALF_OPEN_LOCK_TTL_SECONDS || '60', 10);

  static STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
  };

  static getFailsKey(unidadeId) {
    return `circuit_breaker:ia_fails:${unidadeId}`;
  }

  static getOpenKey(unidadeId) {
    return `circuit_breaker:ia_open:${unidadeId}`;
  }

  static getStateKey(unidadeId) {
    return `circuit_breaker:ia_state:${unidadeId}`;
  }

  static getHalfOpenLockKey(unidadeId) {
    return `circuit_breaker:ia_half_open_lock:${unidadeId}`;
  }

  static async getStatus(redis, unidadeId) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) {
      return { ok: false, state: this.STATES.CLOSED };
    }

    try {
      const stateRaw = await redis.get(this.getStateKey(uid));
      const state = stateRaw || this.STATES.CLOSED;
      const ttl = await redis.ttl(this.getOpenKey(uid));
      const ttlSeconds = typeof ttl === 'number' ? ttl : null;

      return {
        ok: true,
        state,
        ttlSeconds,
      };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on getStatus (fail-open):', err?.message);
      return { ok: false, state: this.STATES.CLOSED };
    }
  }

  static logStateChange(unidadeId, fromState, toState, extra = {}) {
    if (fromState === toState) return;
    logger.warn('[CircuitBreaker] State Changed', {
      unidade_id: unidadeId,
      from: fromState,
      to: toState,
      ...extra,
    });
  }

  static async open(redis, unidadeId, reason = null) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) {
      return { ok: false, state: this.STATES.CLOSED, openedNow: false };
    }

    const stateKey = this.getStateKey(uid);
    const openKey = this.getOpenKey(uid);
    const halfOpenLockKey = this.getHalfOpenLockKey(uid);

    try {
      const prevState = (await redis.get(stateKey)) || this.STATES.CLOSED;
      await redis.set(stateKey, this.STATES.OPEN);

      const setResult = await redis.set(openKey, '1', 'EX', this.OPEN_TTL_SECONDS, 'NX');
      const openedNow = setResult === 'OK';
      await redis.del(halfOpenLockKey);

      if (openedNow) {
        this.logStateChange(uid, prevState, this.STATES.OPEN, { reason, openTtlSeconds: this.OPEN_TTL_SECONDS });
      }

      return {
        ok: true,
        state: this.STATES.OPEN,
        open: true,
        openedNow,
        openTtlSeconds: this.OPEN_TTL_SECONDS,
      };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on open (fail-open):', err?.message);
      return { ok: false, state: this.STATES.CLOSED, openedNow: false, open: false };
    }
  }

  static async transitionToHalfOpen(redis, unidadeId) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) {
      return { ok: false, state: this.STATES.CLOSED };
    }

    const stateKey = this.getStateKey(uid);

    try {
      const prevState = (await redis.get(stateKey)) || this.STATES.CLOSED;
      if (prevState !== this.STATES.OPEN) {
        return { ok: true, state: prevState };
      }

      await redis.set(stateKey, this.STATES.HALF_OPEN);
      this.logStateChange(uid, prevState, this.STATES.HALF_OPEN);
      return { ok: true, state: this.STATES.HALF_OPEN };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on transitionToHalfOpen (fail-open):', err?.message);
      return { ok: false, state: this.STATES.CLOSED };
    }
  }

  static async acquireHalfOpenTrial(redis, unidadeId) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) {
      return { ok: false, acquired: true };
    }

    try {
      const lockKey = this.getHalfOpenLockKey(uid);
      const result = await redis.set(lockKey, '1', 'EX', this.HALF_OPEN_LOCK_TTL_SECONDS, 'NX');
      return { ok: true, acquired: result === 'OK' };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on acquireHalfOpenTrial (fail-open):', err?.message);
      return { ok: false, acquired: true };
    }
  }

  static async beforeRequest(redis, unidadeId) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) {
      return { ok: false, allow: true, state: this.STATES.CLOSED };
    }

    try {
      const stateKey = this.getStateKey(uid);
      const openKey = this.getOpenKey(uid);

      const stateRaw = await redis.get(stateKey);
      let state = stateRaw || this.STATES.CLOSED;

      if (!stateRaw) {
        const legacyTtl = await redis.ttl(openKey);
        if (legacyTtl > 0) {
          await redis.set(stateKey, this.STATES.OPEN);
          state = this.STATES.OPEN;
        }
      }

      if (state === this.STATES.OPEN) {
        const ttl = await redis.ttl(openKey);
        if (ttl > 0) {
          return { ok: true, allow: false, state: this.STATES.OPEN, ttlSeconds: ttl };
        }

        const transitioned = await this.transitionToHalfOpen(redis, uid);
        if (transitioned.state !== this.STATES.HALF_OPEN) {
          return { ok: true, allow: true, state: transitioned.state };
        }

        const trial = await this.acquireHalfOpenTrial(redis, uid);
        return {
          ok: true,
          allow: trial.acquired,
          state: this.STATES.HALF_OPEN,
          trial: true,
        };
      }

      if (state === this.STATES.HALF_OPEN) {
        const trial = await this.acquireHalfOpenTrial(redis, uid);
        return {
          ok: true,
          allow: trial.acquired,
          state: this.STATES.HALF_OPEN,
          trial: true,
        };
      }

      return { ok: true, allow: true, state: this.STATES.CLOSED };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on beforeRequest (fail-open):', err?.message);
      return { ok: false, allow: true, state: this.STATES.CLOSED };
    }
  }

  static async isOpen(redis, unidadeId) {
    const status = await this.getStatus(redis, unidadeId);
    const ttlSeconds = status?.ttlSeconds;
    const open = status?.state === this.STATES.OPEN && typeof ttlSeconds === 'number' && ttlSeconds > 0;
    return { open, ttlSeconds: typeof ttlSeconds === 'number' ? ttlSeconds : null, state: status?.state || this.STATES.CLOSED };
  }

  static async recordSuccess(redis, unidadeId) {
    const uid = parseInt(unidadeId, 10);
    if (!redis || !Number.isInteger(uid)) return { ok: false };

    try {
      const stateKey = this.getStateKey(uid);
      const openKey = this.getOpenKey(uid);
      const halfOpenLockKey = this.getHalfOpenLockKey(uid);
      const prevState = (await redis.get(stateKey)) || this.STATES.CLOSED;

      await redis.del(this.getFailsKey(uid));

      if (prevState === this.STATES.HALF_OPEN) {
        await redis.set(stateKey, this.STATES.CLOSED);
        await redis.del(openKey);
        await redis.del(halfOpenLockKey);
        this.logStateChange(uid, prevState, this.STATES.CLOSED);
      }

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
    const stateKey = this.getStateKey(uid);

    try {
      const prevState = (await redis.get(stateKey)) || this.STATES.CLOSED;

      if (prevState === this.STATES.HALF_OPEN) {
        const opened = await this.open(redis, uid, 'half_open_trial_failed');
        return {
          ok: opened.ok,
          count: null,
          open: true,
          openedNow: true,
          openTtlSeconds: this.OPEN_TTL_SECONDS,
          state: this.STATES.OPEN,
          reason: 'half_open_trial_failed',
        };
      }

      const count = await redis.incr(failsKey);
      await redis.expire(failsKey, this.FAIL_TTL_SECONDS);

      if (count >= this.FAIL_THRESHOLD) {
        const opened = await this.open(redis, uid, 'fail_threshold_reached');
        return {
          ok: opened.ok,
          count,
          open: true,
          openedNow: opened.openedNow,
          openTtlSeconds: this.OPEN_TTL_SECONDS,
          state: this.STATES.OPEN,
          reason: 'fail_threshold_reached',
        };
      }

      return { ok: true, count, open: false, openedNow: false, state: prevState };
    } catch (err) {
      logger.error('[CircuitBreaker] Redis error on recordFailure (fail-open):', err?.message);
      return { ok: false, openedNow: false, open: false };
    }
  }
}

module.exports = CircuitBreakerService;

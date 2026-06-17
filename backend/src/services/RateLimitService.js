const logger = require('../utils/logger');

const WINDOW_SECONDS = 10;
const MAX_MESSAGES = 5;

const LUA_FIXED_WINDOW_INCR = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

class RateLimitService {
  /**
   * @param {import('ioredis')} redis
   * @param {string} telefoneLimpo
   */
  static async checkWhatsappRateLimit(redis, telefoneLimpo) {
    const phone = String(telefoneLimpo || '').replace(/\D/g, '');

    if (!phone) {
      return { allowed: true, count: 0 };
    }

    const key = `rate_limit:whatsapp:${phone}`;

    try {
      const count = await redis.eval(LUA_FIXED_WINDOW_INCR, 1, key, String(WINDOW_SECONDS));
      const numeric = typeof count === 'number' ? count : parseInt(count, 10);

      return {
        allowed: numeric <= MAX_MESSAGES,
        count: Number.isFinite(numeric) ? numeric : 0,
        windowSeconds: WINDOW_SECONDS,
        max: MAX_MESSAGES,
      };
    } catch (err) {
      try {
        logger.error('[RateLimitService] Falha ao checar rate limit (fail-open)', {
          error: err?.message,
          key,
        });
      } catch {}

      return { allowed: true, count: 0, windowSeconds: WINDOW_SECONDS, max: MAX_MESSAGES };
    }
  }
}

module.exports = RateLimitService;

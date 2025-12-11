/**
 * RedisService - Serviço de cache e blacklist com fallback para memória
 * 
 * ESTRATÉGIA DE SEGURANÇA:
 * - Em produção: EXIGE Redis configurado
 * - Em desenvolvimento: Fallback para memória (com warning)
 * - Blacklist de tokens JWT
 * - TTL automático baseado na expiração do token
 */

const logger = require('../utils/logger');

class RedisService {
  constructor() {
    this.redis = null;
    this.isRedisAvailable = false;
    this.memoryStore = new Map(); // Fallback para desenvolvimento
    
    this.initializeRedis();
  }

  /**
   * Inicializar conexão Redis
   */
  async initializeRedis() {
    try {
      // Validar configuração em produção
      if (process.env.NODE_ENV === 'production') {
        if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
          throw new Error('🔴 PRODUÇÃO: REDIS_HOST e REDIS_PORT são obrigatórios');
        }
      }

      // Tentar importar redis (apenas se configurado)
      if (process.env.REDIS_HOST) {
        const redis = require('redis');
        
        this.redis = redis.createClient({
          socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            connectTimeout: 5000,
            reconnectStrategy: (retries) => {
              if (retries > 10) {
                logger.error('🔴 Redis: Máximo de tentativas de reconexão atingido');
                return new Error('Redis reconnect failed');
              }
              return Math.min(retries * 100, 3000);
            }
          },
          password: process.env.REDIS_PASSWORD || undefined,
          database: parseInt(process.env.REDIS_DB || '0')
        });

        // Event handlers
        this.redis.on('error', (err) => {
          logger.error('🔴 Redis Error:', err.message);
          this.isRedisAvailable = false;
          
          // Em produção, falha crítica
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Redis connection failed in production');
          }
        });

        this.redis.on('connect', () => {
          logger.log('✅ Redis: Conectado com sucesso');
          this.isRedisAvailable = true;
        });

        this.redis.on('ready', () => {
          logger.log('✅ Redis: Pronto para uso');
          this.isRedisAvailable = true;
        });

        this.redis.on('reconnecting', () => {
          logger.log('🔄 Redis: Tentando reconectar...');
          this.isRedisAvailable = false;
        });

        // Conectar
        await this.redis.connect();
        
      } else {
        // Modo desenvolvimento sem Redis
        if (process.env.NODE_ENV === 'production') {
          throw new Error('🔴 PRODUÇÃO: Redis não configurado');
        }
        
        logger.warn('⚠️  Redis não configurado - usando memória (APENAS DESENVOLVIMENTO)');
        logger.warn('⚠️  Configure REDIS_HOST no .env para produção');
        this.isRedisAvailable = false;
      }
      
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        logger.error('🔴 ERRO CRÍTICO: Redis não disponível em produção');
        throw error;
      }
      
      logger.warn('⚠️  Redis não disponível - usando fallback de memória');
      logger.warn('⚠️  Instale Redis: brew install redis (Mac) ou apt-get install redis (Linux)');
      this.isRedisAvailable = false;
    }
  }

  /**
   * Adicionar token à blacklist
   * @param {string} token - JWT token
   * @param {number} expiresIn - Tempo de expiração em segundos
   */
  async addToBlacklist(token, expiresIn = 3600) {
    try {
      const key = `blacklist:${token}`;
      
      if (this.isRedisAvailable && this.redis) {
        // Redis: Set com TTL automático
        await this.redis.setEx(key, expiresIn, 'revoked');
        logger.log(`✅ Token adicionado à blacklist (Redis) - TTL: ${expiresIn}s`);
      } else {
        // Fallback: Memória com limpeza manual
        this.memoryStore.set(key, {
          value: 'revoked',
          expiresAt: Date.now() + (expiresIn * 1000)
        });
        logger.log(`⚠️  Token adicionado à blacklist (Memória) - TTL: ${expiresIn}s`);
        
        // Agendar limpeza
        setTimeout(() => {
          this.memoryStore.delete(key);
        }, expiresIn * 1000);
      }
      
      return true;
    } catch (error) {
      logger.error('❌ Erro ao adicionar token à blacklist:', error.message);
      throw error;
    }
  }

  /**
   * Verificar se token está na blacklist
   * @param {string} token - JWT token
   * @returns {Promise<boolean>}
   */
  async isBlacklisted(token) {
    try {
      const key = `blacklist:${token}`;
      
      if (this.isRedisAvailable && this.redis) {
        // Redis: Verificar existência
        const result = await this.redis.get(key);
        return result !== null;
      } else {
        // Fallback: Memória com verificação de expiração
        const entry = this.memoryStore.get(key);
        if (!entry) return false;
        
        // Verificar se expirou
        if (Date.now() > entry.expiresAt) {
          this.memoryStore.delete(key);
          return false;
        }
        
        return true;
      }
    } catch (error) {
      logger.error('❌ Erro ao verificar blacklist:', error.message);
      // Em caso de erro, assumir que NÃO está na blacklist (fail-open)
      // Em produção, considere fail-closed (retornar true)
      return false;
    }
  }

  /**
   * Remover token da blacklist (raramente usado)
   * @param {string} token - JWT token
   */
  async removeFromBlacklist(token) {
    try {
      const key = `blacklist:${token}`;
      
      if (this.isRedisAvailable && this.redis) {
        await this.redis.del(key);
      } else {
        this.memoryStore.delete(key);
      }
      
      return true;
    } catch (error) {
      logger.error('❌ Erro ao remover token da blacklist:', error.message);
      throw error;
    }
  }

  /**
   * Limpar toda a blacklist (manutenção)
   */
  async clearBlacklist() {
    try {
      if (this.isRedisAvailable && this.redis) {
        const keys = await this.redis.keys('blacklist:*');
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
        logger.log(`✅ Blacklist limpa: ${keys.length} tokens removidos`);
      } else {
        const count = this.memoryStore.size;
        this.memoryStore.clear();
        logger.log(`✅ Blacklist limpa: ${count} tokens removidos`);
      }
      
      return true;
    } catch (error) {
      logger.error('❌ Erro ao limpar blacklist:', error.message);
      throw error;
    }
  }

  /**
   * Obter estatísticas da blacklist
   */
  async getStats() {
    try {
      if (this.isRedisAvailable && this.redis) {
        const keys = await this.redis.keys('blacklist:*');
        return {
          storage: 'redis',
          tokensCount: keys.length,
          isRedisAvailable: true
        };
      } else {
        return {
          storage: 'memory',
          tokensCount: this.memoryStore.size,
          isRedisAvailable: false,
          warning: 'Usando memória - tokens serão perdidos ao reiniciar'
        };
      }
    } catch (error) {
      logger.error('❌ Erro ao obter estatísticas:', error.message);
      return {
        storage: 'unknown',
        tokensCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Fechar conexão Redis (graceful shutdown)
   */
  async disconnect() {
    try {
      if (this.redis && this.isRedisAvailable) {
        await this.redis.quit();
        logger.log('✅ Redis: Conexão fechada');
      }
    } catch (error) {
      logger.error('❌ Erro ao fechar conexão Redis:', error.message);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (this.isRedisAvailable && this.redis) {
        await this.redis.ping();
        return { status: 'healthy', storage: 'redis' };
      } else {
        return { 
          status: 'degraded', 
          storage: 'memory',
          warning: 'Redis não disponível - usando fallback'
        };
      }
    } catch (error) {
      return { 
        status: 'unhealthy', 
        storage: 'memory',
        error: error.message 
      };
    }
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new RedisService();
    }
    return instance;
  },
  RedisService
};

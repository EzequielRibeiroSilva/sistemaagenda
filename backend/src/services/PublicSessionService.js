/**
 * PublicSessionService - Gerenciamento de sessões temporárias para booking público
 * 
 * ESTRATÉGIA DE SEGURANÇA:
 * - Gerar token de sessão ao acessar página de booking
 * - Validar token em operações sensíveis (busca de cliente)
 * - TTL de 30 minutos (renovável)
 * - Armazenar em Redis (ou memória como fallback)
 */

const crypto = require('crypto');
const { getInstance: getRedisService } = require('./RedisService');

class PublicSessionService {
  constructor() {
    this.redisService = getRedisService();
    this.memoryStore = new Map(); // Fallback para desenvolvimento
    this.sessionTTL = 30 * 60; // 30 minutos em segundos
  }

  /**
   * Criar nova sessão pública
   * @param {string} unidadeId - ID da unidade
   * @param {string} ip - IP do cliente
   * @returns {Promise<string>} - Token da sessão
   */
  async createSession(unidadeId, ip) {
    try {
      // Gerar token único
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const key = `public_session:${sessionToken}`;
      
      const sessionData = {
        unidade_id: unidadeId,
        ip: ip,
        created_at: Date.now(),
        client_searches: 0, // Contador de buscas de cliente
        bookings_created: 0 // Contador de agendamentos criados
      };

      // Tentar armazenar no Redis
      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        await this.redisService.redis.setEx(
          key,
          this.sessionTTL,
          JSON.stringify(sessionData)
        );
        console.log(`✅ [PublicSession] Sessão criada (Redis): ${sessionToken.substring(0, 8)}...`);
      } else {
        // Fallback: Memória
        this.memoryStore.set(key, {
          ...sessionData,
          expiresAt: Date.now() + (this.sessionTTL * 1000)
        });
        console.log(`⚠️  [PublicSession] Sessão criada (Memória): ${sessionToken.substring(0, 8)}...`);
        
        // Agendar limpeza
        setTimeout(() => {
          this.memoryStore.delete(key);
        }, this.sessionTTL * 1000);
      }

      return sessionToken;
    } catch (error) {
      console.error('❌ [PublicSession] Erro ao criar sessão:', error.message);
      throw error;
    }
  }

  /**
   * Validar sessão e incrementar contador
   * @param {string} sessionToken - Token da sessão
   * @param {string} action - Ação realizada ('client_search' ou 'booking_create')
   * @returns {Promise<Object|null>} - Dados da sessão ou null se inválida
   */
  async validateAndIncrementSession(sessionToken, action = 'client_search') {
    try {
      if (!sessionToken) {
        console.warn('⚠️  [PublicSession] Token de sessão não fornecido');
        return null;
      }

      const key = `public_session:${sessionToken}`;
      let sessionData = null;

      // Tentar buscar no Redis
      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        const data = await this.redisService.redis.get(key);
        if (data) {
          sessionData = JSON.parse(data);
          
          // Incrementar contador
          if (action === 'client_search') {
            sessionData.client_searches = (sessionData.client_searches || 0) + 1;
          } else if (action === 'booking_create') {
            sessionData.bookings_created = (sessionData.bookings_created || 0) + 1;
          }
          
          // Atualizar no Redis
          await this.redisService.redis.setEx(
            key,
            this.sessionTTL,
            JSON.stringify(sessionData)
          );
          
          console.log(`✅ [PublicSession] Sessão validada (Redis): ${sessionToken.substring(0, 8)}... - ${action}`);
        }
      } else {
        // Fallback: Memória
        const entry = this.memoryStore.get(key);
        if (entry) {
          // Verificar expiração
          if (Date.now() > entry.expiresAt) {
            this.memoryStore.delete(key);
            console.warn('⚠️  [PublicSession] Sessão expirada (Memória)');
            return null;
          }
          
          sessionData = entry;
          
          // Incrementar contador
          if (action === 'client_search') {
            sessionData.client_searches = (sessionData.client_searches || 0) + 1;
          } else if (action === 'booking_create') {
            sessionData.bookings_created = (sessionData.bookings_created || 0) + 1;
          }
          
          // Atualizar na memória
          this.memoryStore.set(key, sessionData);
          
          console.log(`✅ [PublicSession] Sessão validada (Memória): ${sessionToken.substring(0, 8)}... - ${action}`);
        }
      }

      return sessionData;
    } catch (error) {
      console.error('❌ [PublicSession] Erro ao validar sessão:', error.message);
      return null;
    }
  }

  /**
   * Renovar TTL da sessão
   * @param {string} sessionToken - Token da sessão
   * @returns {Promise<boolean>} - Sucesso ou falha
   */
  async renewSession(sessionToken) {
    try {
      const key = `public_session:${sessionToken}`;

      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        const data = await this.redisService.redis.get(key);
        if (data) {
          await this.redisService.redis.expire(key, this.sessionTTL);
          console.log(`✅ [PublicSession] Sessão renovada (Redis): ${sessionToken.substring(0, 8)}...`);
          return true;
        }
      } else {
        const entry = this.memoryStore.get(key);
        if (entry) {
          entry.expiresAt = Date.now() + (this.sessionTTL * 1000);
          this.memoryStore.set(key, entry);
          console.log(`✅ [PublicSession] Sessão renovada (Memória): ${sessionToken.substring(0, 8)}...`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('❌ [PublicSession] Erro ao renovar sessão:', error.message);
      return false;
    }
  }

  /**
   * Remover sessão
   * @param {string} sessionToken - Token da sessão
   * @returns {Promise<boolean>} - Sucesso ou falha
   */
  async deleteSession(sessionToken) {
    try {
      const key = `public_session:${sessionToken}`;

      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        await this.redisService.redis.del(key);
      } else {
        this.memoryStore.delete(key);
      }

      console.log(`✅ [PublicSession] Sessão removida: ${sessionToken.substring(0, 8)}...`);
      return true;
    } catch (error) {
      console.error('❌ [PublicSession] Erro ao remover sessão:', error.message);
      return false;
    }
  }

  /**
   * Limpar todas as sessões (manutenção)
   */
  async clearAllSessions() {
    try {
      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        const keys = await this.redisService.redis.keys('public_session:*');
        if (keys.length > 0) {
          await this.redisService.redis.del(keys);
        }
        console.log(`✅ [PublicSession] ${keys.length} sessões limpas (Redis)`);
      } else {
        const count = this.memoryStore.size;
        this.memoryStore.clear();
        console.log(`✅ [PublicSession] ${count} sessões limpas (Memória)`);
      }

      return true;
    } catch (error) {
      console.error('❌ [PublicSession] Erro ao limpar sessões:', error.message);
      return false;
    }
  }

  /**
   * Obter estatísticas das sessões
   */
  async getStats() {
    try {
      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        const keys = await this.redisService.redis.keys('public_session:*');
        return {
          storage: 'redis',
          activeSessions: keys.length,
          isRedisAvailable: true
        };
      } else {
        return {
          storage: 'memory',
          activeSessions: this.memoryStore.size,
          isRedisAvailable: false,
          warning: 'Usando memória - sessões serão perdidas ao reiniciar'
        };
      }
    } catch (error) {
      console.error('❌ [PublicSession] Erro ao obter estatísticas:', error.message);
      return {
        storage: 'unknown',
        activeSessions: 0,
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
      instance = new PublicSessionService();
    }
    return instance;
  },
  PublicSessionService
};

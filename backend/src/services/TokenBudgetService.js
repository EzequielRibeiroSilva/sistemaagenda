/**
 * TokenBudgetService.js
 * 
 * TASK 1.1 - TOKEN BUDGET (FASE 2 - ENFORCEMENT)
 * Sprint de Hardening - Due Diligence
 * 
 * Responsabilidade: Proteger o sistema contra consumo excessivo de tokens da OpenAI
 * através de verificação em tempo real do consumo diário por usuário.
 * 
 * Arquitetura:
 * 1. Cache Redis (performance): Evita consultas pesadas ao PostgreSQL em cada mensagem
 * 2. Consulta PostgreSQL (fonte da verdade): Quando cache expira ou não existe
 * 3. Fail-Safe: Em caso de erro, permite operação (não derruba o atendimento)
 * 
 * Fluxo de Verificação:
 * - Cliente envia mensagem → WhatsappWorker → checkDailyBudget()
 * - Se allowed=true: Processa normalmente
 * - Se allowed=false: Bloqueia e envia mensagem amigável
 * - Se erro: Permite (fail-safe) e loga para investigação
 */

const { db } = require('../config/knex');
const logger = require('../utils/logger');

class TokenBudgetService {
  
  /**
   * TTL do cache Redis: 5 minutos
   * 
   * Justificativa:
   * - Curto o suficiente para refletir consumo recente
   * - Longo o suficiente para reduzir carga no PostgreSQL
   * - Compromisso entre precisão e performance
   */
  static CACHE_TTL_SECONDS = 300; // 5 minutos

  /**
   * Threshold de alerta: 80% do limite
   * 
   * Permite ao admin ser notificado antes do bloqueio total
   */
  static WARNING_THRESHOLD_PERCENT = 0.80;

  /**
   * Verifica se o usuário ainda tem budget disponível para consumir tokens hoje.
   * 
   * @param {object} redis - Cliente Redis (ioredis)
   * @param {number} usuarioId - ID do usuário a ser verificado
   * @returns {Promise<object>} Resultado da verificação
   * 
   * Estrutura do retorno:
   * {
   *   allowed: boolean,          // true se pode processar, false se bloqueado
   *   consumido: number,          // tokens já consumidos hoje
   *   limite: number,             // max_tokens_daily do usuário
   *   disponivel: number,         // tokens restantes
   *   percentual: number,         // % do limite já consumido (0-100)
   *   atingiu_limite: boolean,    // true se consumo >= limite
   *   proximo_alerta: boolean     // true se está em 80%+ (alerta admin)
   * }
   */
  static async checkDailyBudget(redis, usuarioId) {
    // Validação de parâmetros
    if (!usuarioId || !Number.isInteger(parseInt(usuarioId, 10))) {
      logger.warn('[TokenBudgetService] usuarioId inválido, permitindo por segurança (fail-safe)', { usuarioId });
      return { 
        allowed: true, 
        consumido: 0, 
        limite: 100000, 
        disponivel: 100000,
        percentual: 0,
        atingiu_limite: false,
        proximo_alerta: false,
        motivo: 'usuario_id_invalido'
      };
    }

    const uid = parseInt(usuarioId, 10);

    try {
      // ========================================================================
      // STEP 1: BUSCAR LIMITE CONFIGURADO (max_tokens_daily) DO USUÁRIO
      // ========================================================================
      const usuario = await db('usuarios')
        .where('id', uid)
        .select('max_tokens_daily')
        .first();

      if (!usuario || usuario.max_tokens_daily === null || usuario.max_tokens_daily === undefined) {
        logger.warn('[TokenBudgetService] Usuário não encontrado ou sem limite configurado, permitindo (fail-safe)', { usuarioId: uid });
        return { 
          allowed: true, 
          consumido: 0, 
          limite: 100000, 
          disponivel: 100000,
          percentual: 0,
          atingiu_limite: false,
          proximo_alerta: false,
          motivo: 'usuario_nao_encontrado'
        };
      }

      const limite = parseInt(usuario.max_tokens_daily, 10);

      // Se limite for 0 ou negativo, consideramos como "sem limite" (fail-safe)
      if (limite <= 0) {
        logger.warn('[TokenBudgetService] Limite configurado como 0 ou negativo, permitindo (fail-safe)', { usuarioId: uid, limite });
        return { 
          allowed: true, 
          consumido: 0, 
          limite: 0, 
          disponivel: Infinity,
          percentual: 0,
          atingiu_limite: false,
          proximo_alerta: false,
          motivo: 'limite_zero_ou_negativo'
        };
      }

      // ========================================================================
      // STEP 2: BUSCAR CONSUMO DO DIA (CACHE REDIS FIRST, FALLBACK PG)
      // ========================================================================
      const dataHoje = this._obterDataLocal();
      const cacheKey = `token_budget:${uid}:${dataHoje}`;
      let consumido = null;

      // Tentar buscar do cache Redis
      if (redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached !== null) {
            consumido = parseInt(cached, 10);
            
            // Validação: se cache retornar valor inválido, ignorar
            if (!Number.isInteger(consumido) || consumido < 0) {
              logger.warn('[TokenBudgetService] Cache Redis retornou valor inválido, buscando no banco', { 
                usuarioId: uid, 
                cached 
              });
              consumido = null;
            }
          }
        } catch (redisErr) {
          logger.error('[TokenBudgetService] Erro ao buscar cache Redis (fail-safe: busca banco)', {
            error: redisErr.message,
            usuarioId: uid
          });
          // Continua para buscar no banco
        }
      }

      // Se não encontrou no cache, buscar no PostgreSQL
      if (consumido === null) {
        try {
          const row = await db('uso_tokens_diario')
            .where('usuario_id', uid)
            .where('data', dataHoje)
            .select('total_tokens')
            .first();

          consumido = row?.total_tokens ? parseInt(row.total_tokens, 10) : 0;

          // Atualizar cache Redis (fire-and-forget)
          if (redis && Number.isInteger(consumido) && consumido >= 0) {
            redis.setex(cacheKey, this.CACHE_TTL_SECONDS, consumido).catch(err => {
              logger.error('[TokenBudgetService] Erro ao atualizar cache Redis', {
                error: err.message,
                usuarioId: uid
              });
            });
          }
        } catch (dbErr) {
          logger.error('[TokenBudgetService] Erro ao buscar consumo no banco (fail-safe: permite)', {
            error: dbErr.message,
            usuarioId: uid
          });
          
          // FAIL-SAFE: Em caso de erro no banco, permitir operação
          return { 
            allowed: true, 
            consumido: 0, 
            limite, 
            disponivel: limite,
            percentual: 0,
            atingiu_limite: false,
            proximo_alerta: false,
            motivo: 'erro_banco_dados_fail_safe'
          };
        }
      }

      // ========================================================================
      // STEP 3: CALCULAR DISPONIBILIDADE E TOMAR DECISÃO
      // ========================================================================
      const disponivel = Math.max(0, limite - consumido);
      const percentual = limite > 0 ? (consumido / limite) * 100 : 0;
      const atingiuLimite = consumido >= limite;
      const proximoAlerta = percentual >= (this.WARNING_THRESHOLD_PERCENT * 100) && !atingiuLimite;

      // Decisão de bloqueio
      const allowed = !atingiuLimite;

      // ========================================================================
      // STEP 4: LOGS E ALERTAS
      // ========================================================================
      if (atingiuLimite) {
        logger.warn('[TokenBudgetService] 🚫 LIMITE DIÁRIO ATINGIDO - Bloqueando atendimento', {
          usuario_id: uid,
          consumido,
          limite,
          percentual: percentual.toFixed(1) + '%',
          data: dataHoje
        });
      } else if (proximoAlerta) {
        logger.warn('[TokenBudgetService] ⚠️  ALERTA 80% - Usuário próximo do limite', {
          usuario_id: uid,
          consumido,
          limite,
          disponivel,
          percentual: percentual.toFixed(1) + '%',
          data: dataHoje
        });
      }

      return {
        allowed,
        consumido,
        limite,
        disponivel,
        percentual: parseFloat(percentual.toFixed(2)),
        atingiu_limite: atingiuLimite,
        proximo_alerta: proximoAlerta
      };

    } catch (error) {
      // FAIL-SAFE GLOBAL: Qualquer erro não capturado deve permitir operação
      logger.error('[TokenBudgetService] ❌ Erro inesperado na verificação de budget (fail-safe: permite)', {
        error: error.message,
        stack: error.stack,
        usuarioId: uid
      });

      return { 
        allowed: true, 
        consumido: 0, 
        limite: 100000, 
        disponivel: 100000,
        percentual: 0,
        atingiu_limite: false,
        proximo_alerta: false,
        motivo: 'erro_inesperado_fail_safe'
      };
    }
  }

  /**
   * Invalida o cache Redis do consumo diário de um usuário.
   * 
   * Útil quando:
   * - Admin ajusta o limite manualmente
   * - Sistema de monitoramento precisa forçar recálculo
   * - Teste/debug
   * 
   * @param {object} redis - Cliente Redis (ioredis)
   * @param {number} usuarioId - ID do usuário
   * @returns {Promise<boolean>} true se invalidado, false se erro
   */
  static async invalidateCache(redis, usuarioId) {
    if (!redis || !usuarioId) return false;

    try {
      const uid = parseInt(usuarioId, 10);
      const dataHoje = this._obterDataLocal();
      const cacheKey = `token_budget:${uid}:${dataHoje}`;
      
      await redis.del(cacheKey);
      
      logger.info('[TokenBudgetService] Cache invalidado', {
        usuario_id: uid,
        data: dataHoje
      });
      
      return true;
    } catch (error) {
      logger.error('[TokenBudgetService] Erro ao invalidar cache', {
        error: error.message,
        usuarioId
      });
      return false;
    }
  }

  /**
   * Incrementa o consumo de tokens no cache Redis (otimização).
   * 
   * Chamado após cada requisição bem-sucedida à OpenAI para
   * atualizar o cache sem precisar recarregar do banco.
   * 
   * IMPORTANTE: Não substitui a persistência no banco (feita pelo TokenUsageService).
   * Esta é apenas uma otimização de cache.
   * 
   * @param {object} redis - Cliente Redis (ioredis)
   * @param {number} usuarioId - ID do usuário
   * @param {number} tokensConsumidos - Quantidade de tokens da última chamada
   * @returns {Promise<void>}
   */
  static async incrementCache(redis, usuarioId, tokensConsumidos) {
    if (!redis || !usuarioId || !tokensConsumidos || tokensConsumidos <= 0) return;

    try {
      const uid = parseInt(usuarioId, 10);
      const tokens = parseInt(tokensConsumidos, 10);
      const dataHoje = this._obterDataLocal();
      const cacheKey = `token_budget:${uid}:${dataHoje}`;

      // Incrementar no Redis (atomicamente)
      await redis.incrby(cacheKey, tokens);
      
      // Garantir TTL (caso a chave não existisse antes)
      await redis.expire(cacheKey, this.CACHE_TTL_SECONDS);

    } catch (error) {
      logger.error('[TokenBudgetService] Erro ao incrementar cache (operação não-crítica)', {
        error: error.message,
        usuarioId
      });
      // Não propaga erro: atualização de cache é não-crítica
    }
  }

  /**
   * Gera a data atual no formato YYYY-MM-DD (timezone local).
   * 
   * @returns {string} Data no formato ISO (apenas dia)
   * @private
   */
  static _obterDataLocal() {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    
    return `${ano}-${mes}-${dia}`; // "YYYY-MM-DD"
  }
}

module.exports = TokenBudgetService;

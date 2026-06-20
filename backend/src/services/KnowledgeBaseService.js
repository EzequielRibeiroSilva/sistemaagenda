/**
 * KnowledgeBaseService - Sistema de Cache Multi-Tenant para FAQ
 * 
 * ESTRATÉGIA:
 * - Isolar conhecimento por usuario_id + unidade_id
 * - Cache em Redis com TTL de 1 hora
 * - Invalidação automática em updates
 * - Fallback para memória em desenvolvimento
 * 
 * PADRÃO DE CHAVE: kb:{usuario_id}:{unidade_id}:data
 */

const { db } = require('../config/knex');
const { getInstance: getRedisService } = require('./RedisService');
const logger = require('../utils/logger');

class KnowledgeBaseService {
  constructor() {
    this.redisService = getRedisService();
    this.memoryCache = new Map(); // Fallback
    this.CACHE_TTL = 3600; // 1 hora
    this.CACHE_PREFIX = 'kb';
  }

  /**
   * Gera chave de cache com isolamento multi-tenant
   * @param {number} usuarioId - ID do usuário/empresa
   * @param {number} unidadeId - ID da unidade
   * @returns {string} Chave formatada
   */
  _getCacheKey(usuarioId, unidadeId) {
    if (!usuarioId || !unidadeId) {
      throw new Error('usuarioId e unidadeId são obrigatórios para cache multi-tenant');
    }
    return `${this.CACHE_PREFIX}:${usuarioId}:${unidadeId}:data`;
  }

  /**
   * Busca conhecimento do cache (Redis ou memória)
   * @param {number} usuarioId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<Object|null>} Conhecimento em cache ou null
   */
  async getCachedKnowledge(usuarioId, unidadeId) {
    try {
      const key = this._getCacheKey(usuarioId, unidadeId);
      
      // Tentar Redis primeiro
      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        const cached = await this.redisService.redis.get(key);
        if (cached) {
          logger.log(`✅ [KB Cache] HIT Redis - Usuario: ${usuarioId}, Unidade: ${unidadeId}`);
          return JSON.parse(cached);
        }
      } else {
        // Fallback: Memória
        const memEntry = this.memoryCache.get(key);
        if (memEntry && Date.now() < memEntry.expiresAt) {
          logger.log(`✅ [KB Cache] HIT Memória - Usuario: ${usuarioId}, Unidade: ${unidadeId}`);
          return memEntry.data;
        } else if (memEntry) {
          // Expirou, limpar
          this.memoryCache.delete(key);
        }
      }
      
      logger.log(`⚠️  [KB Cache] MISS - Usuario: ${usuarioId}, Unidade: ${unidadeId}`);
      return null;
      
    } catch (error) {
      logger.error('❌ [KB Cache] Erro ao buscar cache:', error);
      return null;
    }
  }

  /**
   * Armazena conhecimento no cache
   * @param {number} usuarioId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @param {Object} knowledgeData - Dados do conhecimento
   * @returns {Promise<boolean>} Sucesso
   */
  async _setCachedKnowledge(usuarioId, unidadeId, knowledgeData) {
    try {
      const key = this._getCacheKey(usuarioId, unidadeId);
      const dataWithMeta = {
        ...knowledgeData,
        _cached_at: new Date().toISOString(),
        _ttl: this.CACHE_TTL
      };
      
      // Tentar Redis primeiro
      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        await this.redisService.redis.setEx(
          key, 
          this.CACHE_TTL, 
          JSON.stringify(dataWithMeta)
        );
        logger.log(`✅ [KB Cache] SET Redis - Usuario: ${usuarioId}, Unidade: ${unidadeId}, TTL: ${this.CACHE_TTL}s`);
      } else {
        // Fallback: Memória
        this.memoryCache.set(key, {
          data: dataWithMeta,
          expiresAt: Date.now() + (this.CACHE_TTL * 1000)
        });
        logger.log(`⚠️  [KB Cache] SET Memória - Usuario: ${usuarioId}, Unidade: ${unidadeId}, TTL: ${this.CACHE_TTL}s`);
        
        // Limpeza automática
        setTimeout(() => {
          this.memoryCache.delete(key);
        }, this.CACHE_TTL * 1000);
      }
      
      return true;
    } catch (error) {
      logger.error('❌ [KB Cache] Erro ao salvar cache:', error);
      return false;
    }
  }

  /**
   * Invalida cache de uma unidade
   * @param {number} usuarioId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<boolean>} Sucesso
   */
  async invalidateCache(usuarioId, unidadeId) {
    try {
      const key = this._getCacheKey(usuarioId, unidadeId);
      
      // Limpar Redis
      if (this.redisService.isRedisAvailable && this.redisService.redis) {
        await this.redisService.redis.del(key);
        logger.log(`🗑️  [KB Cache] INVALIDADO Redis - Usuario: ${usuarioId}, Unidade: ${unidadeId}`);
      }
      
      // Limpar memória
      this.memoryCache.delete(key);
      logger.log(`🗑️  [KB Cache] INVALIDADO Memória - Usuario: ${usuarioId}, Unidade: ${unidadeId}`);
      
      return true;
    } catch (error) {
      logger.error('❌ [KB Cache] Erro ao invalidar cache:', error);
      return false;
    }
  }

  /**
   * Constrói base de conhecimento completa da unidade
   * @param {number} usuarioId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<Object>} Base de conhecimento estruturada
   */
  async buildKnowledgeBase(usuarioId, unidadeId) {
    try {
      logger.log(`🔧 [KB Build] Construindo base de conhecimento - Usuario: ${usuarioId}, Unidade: ${unidadeId}`);
      
      // ✅ ISOLAMENTO MULTI-TENANT: Todas as queries filtram por usuarioId e unidadeId
      
      // 1. Buscar dados da Unidade
      const unidade = await db('unidades')
        .where('id', unidadeId)
        .where('usuario_id', usuarioId)
        .first();
      
      if (!unidade) {
        throw new Error(`Unidade ${unidadeId} não encontrada para usuário ${usuarioId}`);
      }
      
      // 2. Buscar horários de funcionamento da unidade
      const horariosUnidade = await db('horarios_funcionamento_unidade')
        .where('unidade_id', unidadeId)
        .orderBy('dia_semana');
      
      // Parse dos horários (podem estar em JSON string)
      const horariosFormatados = horariosUnidade.map(h => ({
        dia: h.dia_semana,
        nome: this._getDiaNome(h.dia_semana),
        periodos: typeof h.horarios_json === 'string' 
          ? JSON.parse(h.horarios_json) 
          : h.horarios_json,
        aberto: h.is_aberto
      }));
      
      // 3. Buscar configurações do sistema
      const configuracoes = await db('configuracoes_sistema')
        .where('unidade_id', unidadeId)
        .first();
      
      // 4. Buscar serviços ativos da unidade
      const servicos = await db('servicos')
        .leftJoin('categorias_servicos', 'servicos.categoria_id', 'categorias_servicos.id')
        .where('servicos.usuario_id', usuarioId)
        .where('servicos.status', 'Ativo')
        .whereNull('servicos.deleted_at')
        .select(
          'servicos.id',
          'servicos.nome',
          'servicos.descricao',
          'servicos.preco',
          'servicos.duracao_minutos',
          'servicos.preco_minimo_exibicao',
          'servicos.preco_maximo_exibicao',
          'categorias_servicos.nome as categoria'
        );
      
      // 5. Para cada serviço, buscar agentes que o executam
      const servicosComAgentes = await Promise.all(
        servicos.map(async (servico) => {
          const agentes = await db('agente_servicos')
            .join('agentes', 'agente_servicos.agente_id', 'agentes.id')
            .where('agente_servicos.servico_id', servico.id)
            .where('agentes.unidade_id', unidadeId) // ✅ ISOLAMENTO
            .whereNull('agentes.deleted_at')
            .select('agentes.nome', 'agentes.sobrenome');
          
          return {
            ...servico,
            agentes: agentes.map(a => `${a.nome} ${a.sobrenome}`.trim()),
            preco_formatado: this._formatarPreco(servico),
            duracao_formatada: this._formatarDuracao(servico.duracao_minutos)
          };
        })
      );
      
      // 6. Buscar agentes da unidade
      const agentes = await db('agentes')
        .where('unidade_id', unidadeId)
        .where('status', 'Ativo')
        .whereNull('deleted_at')
        .select('id', 'nome', 'sobrenome');
      
      // 7. Para cada agente, buscar serviços e horários
      const agentesCompletos = await Promise.all(
        agentes.map(async (agente) => {
          const servicosAgente = await db('agente_servicos')
            .join('servicos', 'agente_servicos.servico_id', 'servicos.id')
            .where('agente_servicos.agente_id', agente.id)
            .where('servicos.usuario_id', usuarioId) // ✅ ISOLAMENTO
            .whereNull('servicos.deleted_at')
            .select('servicos.nome');
          
          const horariosAgente = await db('horarios_funcionamento')
            .where('agente_id', agente.id)
            .where('ativo', true)
            .orderBy('dia_semana');
          
          return {
            nome_completo: `${agente.nome} ${agente.sobrenome}`.trim(),
            servicos: servicosAgente.map(s => s.nome),
            horarios: horariosAgente.map(h => ({
              dia: h.dia_semana,
              nome: this._getDiaNome(h.dia_semana),
              periodos: typeof h.periodos === 'string' ? JSON.parse(h.periodos) : h.periodos
            }))
          };
        })
      );
      
      // 8. Buscar categorias
      const categorias = await db('categorias_servicos')
        .where('usuario_id', usuarioId)
        .select('nome')
        .orderBy('nome');
      
      // 9. Buscar extras ativos
      const extras = await db('servicos_extras')
        .where('usuario_id', usuarioId)
        .where('status', 'Ativo')
        .select('id', 'nome', 'descricao', 'preco', 'duracao_minutos');
      
      // 10. Parse do config_perfil se existir
      let perfilPublico = {};
      if (unidade.config_perfil) {
        try {
          perfilPublico = typeof unidade.config_perfil === 'string'
            ? JSON.parse(unidade.config_perfil)
            : unidade.config_perfil;
        } catch (e) {
          logger.warn('Erro ao parsear config_perfil:', e);
        }
      }
      
      // 11. Montar base de conhecimento
      const knowledgeBase = {
        usuario_id: usuarioId,
        unidade_id: unidadeId,
        unidade: {
          nome: unidade.nome,
          endereco: unidade.endereco || 'Não informado',
          telefone: unidade.telefone || 'Não informado',
          slug_url: unidade.slug_url,
          link_agendamento: unidade.slug_url 
            ? `${process.env.FRONTEND_URL || 'https://sistema.com'}/agendar/${unidade.slug_url}`
            : 'Não disponível',
          status: unidade.status,
          horarios: horariosFormatados,
          redes_sociais: {
            instagram: perfilPublico.instagram || null,
            facebook: perfilPublico.facebook || null,
            website: perfilPublico.website || null
          },
          descricao_negocio: perfilPublico.descricao_negocio || null
        },
        configuracoes: configuracoes ? {
          nome_negocio: configuracoes.nome_negocio,
          antecedencia_minima_horas: configuracoes.tempo_limite_agendar_horas,
          cancelamento_permitido: configuracoes.permitir_cancelamento,
          prazo_cancelamento_horas: configuracoes.tempo_limite_cancelar_horas,
          periodo_futuro_dias: configuracoes.periodo_futuro_dias,
          programa_fidelidade: {
            ativo: configuracoes.pontos_ativo || false,
            pontos_por_real: configuracoes.pontos_por_real || 0,
            reais_por_pontos: configuracoes.reais_por_pontos || 0,
            validade_meses: configuracoes.pontos_validade_meses || 0
          }
        } : null,
        servicos: servicosComAgentes,
        agentes: agentesCompletos,
        categorias: categorias.map(c => c.nome),
        extras: extras.map(e => ({
          nome: e.nome,
          descricao: e.descricao,
          preco: parseFloat(e.preco),
          duracao_adicional: e.duracao_minutos
        })),
        _gerado_em: new Date().toISOString()
      };
      
      // 12. Salvar no cache
      await this._setCachedKnowledge(usuarioId, unidadeId, knowledgeBase);
      
      logger.log(`✅ [KB Build] Base de conhecimento construída - ${servicos.length} serviços, ${agentes.length} agentes`);
      
      return knowledgeBase;
      
    } catch (error) {
      // 🔥 DEBUG OBRIGATÓRIO: Logar objeto de erro completo (stack trace + campos do driver)
      // Alguns erros de banco/Promise podem aparecer como {} no logger dependendo do serializer.
      // eslint-disable-next-line no-console
      console.error('❌ [KB Build] ERRO COMPLETO (raw):', error);
      // eslint-disable-next-line no-console
      console.error('❌ [KB Build] ERRO DETALHADO:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
        detail: error?.detail,
        hint: error?.hint,
        where: error?.where,
        schema: error?.schema,
        table: error?.table,
        constraint: error?.constraint,
        routine: error?.routine
      });
      logger.error('❌ [KB Build] Erro ao construir base de conhecimento:', error);
      throw error;
    }
  }

  /**
   * Obtém base de conhecimento (cache ou rebuild)
   * @param {number} usuarioId - ID do usuário
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<Object>} Base de conhecimento
   */
  async getKnowledgeBase(usuarioId, unidadeId) {
    // Tentar cache primeiro
    let knowledge = await this.getCachedKnowledge(usuarioId, unidadeId);
    
    if (!knowledge) {
      // Cache miss, construir
      knowledge = await this.buildKnowledgeBase(usuarioId, unidadeId);
    }
    
    return knowledge;
  }

  /**
   * Formata preço do serviço (considera faixa se houver)
   * @param {Object} servico - Dados do serviço
   * @returns {string} Preço formatado
   */
  _formatarPreco(servico) {
    const preco = parseFloat(servico.preco);
    const minimo = parseFloat(servico.preco_minimo_exibicao || 0);
    const maximo = parseFloat(servico.preco_maximo_exibicao || 0);
    
    if (minimo > 0 && maximo > 0 && minimo !== maximo) {
      return `R$ ${minimo.toFixed(2)} - R$ ${maximo.toFixed(2)}`;
    }
    
    return `R$ ${preco.toFixed(2)}`;
  }

  /**
   * Formata duração em minutos para texto legível
   * @param {number} minutos - Duração em minutos
   * @returns {string} Duração formatada
   */
  _formatarDuracao(minutos) {
    if (minutos < 60) {
      return `${minutos} minutos`;
    }
    
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    
    if (mins === 0) {
      return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    }
    
    return `${horas}h${mins}min`;
  }

  /**
   * Retorna nome do dia da semana
   * @param {number} dia - Número do dia (0-6)
   * @returns {string} Nome do dia
   */
  _getDiaNome(dia) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return dias[dia] || 'Desconhecido';
  }

  /**
   * Health check do serviço
   * @returns {Promise<Object>} Status do serviço
   */
  async healthCheck() {
    const redisHealth = await this.redisService.healthCheck();
    return {
      service: 'KnowledgeBaseService',
      status: 'healthy',
      redis: redisHealth,
      memoryCache: {
        entries: this.memoryCache.size
      }
    };
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new KnowledgeBaseService();
    }
    return instance;
  },
  KnowledgeBaseService
};

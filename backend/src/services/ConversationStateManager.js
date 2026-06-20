/**
 * ConversationStateManager - Gerenciador de Estado Estruturado de Conversação
 * 
 * PROPÓSITO:
 * Substituir o sistema antigo de "summary" (resumo textual comprimido) por um
 * objeto JSON estruturado que preserva DADOS CRÍTICOS durante toda a conversa,
 * mesmo após purge de histórico.
 * 
 * ARQUITETURA:
 * - Estado JSON persistido na coluna `contexto_json` da tabela `chat_sessions`
 * - Injetado no System Prompt a cada rodada de conversa
 * - Atualizado incrementalmente conforme a conversa progride
 * 
 * BENEFÍCIOS:
 * ✅ Nunca perde IDs de agendamento, seleções de serviços ou preferências
 * ✅ Recuperação de contexto após purge de mensagens antigas
 * ✅ Permite retomar conversas pausadas sem perder estado
 * ✅ Facilita debugging (estado é legível e versionável)
 * 
 * TASK 2.1 - FASE 1: CONVERSATION STATE MANAGER (HARDENING SPRINT)
 */

const { db } = require('../config/knex');
const logger = require('../utils/logger');

/**
 * Esquema padrão do contexto estruturado
 */
const DEFAULT_STATE = {
  // Identificadores de contexto
  unidade_id: null,
  agente_id: null,
  cliente_id: null,
  
  // Seleções e preferências
  servicos_selecionados: [],  // Array de { id, nome }
  data_agendamento: null,      // YYYY-MM-DD
  hora_inicio: null,           // HH:MM
  
  // Estado do fluxo
  status: 'iniciada',          // iniciada, em_agendamento, aguardando_pagamento, concluida
  etapa_atual: 'identificacao', // identificacao, selecao_servico, escolha_data, confirmacao
  
  // Controle de pagamento
  pagamento_pendente: false,
  pix_gerado: false,
  agendamento_id: null,
  
  // Metadata
  tentativas_reagendamento: 0,
  ultima_atualizacao: null
};

class ConversationStateManager {
  /**
   * Obter estado da conversa
   * @param {number} sessionId - ID da sessão de chat
   * @returns {Promise<Object>} Estado estruturado ou estado padrão
   */
  async getState(sessionId) {
    if (!sessionId) {
      logger.warn('[ConversationStateManager] getState chamado sem sessionId - retornando estado padrão');
      return { ...DEFAULT_STATE };
    }

    try {
      const session = await db('chat_sessions')
        .where('id', sessionId)
        .select('contexto_json')
        .first();

      if (!session) {
        logger.warn('[ConversationStateManager] Sessão não encontrada', { sessionId });
        return { ...DEFAULT_STATE };
      }

      // Parse do JSON armazenado
      let state = session.contexto_json;

      // Se contexto_json é string, fazer parse
      if (typeof state === 'string') {
        try {
          state = JSON.parse(state);
        } catch (parseErr) {
          logger.error('[ConversationStateManager] Erro ao parsear contexto_json corrompido - resetando', {
            sessionId,
            error: parseErr.message,
            raw: state?.substring(0, 100)
          });
          state = null;
        }
      }

      // Se não tem estado ou está corrompido, retornar padrão
      if (!state || typeof state !== 'object') {
        logger.warn('[ConversationStateManager] Estado corrompido ou ausente - usando padrão', { sessionId });
        return { ...DEFAULT_STATE };
      }

      // Garantir que todas as chaves padrão existem (merge com defaults)
      const mergedState = { ...DEFAULT_STATE, ...state };

      return mergedState;

    } catch (error) {
      logger.error('[ConversationStateManager] Erro ao obter estado', {
        sessionId,
        error: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });

      // FAIL-SAFE: retornar estado padrão
      return { ...DEFAULT_STATE };
    }
  }

  /**
   * Atualizar estado da conversa (merge incremental)
   * @param {number} sessionId - ID da sessão de chat
   * @param {Object} partialState - Parte do estado a ser atualizada
   * @returns {Promise<Object>} Estado atualizado completo
   */
  async updateState(sessionId, partialState) {
    if (!sessionId) {
      throw new Error('sessionId é obrigatório para updateState');
    }

    if (!partialState || typeof partialState !== 'object') {
      throw new Error('partialState deve ser um objeto válido');
    }

    try {
      // Obter estado atual
      const currentState = await this.getState(sessionId);

      // Merge incremental (shallow merge - arrays são substituídos, não concatenados)
      const newState = {
        ...currentState,
        ...partialState,
        ultima_atualizacao: new Date().toISOString()
      };

      // Validar JSON antes de persistir
      let jsonString;
      try {
        jsonString = JSON.stringify(newState);
        // Validar que é parseável (round-trip test)
        JSON.parse(jsonString);
      } catch (stringifyErr) {
        logger.error('[ConversationStateManager] Erro ao serializar estado - abortando update', {
          sessionId,
          error: stringifyErr.message,
          partialState
        });
        throw new Error('Estado inválido: não é serializável como JSON');
      }

      // Persistir no banco
      await db('chat_sessions')
        .where('id', sessionId)
        .update({
          contexto_json: jsonString,
          updated_at: db.fn.now()
        });

      logger.debug('[ConversationStateManager] Estado atualizado com sucesso', {
        sessionId,
        updatedKeys: Object.keys(partialState),
        etapa_atual: newState.etapa_atual,
        status: newState.status
      });

      return newState;

    } catch (error) {
      logger.error('[ConversationStateManager] Erro ao atualizar estado', {
        sessionId,
        error: error.message,
        partialState,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });

      throw error;
    }
  }

  /**
   * Limpar estado da conversa (reset para padrão)
   * @param {number} sessionId - ID da sessão de chat
   * @returns {Promise<Object>} Estado padrão resetado
   */
  async clearState(sessionId) {
    if (!sessionId) {
      throw new Error('sessionId é obrigatório para clearState');
    }

    try {
      const defaultState = { ...DEFAULT_STATE };
      defaultState.ultima_atualizacao = new Date().toISOString();

      const jsonString = JSON.stringify(defaultState);

      await db('chat_sessions')
        .where('id', sessionId)
        .update({
          contexto_json: jsonString,
          updated_at: db.fn.now()
        });

      logger.info('[ConversationStateManager] Estado resetado para padrão', { sessionId });

      return defaultState;

    } catch (error) {
      logger.error('[ConversationStateManager] Erro ao limpar estado', {
        sessionId,
        error: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });

      throw error;
    }
  }

  /**
   * Obter múltiplos estados em batch (otimização de performance)
   * @param {number[]} sessionIds - Array de IDs de sessão
   * @returns {Promise<Map<number, Object>>} Map de sessionId -> state
   */
  async getStateBatch(sessionIds) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return new Map();
    }

    try {
      const sessions = await db('chat_sessions')
        .whereIn('id', sessionIds)
        .select('id', 'contexto_json');

      const stateMap = new Map();

      for (const session of sessions) {
        let state = session.contexto_json;

        // Parse se for string
        if (typeof state === 'string') {
          try {
            state = JSON.parse(state);
          } catch {
            state = null;
          }
        }

        // Merge com defaults
        const mergedState = { ...DEFAULT_STATE, ...(state || {}) };
        stateMap.set(session.id, mergedState);
      }

      // Adicionar estados padrão para IDs não encontrados
      for (const id of sessionIds) {
        if (!stateMap.has(id)) {
          stateMap.set(id, { ...DEFAULT_STATE });
        }
      }

      return stateMap;

    } catch (error) {
      logger.error('[ConversationStateManager] Erro ao obter batch de estados', {
        sessionIds,
        error: error.message
      });

      // FAIL-SAFE: retornar Map com estados padrão
      const fallbackMap = new Map();
      for (const id of sessionIds) {
        fallbackMap.set(id, { ...DEFAULT_STATE });
      }
      return fallbackMap;
    }
  }

  /**
   * Formatar estado para injeção no System Prompt
   * @param {Object} state - Estado estruturado
   * @returns {string} Bloco formatado para injeção no prompt
   */
  formatStateForPrompt(state) {
    if (!state || typeof state !== 'object') {
      return '**CONTEXTO_ESTRUTURADO:** Não há contexto anterior (nova conversa).';
    }

    try {
      // Criar versão limpa do estado (remover nulls/undefined para clarity)
      const cleanState = {};
      
      for (const [key, value] of Object.entries(state)) {
        if (value !== null && value !== undefined) {
          // Arrays vazios também são removidos
          if (Array.isArray(value) && value.length === 0) {
            continue;
          }
          cleanState[key] = value;
        }
      }

      // Se não há dados relevantes, retornar indicação de conversa nova
      if (Object.keys(cleanState).length === 0) {
        return '**CONTEXTO_ESTRUTURADO:** Não há contexto anterior (nova conversa).';
      }

      // Formatar como JSON legível para a IA
      const jsonFormatted = JSON.stringify(cleanState, null, 2);

      return `**CONTEXTO_ESTRUTURADO (MEMÓRIA DE LONGO PRAZO):**
\`\`\`json
${jsonFormatted}
\`\`\`

**INSTRUÇÕES CRÍTICAS:**
- Este contexto é sua MEMÓRIA PERSISTENTE. Ele sobrevive ao purge de mensagens antigas.
- Sempre que o cliente confirmar um dado novo (data, horário, serviço), você DEVE atualizar este contexto.
- Use a ferramenta \`atualizar_contexto_conversa\` após cada confirmação importante.
- Se detectar inconsistências entre o contexto e a conversa atual, priorize a conversa atual e atualize o contexto.
- NUNCA invente informações. Se um campo está vazio, pergunte ao cliente.`;

    } catch (error) {
      logger.error('[ConversationStateManager] Erro ao formatar estado para prompt', {
        error: error.message,
        state
      });

      return '**CONTEXTO_ESTRUTURADO:** Erro ao carregar contexto (usando conversa atual).';
    }
  }

  /**
   * Validar integridade do estado (útil para debugging e testes)
   * @param {Object} state - Estado a ser validado
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validateState(state) {
    const errors = [];

    if (!state || typeof state !== 'object') {
      errors.push('Estado deve ser um objeto');
      return { valid: false, errors };
    }

    // Validar campos obrigatórios
    const requiredFields = ['status', 'etapa_atual'];
    for (const field of requiredFields) {
      if (!state[field]) {
        errors.push(`Campo obrigatório ausente: ${field}`);
      }
    }

    // Validar tipos
    if (state.servicos_selecionados && !Array.isArray(state.servicos_selecionados)) {
      errors.push('servicos_selecionados deve ser um array');
    }

    if (state.pagamento_pendente !== undefined && typeof state.pagamento_pendente !== 'boolean') {
      errors.push('pagamento_pendente deve ser boolean');
    }

    if (state.pix_gerado !== undefined && typeof state.pix_gerado !== 'boolean') {
      errors.push('pix_gerado deve ser boolean');
    }

    // Validar valores enum
    const validStatus = ['iniciada', 'em_agendamento', 'aguardando_pagamento', 'concluida', 'pausada'];
    if (state.status && !validStatus.includes(state.status)) {
      errors.push(`status inválido: ${state.status}. Valores permitidos: ${validStatus.join(', ')}`);
    }

    const validEtapas = ['identificacao', 'selecao_servico', 'escolha_data', 'escolha_horario', 'confirmacao', 'pagamento'];
    if (state.etapa_atual && !validEtapas.includes(state.etapa_atual)) {
      errors.push(`etapa_atual inválida: ${state.etapa_atual}. Valores permitidos: ${validEtapas.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new ConversationStateManager();
    }
    return instance;
  },
  ConversationStateManager,
  DEFAULT_STATE
};

const OpenAI = require('openai');
const logger = require('../utils/logger');
const CircuitBreakerService = require('./CircuitBreakerService');
const TokenUsageService = require('./TokenUsageService');

// ⚠️ SYSTEM_PROMPT REMOVIDO - Agora é 100% dinâmico e injetado pelo WhatsappWorker
// Cada unidade terá seu próprio prompt personalizado baseado em config_perfil

class AiAgentService {
  constructor() {
    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://app.tally.com.br',
        'X-Title': 'Tally AI Recepcionista',
      },
    });
    
    this.model = process.env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL_DEV;
  }

  async processMessage({ message, history = [], tools = null, systemPrompt = '', unidadeId = null, redis = null }) {
    if (!this.model) {
      throw new Error('OPENROUTER_MODEL (ou OPENROUTER_MODEL_DEV) não configurado');
    }
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY não configurado');
    }

    // ⚠️ VALIDAÇÃO CRÍTICA: systemPrompt é obrigatório
    // Cada unidade deve injetar seu próprio prompt personalizado
    if (!systemPrompt || systemPrompt.trim() === '') {
      throw new Error('systemPrompt é obrigatório - cada unidade deve ter seu prompt personalizado');
    }

    const messages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(history) && history.length > 0) {
      messages.push(...history);
    }

    if (message !== undefined && message !== null) {
      messages.push({ role: 'user', content: String(message ?? '') });
    }

    const payload = {
      model: this.model,
      messages,
    };

    if (tools) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    let completion;
    try {
      completion = await this.openai.chat.completions.create(payload);
      if (redis && unidadeId) {
        await CircuitBreakerService.recordSuccess(redis, unidadeId);
      }
    } catch (err) {
      let circuit = null;
      if (redis && unidadeId) {
        const result = await CircuitBreakerService.recordFailure(redis, unidadeId);
        circuit = result;
      }

      if (circuit) {
        err.circuitBreaker = circuit;
      }
      throw err;
    }

    try {
      if (process.env.NODE_ENV === 'development') {
        const usage = completion?.usage;
        if (usage) {
          logger.info('[AI][usage]', {
            model: this.model,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          });
        }
      }
      
      // 🎯 TASK 3.3 - FASE 1: CAPTURA DE TOKENS PARA DASHBOARD
      // Registra o consumo de tokens na tabela uso_tokens_diario
      // Operação assíncrona não-bloqueante (fire-and-forget)
      if (completion?.usage?.total_tokens && unidadeId) {
        // Não usar await: execução paralela para não atrasar resposta ao cliente
        TokenUsageService.registrarConsumo(
          unidadeId, 
          completion.usage.total_tokens, 
          this.model
        );
      }
    } catch {
      // não bloquear fluxo por falha de log
    }
    const msg = completion?.choices?.[0]?.message;

    return {
      raw: completion,
      message: msg || null,
      content: msg?.content || null,
      toolCalls: msg?.tool_calls || null,
    };
  }

  async testConnection() {
    try {
      console.log(`[AI] Iniciando teste de conexão com o modelo: ${this.model}...`);
      
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'user', content: 'Responda apenas com a palavra: CONECTADO' }
        ],
      });

      console.log('[AI] Resposta recebida:', completion.choices[0].message.content);
      return true;
    } catch (error) {
      console.error('[AI] Erro na conexão com OpenRouter:', error.message);
      return false;
    }
  }
}

module.exports = new AiAgentService();

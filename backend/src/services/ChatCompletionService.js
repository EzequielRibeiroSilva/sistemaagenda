'use strict';

/**
 * ChatCompletionService.js
 *
 * Serviço de infraestrutura de comunicação com a LLM via OpenRouter.
 * Responsabilidade única: instanciar o cliente OpenAI apontando para
 * https://openrouter.ai/api/v1 e expor um método processMessage() testável
 * de forma isolada, sem dependências de Worker ou filas.
 *
 * Fase 4 — Recepcionista Virtual
 */

const OpenAI = require('openai');

class ChatCompletionService {
  constructor() {
    // Lê e sanitiza a chave — remove espaços e caracteres ocultos que possam
    // ter entrado no .env (BOM, \r, espaços no início/fim).
    const rawKey = process.env.OPENROUTER_API_KEY || '';
    const apiKey = rawKey.trim().replace(/[\r\n\t]/g, '');

    if (!apiKey) {
      throw new Error(
        '[ChatCompletionService] OPENROUTER_API_KEY não configurada. ' +
        'Adicione a variável ao seu .env antes de usar este serviço.'
      );
    }

    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://app.tally.com.br',
        'X-Title': 'Tally AI Recepcionista',
      },
    });

    // Modelo estável e pago — sem fallbacks de variável de ambiente
    // para eliminar qualquer ambiguidade de configuração.
    this.model = 'openai/gpt-4o-mini';
  }

  /**
   * Processa uma mensagem de texto e retorna a resposta da LLM via OpenRouter.
   *
   * @param {string} message - Texto enviado pelo usuário
   * @returns {Promise<string>} - Conteúdo textual da resposta
   */
  async processMessage(message) {
    console.log('[ChatCompletionService] IA processando:', message);
    console.log(`[ChatCompletionService] Usando modelo: ${this.model}`);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'Você é a Stephanie, recepcionista virtual do salão Stephanie Cabelos. ' +
            'Seu papel é atender clientes pelo WhatsApp com simpatia, agilidade e profissionalismo. ' +
            'Você agenda horários, informa serviços disponíveis, confirma agendamentos e tira dúvidas sobre o salão. ' +
            'Seja sempre cordial, use linguagem natural e próxima, e responda de forma curta e objetiva. ' +
            'Nunca invente horários ou serviços — use apenas as informações disponíveis. ' +
            'Responda sempre em português brasileiro.'
        },
        { role: 'user', content: String(message ?? '') }
      ],
    });

    const responseText = completion?.choices?.[0]?.message?.content || '';
    console.log('[ChatCompletionService] Resposta recebida:', responseText);
    return responseText;
  }
}

module.exports = new ChatCompletionService();

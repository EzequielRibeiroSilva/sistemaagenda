const OpenAI = require('openai');

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
    
    this.model = process.env.OPENROUTER_MODEL_DEV;
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

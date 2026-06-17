const OpenAI = require('openai');
const { db } = require('../config/knex');
const logger = require('../utils/logger');

const TRIGGER_MESSAGE_COUNT = 15;
const KEEP_LAST_MESSAGES = 4;

class ContextPurgeService {
  constructor() {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://app.tally.com.br',
        'X-Title': 'Tally AI Recepcionista',
      },
    });

    this.model = 'openai/gpt-4o-mini';
  }

  schedule(redis, chatSessionId) {
    if (!redis || !chatSessionId) return;

    setImmediate(() => {
      this.purgeIfNeeded(redis, chatSessionId).catch((err) => {
        logger.error('[ContextPurgeService] Falha ao executar purgeIfNeeded', {
          error: err?.message,
          chat_session_id: chatSessionId,
        });
      });
    });
  }

  async purgeIfNeeded(redis, chatSessionId) {
    const sessionId = Number(chatSessionId);
    if (!Number.isFinite(sessionId)) return;

    const lockKey = `context_purge:lock:${sessionId}`;
    let gotLock = false;

    try {
      const lockOk = await redis.set(lockKey, '1', 'EX', 60, 'NX');
      gotLock = lockOk === 'OK';
    } catch (err) {
      return;
    }

    if (!gotLock) return;

    try {
      const totalRow = await db('chat_messages')
        .where('chat_session_id', sessionId)
        .count({ total: '*' })
        .first();

      const total = Number(totalRow?.total || 0);
      if (!Number.isFinite(total) || total <= TRIGGER_MESSAGE_COUNT) {
        return;
      }

      const messages = await db('chat_messages')
        .where('chat_session_id', sessionId)
        .select('id', 'role', 'content', 'tool_calls', 'tool_call_id', 'name')
        .orderBy('id', 'asc');

      if (!Array.isArray(messages) || messages.length <= TRIGGER_MESSAGE_COUNT) {
        return;
      }

      const keep = messages.slice(-KEEP_LAST_MESSAGES);
      const toSummarize = messages.slice(0, Math.max(0, messages.length - KEEP_LAST_MESSAGES));

      const transcript = toSummarize
        .map((m) => {
          const role = String(m?.role || 'unknown');
          const content = m?.content != null ? String(m.content) : '';
          if (role === 'tool') {
            const name = m?.name ? String(m.name) : 'tool';
            return `[tool:${name}] ${content}`;
          }
          if (role === 'assistant' && m?.tool_calls) {
            return `[assistant:tool_calls] ${content}`;
          }
          return `[${role}] ${content}`;
        })
        .join('\n');

      const summary = await this.summarize(transcript);
      if (!summary) {
        return;
      }

      await db.transaction(async (trx) => {
        const keepIds = keep.map((m) => m.id);

        await trx('chat_messages')
          .where('chat_session_id', sessionId)
          .whereNotIn('id', keepIds)
          .del();

        const summaryRow = {
          chat_session_id: sessionId,
          role: 'system',
          content: `[RESUMO DA CONVERSA ANTERIOR]\n${summary}`,
        };

        await trx('chat_messages').insert(summaryRow);
      });

      logger.info('[ContextPurgeService] Histórico comprimido', {
        chat_session_id: sessionId,
        before: messages.length,
        keep: KEEP_LAST_MESSAGES,
      });
    } finally {
      try {
        await redis.del(lockKey);
      } catch {}
    }
  }

  async summarize(transcript) {
    const clean = String(transcript || '').trim();
    if (!clean) return null;

    if (!process.env.OPENROUTER_API_KEY) {
      return null;
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Você resume conversas de WhatsApp de uma recepcionista de agendamentos. Responda em português brasileiro. Gere um resumo em 1 ou 2 parágrafos, com os pontos principais, preferências do cliente e decisões já tomadas (datas/horários/serviços/profissional), sem inventar nada.'
        },
        {
          role: 'user',
          content: clean,
        }
      ],
      temperature: 0.2,
    });

    const text = completion?.choices?.[0]?.message?.content;
    const summary = text ? String(text).trim() : null;
    return summary || null;
  }
}

module.exports = new ContextPurgeService();

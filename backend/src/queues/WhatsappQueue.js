const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  maxRetriesPerRequest: null
};

const connection = new Redis(redisOptions);
const whatsappQueue = new Queue('whatsapp-messages', { connection });

class WhatsappQueueService {
  async addMessage(payload) {
    // ── Debug agressivo: inspecionar payload completo antes de enfileirar ────
    // Permite identificar campos numéricos que o BullMQ possa interpretar como ID.
    console.log('[WhatsappQueue] Payload completo:', JSON.stringify(payload, null, 2));

    // ── jobId removido temporariamente ────────────────────────────────────────
    // Deixamos o BullMQ gerar o ID automático (sempre uma string UUID única).
    // Se o erro "Custom Id cannot be integers" parar, o problema era o jobId
    // que estávamos injetando. Se persistir, o problema está na estrutura do payload.
    await whatsappQueue.add('process-incoming-message', payload, {
      attempts: 1,                                      // sem retentativas — 1 tentativa e para
      backoff: { type: 'exponential', delay: 10000 }   // 10s (irrelevante com attempts=1, mas mantido por segurança)
    });

    console.log('[WhatsappQueue] Job enfileirado com ID automático (BullMQ)');
  }
}

module.exports = new WhatsappQueueService();

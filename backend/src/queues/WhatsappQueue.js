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
    const messageId = payload.data?.message?.id || Date.now().toString();
    
    await whatsappQueue.add('process-incoming-message', payload, {
      jobId: messageId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  }
}

module.exports = new WhatsappQueueService();

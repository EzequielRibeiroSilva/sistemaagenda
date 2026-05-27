const { Worker } = require('bullmq');
const Redis = require('ioredis');

const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  maxRetriesPerRequest: null
};

const connection = new Redis(redisOptions);

class WhatsappWorker {
  start() {
    console.log('[Worker] Iniciando escuta da fila whatsapp-messages...');
    
    this.worker = new Worker('whatsapp-messages', async (job) => {
      const payload = job.data;
      console.log(`[Worker] Processando job ${job.id} - Mensagem da instância: ${payload.instance}`);
      return true;
    }, { connection });

    this.worker.on('completed', job => console.log(`[Worker] Job ${job.id} concluído.`));
    this.worker.on('failed', (job, err) => console.error(`[Worker] Job ${job.id} falhou:`, err.message));
  }
}

module.exports = new WhatsappWorker();

const Redis = require('ioredis');
const CircuitBreakerService = require('../src/services/CircuitBreakerService');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n🧪 INICIANDO TESTE CIRCUIT BREAKER HALF-OPEN (TASK 3.1)');
  console.log('═'.repeat(80));

  const unidadeId = 999999;

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: null,
  });

  const keys = {
    fails: CircuitBreakerService.getFailsKey(unidadeId),
    open: CircuitBreakerService.getOpenKey(unidadeId),
    state: CircuitBreakerService.getStateKey(unidadeId),
    lock: CircuitBreakerService.getHalfOpenLockKey(unidadeId),
  };

  await redis.del(keys.fails, keys.open, keys.state, keys.lock);

  console.log('1) Simulando 3 falhas -> deve abrir (OPEN)');
  for (let i = 0; i < 3; i++) {
    const res = await CircuitBreakerService.recordFailure(redis, unidadeId);
    console.log(`   failure ${i + 1}:`, res);
  }

  const statusOpen = await CircuitBreakerService.getStatus(redis, unidadeId);
  if (statusOpen.state !== CircuitBreakerService.STATES.OPEN) {
    throw new Error(`Esperado state=OPEN, atual=${statusOpen.state}`);
  }

  console.log('2) beforeRequest enquanto OPEN -> deve bloquear');
  const br1 = await CircuitBreakerService.beforeRequest(redis, unidadeId);
  if (br1.allow !== false) {
    throw new Error('Esperado allow=false enquanto OPEN');
  }

  console.log('3) Forçando passagem do tempo: reduzir TTL do OPEN para 1s');
  await redis.expire(keys.open, 1);
  await sleep(1200);

  console.log('4) beforeRequest após TTL -> transita para HALF_OPEN e permite 1 trial');
  const br2 = await CircuitBreakerService.beforeRequest(redis, unidadeId);
  if (br2.state !== CircuitBreakerService.STATES.HALF_OPEN) {
    throw new Error(`Esperado state=HALF_OPEN, atual=${br2.state}`);
  }
  if (br2.allow !== true) {
    throw new Error('Esperado allow=true para o 1 trial em HALF_OPEN');
  }

  console.log('5) beforeRequest em HALF_OPEN concorrente -> deve bloquear (trial já usado)');
  const br3 = await CircuitBreakerService.beforeRequest(redis, unidadeId);
  if (br3.allow !== false) {
    throw new Error('Esperado allow=false para concorrentes em HALF_OPEN');
  }

  console.log('6) Simulando sucesso do trial -> deve fechar (CLOSED)');
  await CircuitBreakerService.recordSuccess(redis, unidadeId);
  const statusClosed = await CircuitBreakerService.getStatus(redis, unidadeId);
  if (statusClosed.state !== CircuitBreakerService.STATES.CLOSED) {
    throw new Error(`Esperado state=CLOSED, atual=${statusClosed.state}`);
  }

  await redis.del(keys.fails, keys.open, keys.state, keys.lock);
  await redis.quit();

  console.log('═'.repeat(80));
  console.log('✅ TESTE TASK 3.1 PASSOU: OPEN -> HALF_OPEN -> CLOSED');
}

run().catch(err => {
  console.error('❌ TESTE TASK 3.1 FALHOU:', err?.message);
  console.error(err?.stack);
  process.exit(1);
});

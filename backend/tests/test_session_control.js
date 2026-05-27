const { db } = require('../src/config/knex');
const ChatSessionService = require('../src/services/ChatSessionService');
const ReactivateSessionsJob = require('../src/jobs/ReactivateSessionsJob');

async function getUnidadeId() {
  const unidade1 = await db('unidades').where('id', 1).first();
  if (unidade1) return 1;

  const first = await db('unidades').orderBy('id', 'asc').first();
  if (first?.id) return first.id;

  throw new Error('Nenhuma unidade encontrada no banco. Crie uma unidade antes de rodar o teste.');
}

async function getSession(unidadeId, telefone) {
  return await db('chat_sessions')
    .where('unidade_id', unidadeId)
    .where('cliente_telefone', telefone)
    .orderBy('id', 'desc')
    .first();
}

async function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const telefoneTeste = '5585999999999';
  const unidadeId = await getUnidadeId();

  console.log('[TEST] Unidade usada:', unidadeId);
  console.log('[TEST] Telefone teste:', telefoneTeste);

  await db('chat_sessions')
    .where('unidade_id', unidadeId)
    .where('cliente_telefone', telefoneTeste)
    .del();

  console.log('\n[TEST] Cenário A (Ativo)');
  const shouldProcessA = await ChatSessionService.shouldProcessMessage(unidadeId, telefoneTeste);
  await assert(shouldProcessA === true, 'Cenário A falhou: shouldProcessMessage deveria retornar true');

  const sessionA = await getSession(unidadeId, telefoneTeste);
  await assert(!!sessionA, 'Cenário A falhou: sessão não foi criada');
  await assert(sessionA.status === 'active', `Cenário A falhou: status esperado active, recebido ${sessionA.status}`);

  console.log('[TEST] Cenário A OK');

  console.log('\n[TEST] Cenário B (Pausa Humana)');
  await db('chat_sessions')
    .where('id', sessionA.id)
    .update({
      status: 'paused_by_human',
      updated_at: db.fn.now()
    });

  const sessionB = await getSession(unidadeId, telefoneTeste);
  await assert(sessionB.status === 'paused_by_human', `Cenário B falhou: status esperado paused_by_human, recebido ${sessionB.status}`);

  console.log('[TEST] Cenário B OK');

  console.log('\n[TEST] Cenário C (Kill Switch)');
  const shouldProcessC = await ChatSessionService.shouldProcessMessage(unidadeId, telefoneTeste);
  await assert(shouldProcessC === false, 'Cenário C falhou: shouldProcessMessage deveria retornar false');

  console.log('[TEST] Cenário C OK');

  console.log('\n[TEST] Cenário D (Reativação)');
  await db('chat_sessions')
    .where('unidade_id', unidadeId)
    .where('cliente_telefone', telefoneTeste)
    .update({
      last_interaction_at: db.raw("NOW() - INTERVAL '3 hours'"),
      updated_at: db.fn.now()
    });

  await ReactivateSessionsJob.execute();

  const sessionD = await getSession(unidadeId, telefoneTeste);
  await assert(sessionD.status === 'active', `Cenário D falhou: status esperado active, recebido ${sessionD.status}`);

  console.log('[TEST] Cenário D OK');

  console.log('\n[TEST] ✅ Todos os cenários (A, B, C, D) passaram.');
}

run()
  .then(() => db.destroy())
  .catch(async (err) => {
    console.error('\n[TEST] ❌ Falha no teste:', err.message);
    try {
      await db.destroy();
    } catch {}
    process.exit(1);
  });

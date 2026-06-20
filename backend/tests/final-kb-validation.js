const { getInstance: getKnowledgeBaseService } = require('../src/services/KnowledgeBaseService');
const { db, closeConnection } = require('../src/config/knex');

async function main() {
  const email = 'testando@gmail.com';

  console.log('--- final-kb-validation.js ---');
  console.log('email:', email);

  const kb = getKnowledgeBaseService();

  try {
    const usuario = await db('usuarios')
      .where('email', email)
      .select('id', 'email', 'nome', 'role', 'status')
      .first();

    if (!usuario) {
      throw new Error(`Usuário não encontrado: ${email}`);
    }

    const unidade = await db('unidades')
      .where('usuario_id', usuario.id)
      .where('nome', 'Stephanie Cabelos')
      .select('id', 'usuario_id', 'nome', 'status')
      .first();

    if (!unidade) {
      throw new Error(`Unidade "Stephanie Cabelos" não encontrada para usuario_id=${usuario.id}`);
    }

    console.log('usuario_id:', usuario.id);
    console.log('unidade_id:', unidade.id);

    // Forçar rebuild para validar buildKnowledgeBase e popular cache
    await kb.invalidateCache(usuario.id, unidade.id);

    const knowledge = await kb.buildKnowledgeBase(usuario.id, unidade.id);

    // Verificações obrigatórias
    const unidadeNomeOk = knowledge?.unidade?.nome === 'Stephanie Cabelos';
    const equipe = Array.isArray(knowledge?.agentes)
      ? knowledge.agentes.map(a => a?.nome_completo).filter(Boolean)
      : [];

    const equipeOk = equipe.includes('Stephanie Silva') && equipe.includes('Damião Gomes');

    const servicos = Array.isArray(knowledge?.servicos)
      ? knowledge.servicos.map(s => s?.nome).filter(Boolean)
      : [];

    const servicosOk = servicos.includes('Corte') && servicos.includes('Pintura');

    console.log('\n--- asserts ---');
    console.log('unidade_nome_ok:', unidadeNomeOk);
    console.log('equipe_ok:', equipeOk, 'equipe:', equipe);
    console.log('servicos_ok:', servicosOk, 'servicos:', servicos);

    console.log('\n--- knowledgebase (snapshot) ---');
    console.log(JSON.stringify(knowledge, null, 2));

    if (!unidadeNomeOk || !equipeOk || !servicosOk) {
      process.exitCode = 1;
    }

    // Validar HIT logo após build (deve vir do cache)
    console.log('\n--- cache hit check ---');
    const cached = await kb.getCachedKnowledge(usuario.id, unidade.id);
    console.log('cached_ok:', !!cached);
  } catch (err) {
    console.error('❌ final-kb-validation ERROR (raw):', err);
    console.error('❌ final-kb-validation ERROR (details):', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint,
      where: err?.where,
      schema: err?.schema,
      table: err?.table,
      constraint: err?.constraint,
      routine: err?.routine
    });
    process.exitCode = 1;
  } finally {
    await closeConnection();
  }
}

main();

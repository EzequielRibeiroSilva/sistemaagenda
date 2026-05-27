const { db } = require('../src/config/knex');
const AgendamentoController = require('../src/controllers/AgendamentoController');

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildMockRes() {
  const res = {
    statusCode: null,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    }
  };
  return res;
}

function formatDateYmd(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

async function pickFixture() {
  const usuario = await db('usuarios')
    .where('email', 'testando@gmail.com')
    .first();

  if (!usuario?.id) {
    throw new Error('Usuário testando@gmail.com não encontrado no banco.');
  }

  let unidade = null;
  if (usuario.unidade_id) {
    unidade = await db('unidades')
      .where('id', usuario.unidade_id)
      .where('usuario_id', usuario.id)
      .first();
  }

  if (!unidade) {
    unidade = await db('unidades')
      .where('usuario_id', usuario.id)
      .where('status', 'Ativo')
      .orderBy('id', 'asc')
      .first();
  }

  if (!unidade?.id) {
    throw new Error(`Nenhuma unidade ativa encontrada para usuario_id=${usuario.id}`);
  }

  const agente = await db('agentes')
    .where('unidade_id', unidade.id)
    .where('status', 'Ativo')
    .whereNull('deleted_at')
    .orderBy('id', 'asc')
    .first();

  if (!agente?.id) {
    throw new Error(`Nenhum agente ativo encontrado para unidade_id=${unidade.id}`);
  }

  const servicoRel = await db('unidade_servicos')
    .where('unidade_id', unidade.id)
    .orderBy('servico_id', 'asc')
    .first();

  if (!servicoRel?.servico_id) {
    throw new Error(`Nenhum serviço associado à unidade_id=${unidade.id} (tabela unidade_servicos).`);
  }

  const servicoSemSinal = await db('servicos as s')
    .join('unidade_servicos as us', 's.id', 'us.servico_id')
    .where('us.unidade_id', unidade.id)
    .where('s.status', 'Ativo')
    .where(function () {
      this.where('s.exige_sinal', false).orWhereNull('s.exige_sinal');
    })
    .select('s.id', 's.exige_sinal')
    .orderBy('s.id', 'asc')
    .first();

  const servico = servicoSemSinal
    ? servicoSemSinal
    : await db('servicos')
      .where('id', servicoRel.servico_id)
      .where('status', 'Ativo')
      .select('id', 'exige_sinal')
      .first();

  if (!servico?.id) {
    throw new Error(`Nenhum serviço ativo encontrado para unidade_id=${unidade.id}.`);
  }

  if (servico?.exige_sinal) {
    throw new Error(`Não foi possível encontrar serviço sem sinal (exige_sinal=false) para unidade_id=${unidade.id}.`);
  }

  const telefoneLimpo = `5599${Date.now().toString().slice(-9)}`;
  const [cliente] = await db('clientes')
    .insert({
      primeiro_nome: 'Teste',
      ultimo_nome: 'Refactor',
      telefone: telefoneLimpo,
      telefone_limpo: telefoneLimpo,
      unidade_id: unidade.id,
      status: 'Ativo',
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    })
    .returning('*');

  if (!cliente?.id) {
    throw new Error('Falha ao criar cliente fixture');
  }

  return { usuario, unidade, agente, servico, cliente };
}

async function run() {
  const controller = new AgendamentoController();

  const { usuario, unidade, agente, servico, cliente } = await pickFixture();

  const future = new Date();
  future.setDate(future.getDate() + 7);
  const dataAgendamento = formatDateYmd(future);

  const req = {
    body: {
      unidade_id: unidade.id,
      agente_id: agente.id,
      cliente_id: cliente.id,
      // Intencionalmente omitido: cliente_telefone (UseCase deve buscar por clienteId)
      servico_ids: [servico.id],
      data_agendamento: dataAgendamento,
      hora_inicio: '10:00'
      // Intencionalmente omitido: hora_fim (UseCase deve calcular por duracao_minutos)
    },
    user: {
      id: usuario.id,
      role: usuario.role || 'ADMIN'
    }
  };

  const res = buildMockRes();

  console.log('[TEST] Chamando AgendamentoController.store...');
  await controller.store(req, res);

  console.log('[TEST] statusCode:', res.statusCode);
  console.log('[TEST] jsonBody keys:', res.jsonBody ? Object.keys(res.jsonBody) : null);

  await assert(res.statusCode === 201, `Esperado status 201, recebido ${res.statusCode}. Body=${JSON.stringify(res.jsonBody)}`);
  await assert(!!res.jsonBody, 'Resposta JSON vazia');

  const returnedId = res.jsonBody?.agendamento?.id || res.jsonBody?.id || res.jsonBody?.data?.id;
  await assert(!!returnedId, `Resposta não contém id do agendamento. Body=${JSON.stringify(res.jsonBody)}`);

  const persisted = await db('agendamentos')
    .where('id', returnedId)
    .whereNull('deleted_at')
    .first();

  await assert(!!persisted, `Agendamento ${returnedId} não encontrado no banco`);
  await assert(Number(persisted.unidade_id) === Number(unidade.id), 'Agendamento persistido com unidade_id incorreta');
  await assert(Number(persisted.agente_id) === Number(agente.id), 'Agendamento persistido com agente_id incorreto');
  await assert(Number(persisted.cliente_id) === Number(cliente.id), 'Agendamento persistido com cliente_id incorreto');

  console.log('[TEST] ✅ Agendamento persistido com sucesso via controller.store:', {
    id: persisted.id,
    unidade_id: persisted.unidade_id,
    agente_id: persisted.agente_id,
    cliente_id: persisted.cliente_id,
    data_agendamento: persisted.data_agendamento,
    hora_inicio: persisted.hora_inicio,
    hora_fim: persisted.hora_fim
  });

  // Cleanup best-effort
  try {
    await db('agendamento_servicos').where('agendamento_id', returnedId).del();
  } catch {}
  try {
    await db('agendamento_servicos_extras').where('agendamento_id', returnedId).del();
  } catch {}
  try {
    await db('agendamentos').where('id', returnedId).del();
  } catch {}
  try {
    await db('clientes').where('id', cliente.id).del();
  } catch {}

  console.log('[TEST] Cleanup concluído.');
}

run()
  .then(() => db.destroy())
  .catch(async (err) => {
    console.error('\n[TEST] ❌ Falha:', err.message);
    try { await db.destroy(); } catch {}
    process.exit(1);
  });

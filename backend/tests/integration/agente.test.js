const {
  createTestUserInDB,
  createTestUnit,
  createTestAgent,
  createTestClient,
  loginAndGetToken,
  authRequest,
  db
} = require('../helpers/testHelpers');

const TEST_PREFIX = 'agente_integration_test';

async function cleanupAgenteIntegrationData() {
  await db('agendamento_servicos')
    .whereRaw(`agendamento_id IN (SELECT id FROM agendamentos WHERE observacoes LIKE ?)`, [`%${TEST_PREFIX}%`])
    .del();
  await db('agendamentos')
    .where('observacoes', 'like', `%${TEST_PREFIX}%`)
    .del();
  await db('agente_unidades')
    .whereRaw(`agente_id IN (SELECT id FROM agentes WHERE nome LIKE ?)`, [`%${TEST_PREFIX}%`])
    .del();
  await db('agentes')
    .where('nome', 'like', `%${TEST_PREFIX}%`)
    .del();
  await db('clientes')
    .where('primeiro_nome', 'like', `%${TEST_PREFIX}%`)
    .del();
  await db('unidades')
    .where('nome', 'like', `%${TEST_PREFIX}%`)
    .del();
  await db('usuarios')
    .where('email', 'like', `%${TEST_PREFIX}%`)
    .del();
}

async function createFutureAppointment({ agenteId, unidadeId, clienteId, usuarioId, observacoes }) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const dataAgendamento = futureDate.toISOString().split('T')[0];

  const [appointment] = await db('agendamentos')
    .insert({
      cliente_id: clienteId,
      agente_id: agenteId,
      unidade_id: unidadeId,
      usuario_id: usuarioId,
      numero_agendamento: Math.floor(Math.random() * 1000000000),
      data_agendamento: dataAgendamento,
      hora_inicio: '10:00',
      hora_fim: '11:00',
      status: 'Aprovado',
      status_pagamento: 'Não Pago',
      metodo_pagamento: 'Não definido',
      valor_total: 100,
      observacoes,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');

  return appointment;
}

describe('AgenteController - integração de exclusão de agentes', () => {
  beforeEach(async () => {
    await cleanupAgenteIntegrationData();
  });

  afterEach(async () => {
    await cleanupAgenteIntegrationData();
  });

  test('deve retornar 409 Conflict e manter deleted_at nulo ao tentar excluir agente com agendamentos futuros', async () => {
    const unique = `${TEST_PREFIX}_${Date.now()}_conflict`;
    const admin = await createTestUserInDB({
      email: `${unique}_admin@test.com`,
      nome: `${TEST_PREFIX} Admin Conflict`,
      senha: 'Test@123',
      role: 'ADMIN',
      tipo_usuario: 'admin',
      plano: 'Single'
    });
    const unidade = await createTestUnit(admin.id, {
      nome: `${TEST_PREFIX} Unidade Conflict`
    });
    const { agent } = await createTestAgent(admin.id, unidade.id, {
      email: `${unique}_agent@test.com`,
      nome: `${TEST_PREFIX} Agente Conflict`
    });
    const cliente = await createTestClient(unidade.id, {
      primeiro_nome: `${TEST_PREFIX} Cliente Conflict`
    });

    await createFutureAppointment({
      agenteId: agent.id,
      unidadeId: unidade.id,
      clienteId: cliente.id,
      usuarioId: admin.id,
      observacoes: `${TEST_PREFIX} future appointment conflict`
    });

    const token = await loginAndGetToken(admin.email, 'Test@123');

    const response = await authRequest(token).delete(`/api/agentes/${agent.id}`);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.data.agendamentos_futuros).toBe(1);

    const agenteNoBanco = await db('agentes')
      .where('id', agent.id)
      .first();

    expect(agenteNoBanco).toBeTruthy();
    expect(agenteNoBanco.deleted_at).toBeNull();
  });

  test('deve retornar 200 OK e preencher deleted_at ao excluir agente sem agendamentos futuros', async () => {
    const unique = `${TEST_PREFIX}_${Date.now()}_success`;
    const admin = await createTestUserInDB({
      email: `${unique}_admin@test.com`,
      nome: `${TEST_PREFIX} Admin Success`,
      senha: 'Test@123',
      role: 'ADMIN',
      tipo_usuario: 'admin',
      plano: 'Single'
    });
    const unidade = await createTestUnit(admin.id, {
      nome: `${TEST_PREFIX} Unidade Success`
    });
    const { agent } = await createTestAgent(admin.id, unidade.id, {
      email: `${unique}_agent@test.com`,
      nome: `${TEST_PREFIX} Agente Success`
    });

    const token = await loginAndGetToken(admin.email, 'Test@123');

    const response = await authRequest(token).delete(`/api/agentes/${agent.id}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const agenteNoBanco = await db('agentes')
      .where('id', agent.id)
      .first();

    expect(agenteNoBanco).toBeTruthy();
    expect(agenteNoBanco.deleted_at).not.toBeNull();
  });
});

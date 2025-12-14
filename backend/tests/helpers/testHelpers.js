/**
 * Test Helpers
 * Funções auxiliares para testes automatizados
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../../src/app');
const { db } = require('../../src/config/knex');

/**
 * Criar usuário de teste no banco
 */
async function createTestUserInDB(userData) {
  const senhaHash = await bcrypt.hash(userData.senha || 'Test@123', 10);
  
  const [user] = await db('usuarios')
    .insert({
      email: userData.email,
      nome: userData.nome || 'Test User',
      senha_hash: senhaHash,
      role: userData.role || 'ADMIN',
      tipo_usuario: userData.tipo_usuario || 'Admin',
      status: userData.status || 'Ativo',
      plano: userData.plano || 'basico',
      limite_unidades: userData.limite_unidades || 1,
      unidade_id: userData.unidade_id || null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');
  
  return user;
}

/**
 * Criar unidade de teste
 */
async function createTestUnit(usuarioId, unitData = {}) {
  const [unit] = await db('unidades')
    .insert({
      nome: unitData.nome || 'Unidade Teste',
      usuario_id: usuarioId,
      telefone: unitData.telefone || '11999999999',
      endereco: unitData.endereco || 'Rua Teste, 123',
      status: unitData.status || 'Ativo',
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');
  
  return unit;
}

/**
 * Criar agente de teste
 */
async function createTestAgent(usuarioId, unidadeId, agentData = {}) {
  // Primeiro criar usuário para o agente
  const agenteUser = await createTestUserInDB({
    email: agentData.email || `agente_${Date.now()}@test.com`,
    nome: agentData.nome || 'Agente Teste',
    role: 'AGENTE',
    tipo_usuario: 'Agente',
    unidade_id: unidadeId
  });
  
  // Criar registro na tabela agentes
  const [agent] = await db('agentes')
    .insert({
      nome: agentData.nome || 'Agente Teste',
      sobrenome: agentData.sobrenome || 'Sobrenome',
      email: agenteUser.email,
      telefone: agentData.telefone || '11988888888',
      usuario_id: agenteUser.id,
      unidade_id: unidadeId,
      status: 'Ativo',
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');
  
  // Vincular agente à unidade
  await db('agente_unidades')
    .insert({
      agente_id: agent.id,
      unidade_id: unidadeId
    })
    .onConflict(['agente_id', 'unidade_id'])
    .ignore();
  
  return { agent, user: agenteUser };
}

/**
 * Criar cliente de teste
 */
async function createTestClient(unidadeId, clientData = {}) {
  const telefone = clientData.telefone || `119${Date.now().toString().slice(-8)}`;
  const [client] = await db('clientes')
    .insert({
      primeiro_nome: clientData.primeiro_nome || 'Cliente',
      ultimo_nome: clientData.ultimo_nome || 'Teste',
      telefone: telefone,
      telefone_limpo: telefone.replace(/\D/g, ''),
      unidade_id: unidadeId,
      status: 'Ativo',
      is_assinante: clientData.is_assinante || false,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');
  
  return client;
}

/**
 * Criar serviço de teste
 */
async function createTestService(usuarioId, serviceData = {}) {
  const [service] = await db('servicos')
    .insert({
      nome: serviceData.nome || 'Serviço Teste',
      descricao: serviceData.descricao || 'Descrição do serviço teste',
      preco: serviceData.preco || '50.00',
      duracao_minutos: serviceData.duracao_minutos || 30,
      usuario_id: usuarioId,
      status: 'Ativo',
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');
  
  return service;
}

/**
 * Fazer login e retornar token
 */
async function loginAndGetToken(email, senha) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, senha });
  
  if (response.status !== 200) {
    throw new Error(`Login falhou: ${JSON.stringify(response.body)}`);
  }
  
  return response.body.token;
}

/**
 * Fazer requisição autenticada
 */
function authRequest(token) {
  return {
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`)
  };
}

/**
 * Limpar dados de teste
 */
async function cleanupTestData(prefix = 'test') {
  // Ordem importante: respeitar foreign keys
  await db('agendamento_servicos').whereRaw(`agendamento_id IN (SELECT id FROM agendamentos WHERE observacoes LIKE '%${prefix}%')`).del();
  await db('agendamentos').where('observacoes', 'like', `%${prefix}%`).del();
  await db('agente_unidades').whereRaw(`agente_id IN (SELECT id FROM agentes WHERE email LIKE '%${prefix}%')`).del();
  await db('agentes').where('email', 'like', `%${prefix}%`).del();
  await db('clientes').where('primeiro_nome', 'like', `%${prefix}%`).del();
  await db('servicos').where('nome', 'like', `%${prefix}%`).del();
  await db('unidades').where('nome', 'like', `%${prefix}%`).del();
  await db('usuarios').where('email', 'like', `%${prefix}%`).del();
}

module.exports = {
  createTestUserInDB,
  createTestUnit,
  createTestAgent,
  createTestClient,
  createTestService,
  loginAndGetToken,
  authRequest,
  cleanupTestData,
  db,
  app
};


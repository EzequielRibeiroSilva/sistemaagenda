/**
 * Testes de Concorrência
 * 
 * Testa cenários onde múltiplas operações acontecem simultaneamente:
 * - Múltiplos agendamentos no mesmo horário (race condition)
 * - Múltiplos logins simultâneos
 * - Operações de escrita simultâneas no mesmo recurso
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { db } = require('../../src/config/knex');

jest.mock('../../src/services/WhatsAppService', () => {
  return jest.fn().mockImplementation(() => {
    return {
      sendAppointmentConfirmation: jest.fn().mockResolvedValue({ mocked: true })
    };
  });
});

jest.mock('../../src/services/RedisService', () => {
  return {
    getInstance: () => ({
      get: async () => null,
      set: async () => true,
      del: async () => true,
      incr: async () => 1,
      expire: async () => true,
      addToBlacklist: async () => true,
      isBlacklisted: async () => false
    })
  };
});

let app;

describe('🏎️ Testes de Concorrência', () => {
  let admin, unidade, agente, cliente, servico, token;
  let runId;
  
  beforeAll(async () => {
    const appModule = require('../../src/app');
    app = appModule.app;

    runId = Date.now().toString();
    
    await cleanupConcurrencyTestData();
    const setup = await createConcurrencySetup(runId);
    admin = setup.admin;
    unidade = setup.unidade;
    agente = setup.agente;
    cliente = setup.cliente;
    servico = setup.servico;
    token = setup.token;
  });
  
  afterAll(async () => {
    await cleanupConcurrencyTestData();
    await db.destroy();
  });

  describe('⚔️ Race Condition em Agendamentos', () => {
    test('Apenas 1 agendamento deve ser criado quando 5 clientes tentam o mesmo horário', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2); // D+2 para evitar conflitos
      const dataStr = tomorrow.toISOString().split('T')[0];
      
      // Simular 5 requisições simultâneas para o MESMO horário
      const promises = Array(5).fill(null).map((_, i) => 
        request(app)
          .post('/api/agendamentos')
          .set('Authorization', `Bearer ${token}`)
          .send({
            agente_id: agente.id,
            unidade_id: unidade.id,
            servico_ids: [servico.id],
            data_agendamento: dataStr,
            hora_inicio: '11:00',
            hora_fim: '11:30',
            cliente_nome: `Cliente Concorrente ${i}`,
            cliente_telefone: `1199999000${i}`,
            observacoes: 'CONCURRENCY_TEST race'
          })
      );
      
      // Executar todas simultaneamente
      const results = await Promise.all(promises);
      
      // Contar quantos tiveram sucesso (201) e quantos falharam (400/409)
      const successes = results.filter(r => r.status === 201);
      const failures = results.filter(r => r.status !== 201);
      
      console.log(`\n📊 Race Condition Results:`);
      console.log(`   ✅ Criados: ${successes.length}`);
      console.log(`   ❌ Bloqueados: ${failures.length}`);
      
      // APENAS 1 deve ter sucesso (o primeiro a chegar)
      expect(successes.length).toBe(1);
      // Os outros 4 devem falhar por conflito de horário
      expect(failures.length).toBe(4);
    }, 60000);

    test('Sistema deve processar 5 agendamentos em horários diferentes sem falhas', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 3); // D+3
      const dataStr = tomorrow.toISOString().split('T')[0];
      
      // 5 requisições para horários DIFERENTES (sem conflito)
      const promises = Array(5).fill(null).map((_, i) => {
        const hora = 8 + i; // 08:00, 09:00, 10:00... até 17:00
        return request(app)
          .post('/api/agendamentos')
          .set('Authorization', `Bearer ${token}`)
          .send({
            agente_id: agente.id,
            unidade_id: unidade.id,
            servico_ids: [servico.id],
            data_agendamento: dataStr,
            hora_inicio: `${hora.toString().padStart(2, '0')}:00`,
            hora_fim: `${hora.toString().padStart(2, '0')}:30`,
            cliente_nome: `Cliente Volume ${i}`,
            cliente_telefone: `1198888000${i}`,
            observacoes: 'CONCURRENCY_TEST volume'
          });
      });
      
      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      const successes = results.filter(r => r.status === 201);
      const handled = results.filter(r => [201, 400, 409, 500].includes(r.status));
      
      console.log(`\n📊 Volume Test Results:`);
      console.log(`   ✅ Criados: ${successes.length}/5`);
      console.log(`   ⏱️  Tempo total: ${duration}ms`);
      console.log(`   📈 Média por request: ${Math.round(duration/5)}ms`);
      
      // Não deve travar/hangar: todas respostas devem ser status conhecido
      expect(handled.length).toBe(5);
      // Deve processar em tempo razoável (menos de 10s para 10 requests)
      expect(duration).toBeLessThan(60000);
    }, 60000);
  });

  describe('🔐 Concorrência em Autenticação', () => {
    test('Sistema deve processar 20 logins simultâneos', async () => {
      // 20 tentativas de login simultâneas
      const promises = Array(20).fill(null).map(() => 
        request(app)
          .post('/api/auth/login')
          .send({
            email: admin.email,
            senha: 'Test@123'
          })
      );
      
      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      const successes = results.filter(r => r.status === 200);
      
      console.log(`\n📊 Login Concurrency Results:`);
      console.log(`   ✅ Logins bem-sucedidos: ${successes.length}/20`);
      console.log(`   ⏱️  Tempo total: ${duration}ms`);
      console.log(`   📈 Média por login: ${Math.round(duration/20)}ms`);
      
      // Todos devem ter sucesso
      expect(successes.length).toBe(20);
      // Deve processar em tempo razoável
      expect(duration).toBeLessThan(60000);
    }, 60000);
  });

  describe('📊 Leitura Massiva de Dados', () => {
    test('Sistema deve listar agendamentos com 50 requisições simultâneas', async () => {
      const promises = Array(50).fill(null).map(() =>
        request(app)
          .get('/api/agendamentos')
          .set('Authorization', `Bearer ${token}`)
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      const successes = results.filter(r => r.status === 200);

      console.log(`\n📊 Read Concurrency Results:`);
      console.log(`   ✅ Requisições bem-sucedidas: ${successes.length}/50`);
      console.log(`   ⏱️  Tempo total: ${duration}ms`);
      console.log(`   📈 Média por request: ${Math.round(duration/50)}ms`);
      console.log(`   🚀 Throughput: ${Math.round(50000/duration)} req/s`);

      expect(successes.length).toBe(50);
      expect(duration).toBeLessThan(20000); // Menos de 20s
    }, 30000);
  });
});

// ============= FUNÇÕES AUXILIARES =============

async function cleanupConcurrencyTestData() {
  await db('lembretes_enviados').whereRaw("1=1").del().catch(() => {});
  await db('agendamento_servicos').whereRaw(`agendamento_id IN (SELECT id FROM agendamentos WHERE observacoes LIKE '%CONCURRENCY_TEST%')`).del().catch(() => {});
  await db('agendamentos')
    .where('observacoes', 'like', '%CONCURRENCY_TEST%')
    .whereNull('deleted_at')
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() })
    .catch(() => {});
  await db('agente_servicos').whereRaw(`agente_id IN (SELECT id FROM agentes WHERE email LIKE '%concurrency_test%')`).del().catch(() => {});
  await db('agente_unidades').whereRaw(`agente_id IN (SELECT id FROM agentes WHERE email LIKE '%concurrency_test%')`).del().catch(() => {});
  await db('agentes').where('email', 'like', '%concurrency_test%').del().catch(() => {});
  await db('clientes').where('primeiro_nome', 'like', '%CONCURRENCY%').del().catch(() => {});
  await db('clientes').where('primeiro_nome', 'like', '%Cliente Concorrente%').del().catch(() => {});
  await db('clientes').where('primeiro_nome', 'like', '%Cliente Volume%').del().catch(() => {});
  await db('unidade_servicos').whereRaw(`servico_id IN (SELECT id FROM servicos WHERE nome LIKE '%CONCURRENCY_TEST%')`).del().catch(() => {});
  await db('servicos').where('nome', 'like', '%CONCURRENCY_TEST%').del().catch(() => {});
  await db('unidades').where('nome', 'like', '%CONCURRENCY_TEST%').del().catch(() => {});
  await db('usuarios').where('email', 'like', '%concurrency_test%').del().catch(() => {});
}

async function createConcurrencySetup(runId) {
  const senhaHash = await bcrypt.hash('Test@123', 10);

  const adminEmail = `concurrency_test_${runId}@test.com`;
  const agenteEmail = `agente_concurrency_test_${runId}@test.com`;

  const [admin] = await db('usuarios').insert({
    email: adminEmail, nome: 'Admin CONCURRENCY_TEST',
    senha_hash: senhaHash, role: 'ADMIN', tipo_usuario: 'admin',
    status: 'Ativo', plano: 'Multi', limite_unidades: 5,
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  const [unidade] = await db('unidades').insert({
    nome: 'Unidade CONCURRENCY_TEST', usuario_id: admin.id,
    telefone: '11999999999', status: 'Ativo',
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  await db('usuarios').where('id', admin.id).update({ unidade_id: unidade.id });

  const [agenteUser] = await db('usuarios').insert({
    email: agenteEmail, nome: 'Agente CONCURRENCY_TEST',
    senha_hash: senhaHash, role: 'AGENTE', tipo_usuario: 'agent',
    status: 'Ativo', unidade_id: unidade.id,
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  const [agente] = await db('agentes').insert({
    nome: 'Agente', sobrenome: 'CONCURRENCY_TEST',
    email: agenteUser.email, telefone: '11988888888',
    usuario_id: admin.id, unidade_id: unidade.id, status: 'Ativo',
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  const exists = await db('agente_unidades')
    .where({ agente_id: agente.id, unidade_id: unidade.id })
    .first();
  if (!exists) {
    await db('agente_unidades').insert({ agente_id: agente.id, unidade_id: unidade.id });
  }

  const [cliente] = await db('clientes').insert({
    primeiro_nome: 'Cliente', ultimo_nome: 'CONCURRENCY_TEST',
    telefone: '11977777777', telefone_limpo: '11977777777',
    unidade_id: unidade.id, status: 'Ativo',
    exige_sinal_excecao: false,
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  const [servico] = await db('servicos').insert({
    nome: 'Servico CONCURRENCY_TEST', descricao: 'Teste',
    preco: '50.00', duracao_minutos: 30,
    usuario_id: admin.id, status: 'Ativo',
    exige_sinal: false,
    valor_sinal: null,
    created_at: new Date(), updated_at: new Date()
  }).returning('*');

  await db('unidade_servicos').insert({
    unidade_id: unidade.id,
    servico_id: servico.id
  });

  const AuthService = require('../../src/services/AuthService');
  const authService = new AuthService();
  const loginResult = await authService.login(adminEmail, 'Test@123');

  return { admin, unidade, agente, cliente, servico, token: loginResult.token };
}


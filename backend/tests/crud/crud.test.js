/**
 * 🔧 TESTES CRUD DE FUNCIONALIDADES
 *
 * Testa operações Create, Read, Update, Delete de:
 * - Agentes
 * - Serviços
 * - Clientes
 * - Unidades
 * - Cupons
 */

const request = require('supertest');
const { db } = require('../../src/config/knex');

let app;
let authToken;
let testData = {};
let adminUser;

describe('🔧 Testes CRUD de Funcionalidades', () => {
  
  beforeAll(async () => {
    const appModule = require('../../src/app');
    app = appModule.app;

    // Buscar usuário admin para login
    adminUser = await db('usuarios')
      .whereIn('tipo_usuario', ['admin', 'ADMIN'])
      .where('status', 'Ativo')
      .first();

    if (adminUser) {
      const senhasTeste = ['Teste@123', 'Admin@123', '123456'];
      for (const senha of senhasTeste) {
        const loginRes = await request(app)
          .post('/api/auth/login')
          .send({ email: adminUser.email, senha });
        if (loginRes.body?.data?.token) {
          authToken = loginRes.body.data.token;
          break;
        }
      }
    }

    // Buscar dados existentes para testes
    let unidade = null;
    if (adminUser?.id) {
      unidade = await db('unidades')
        .where({ status: 'Ativo', usuario_id: adminUser.id })
        .first();
    }

    if (!unidade && adminUser?.id) {
      const [created] = await db('unidades')
        .insert({
          nome: `CRUD_TEST Unidade ${Date.now()}`,
          usuario_id: adminUser.id,
          telefone: '11999999999',
          status: 'Ativo',
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      unidade = created;

      await db('usuarios')
        .where('id', adminUser.id)
        .whereNull('unidade_id')
        .update({ unidade_id: unidade.id, updated_at: new Date() })
        .catch(() => {});
    }

    const agente = unidade?.id
      ? await db('agentes').where({ status: 'Ativo', unidade_id: unidade.id }).first()
      : null;
    const cliente = unidade?.id
      ? await db('clientes').where('unidade_id', unidade.id).first()
      : null;
    const servico = adminUser?.id
      ? await db('servicos').where({ status: 'Ativo', usuario_id: adminUser.id }).first()
      : null;

    testData = {
      unidade_id: unidade?.id,
      agente_id: agente?.id,
      cliente_id: cliente?.id,
      servico_id: servico?.id
    };
  });

  afterAll(async () => {
    // Limpar dados de teste criados
    await db('servicos').where('nome', 'like', '%CRUD_TEST%').delete();
    await db('clientes').where('primeiro_nome', 'like', '%CRUD_TEST%').delete();
    await db('cupons').where('codigo', 'like', '%CRUDTEST%').delete();
    await db.destroy();
  });

  // ═══════════════════════════════════════════════════════════════
  // 📋 TESTES DE SERVIÇOS
  // ═══════════════════════════════════════════════════════════════
  describe('📋 CRUD de Serviços', () => {
    let servicoCriado;

    test('✓ Deve listar serviços', async () => {
      if (!authToken) return;
      
      const res = await request(app)
        .get('/api/servicos')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('✓ Deve criar novo serviço', async () => {
      if (!authToken || !testData.unidade_id) return;

      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          nome: 'CRUD_TEST_Corte Teste',
          descricao: 'Serviço criado para teste CRUD',
          preco: 50.00,
          duracao_minutos: 30,
          status: 'Ativo'
        });

      expect([200, 201]).toContain(res.status);
      if (res.body.data) {
        servicoCriado = res.body.data;
      }
    });

    test('✓ Deve buscar serviço por ID', async () => {
      if (!authToken || !testData.servico_id) return;

      const res = await request(app)
        .get(`/api/servicos/${testData.servico_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    test('✓ Deve atualizar serviço', async () => {
      if (!authToken || !servicoCriado?.id) return;

      const res = await request(app)
        .put(`/api/servicos/${servicoCriado.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          nome: 'CRUD_TEST_Corte Atualizado',
          preco: 60.00
        });

      expect([200, 201]).toContain(res.status);
    });

    test('✓ Deve deletar serviço', async () => {
      if (!authToken || !servicoCriado?.id) return;

      const res = await request(app)
        .delete(`/api/servicos/${servicoCriado.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 204]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 👥 TESTES DE CLIENTES
  // ═══════════════════════════════════════════════════════════════
  describe('👥 CRUD de Clientes', () => {
    let clienteCriado;

    test('✓ Deve buscar clientes (search)', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/clientes/search?q=teste')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    test('✓ Deve listar clientes', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/clientes')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('✓ Deve criar novo cliente', async () => {
      if (!authToken || !testData.unidade_id) return;

      const telefone = `119${Date.now().toString().slice(-8)}`;
      const res = await request(app)
        .post('/api/clientes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          primeiro_nome: 'CRUD_TEST_Cliente',
          ultimo_nome: 'Teste',
          telefone: telefone,
          unidade_id: testData.unidade_id
        });

      expect([200, 201]).toContain(res.status);
      if (res.body.data) {
        clienteCriado = res.body.data;
      }
    });

    test('✓ Deve buscar cliente por ID', async () => {
      if (!authToken || !testData.cliente_id) return;

      const res = await request(app)
        .get(`/api/clientes/${testData.cliente_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    test('✓ Deve buscar pontos do cliente', async () => {
      if (!authToken || !testData.cliente_id || !testData.unidade_id) return;

      const res = await request(app)
        .get(`/api/clientes/${testData.cliente_id}/pontos?unidade_id=${testData.unidade_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    test('✓ Deve atualizar cliente', async () => {
      if (!authToken || !clienteCriado?.id) return;

      const res = await request(app)
        .put(`/api/clientes/${clienteCriado.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          primeiro_nome: 'CRUD_TEST_ClienteAtualizado'
        });

      expect([200, 201]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 👔 TESTES DE AGENTES
  // ═══════════════════════════════════════════════════════════════
  describe('👔 CRUD de Agentes', () => {

    test('✓ Deve listar agentes', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/agentes')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('✓ Deve listar agentes (versão leve)', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/agentes/list')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('✓ Deve buscar agente por ID', async () => {
      if (!authToken || !testData.agente_id) return;

      const res = await request(app)
        .get(`/api/agentes/${testData.agente_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('✓ Deve validar campos obrigatórios ao criar agente', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/api/agentes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Sem campos obrigatórios
        });

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 🏢 TESTES DE UNIDADES
  // ═══════════════════════════════════════════════════════════════
  describe('🏢 CRUD de Unidades', () => {

    test('✓ Deve listar unidades', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/unidades')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      if (typeof res.body?.success === 'boolean') {
        expect(res.body.success).toBe(true);
      } else if (Array.isArray(res.body)) {
        expect(Array.isArray(res.body)).toBe(true);
      } else {
        expect(Array.isArray(res.body?.data)).toBe(true);
      }
    });

    test('✓ Deve buscar unidade por ID', async () => {
      if (!authToken || !testData.unidade_id) return;

      const res = await request(app)
        .get(`/api/unidades/${testData.unidade_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('✓ Deve listar exceções de calendário', async () => {
      if (!authToken || !testData.unidade_id) return;

      const res = await request(app)
        .get(`/api/unidades/${testData.unidade_id}/excecoes`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 🎫 TESTES DE CUPONS
  // ═══════════════════════════════════════════════════════════════
  describe('🎫 CRUD de Cupons', () => {
    let cupomCriado;

    test('✓ Deve listar cupons', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/cupons')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('✓ Deve criar novo cupom', async () => {
      if (!authToken || !testData.unidade_id) return;

      const codigoUnico = `CRUDTEST${Date.now().toString().slice(-6)}`;
      const dataFim = new Date();
      dataFim.setMonth(dataFim.getMonth() + 1);

      const res = await request(app)
        .post('/api/cupons')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          codigo: codigoUnico,
          tipo_desconto: 'percentual',
          valor_desconto: 10,
          data_inicio: new Date().toISOString().split('T')[0],
          data_fim: dataFim.toISOString().split('T')[0],
          limite_uso: 100,
          ativo: true,
          unidade_id: testData.unidade_id
        });

      expect([200, 201]).toContain(res.status);
      if (res.body.data) {
        cupomCriado = res.body.data;
      }
    });

    test('✓ Deve buscar cupom por ID', async () => {
      if (!authToken || !cupomCriado?.id) return;

      const res = await request(app)
        .get(`/api/cupons/${cupomCriado.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    test('✓ Deve atualizar cupom', async () => {
      if (!authToken || !cupomCriado?.id) return;

      const codigo = cupomCriado.codigo || cupomCriado?.data?.codigo;
      const tipoDesconto = cupomCriado.tipo_desconto || cupomCriado?.data?.tipo_desconto || 'percentual';
      const dataInicio = cupomCriado.data_inicio || cupomCriado?.data?.data_inicio || new Date().toISOString().split('T')[0];
      const dataFim = cupomCriado.data_fim || cupomCriado?.data?.data_fim;

      const res = await request(app)
        .put(`/api/cupons/${cupomCriado.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          codigo: codigo || `CRUDTEST${Date.now().toString().slice(-6)}`,
          tipo_desconto: tipoDesconto,
          valor_desconto: 15,
          data_inicio: dataInicio,
          data_fim: dataFim || dataInicio,
          limite_uso_total: 100,
          status: 'Ativo',
          unidade_id: testData.unidade_id
        });

      expect([200, 201]).toContain(res.status);
    });

    test('✓ Deve deletar cupom', async () => {
      if (!authToken || !cupomCriado?.id) return;

      const res = await request(app)
        .delete(`/api/cupons/${cupomCriado.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 204]).toContain(res.status);
    });

    test('✓ Não deve criar cupom com código duplicado', async () => {
      if (!authToken || !testData.unidade_id) return;

      // Primeiro criar um cupom
      const codigo = `CRUDTEST${Date.now().toString().slice(-6)}`;
      await request(app)
        .post('/api/cupons')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          codigo: codigo,
          tipo_desconto: 'percentual',
          valor_desconto: 10,
          data_inicio: new Date().toISOString().split('T')[0],
          data_fim: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
          unidade_id: testData.unidade_id
        });

      // Tentar criar outro com mesmo código
      const res = await request(app)
        .post('/api/cupons')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          codigo: codigo,
          tipo_desconto: 'percentual',
          valor_desconto: 20,
          data_inicio: new Date().toISOString().split('T')[0],
          data_fim: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
          unidade_id: testData.unidade_id
        });

      // Deve retornar erro de duplicado
      expect([400, 409]).toContain(res.status);
    });
  });
});


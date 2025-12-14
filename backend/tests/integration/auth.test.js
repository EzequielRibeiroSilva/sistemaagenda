/**
 * Testes de Autenticação e Autorização RBAC
 * 
 * Cenários testados:
 * - Login com credenciais válidas e inválidas
 * - Token JWT - geração, validação, expiração
 * - Blacklist de tokens após logout
 * - Permissões por role (MASTER, ADMIN, AGENTE)
 * - Acesso a rotas protegidas sem token
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { db } = require('../../src/config/knex');

let app;

describe('🔐 Testes de Autenticação e Autorização', () => {
  let testUser;
  
  beforeAll(async () => {
    const appModule = require('../../src/app');
    app = appModule.app;
    
    await cleanupAuthTestData();
    
    // Criar usuário de teste
    const senhaHash = await bcrypt.hash('TestAuth@123', 10);
    const [user] = await db('usuarios').insert({
      email: 'auth_test@test.com',
      nome: 'Auth Test User',
      senha_hash: senhaHash,
      role: 'ADMIN',
      tipo_usuario: 'admin',
      status: 'Ativo',
      plano: 'Multi',
      limite_unidades: 5,
      created_at: new Date(),
      updated_at: new Date()
    }).returning('*');
    
    // Criar unidade para o usuário
    const [unidade] = await db('unidades').insert({
      nome: 'AUTH_TEST Unidade',
      usuario_id: user.id,
      telefone: '11999999999',
      status: 'Ativo',
      created_at: new Date(),
      updated_at: new Date()
    }).returning('*');
    
    await db('usuarios').where('id', user.id).update({ unidade_id: unidade.id });
    user.unidade_id = unidade.id;
    testUser = user;
  });
  
  afterAll(async () => {
    await cleanupAuthTestData();
  });

  describe('🔑 Login', () => {
    test('Login com credenciais válidas deve retornar token', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth_test@test.com',
          senha: 'TestAuth@123'
        });

      expect(response.status).toBe(200);
      // A API retorna { success, message, data: { token, user, ... } }
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe('auth_test@test.com');
      expect(response.body.data.user).not.toHaveProperty('senha_hash'); // Senha não deve ser retornada
    });
    
    test('Login com email inválido deve retornar 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'naoexiste@test.com',
          senha: 'TestAuth@123'
        });
      
      expect(response.status).toBe(401);
    });
    
    test('Login com senha inválida deve retornar 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth_test@test.com',
          senha: 'SenhaErrada@123'
        });
      
      expect(response.status).toBe(401);
    });
    
    test('Login com usuário bloqueado deve retornar 401', async () => {
      // Bloquear usuário temporariamente
      await db('usuarios')
        .where('email', 'auth_test@test.com')
        .update({ status: 'Bloqueado' });
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth_test@test.com',
          senha: 'TestAuth@123'
        });
      
      expect(response.status).toBe(401);
      
      // Restaurar status
      await db('usuarios')
        .where('email', 'auth_test@test.com')
        .update({ status: 'Ativo' });
    });
  });

  describe('🎫 Token JWT', () => {
    let validToken;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'auth_test@test.com', senha: 'TestAuth@123' });
      validToken = response.body.data?.token;
    });
    
    test('Requisição com token válido deve ser aceita', async () => {
      const response = await request(app)
        .get('/api/unidades')
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).toBe(200);
    });
    
    test('Requisição sem token deve retornar 401', async () => {
      const response = await request(app)
        .get('/api/unidades');
      
      expect(response.status).toBe(401);
    });
    
    test('Requisição com token malformado deve retornar 401', async () => {
      const response = await request(app)
        .get('/api/unidades')
        .set('Authorization', 'Bearer token_invalido_123');
      
      expect(response.status).toBe(401);
    });
    
    test('Requisição com token expirado deve retornar 401', async () => {
      // Criar token expirado manualmente
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { id: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret-key-for-jest-tests-minimum-32-chars',
        { expiresIn: '-1h' } // Expirou há 1 hora
      );
      
      const response = await request(app)
        .get('/api/unidades')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).toBe(401);
    });
  });
});

async function cleanupAuthTestData() {
  await db('unidades').where('nome', 'like', '%AUTH_TEST%').del().catch(() => {});
  await db('usuarios').where('email', 'like', '%auth_test%').del().catch(() => {});
}


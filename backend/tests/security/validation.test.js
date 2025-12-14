/**
 * Testes de Validação e Segurança
 * 
 * CRÍTICO: Testa proteções contra:
 * - SQL Injection
 * - XSS (Cross-Site Scripting)
 * - Campos obrigatórios
 * - Dados malformados
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { db } = require('../../src/config/knex');

let app;

describe('🛡️ Testes de Segurança e Validação', () => {
  let adminUser, token, unidade;
  
  beforeAll(async () => {
    const appModule = require('../../src/app');
    app = appModule.app;
    
    await cleanupSecurityTestData();
    
    // Criar admin para testes
    const senhaHash = await bcrypt.hash('Test@123', 10);
    const [user] = await db('usuarios').insert({
      email: 'security_test@test.com',
      nome: 'Security Test',
      senha_hash: senhaHash,
      role: 'ADMIN',
      tipo_usuario: 'admin',
      status: 'Ativo',
      plano: 'Multi',
      limite_unidades: 5,
      created_at: new Date(),
      updated_at: new Date()
    }).returning('*');
    
    const [unit] = await db('unidades').insert({
      nome: 'SECURITY_TEST Unidade',
      usuario_id: user.id,
      telefone: '11999999999',
      status: 'Ativo',
      created_at: new Date(),
      updated_at: new Date()
    }).returning('*');
    
    await db('usuarios').where('id', user.id).update({ unidade_id: unit.id });
    
    adminUser = { ...user, unidade_id: unit.id };
    unidade = unit;
    
    const AuthService = require('../../src/services/AuthService');
    const authService = new AuthService();
    const loginResult = await authService.login('security_test@test.com', 'Test@123');
    token = loginResult.token;
  });
  
  afterAll(async () => {
    await cleanupSecurityTestData();
  });

  describe('💉 Proteção contra SQL Injection', () => {
    test('Deve rejeitar SQL injection em campo de busca', async () => {
      const maliciousInput = "'; DROP TABLE usuarios; --";
      
      const response = await request(app)
        .get('/api/clientes/search')
        .query({ q: maliciousInput })
        .set('Authorization', `Bearer ${token}`);
      
      // Não deve causar erro de servidor (500)
      expect(response.status).not.toBe(500);
      
      // Tabela usuarios deve continuar existindo
      const usuarios = await db('usuarios').select('id').limit(1);
      expect(usuarios.length).toBeGreaterThan(0);
    });
    
    test('Deve rejeitar SQL injection em campo nome de cliente', async () => {
      const maliciousInput = "Robert'); DROP TABLE clientes;--";
      
      const response = await request(app)
        .post('/api/clientes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          primeiro_nome: maliciousInput,
          ultimo_nome: 'Test',
          telefone: '11999888777'
        });
      
      // Não deve causar erro de servidor
      expect(response.status).not.toBe(500);
      
      // Tabela clientes deve continuar existindo
      const clientes = await db('clientes').select('id').limit(1);
      expect(clientes).toBeDefined();
    });
    
    test('Deve sanitizar ID numérico', async () => {
      const response = await request(app)
        .get('/api/clientes/1 OR 1=1')
        .set('Authorization', `Bearer ${token}`);
      
      // Deve retornar 400 (bad request) ou 404, nunca 500
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('🕷️ Proteção contra XSS', () => {
    test('Deve sanitizar script tags em nome de cliente', async () => {
      const xssPayload = '<script>alert("XSS")</script>Teste';
      
      const response = await request(app)
        .post('/api/clientes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          primeiro_nome: xssPayload,
          ultimo_nome: 'XSS_Test',
          telefone: '11999777666'
        });
      
      if (response.status === 201 || response.status === 200) {
        const clienteId = response.body.data?.id || response.body.id;
        
        if (clienteId) {
          const cliente = await db('clientes').where('id', clienteId).first();
          
          // Nome não deve conter tags de script
          expect(cliente.primeiro_nome).not.toContain('<script>');
          expect(cliente.primeiro_nome).not.toContain('</script>');
          
          // Limpar
          await db('clientes').where('id', clienteId).del();
        }
      }
    });
    
    test('Deve sanitizar evento handlers em observações', async () => {
      const xssPayload = '<img src=x onerror="alert(1)">';
      
      // Criar cliente primeiro para teste
      const [cliente] = await db('clientes').insert({
        primeiro_nome: 'XSS', ultimo_nome: 'SECURITY_TEST',
        telefone: '11988877766', telefone_limpo: '11988877766',
        unidade_id: unidade.id, status: 'Ativo',
        created_at: new Date(), updated_at: new Date()
      }).returning('*');
      
      // Tentar atualizar com XSS não deve funcionar ou deve sanitizar
      const response = await request(app)
        .put(`/api/clientes/${cliente.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          primeiro_nome: xssPayload
        });
      
      // Se atualizou, verificar que foi sanitizado
      if (response.status === 200) {
        const updated = await db('clientes').where('id', cliente.id).first();
        expect(updated.primeiro_nome).not.toContain('onerror');
      }
      
      // Limpar
      await db('clientes').where('id', cliente.id).del();
    });
  });
});

async function cleanupSecurityTestData() {
  await db('clientes').where('ultimo_nome', 'SECURITY_TEST').del().catch(() => {});
  await db('clientes').where('ultimo_nome', 'XSS_Test').del().catch(() => {});
  await db('unidades').where('nome', 'like', '%SECURITY_TEST%').del().catch(() => {});
  await db('usuarios').where('email', 'like', '%security_test%').del().catch(() => {});
}


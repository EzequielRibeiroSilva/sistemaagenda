/**
 * Jest Setup - Configuração Global de Testes
 *
 * Este arquivo é executado antes de cada arquivo de teste.
 * Configura o ambiente de testes, conexão com banco, e helpers globais.
 */

// Carregar variáveis de ambiente PRIMEIRO
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Configurar variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest-tests-minimum-32-chars';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key-for-jest-minimum-32-chars';

// Agora importar o db (após as variáveis de ambiente estarem configuradas)
const { db } = require('../src/config/knex');

// Timeout global para operações assíncronas
jest.setTimeout(30000);

// Helper global para logging em testes
global.testLog = (message, data = null) => {
  if (process.env.TEST_VERBOSE === 'true') {
    console.log(`[TEST] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

// Dados de teste globais (fixtures)
global.testFixtures = {
  // Usuário MASTER (super admin)
  masterUser: {
    email: 'master.test@test.com',
    senha: 'TestMaster@123',
    nome: 'Master Test',
    role: 'MASTER',
    tipo_usuario: 'Master',
    status: 'Ativo'
  },
  
  // Usuário ADMIN (dono do salão)
  adminUser: {
    email: 'admin.test@test.com',
    senha: 'TestAdmin@123',
    nome: 'Admin Test',
    role: 'ADMIN',
    tipo_usuario: 'Admin',
    status: 'Ativo',
    plano: 'premium',
    limite_unidades: 5
  },
  
  // Segundo ADMIN (para testes de isolamento)
  adminUser2: {
    email: 'admin2.test@test.com',
    senha: 'TestAdmin2@123',
    nome: 'Admin Test 2',
    role: 'ADMIN',
    tipo_usuario: 'Admin',
    status: 'Ativo',
    plano: 'basico',
    limite_unidades: 1
  },
  
  // Usuário AGENTE
  agenteUser: {
    email: 'agente.test@test.com',
    senha: 'TestAgente@123',
    nome: 'Agente Test',
    role: 'AGENTE',
    tipo_usuario: 'Agente',
    status: 'Ativo'
  }
};

// Antes de todos os testes - verificar conexão
beforeAll(async () => {
  try {
    // Verificar se banco está acessível
    await db.raw('SELECT 1');
    global.testLog('✅ Conexão com banco de dados OK');
  } catch (error) {
    console.error('❌ Erro ao conectar com banco de dados:', error.message);
    throw error;
  }
});

// Após todos os testes - fechar conexão
afterAll(async () => {
  try {
    await db.destroy();
    global.testLog('✅ Conexão com banco encerrada');
  } catch (error) {
    console.error('❌ Erro ao encerrar conexão:', error.message);
  }
});

// Helper para criar usuário de teste com hash de senha
global.createTestUser = async (userData) => {
  const bcrypt = require('bcryptjs');
  const senhaHash = await bcrypt.hash(userData.senha, 10);
  
  const [user] = await db('usuarios')
    .insert({
      ...userData,
      senha_hash: senhaHash,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');
  
  return user;
};

// Helper para limpar dados de teste
global.cleanupTestData = async (tableName, condition) => {
  await db(tableName).where(condition).del();
};

// Helper para fazer login e obter token
global.loginAndGetToken = async (email, senha) => {
  const AuthService = require('../src/services/AuthService');
  const authService = new AuthService();
  const result = await authService.login(email, senha);
  return result.token;
};

// Matcher customizado para verificar estrutura de resposta da API
expect.extend({
  toBeApiSuccess(received) {
    const pass = received.success === true;
    return {
      pass,
      message: () => pass 
        ? `Expected response not to be a successful API response`
        : `Expected response to be a successful API response, but got: ${JSON.stringify(received)}`
    };
  },
  
  toBeApiError(received, expectedStatus) {
    const pass = received.success === false && 
      (expectedStatus === undefined || received.statusCode === expectedStatus);
    return {
      pass,
      message: () => pass
        ? `Expected response not to be an API error`
        : `Expected API error with status ${expectedStatus}, got: ${JSON.stringify(received)}`
    };
  }
});

module.exports = { db };


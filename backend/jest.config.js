/**
 * Jest Configuration
 * Configuração para testes automatizados do sistema de agendamento
 */

module.exports = {
  // Ambiente de teste
  testEnvironment: 'node',
  
  // Diretório raiz dos testes
  roots: ['<rootDir>/tests'],
  
  // Padrão de arquivos de teste
  testMatch: [
    '**/*.test.js',
    '**/*.spec.js'
  ],
  
  // Arquivos de setup (executados antes de cada arquivo de teste)
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Timeout para testes (aumentado para operações de banco)
  testTimeout: 30000,
  
  // Cobertura de código
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/config/*.js'
  ],
  
  // Diretório de relatórios de cobertura
  coverageDirectory: 'coverage',
  
  // Reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Limites de cobertura (para garantir qualidade)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  
  // Verbose output
  verbose: true,
  
  // Executar testes em sequência (importante para testes de banco)
  maxWorkers: 1,
  
  // Limpar mocks automaticamente
  clearMocks: true,
  
  // Restaurar mocks após cada teste
  restoreMocks: true,
  
  // Variáveis de ambiente para testes
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Módulos a serem transformados
  transformIgnorePatterns: [
    'node_modules/'
  ],
  
  // Mapear módulos
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Forçar saída após testes (evita processos pendentes)
  forceExit: true,

  // Detectar handles abertos (desabilitado para evitar warnings do setInterval)
  detectOpenHandles: false
};


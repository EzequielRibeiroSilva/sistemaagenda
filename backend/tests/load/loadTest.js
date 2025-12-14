#!/usr/bin/env node
/**
 * Script de Testes de Carga
 * 
 * Uso: node tests/load/loadTest.js [cenario]
 * Cenários: login, agendamentos, clientes, all
 * 
 * Exemplo: node tests/load/loadTest.js login
 */

const autocannon = require('autocannon');
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_EMAIL = 'testando@gmail.com';
const TEST_PASSWORD = 'Teste@123';

let authToken = null;

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

// Obter token de autenticação
async function getAuthToken() {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: TEST_EMAIL,
      senha: TEST_PASSWORD
    });
    authToken = response.data.data.token;
    log(colors.green, '✅ Token obtido com sucesso');
    return authToken;
  } catch (error) {
    log(colors.red, `❌ Erro ao obter token: ${error.message}`);
    process.exit(1);
  }
}

// Configurações dos testes
const testConfigs = {
  login: {
    name: '🔐 Teste de Carga - Login',
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, senha: TEST_PASSWORD }),
    headers: { 'Content-Type': 'application/json' },
    connections: 10,
    duration: 30,
    pipelining: 1
  },
  agendamentos: {
    name: '📅 Teste de Carga - Listagem de Agendamentos',
    url: `${BASE_URL}/api/agendamentos?page=1&limit=10`,
    method: 'GET',
    connections: 50,
    duration: 30,
    pipelining: 5
  },
  clientes: {
    name: '👥 Teste de Carga - Listagem de Clientes',
    url: `${BASE_URL}/api/clientes?page=1&limit=20`,
    method: 'GET',
    connections: 50,
    duration: 30,
    pipelining: 5
  },
  unidades: {
    name: '🏢 Teste de Carga - Listagem de Unidades',
    url: `${BASE_URL}/api/unidades`,
    method: 'GET',
    connections: 30,
    duration: 20,
    pipelining: 3
  }
};

// Executar teste
async function runTest(config) {
  log(colors.cyan, `\n${'='.repeat(60)}`);
  log(colors.bold, config.name);
  log(colors.cyan, `${'='.repeat(60)}`);
  
  const opts = {
    url: config.url,
    method: config.method || 'GET',
    connections: config.connections || 10,
    duration: config.duration || 30,
    pipelining: config.pipelining || 1,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      ...config.headers
    }
  };
  
  if (config.body) {
    opts.body = config.body;
  }

  return new Promise((resolve) => {
    const instance = autocannon(opts, (err, result) => {
      if (err) {
        log(colors.red, `❌ Erro: ${err.message}`);
        resolve(null);
        return;
      }
      
      printResults(result);
      resolve(result);
    });
    
    autocannon.track(instance, { renderProgressBar: true });
  });
}

function printResults(result) {
  log(colors.cyan, '\n📊 RESULTADOS:');
  console.log('─'.repeat(50));
  
  log(colors.green, `✅ Requests totais: ${result.requests.total}`);
  log(colors.green, `📈 Throughput: ${result.requests.average} req/s`);
  log(colors.yellow, `⏱️  Latência média: ${result.latency.average}ms`);
  log(colors.yellow, `⏱️  Latência p99: ${result.latency.p99}ms`);
  
  const errorRate = (result.errors / result.requests.total * 100).toFixed(2);
  if (result.errors > 0) {
    log(colors.red, `❌ Erros: ${result.errors} (${errorRate}%)`);
  } else {
    log(colors.green, `✅ Erros: 0 (0%)`);
  }
  
  // Avaliação
  console.log('\n' + '─'.repeat(50));
  if (result.latency.average < 100 && errorRate < 1) {
    log(colors.green, '🏆 EXCELENTE - Sistema performando muito bem!');
  } else if (result.latency.average < 500 && errorRate < 5) {
    log(colors.yellow, '👍 BOM - Performance aceitável');
  } else {
    log(colors.red, '⚠️  ATENÇÃO - Performance precisa melhorar');
  }
}

// Main
async function main() {
  const scenario = process.argv[2] || 'all';

  log(colors.bold, '\n🚀 INICIANDO TESTES DE CARGA\n');
  log(colors.cyan, `📍 URL Base: ${BASE_URL}`);
  log(colors.cyan, `📋 Cenário: ${scenario}`);

  // Login primeiro para obter token
  if (scenario !== 'login') {
    await getAuthToken();
  }

  const results = [];

  if (scenario === 'all') {
    // Executar todos os testes
    for (const [key, config] of Object.entries(testConfigs)) {
      if (key !== 'login') await getAuthToken(); // Refresh token
      const result = await runTest(config);
      if (result) results.push({ name: config.name, ...result });
    }
  } else if (testConfigs[scenario]) {
    const result = await runTest(testConfigs[scenario]);
    if (result) results.push({ name: testConfigs[scenario].name, ...result });
  } else {
    log(colors.red, `❌ Cenário desconhecido: ${scenario}`);
    log(colors.yellow, `Cenários disponíveis: ${Object.keys(testConfigs).join(', ')}, all`);
    process.exit(1);
  }

  // Resumo final
  if (results.length > 1) {
    log(colors.bold, '\n\n📋 RESUMO FINAL');
    log(colors.cyan, '═'.repeat(60));

    results.forEach(r => {
      const status = r.errors === 0 ? '✅' : '⚠️';
      console.log(`${status} ${r.name}`);
      console.log(`   Throughput: ${r.requests.average} req/s | Latência: ${r.latency.average}ms`);
    });
  }

  log(colors.green, '\n✅ Testes de carga finalizados!\n');
  process.exit(0);
}

main().catch(err => {
  log(colors.red, `❌ Erro fatal: ${err.message}`);
  process.exit(1);
});


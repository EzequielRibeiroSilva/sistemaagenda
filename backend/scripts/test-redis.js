#!/usr/bin/env node

/**
 * Script de Teste de Conexão Redis
 * 
 * Testa a conexão com Redis e operações básicas de blacklist
 * 
 * Uso:
 *   node scripts/test-redis.js
 */

require('dotenv').config();
const { getInstance: getRedisService } = require('../src/services/RedisService');
const logger = require('../src/utils/logger');

async function testRedis() {
  console.log('\n========================================');
  console.log('🔍 TESTE DE CONEXÃO REDIS');
  console.log('========================================\n');

  try {
    // 1. Obter instância do RedisService
    console.log('1️⃣  Obtendo instância do RedisService...');
    const redisService = getRedisService();
    
    // Aguardar inicialização
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. Health Check
    console.log('\n2️⃣  Executando Health Check...');
    const health = await redisService.healthCheck();
    console.log('   Status:', health.status);
    console.log('   Storage:', health.storage);
    if (health.warning) {
      console.log('   ⚠️  Aviso:', health.warning);
    }
    if (health.error) {
      console.log('   ❌ Erro:', health.error);
    }
    
    // 3. Testar Blacklist
    console.log('\n3️⃣  Testando operações de blacklist...');
    
    // Adicionar token de teste
    const testToken = 'test_token_' + Date.now();
    console.log('   Adicionando token:', testToken.substring(0, 20) + '...');
    await redisService.addToBlacklist(testToken, 60); // 60 segundos
    
    // Verificar se está na blacklist
    console.log('   Verificando se token está na blacklist...');
    const isBlacklisted = await redisService.isBlacklisted(testToken);
    console.log('   Token está na blacklist?', isBlacklisted ? '✅ SIM' : '❌ NÃO');
    
    // Verificar token inexistente
    const fakeToken = 'fake_token_12345';
    const isFakeBlacklisted = await redisService.isBlacklisted(fakeToken);
    console.log('   Token fake está na blacklist?', isFakeBlacklisted ? '❌ SIM (ERRO!)' : '✅ NÃO');
    
    // 4. Estatísticas
    console.log('\n4️⃣  Obtendo estatísticas...');
    const stats = await redisService.getStats();
    console.log('   Storage:', stats.storage);
    console.log('   Tokens na blacklist:', stats.tokensCount);
    console.log('   Redis disponível?', stats.isRedisAvailable ? '✅ SIM' : '⚠️  NÃO');
    if (stats.warning) {
      console.log('   ⚠️  Aviso:', stats.warning);
    }
    
    // 5. Limpar token de teste
    console.log('\n5️⃣  Limpando token de teste...');
    await redisService.removeFromBlacklist(testToken);
    const isStillBlacklisted = await redisService.isBlacklisted(testToken);
    console.log('   Token removido?', !isStillBlacklisted ? '✅ SIM' : '❌ NÃO');
    
    // 6. Resultado Final
    console.log('\n========================================');
    if (redisService.isRedisAvailable) {
      console.log('✅ REDIS FUNCIONANDO PERFEITAMENTE!');
      console.log('========================================\n');
      console.log('📊 Configuração:');
      console.log('   Host:', process.env.REDIS_HOST || 'localhost');
      console.log('   Port:', process.env.REDIS_PORT || 6379);
      console.log('   DB:', process.env.REDIS_DB || 0);
      console.log('   Password:', process.env.REDIS_PASSWORD ? '***' : '(sem senha)');
    } else {
      console.log('⚠️  REDIS NÃO DISPONÍVEL - USANDO FALLBACK DE MEMÓRIA');
      console.log('========================================\n');
      console.log('⚠️  ATENÇÃO:');
      console.log('   - Tokens serão perdidos ao reiniciar o servidor');
      console.log('   - Não funciona com múltiplas instâncias');
      console.log('   - NÃO USAR EM PRODUÇÃO!');
      console.log('\n📝 Para configurar Redis:');
      console.log('   1. Instalar Redis:');
      console.log('      - Mac: brew install redis');
      console.log('      - Ubuntu: apt-get install redis-server');
      console.log('      - Docker: docker-compose up redis');
      console.log('   2. Configurar .env:');
      console.log('      REDIS_HOST=localhost');
      console.log('      REDIS_PORT=6379');
      console.log('   3. Reiniciar aplicação');
    }
    console.log('\n');
    
    // Fechar conexão
    await redisService.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error('\n📋 Stack trace:');
    console.error(error.stack);
    console.log('\n========================================\n');
    process.exit(1);
  }
}

// Executar teste
testRedis();

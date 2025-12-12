#!/usr/bin/env node

/**
 * Script para gerar secrets criptograficamente seguros para produção
 * 
 * IMPORTANTE:
 * - Gera secrets de 64 bytes (128 caracteres hex)
 * - Usa crypto.randomBytes() para máxima segurança
 * - Atualiza o arquivo .env automaticamente
 * - Faz backup do .env anterior
 * 
 * USO:
 *   node scripts/generate-production-secrets.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Cores para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function generateSecureSecret(bytes = 64) {
  return crypto.randomBytes(bytes).toString('hex');
}

function backupEnvFile(envPath) {
  if (fs.existsSync(envPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${envPath}.backup.${timestamp}`;
    fs.copyFileSync(envPath, backupPath);
    log(`✅ Backup criado: ${path.basename(backupPath)}`, 'green');
    return backupPath;
  }
  return null;
}

function updateEnvFile(envPath, secrets) {
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else {
    log('⚠️  Arquivo .env não encontrado, criando novo...', 'yellow');
    // Copiar do .env.example
    const examplePath = path.join(path.dirname(envPath), '.env.example');
    if (fs.existsSync(examplePath)) {
      envContent = fs.readFileSync(examplePath, 'utf8');
    }
  }
  
  // Atualizar ou adicionar secrets
  const updates = {
    'JWT_SECRET': secrets.jwtSecret,
    'JWT_REFRESH_SECRET': secrets.jwtRefreshSecret,
    'REDIS_PASSWORD': secrets.redisPassword
  };
  
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      // Atualizar existente
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // Adicionar novo
      envContent += `\n${key}=${value}`;
    }
  }
  
  // Salvar arquivo
  fs.writeFileSync(envPath, envContent);
  log(`✅ Arquivo .env atualizado com sucesso!`, 'green');
}

function validateSecrets(secrets) {
  const issues = [];
  
  for (const [key, value] of Object.entries(secrets)) {
    if (value.length < 64) {
      issues.push(`${key}: Muito curto (${value.length} caracteres, mínimo 64)`);
    }
  }
  
  return issues;
}

async function main() {
  log('\n========================================', 'cyan');
  log('🔐 GERADOR DE SECRETS DE PRODUÇÃO', 'bright');
  log('========================================\n', 'cyan');
  
  // Gerar secrets
  log('1️⃣  Gerando secrets criptograficamente seguros...', 'blue');
  const secrets = {
    jwtSecret: generateSecureSecret(64),
    jwtRefreshSecret: generateSecureSecret(64),
    redisPassword: generateSecureSecret(32)
  };
  
  log('   ✅ JWT_SECRET: 128 caracteres', 'green');
  log('   ✅ JWT_REFRESH_SECRET: 128 caracteres', 'green');
  log('   ✅ REDIS_PASSWORD: 64 caracteres', 'green');
  
  // Validar
  log('\n2️⃣  Validando secrets...', 'blue');
  const issues = validateSecrets(secrets);
  if (issues.length > 0) {
    log('   ❌ Problemas encontrados:', 'red');
    issues.forEach(issue => log(`      - ${issue}`, 'red'));
    process.exit(1);
  }
  log('   ✅ Todos os secrets são válidos!', 'green');
  
  // Caminho do .env
  const envPath = path.join(__dirname, '..', '.env');
  
  // Fazer backup
  log('\n3️⃣  Criando backup do .env atual...', 'blue');
  const backupPath = backupEnvFile(envPath);
  
  // Atualizar .env
  log('\n4️⃣  Atualizando arquivo .env...', 'blue');
  updateEnvFile(envPath, secrets);
  
  // Exibir secrets (apenas uma vez)
  log('\n========================================', 'cyan');
  log('🔑 SECRETS GERADOS', 'bright');
  log('========================================\n', 'cyan');
  
  log('⚠️  IMPORTANTE: Guarde estes secrets em local seguro!', 'yellow');
  log('⚠️  Eles NÃO serão exibidos novamente!\n', 'yellow');
  
  log('JWT_SECRET:', 'cyan');
  log(secrets.jwtSecret, 'bright');
  log('');
  
  log('JWT_REFRESH_SECRET:', 'cyan');
  log(secrets.jwtRefreshSecret, 'bright');
  log('');
  
  log('REDIS_PASSWORD:', 'cyan');
  log(secrets.redisPassword, 'bright');
  log('');
  
  // Instruções
  log('========================================', 'cyan');
  log('📋 PRÓXIMOS PASSOS', 'bright');
  log('========================================\n', 'cyan');
  
  log('1. ✅ Secrets gerados e salvos em .env', 'green');
  log('2. ✅ Backup criado (caso precise reverter)', 'green');
  log('3. ⚠️  Reinicie o backend para aplicar:', 'yellow');
  log('   docker-compose restart backend', 'bright');
  log('4. ⚠️  Configure Redis com a nova senha:', 'yellow');
  log('   Edite docker-compose.yml e adicione REDIS_PASSWORD', 'bright');
  log('5. ✅ Teste a aplicação após reiniciar\n', 'green');
  
  log('========================================', 'cyan');
  log('🔒 SEGURANÇA', 'bright');
  log('========================================\n', 'cyan');
  
  log('✅ Secrets com 128 caracteres (máxima segurança)', 'green');
  log('✅ Gerados com crypto.randomBytes()', 'green');
  log('✅ Únicos e imprevisíveis', 'green');
  log('✅ Adequados para produção', 'green');
  log('');
  
  if (backupPath) {
    log(`💾 Backup salvo em: ${path.basename(backupPath)}`, 'cyan');
    log('   (Use este backup se precisar reverter)\n', 'cyan');
  }
  
  log('========================================\n', 'cyan');
}

// Executar
main().catch(error => {
  log('\n❌ ERRO:', 'red');
  log(error.message, 'red');
  log('\n📋 Stack trace:', 'yellow');
  log(error.stack, 'yellow');
  process.exit(1);
});

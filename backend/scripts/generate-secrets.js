#!/usr/bin/env node

/**
 * Script de Geração de Secrets Seguros
 * 
 * Gera secrets criptograficamente seguros para produção
 * 
 * Uso:
 *   node scripts/generate-secrets.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('\n========================================');
console.log('🔐 GERADOR DE SECRETS SEGUROS');
console.log('========================================\n');

// Função para gerar secret seguro
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

// Função para gerar senha forte
function generatePassword(length = 32) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  
  return password;
}

// Gerar secrets
console.log('🔑 Gerando secrets criptograficamente seguros...\n');

const secrets = {
  JWT_SECRET: generateSecret(64),
  JWT_REFRESH_SECRET: generateSecret(64),
  REDIS_PASSWORD: generatePassword(32),
  PG_PASSWORD: generatePassword(32),
  SESSION_SECRET: generateSecret(32)
};

// Exibir secrets
console.log('✅ Secrets gerados com sucesso!\n');
console.log('📋 COPIE ESTES VALORES PARA SEU .env DE PRODUÇÃO:\n');
console.log('========================================');
console.log('# JWT Secrets (OBRIGATÓRIO - 128 caracteres)');
console.log(`JWT_SECRET=${secrets.JWT_SECRET}`);
console.log(`JWT_REFRESH_SECRET=${secrets.JWT_REFRESH_SECRET}`);
console.log('');
console.log('# Redis Password (RECOMENDADO - 32 caracteres)');
console.log(`REDIS_PASSWORD=${secrets.REDIS_PASSWORD}`);
console.log('');
console.log('# PostgreSQL Password (OBRIGATÓRIO - 32 caracteres)');
console.log(`PG_PASSWORD=${secrets.PG_PASSWORD}`);
console.log('');
console.log('# Session Secret (OPCIONAL - 64 caracteres)');
console.log(`SESSION_SECRET=${secrets.SESSION_SECRET}`);
console.log('========================================\n');

// Verificar tamanhos
console.log('📊 Informações dos Secrets:\n');
console.log(`   JWT_SECRET: ${secrets.JWT_SECRET.length} caracteres`);
console.log(`   JWT_REFRESH_SECRET: ${secrets.JWT_REFRESH_SECRET.length} caracteres`);
console.log(`   REDIS_PASSWORD: ${secrets.REDIS_PASSWORD.length} caracteres`);
console.log(`   PG_PASSWORD: ${secrets.PG_PASSWORD.length} caracteres`);
console.log(`   SESSION_SECRET: ${secrets.SESSION_SECRET.length} caracteres\n`);

// Opção de salvar em arquivo
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('💾 Deseja salvar em .env.production? (s/N): ', (answer) => {
  if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim') {
    const envPath = path.join(__dirname, '..', '.env.production');
    
    // Verificar se arquivo já existe
    if (fs.existsSync(envPath)) {
      console.log('\n⚠️  ATENÇÃO: .env.production já existe!');
      readline.question('   Deseja sobrescrever? (s/N): ', (overwrite) => {
        if (overwrite.toLowerCase() === 's' || overwrite.toLowerCase() === 'sim') {
          saveEnvFile(envPath, secrets);
        } else {
          console.log('\n❌ Operação cancelada. Secrets não foram salvos.');
        }
        readline.close();
      });
    } else {
      saveEnvFile(envPath, secrets);
      readline.close();
    }
  } else {
    console.log('\n📝 Secrets não foram salvos. Copie manualmente para seu .env de produção.');
    readline.close();
  }
});

function saveEnvFile(filePath, secrets) {
  const envContent = `# ========================================
# VARIÁVEIS DE AMBIENTE - PRODUÇÃO
# ========================================
# ATENÇÃO: NUNCA COMMITAR ESTE ARQUIVO!
# Gerado em: ${new Date().toISOString()}
# ========================================

# Ambiente
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# ========================================
# JWT SECRETS (OBRIGATÓRIO)
# ========================================
# CRÍTICO: Mínimo 32 caracteres
# NUNCA compartilhe estes valores
JWT_SECRET=${secrets.JWT_SECRET}
JWT_REFRESH_SECRET=${secrets.JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d

# ========================================
# BANCO DE DADOS (OBRIGATÓRIO)
# ========================================
PG_HOST=localhost
PG_PORT=5432
PG_USER=tally_user
PG_PASSWORD=${secrets.PG_PASSWORD}
PG_DATABASE=painel_agendamento_prod

# Ou use DATABASE_URL (alternativa)
# DATABASE_URL=postgresql://tally_user:${secrets.PG_PASSWORD}@localhost:5432/painel_agendamento_prod

# ========================================
# REDIS (OBRIGATÓRIO EM PRODUÇÃO)
# ========================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=${secrets.REDIS_PASSWORD}
REDIS_DB=0

# ========================================
# EVOLUTION API (WHATSAPP)
# ========================================
EVO_API_BASE_URL=https://sua-evolution-api.com/
EVO_API_INTERNAL_URL=http://localhost:8080/
EVO_API_INSTANCE_ID=SUA_INSTANCE_ID
EVO_API_KEY=SUA_API_KEY

# ========================================
# NOTIFICAÇÕES
# ========================================
ENABLE_WHATSAPP_NOTIFICATIONS=true
REMINDER_24H_ENABLED=true
REMINDER_1H_ENABLED=true
SUBSCRIPTION_REMINDER_DAYS=7

# ========================================
# SEGURANÇA
# ========================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BCRYPT_SALT_ROUNDS=12

# ========================================
# CORS (OBRIGATÓRIO EM PRODUÇÃO)
# ========================================
# Adicione APENAS os domínios permitidos
CORS_PRODUCTION_ORIGINS=https://app.tally.com.br,https://tally.com.br

# ========================================
# LOGS
# ========================================
LOG_LEVEL=info
LOG_FILE=logs/app.log

# ========================================
# BACKUP (OPCIONAL)
# ========================================
# Configurações para backup automático
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=30

# Email para notificações de backup
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ribeirosilvaquiel@gmail.com
SMTP_PASSWORD=sua_senha_de_app_gmail
SMTP_FROM=backup@tally.com.br
`;

  try {
    fs.writeFileSync(filePath, envContent);
    console.log(`\n✅ Arquivo salvo com sucesso: ${filePath}`);
    console.log('\n⚠️  IMPORTANTE:');
    console.log('   1. Revise o arquivo e ajuste as configurações');
    console.log('   2. Configure Evolution API (WhatsApp)');
    console.log('   3. Configure CORS_PRODUCTION_ORIGINS');
    console.log('   4. NUNCA commite este arquivo no Git!');
    console.log('   5. Mantenha os secrets em local seguro (gerenciador de senhas)');
  } catch (error) {
    console.error(`\n❌ Erro ao salvar arquivo: ${error.message}`);
  }
}

#!/usr/bin/env node

/**
 * Script de Validação de Variáveis de Ambiente
 * 
 * Valida se todas as variáveis obrigatórias estão configuradas
 * e se atendem aos requisitos de segurança
 * 
 * Uso:
 *   node scripts/validate-env.js
 *   NODE_ENV=production node scripts/validate-env.js
 */

require('dotenv').config();

const crypto = require('crypto');

console.log('\n========================================');
console.log('🔍 VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE');
console.log('========================================\n');

const env = process.env.NODE_ENV || 'development';
console.log(`📊 Ambiente: ${env.toUpperCase()}\n`);

let hasErrors = false;
let hasWarnings = false;

// Função para validar variável obrigatória
function validateRequired(varName, minLength = 0) {
  const value = process.env[varName];
  
  if (!value) {
    console.log(`❌ ${varName}: NÃO DEFINIDA (OBRIGATÓRIO)`);
    hasErrors = true;
    return false;
  }
  
  if (minLength > 0 && value.length < minLength) {
    console.log(`❌ ${varName}: Muito curta (${value.length} caracteres, mínimo ${minLength})`);
    hasErrors = true;
    return false;
  }
  
  console.log(`✅ ${varName}: OK (${value.length} caracteres)`);
  return true;
}

// Função para validar variável opcional
function validateOptional(varName, defaultValue = null) {
  const value = process.env[varName];
  
  if (!value) {
    if (defaultValue) {
      console.log(`⚠️  ${varName}: Usando valor padrão (${defaultValue})`);
      hasWarnings = true;
    } else {
      console.log(`ℹ️  ${varName}: Não definida (opcional)`);
    }
    return false;
  }
  
  console.log(`✅ ${varName}: OK`);
  return true;
}

// Função para validar secret fraco
function validateSecretStrength(varName, value) {
  if (!value) return;
  
  // Verificar se é um secret de exemplo/desenvolvimento
  const weakSecrets = [
    'fallback_secret_key_not_secure',
    'secret',
    'password',
    '123456',
    'admin',
    'test',
    'development',
    'painel_agendamento_jwt_secret_key_2025_muito_segura_desenvolvimento'
  ];
  
  const lowerValue = value.toLowerCase();
  for (const weak of weakSecrets) {
    if (lowerValue.includes(weak.toLowerCase())) {
      console.log(`⚠️  ${varName}: Secret parece ser de desenvolvimento/exemplo`);
      hasWarnings = true;
      return false;
    }
  }
  
  return true;
}

// Função para validar URL
function validateUrl(varName) {
  const value = process.env[varName];
  
  if (!value) {
    console.log(`⚠️  ${varName}: Não definida`);
    hasWarnings = true;
    return false;
  }
  
  try {
    new URL(value);
    console.log(`✅ ${varName}: OK`);
    return true;
  } catch (error) {
    console.log(`❌ ${varName}: URL inválida`);
    hasErrors = true;
    return false;
  }
}

// Função para validar número
function validateNumber(varName, min = null, max = null) {
  const value = process.env[varName];
  
  if (!value) {
    console.log(`⚠️  ${varName}: Não definida`);
    hasWarnings = true;
    return false;
  }
  
  const num = parseInt(value);
  if (isNaN(num)) {
    console.log(`❌ ${varName}: Não é um número válido`);
    hasErrors = true;
    return false;
  }
  
  if (min !== null && num < min) {
    console.log(`❌ ${varName}: Valor muito baixo (${num}, mínimo ${min})`);
    hasErrors = true;
    return false;
  }
  
  if (max !== null && num > max) {
    console.log(`❌ ${varName}: Valor muito alto (${num}, máximo ${max})`);
    hasErrors = true;
    return false;
  }
  
  console.log(`✅ ${varName}: OK (${num})`);
  return true;
}

// ========================================
// VALIDAÇÕES POR CATEGORIA
// ========================================

console.log('🔐 JWT SECRETS (CRÍTICO)');
console.log('─────────────────────────────────────');
const jwtSecretValid = validateRequired('JWT_SECRET', 32);
const jwtRefreshSecretValid = validateRequired('JWT_REFRESH_SECRET', 32);

if (env === 'production') {
  if (jwtSecretValid) {
    validateSecretStrength('JWT_SECRET', process.env.JWT_SECRET);
  }
  if (jwtRefreshSecretValid) {
    validateSecretStrength('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
  }
}

validateOptional('JWT_EXPIRES_IN', '2h');
validateOptional('JWT_REFRESH_EXPIRES_IN', '7d');
console.log('');

console.log('🗄️  BANCO DE DADOS (CRÍTICO)');
console.log('─────────────────────────────────────');
validateRequired('PG_HOST');
validateNumber('PG_PORT', 1, 65535);
validateRequired('PG_USER');
validateRequired('PG_PASSWORD', 8);
validateRequired('PG_DATABASE');
console.log('');

console.log('🔴 REDIS (CRÍTICO EM PRODUÇÃO)');
console.log('─────────────────────────────────────');
if (env === 'production') {
  validateRequired('REDIS_HOST');
  validateNumber('REDIS_PORT', 1, 65535);
  
  if (process.env.REDIS_PASSWORD) {
    if (process.env.REDIS_PASSWORD.length < 16) {
      console.log(`⚠️  REDIS_PASSWORD: Senha curta (${process.env.REDIS_PASSWORD.length} caracteres, recomendado 16+)`);
      hasWarnings = true;
    } else {
      console.log(`✅ REDIS_PASSWORD: OK (${process.env.REDIS_PASSWORD.length} caracteres)`);
    }
  } else {
    console.log('⚠️  REDIS_PASSWORD: Não definida (RECOMENDADO em produção)');
    hasWarnings = true;
  }
} else {
  validateOptional('REDIS_HOST', 'localhost');
  validateOptional('REDIS_PORT', '6379');
  validateOptional('REDIS_PASSWORD');
}
validateOptional('REDIS_DB', '0');
console.log('');

console.log('📱 EVOLUTION API (WHATSAPP)');
console.log('─────────────────────────────────────');
validateUrl('EVO_API_BASE_URL');
validateOptional('EVO_API_INTERNAL_URL');
validateOptional('EVO_API_INSTANCE_ID');
validateOptional('EVO_API_KEY');
console.log('');

console.log('🔔 NOTIFICAÇÕES');
console.log('─────────────────────────────────────');
validateOptional('ENABLE_WHATSAPP_NOTIFICATIONS', 'true');
validateOptional('REMINDER_24H_ENABLED', 'true');
validateOptional('REMINDER_1H_ENABLED', 'true');
validateOptional('SUBSCRIPTION_REMINDER_DAYS', '7');
console.log('');

console.log('🛡️  SEGURANÇA');
console.log('─────────────────────────────────────');
validateNumber('RATE_LIMIT_WINDOW_MS', 1000);
validateNumber('RATE_LIMIT_MAX_REQUESTS', 1);
validateNumber('BCRYPT_SALT_ROUNDS', 10, 15);
console.log('');

console.log('🌐 CORS');
console.log('─────────────────────────────────────');
if (env === 'production') {
  const corsOrigins = process.env.CORS_PRODUCTION_ORIGINS;
  if (!corsOrigins || corsOrigins.trim() === '') {
    console.log('❌ CORS_PRODUCTION_ORIGINS: NÃO DEFINIDA (OBRIGATÓRIO EM PRODUÇÃO)');
    hasErrors = true;
  } else {
    const origins = corsOrigins.split(',').map(o => o.trim());
    console.log(`✅ CORS_PRODUCTION_ORIGINS: OK (${origins.length} origem(ns))`);
    origins.forEach(origin => {
      console.log(`   - ${origin}`);
    });
  }
} else {
  validateOptional('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000');
}
console.log('');

console.log('📊 LOGS');
console.log('─────────────────────────────────────');
validateOptional('LOG_LEVEL', 'info');
validateOptional('LOG_FILE', 'logs/app.log');
console.log('');

// ========================================
// VALIDAÇÕES ESPECÍFICAS DE PRODUÇÃO
// ========================================

if (env === 'production') {
  console.log('🔴 VALIDAÇÕES CRÍTICAS DE PRODUÇÃO');
  console.log('─────────────────────────────────────');
  
  // Verificar se NODE_ENV está correto
  if (process.env.NODE_ENV !== 'production') {
    console.log('❌ NODE_ENV: Deve ser "production"');
    hasErrors = true;
  } else {
    console.log('✅ NODE_ENV: production');
  }
  
  // Verificar se não está usando valores de desenvolvimento
  const devIndicators = [
    { var: 'PG_DATABASE', value: 'painel_agendamento_dev' },
    { var: 'PG_USER', value: 'postgres' },
    { var: 'PG_PASSWORD', value: 'postgres' }
  ];
  
  devIndicators.forEach(({ var: varName, value }) => {
    if (process.env[varName] === value) {
      console.log(`⚠️  ${varName}: Usando valor de desenvolvimento (${value})`);
      hasWarnings = true;
    }
  });
  
  console.log('');
}

// ========================================
// RESUMO FINAL
// ========================================

console.log('========================================');
console.log('📋 RESUMO DA VALIDAÇÃO');
console.log('========================================\n');

if (!hasErrors && !hasWarnings) {
  console.log('✅ TODAS AS VALIDAÇÕES PASSARAM!');
  console.log('   Ambiente configurado corretamente.\n');
  process.exit(0);
} else if (hasErrors) {
  console.log('❌ VALIDAÇÃO FALHOU!');
  console.log(`   ${hasErrors ? 'Erros críticos encontrados.' : ''}`);
  console.log(`   ${hasWarnings ? 'Avisos encontrados.' : ''}\n`);
  
  console.log('📝 AÇÕES NECESSÁRIAS:');
  console.log('   1. Corrija os erros marcados com ❌');
  console.log('   2. Revise os avisos marcados com ⚠️');
  console.log('   3. Execute este script novamente\n');
  
  if (env === 'production') {
    console.log('🚨 ATENÇÃO: NÃO FAÇA DEPLOY COM ERROS!');
    console.log('   O sistema pode falhar ou ter vulnerabilidades.\n');
  }
  
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  VALIDAÇÃO PASSOU COM AVISOS');
  console.log('   Algumas configurações podem ser melhoradas.\n');
  
  console.log('📝 RECOMENDAÇÕES:');
  console.log('   1. Revise os avisos marcados com ⚠️');
  console.log('   2. Configure as variáveis opcionais importantes');
  console.log('   3. Use secrets fortes em produção\n');
  
  process.exit(0);
}

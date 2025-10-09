#!/usr/bin/env node

/**
 * Script de validação da Fase 1 - Preparação do Ambiente
 * Executa todos os testes necessários para atestar a prontidão do ambiente
 */

const fs = require('fs');
const path = require('path');
const { runDatabaseTest } = require('./testDatabaseConnection');
const { checkEvolutionApiStatus } = require('./checkEvolutionStatus');

async function validatePhase1() {
  console.log('🎯 VALIDAÇÃO DA FASE 1 - PREPARAÇÃO DO AMBIENTE');
  console.log('=' .repeat(60));
  console.log();

  let allTestsPassed = true;
  const results = {
    environment: false,
    dependencies: false,
    database: false,
    evolutionApi: false,
    structure: false
  };

  // 1. Verificar estrutura de pastas
  console.log('📁 1. VERIFICANDO ESTRUTURA DE PASTAS...');
  try {
    const requiredDirs = [
      'src',
      'src/controllers',
      'src/models', 
      'src/routes',
      'src/middleware',
      'src/services',
      'src/jobs',
      'src/config',
      'src/utils',
      'migrations',
      'seeds',
      'tests'
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(__dirname, dir);
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Diretório não encontrado: ${dir}`);
      }
    }

    console.log('✅ Estrutura de pastas: OK');
    results.structure = true;
  } catch (error) {
    console.log('❌ Estrutura de pastas: FALHOU');
    console.log(`   Erro: ${error.message}`);
    allTestsPassed = false;
  }

  // 2. Verificar arquivos de configuração
  console.log('\n⚙️  2. VERIFICANDO ARQUIVOS DE CONFIGURAÇÃO...');
  try {
    const requiredFiles = [
      'package.json',
      '.env',
      '.env.example',
      'src/config/config.js',
      'src/config/database.js',
      'src/app.js'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${file}`);
      }
    }

    // Verificar se .env tem as variáveis essenciais
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const requiredEnvVars = [
      'NODE_ENV',
      'PORT',
      'JWT_SECRET',
      'PG_HOST',
      'PG_DATABASE',
      'EVO_API_BASE_URL',
      'EVO_API_INSTANCE_ID'
    ];

    for (const envVar of requiredEnvVars) {
      if (!envContent.includes(envVar)) {
        throw new Error(`Variável de ambiente não encontrada: ${envVar}`);
      }
    }

    console.log('✅ Arquivos de configuração: OK');
    results.environment = true;
  } catch (error) {
    console.log('❌ Arquivos de configuração: FALHOU');
    console.log(`   Erro: ${error.message}`);
    allTestsPassed = false;
  }

  // 3. Verificar dependências Node.js
  console.log('\n📦 3. VERIFICANDO DEPENDÊNCIAS NODE.JS...');
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    
    if (!fs.existsSync(nodeModulesPath)) {
      throw new Error('node_modules não encontrado - execute npm install');
    }

    // Verificar algumas dependências críticas
    const criticalDeps = ['express', 'pg', 'bcryptjs', 'jsonwebtoken', 'axios'];
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        throw new Error(`Dependência crítica não instalada: ${dep}`);
      }
    }

    console.log('✅ Dependências Node.js: OK');
    console.log(`   Total de dependências: ${Object.keys(packageJson.dependencies || {}).length}`);
    results.dependencies = true;
  } catch (error) {
    console.log('❌ Dependências Node.js: FALHOU');
    console.log(`   Erro: ${error.message}`);
    allTestsPassed = false;
  }

  // 4. Teste de conexão PostgreSQL
  console.log('\n🗄️  4. TESTANDO CONEXÃO POSTGRESQL...');
  try {
    await runDatabaseTest();
    console.log('✅ Conexão PostgreSQL: OK');
    results.database = true;
  } catch (error) {
    console.log('❌ Conexão PostgreSQL: FALHOU');
    console.log(`   Erro: ${error.message}`);
    allTestsPassed = false;
  }

  // 5. Teste de acessibilidade Evolution API
  console.log('\n📱 5. TESTANDO EVOLUTION API...');
  try {
    await checkEvolutionApiStatus();
    console.log('✅ Evolution API: OK');
    results.evolutionApi = true;
  } catch (error) {
    console.log('❌ Evolution API: FALHOU');
    console.log(`   Erro: ${error.message}`);
    allTestsPassed = false;
  }

  // Resultado final
  console.log('\n' + '=' .repeat(60));
  console.log('📊 RESULTADO DA VALIDAÇÃO DA FASE 1');
  console.log('=' .repeat(60));
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASSOU' : '❌ FALHOU';
    const testName = test.charAt(0).toUpperCase() + test.slice(1);
    console.log(`${testName.padEnd(20)}: ${status}`);
  });

  console.log('\n' + '-' .repeat(60));
  
  if (allTestsPassed) {
    console.log('🎉 FASE 1 CONCLUÍDA COM SUCESSO!');
    console.log('✅ Ambiente de desenvolvimento está pronto para codificação');
    console.log('🚀 Próximo passo: Implementar as migrations do banco de dados');
    console.log();
    process.exit(0);
  } else {
    console.log('❌ FASE 1 INCOMPLETA');
    console.log('🚨 Corrija os problemas identificados antes de prosseguir');
    console.log();
    process.exit(1);
  }
}

// Executar validação
if (require.main === module) {
  validatePhase1().catch(error => {
    console.error('💥 Erro durante validação:', error.message);
    process.exit(1);
  });
}

module.exports = { validatePhase1 };

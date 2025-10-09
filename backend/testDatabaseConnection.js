#!/usr/bin/env node

/**
 * Script de teste para verificar a conexão com PostgreSQL
 * Executa: node testDatabaseConnection.js
 */

const { testConnection, pool } = require('./src/config/database');

async function runDatabaseTest() {
  console.log('🔍 Iniciando teste de conexão PostgreSQL...\n');
  
  try {
    // Teste de conexão básica
    const isConnected = await testConnection();
    
    if (isConnected) {
      console.log('\n✅ TESTE DE CONEXÃO POSTGRESQL: SUCESSO');
      console.log('🎉 O backend está pronto para se comunicar com o banco de dados!\n');
      
      // Informações adicionais sobre a configuração
      console.log('📋 Configurações utilizadas:');
      console.log(`   Host: ${process.env.PG_HOST || 'localhost'}`);
      console.log(`   Port: ${process.env.PG_PORT || 5432}`);
      console.log(`   Database: ${process.env.PG_DATABASE || 'painel_agendamento_dev'}`);
      console.log(`   User: ${process.env.PG_USER || 'postgres'}`);
      
    } else {
      console.log('\n❌ TESTE DE CONEXÃO POSTGRESQL: FALHOU');
      console.log('🚨 Verifique as configurações do banco de dados no arquivo .env\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Erro durante o teste:', error.message);
    console.log('\n📝 Possíveis soluções:');
    console.log('   1. Verifique se o PostgreSQL está rodando');
    console.log('   2. Confirme as credenciais no arquivo .env');
    console.log('   3. Verifique se o banco de dados existe');
    console.log('   4. Teste a conectividade de rede\n');
    process.exit(1);
  } finally {
    // Fechar o pool de conexões
    await pool.end();
    console.log('🔌 Pool de conexões fechado.');
  }
}

// Executar o teste
if (require.main === module) {
  runDatabaseTest();
}

module.exports = { runDatabaseTest };

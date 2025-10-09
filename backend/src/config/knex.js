const knex = require('knex');
const knexConfig = require('../../knexfile');
require('dotenv').config();

// Configuração do ambiente
const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

// Instância do Knex
const db = knex(config);

// Função para testar a conexão
async function testConnection() {
  try {
    console.log('🔍 Iniciando teste de conexão PostgreSQL...\n');
    
    // Teste básico de consulta
    const result = await db.raw('SELECT NOW() as current_time, version() as pg_version');
    
    console.log('✅ Conexão PostgreSQL estabelecida com sucesso!');
    console.log(`📅 Hora atual do servidor: ${result.rows[0].current_time}`);
    console.log(`🗄️ Versão PostgreSQL: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com PostgreSQL:', error.message);
    throw error;
  }
}

// Função para fechar a conexão
async function closeConnection() {
  try {
    await db.destroy();
    console.log('🔌 Pool de conexões fechado.');
  } catch (error) {
    console.error('❌ Erro ao fechar pool de conexões:', error.message);
  }
}

module.exports = {
  db,
  testConnection,
  closeConnection
};

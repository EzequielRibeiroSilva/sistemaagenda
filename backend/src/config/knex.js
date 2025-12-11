const knex = require('knex');
const knexConfig = require('../../knexfile');
require('dotenv').config();
const logger = require('./../utils/logger');

// Configuração do ambiente
const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

// Instância do Knex
const db = knex(config);

// Função para testar a conexão
async function testConnection() {
  try {
    logger.log('🔍 Iniciando teste de conexão PostgreSQL...\n');
    
    // Teste básico de consulta
    const result = await db.raw('SELECT NOW() as current_time, version() as pg_version');
    
    logger.log('✅ Conexão PostgreSQL estabelecida com sucesso!');
    logger.log(`📅 Hora atual do servidor: ${result.rows[0].current_time}`);
    logger.log(`🗄️ Versão PostgreSQL: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
    
    return true;
  } catch (error) {
    logger.error('❌ Erro ao conectar com PostgreSQL:', error.message);
    throw error;
  }
}

// Função para fechar a conexão
async function closeConnection() {
  try {
    await db.destroy();
    logger.log('🔌 Pool de conexões fechado.');
  } catch (error) {
    logger.error('❌ Erro ao fechar pool de conexões:', error.message);
  }
}

module.exports = {
  db,
  testConnection,
  closeConnection
};

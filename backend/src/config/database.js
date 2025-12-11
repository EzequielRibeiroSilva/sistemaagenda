const { Pool } = require('pg');
require('dotenv').config();
const logger = require('./../utils/logger');

// Configuração do pool de conexões PostgreSQL
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  database: process.env.PG_DATABASE || 'painel_agendamento_dev',
  max: 20, // Máximo de conexões no pool
  idleTimeoutMillis: 30000, // Tempo limite para conexões inativas
  connectionTimeoutMillis: 2000, // Tempo limite para estabelecer conexão
});

// Event listeners para monitoramento
pool.on('connect', (client) => {
  logger.log('Nova conexão PostgreSQL estabelecida');
});

pool.on('error', (err, client) => {
  logger.error('Erro inesperado no cliente PostgreSQL:', err);
  process.exit(-1);
});

// Função para testar a conexão
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    logger.log('✅ Conexão PostgreSQL estabelecida com sucesso!');
    logger.log('📅 Hora atual do servidor:', result.rows[0].current_time);
    logger.log('🗄️ Versão PostgreSQL:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);
    client.release();
    return true;
  } catch (err) {
    logger.error('❌ Erro ao conectar com PostgreSQL:', err.message);
    return false;
  }
};

// Função para executar queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.log('Query executada:', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error('Erro na query:', { text, error: err.message });
    throw err;
  }
};

// Função para transações
const getClient = async () => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;
  
  // Monkey patch para logging
  client.query = (...args) => {
    client.lastQuery = args;
    return query.apply(client, args);
  };
  
  client.release = () => {
    client.query = query;
    client.release = release;
    return release.apply(client);
  };
  
  return client;
};

module.exports = {
  pool,
  query,
  getClient,
  testConnection
};

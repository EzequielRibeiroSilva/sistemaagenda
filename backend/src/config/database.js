const { Pool } = require('pg');
require('dotenv').config();
const logger = require('./../utils/logger');

/**
 * Configuração do Pool de Conexões PostgreSQL
 *
 * IMPORTANTE: Estas configurações devem estar alinhadas com knexfile.js
 * e com max_connections do PostgreSQL (default: 100)
 *
 * Fórmula recomendada:
 * max_connections = (num_instances * pool_max) + admin_connections(~10)
 *
 * Exemplo para 3 instâncias com pool de 25:
 * max_connections = (3 * 25) + 10 = 85
 */

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Configurações baseadas no ambiente
const poolConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  database: process.env.PG_DATABASE || 'painel_agendamento_dev',

  // Pool sizing - ALINHADO COM knexfile.js
  max: isProduction ? (parseInt(process.env.PG_POOL_MAX) || 25) : (isTest ? 5 : 10),
  min: isProduction ? 5 : (isTest ? 1 : 2),

  // Timeouts
  idleTimeoutMillis: 30000,           // Fechar conexões inativas após 30s
  connectionTimeoutMillis: 30000,      // Timeout para obter conexão

  // Keep-alive para conexões persistentes
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // Identificação da aplicação (útil para debugging no pg_stat_activity)
  application_name: `painel_agendamento_${process.env.NODE_ENV || 'dev'}`,

  // SSL em produção - desabilitar completamente se PG_SSL_REJECT_UNAUTHORIZED === 'false'
  ssl: isProduction
    ? (process.env.PG_SSL_REJECT_UNAUTHORIZED === 'false' ? false : { rejectUnauthorized: true })
    : false,

  // Statement timeout para evitar queries travadas (30 segundos)
  statement_timeout: 30000,
};

const pool = new Pool(poolConfig);

// Contadores para monitoramento
let totalConnections = 0;
let activeConnections = 0;
let waitingClients = 0;

// Event listeners para monitoramento detalhado
pool.on('connect', (client) => {
  totalConnections++;
  activeConnections++;

  // Configurar timezone para cada nova conexão
  client.query('SET timezone = "America/Sao_Paulo"').catch(() => {});

  if (!isTest) {
    logger.log(`📊 Pool: Nova conexão (ativas: ${activeConnections}, total: ${totalConnections})`);
  }
});

pool.on('acquire', (client) => {
  // Conexão foi obtida do pool
  if (process.env.PG_DEBUG === 'true') {
    logger.debug('Pool: Conexão adquirida');
  }
});

pool.on('release', (err, client) => {
  // Conexão foi devolvida ao pool
  if (err) {
    logger.error('Pool: Erro ao liberar conexão:', err.message);
  }
});

pool.on('remove', (client) => {
  activeConnections--;
  if (!isTest) {
    logger.log(`📊 Pool: Conexão removida (ativas: ${activeConnections})`);
  }
});

pool.on('error', (err, client) => {
  logger.error('❌ Erro inesperado no cliente PostgreSQL:', err.message);

  // Em produção, não fazer exit - deixar o pool se recuperar
  if (!isProduction) {
    // Em dev/test, crash para identificar o problema
    process.exit(-1);
  }
});

// Função para testar a conexão
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT
        NOW() as current_time,
        version() as pg_version,
        current_setting('max_connections') as max_connections,
        (SELECT count(*) FROM pg_stat_activity) as active_connections
    `);

    const { current_time, pg_version, max_connections, active_connections } = result.rows[0];

    logger.log('✅ Conexão PostgreSQL estabelecida com sucesso!');
    logger.log('📅 Hora do servidor:', current_time);
    logger.log('🗄️ PostgreSQL:', pg_version.split(' ').slice(0, 2).join(' '));
    logger.log(`📊 Conexões: ${active_connections}/${max_connections} (pool max: ${poolConfig.max})`);

    client.release();
    return true;
  } catch (err) {
    logger.error('❌ Erro ao conectar com PostgreSQL:', err.message);
    return false;
  }
};

// Função para executar queries com logging
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log apenas queries lentas (> 100ms) em produção
    if (duration > 100 || !isProduction) {
      logger.log('Query executada:', {
        text: text.substring(0, 100), // Truncar query longa
        duration: `${duration}ms`,
        rows: res.rowCount
      });
    }

    // Alertar para queries muito lentas
    if (duration > 5000) {
      logger.warn(`⚠️ Query lenta detectada (${duration}ms):`, text.substring(0, 200));
    }

    return res;
  } catch (err) {
    logger.error('Erro na query:', { text: text.substring(0, 100), error: err.message });
    throw err;
  }
};

// Função para transações com timeout
const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  // Timeout para transações (evitar conexões travadas)
  let released = false;
  const timeout = setTimeout(() => {
    if (!released) {
      logger.error('⚠️ Conexão não liberada após 60s - forçando release');
      client.release(true); // Force release
    }
  }, 60000);

  // Monkey patch para logging e segurança
  client.query = (...args) => {
    client.lastQuery = args;
    return originalQuery(...args);
  };

  client.release = (force = false) => {
    released = true;
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease(force);
  };

  return client;
};

// Função para obter estatísticas do pool
const getPoolStats = () => ({
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount,
  maxConnections: poolConfig.max,
  minConnections: poolConfig.min,
});

// Função para health check
const healthCheck = async () => {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const latency = Date.now() - start;

    return {
      status: 'healthy',
      latency: `${latency}ms`,
      pool: getPoolStats()
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      error: err.message,
      pool: getPoolStats()
    };
  }
};

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
  getPoolStats,
  healthCheck
};

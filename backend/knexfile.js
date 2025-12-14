require('dotenv').config();

/**
 * Configuração do Knex para PostgreSQL
 *
 * POOL DE CONEXÕES OTIMIZADO:
 * - Development: 2-10 conexões (uso moderado)
 * - Test: 1-5 conexões (testes paralelos limitados)
 * - Production: 5-25 conexões (alta disponibilidade)
 *
 * IMPORTANTE: Essas configurações devem estar alinhadas com:
 * - max_connections do PostgreSQL (default: 100)
 * - Número de instâncias da aplicação em produção
 * - Se usar PgBouncer, ajustar para pool menor
 */

// Configurações comuns de pool
const poolConfig = {
  // Callbacks para monitoramento
  afterCreate: (conn, done) => {
    // Configura timezone e statement timeout para cada conexão
    conn.query('SET timezone = "America/Sao_Paulo";', (err) => {
      if (err) {
        done(err, conn);
      } else {
        // Statement timeout de 30 segundos para evitar queries travadas
        conn.query('SET statement_timeout = 30000;', (err2) => {
          done(err2, conn);
        });
      }
    });
  }
};

module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5432,
      database: process.env.PG_DATABASE || 'painel_agendamento_dev',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'postgres',
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,      // Tempo máximo para obter conexão
      createTimeoutMillis: 30000,        // Tempo máximo para criar conexão
      destroyTimeoutMillis: 5000,        // Tempo para destruir conexão
      idleTimeoutMillis: 30000,          // Tempo de inatividade antes de fechar
      reapIntervalMillis: 1000,          // Intervalo para verificar conexões mortas
      createRetryIntervalMillis: 200,    // Intervalo entre tentativas de criação
      propagateCreateError: false,       // Não propagar erro de criação
      ...poolConfig
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },

  // Ambiente de testes - pool menor para evitar exaustão
  test: {
    client: 'postgresql',
    connection: {
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5432,
      database: process.env.PG_DATABASE || 'painel_agendamento_dev',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'postgres',
    },
    pool: {
      min: 1,
      max: 5,
      acquireTimeoutMillis: 60000,       // Mais tempo em testes
      createTimeoutMillis: 30000,
      idleTimeoutMillis: 10000,          // Fecha mais rápido em testes
      ...poolConfig
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },

  // PRODUÇÃO - Configurações otimizadas para alta disponibilidade
  production: {
    client: 'postgresql',
    connection: {
      host: process.env.PG_HOST,
      port: process.env.PG_PORT || 5432,
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      // SSL obrigatório em produção
      ssl: {
        rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false'
      },
      // Configurações de conexão
      application_name: 'painel_agendamento_prod',
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    },
    pool: {
      min: 5,                            // Mínimo maior para evitar cold starts
      max: parseInt(process.env.PG_POOL_MAX) || 25,  // Configurável via env
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false,
      ...poolConfig
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './seeds'
    },
    // Log de queries lentas em produção
    log: {
      warn(message) {
        console.warn('[KNEX WARNING]', message);
      },
      error(message) {
        console.error('[KNEX ERROR]', message);
      },
      deprecate(message) {
        console.log('[KNEX DEPRECATE]', message);
      },
      debug(message) {
        // Apenas em debug mode
        if (process.env.KNEX_DEBUG === 'true') {
          console.log('[KNEX DEBUG]', message);
        }
      }
    }
  }
};

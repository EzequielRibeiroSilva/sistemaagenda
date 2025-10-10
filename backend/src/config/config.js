require('dotenv').config();

const config = {
  // Configurações da aplicação
  app: {
    name: 'Painel de Agendamento API',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },

  // Configurações do banco de dados
  database: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'painel_agendamento_dev',
    url: process.env.DATABASE_URL
  },

  // Configurações JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_secret_key_not_secure',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_key_not_secure',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  // Configurações da Evolution API
  evolutionApi: {
    baseUrl: process.env.EVO_API_BASE_URL || 'https://ssesmt-evolution-api-evolution-api.mpra0p.easypanel.host/',
    internalUrl: process.env.EVO_API_INTERNAL_URL || 'http://ssesmt-evolution-api_evolution-api:8080/',
    instanceId: process.env.EVO_API_INSTANCE_ID || 'D1737ABB6963-4720-8EE5-AE48DAE0BB18',
    apiKey: process.env.EVO_API_KEY || null,
    timeout: 10000 // 10 segundos
  },

  // Configurações de agendamento
  booking: {
    defaultAdvanceHours: parseInt(process.env.DEFAULT_BOOKING_ADVANCE_HOURS) || 2,
    defaultFutureDays: parseInt(process.env.DEFAULT_FUTURE_BOOKING_DAYS) || 365,
    defaultCancellationHours: parseInt(process.env.DEFAULT_CANCELLATION_HOURS) || 4,
    defaultServiceDurationHours: parseInt(process.env.DEFAULT_SERVICE_DURATION_HOURS) || 1
  },

  // Configurações de notificação
  notifications: {
    whatsappEnabled: process.env.ENABLE_WHATSAPP_NOTIFICATIONS === 'true',
    reminder24hEnabled: process.env.REMINDER_24H_ENABLED === 'true',
    reminder1hEnabled: process.env.REMINDER_1H_ENABLED === 'true',
    subscriptionReminderDays: parseInt(process.env.SUBSCRIPTION_REMINDER_DAYS) || 7
  },

  // Configurações de segurança
  security: {
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutos
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Aumentado temporariamente
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'file://']
  },

  // Configurações de log
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log'
  },

  // Configurações de desenvolvimento
  development: {
    enableSwagger: process.env.NODE_ENV === 'development',
    enableDetailedErrors: process.env.NODE_ENV === 'development',
    enableRequestLogging: process.env.NODE_ENV === 'development'
  }
};

// Validações básicas
if (config.app.env === 'production') {
  if (config.jwt.secret === 'fallback_secret_key_not_secure') {
    throw new Error('JWT_SECRET deve ser definido em produção');
  }
  if (config.jwt.refreshSecret === 'fallback_refresh_secret_key_not_secure') {
    throw new Error('JWT_REFRESH_SECRET deve ser definido em produção');
  }
}

module.exports = config;

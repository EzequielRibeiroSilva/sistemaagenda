const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config/config');
const { testConnection } = require('./config/database');

const app = express();

// Middleware de segurança
app.use(helmet());

// Configuração CORS
app.use(cors({
  origin: config.security.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: {
    error: 'Muitas requisições deste IP, tente novamente mais tarde.',
    retryAfter: Math.ceil(config.security.rateLimitWindowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compressão
app.use(compression());

// Logging de requisições (apenas em desenvolvimento)
if (config.development.enableRequestLogging) {
  app.use(morgan('combined'));
}

// Rota de health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.app.env,
    version: config.app.version,
    database: 'connected' // TODO: implementar verificação real
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: `Bem-vindo ao ${config.app.name}`,
    version: config.app.version,
    environment: config.app.env,
    documentation: '/api/docs', // TODO: implementar Swagger
    health: '/health'
  });
});

// Middleware de rotas da API
app.use('/api', (req, res, next) => {
  // TODO: implementar rotas da API
  res.json({
    message: 'API em desenvolvimento',
    endpoint: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Middleware de tratamento de erros 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Middleware de tratamento de erros globais
app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  
  const isDevelopment = config.app.env === 'development';
  
  res.status(error.status || 500).json({
    error: error.message || 'Erro interno do servidor',
    ...(isDevelopment && { stack: error.stack }),
    timestamp: new Date().toISOString()
  });
});

// Função para iniciar o servidor
async function startServer() {
  try {
    // Testar conexão com banco de dados
    console.log('🔍 Verificando conexão com banco de dados...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      throw new Error('Falha na conexão com banco de dados');
    }
    
    // Iniciar servidor
    const server = app.listen(config.app.port, config.app.host, () => {
      console.log(`🚀 ${config.app.name} iniciado com sucesso!`);
      console.log(`📡 Servidor rodando em: http://${config.app.host}:${config.app.port}`);
      console.log(`🌍 Ambiente: ${config.app.env}`);
      console.log(`📊 Health check: http://${config.app.host}:${config.app.port}/health`);
      console.log(`📚 API base: http://${config.app.host}:${config.app.port}/api`);
      
      if (config.evolutionApi.apiKey) {
        console.log('📱 Evolution API configurada');
      } else {
        console.log('⚠️  Evolution API sem chave de acesso');
      }
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🛑 Recebido SIGTERM, encerrando servidor...');
      server.close(() => {
        console.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('🛑 Recebido SIGINT, encerrando servidor...');
      server.close(() => {
        console.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('💥 Erro ao iniciar servidor:', error.message);
    process.exit(1);
  }
}

// Iniciar servidor se este arquivo for executado diretamente
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

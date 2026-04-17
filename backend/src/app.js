const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config/config');
const { testConnection } = require('./config/database');
const apiRoutes = require('./routes/index');
const webhooksRoutes = require('./routes/webhooks');
const reminderJob = require('./jobs/reminderJob');
const logger = require('./utils/logger');
const { corsMiddleware, corsStaticFiles } = require('./middleware/corsMiddleware');

const app = express();

// Desabilitar ETag para evitar respostas 304 em endpoints JSON da API
app.set('etag', false);

// ✅ CORREÇÃO: Configurar trust proxy para produção (nginx/proxy reverso)
// Necessário para express-rate-limit funcionar corretamente com X-Forwarded-For
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Confiar no primeiro proxy (nginx)
  logger.log('🔒 [App] Trust proxy habilitado para produção');
}

// Middleware de segurança avançado
// ✅ FASE 2.3: Content Security Policy (CSP) otimizado
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      
      // Scripts: permitir self, CDNs necessários e unsafe-inline para TailwindCSS
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Necessário para TailwindCSS CDN e inline scripts
        "https://cdn.tailwindcss.com",
        "https://unpkg.com",
        "https://aistudiocdn.com"
      ],
      
      // Estilos: permitir self, unsafe-inline e TailwindCSS CDN
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Necessário para estilos inline do React/Tailwind
        "https://cdn.tailwindcss.com"
      ],
      
      // Imagens: permitir self, data URIs, HTTPS e avatares placeholder
      imgSrc: [
        "'self'",
        "data:", // Para imagens inline (SVG, base64)
        "https:", // Permitir qualquer imagem HTTPS (avatares, uploads)
        "http://localhost:5173", // Frontend dev
        "http://localhost:3000", // Backend uploads
        "https://i.pravatar.cc" // Avatares placeholder
      ],
      
      // Conexões: permitir self e backend
      connectSrc: [
        "'self'",
        "http://localhost:3000", // API backend
        "http://localhost:5173", // Frontend dev
        "ws://localhost:5173", // Vite HMR
        "wss://localhost:5173" // Vite HMR (SSL)
      ],
      
      // Fontes: permitir self e data URIs
      fontSrc: [
        "'self'",
        "data:" // Para fontes inline
      ],
      
      // Workers: permitir self e blob
      workerSrc: [
        "'self'",
        "blob:" // Para web workers
      ],
      
      // Objetos: bloquear completamente (segurança)
      objectSrc: ["'none'"],
      
      // Media: permitir self
      mediaSrc: ["'self'"],
      
      // Frames: bloquear completamente (prevenir clickjacking)
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      
      // Base URI: restringir a self
      baseUri: ["'self'"],
      
      // Forms: permitir apenas self
      formAction: ["'self'"],
      
      // Upgrade insecure requests em produção
      ...(process.env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {})
    },
  },
  crossOriginEmbedderPolicy: false, // Desabilitado para compatibilidade com CDNs
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Permitir recursos cross-origin
  hsts: {
    maxAge: 31536000, // 1 ano
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Headers de segurança adicionais
app.use((req, res, next) => {
  // Remover header que expõe tecnologia
  res.removeHeader('X-Powered-By');

  // Headers de segurança personalizados
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
});

// ✅ FASE 2.6: Configuração CORS Restritiva
// Determinar origens permitidas baseado no ambiente
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? config.security.corsProductionOrigins.length > 0
    ? config.security.corsProductionOrigins
    : config.security.corsOrigins // Fallback para dev origins se prod não configurado
  : config.security.corsOrigins;

// Aplicar middleware CORS restritivo
app.use(corsMiddleware({
  allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 horas
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
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Evitar cache em rotas sensíveis de autenticação (perfil/token)
app.use('/api/auth', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Evitar cache em rotas sensíveis de WhatsApp (status/polling)
app.use('/api/whatsapp', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ✅ CORREÇÃO 1.4: Sanitização global de inputs (XSS + SQL Injection)
const { sanitizeInput, detectSQLInjection } = require('./middleware/validation');
app.use('/api', detectSQLInjection); // Detectar SQL Injection em todas as rotas da API
app.use('/api', sanitizeInput); // Sanitizar XSS em todas as rotas da API

// Middleware específico para arquivos estáticos com headers CORS
app.use('/uploads', corsStaticFiles());

// Servir arquivos estáticos (uploads)
app.use('/uploads', express.static('uploads'));

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
app.use('/api', apiRoutes);

// Webhooks (sem autenticação JWT; segurança tratada no handler)
app.use('/webhooks', webhooksRoutes);

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
  logger.error('Erro não tratado:', error);
  
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
    logger.log('🔍 Verificando conexão com banco de dados...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      throw new Error('Falha na conexão com banco de dados');
    }
    
    // Iniciar servidor
    const server = app.listen(config.app.port, config.app.host, () => {
      logger.log(`🚀 ${config.app.name} iniciado com sucesso!`);
      logger.log(`📡 Servidor rodando em: http://${config.app.host}:${config.app.port}`);
      logger.log(`🌍 Ambiente: ${config.app.env}`);
      logger.log(`📊 Health check: http://${config.app.host}:${config.app.port}/health`);
      logger.log(`📚 API base: http://${config.app.host}:${config.app.port}/api`);
      
      if (config.evolutionApi.apiKey) {
        logger.log('📱 Evolution API configurada');
      } else {
        logger.log('⚠️  Evolution API sem chave de acesso');
      }

      // Iniciar cron job de lembretes
      logger.log('\n🔔 Inicializando sistema de lembretes automáticos...');
      reminderJob.start();
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.log('🛑 Recebido SIGTERM, encerrando servidor...');
      reminderJob.stop();
      server.close(() => {
        logger.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.log('🛑 Recebido SIGINT, encerrando servidor...');
      reminderJob.stop();
      server.close(() => {
        logger.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
      });
    });
    
  } catch (error) {
    logger.error('💥 Erro ao iniciar servidor:', error.message);
    process.exit(1);
  }
}

// Iniciar servidor se este arquivo for executado diretamente
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

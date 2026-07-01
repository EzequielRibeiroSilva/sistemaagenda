const config = require('./config/config');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/database');
const apiRoutes = require('./routes/index');
const webhooksRoutes = require('./routes/webhooks');
const reminderJob = require('./jobs/reminderJob');
const pendingPaymentCleanupJob = require('./jobs/pendingPaymentCleanupJob');
const waitingListJob = require('./jobs/waitingListJob');
const reactivateSessionsJob = require('./jobs/ReactivateSessionsJob');
const tokenCleanupJob = require('./jobs/TokenCleanupJob');
const pointsExpirationJob = require('./jobs/PointsExpirationJob');
const despesaOverdueJob = require('./jobs/DespesaOverdueJob');
const whatsappWorker = require('./workers/WhatsappWorker');
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
// Excluir /api/webhooks/* pois são payloads de terceiros (Evolution API, Mercado Pago)
// que podem conter texto livre com palavras reservadas SQL (ex: mensagens WhatsApp).
const { sanitizeInput, detectSQLInjection } = require('./middleware/validation');
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/webhooks/')) return next();
  return detectSQLInjection(req, res, next);
});
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/webhooks/')) return next();
  return sanitizeInput(req, res, next);
});

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

// ── Catch-All de segurança para webhooks na raiz ──────────────────────────────
// A Evolution API às vezes envia POST / em vez de POST /api/webhooks/whatsapp
// (comportamento observado quando a URL do webhook está configurada sem o path).
// Este middleware intercepta POSTs na raiz e força o re-roteamento para o
// endpoint correto antes que qualquer outra rota processe a requisição.
app.post('/', (req, res, next) => {
  logger.warn('⚠️  [App] POST recebido na raiz — redirecionando para /api/webhooks/whatsapp');
  req.url = '/api/webhooks/whatsapp';
  next();
});

// Webhooks (sem autenticação JWT; segurança tratada no handler)
// IMPORTANTE: deve ser registrado ANTES de app.use('/api', apiRoutes)
// para evitar que o handler 404 do apiRoutes capture estas rotas.
app.use('/api/webhooks', webhooksRoutes);

// Middleware de rotas da API
app.use('/api', apiRoutes);

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
      
      // 🔍 AUDITORIA DE ROTAS - Executar após servidor iniciado
      setTimeout(() => {
        console.log('\n=== 🔍 AUDITORIA COMPLETA DE ROTAS EXPRESS ===\n');
        let routeCount = 0;
        
        function printRoutes(stack, basePath = '') {
          stack.forEach((middleware) => {
            if (middleware.route) {
              // Rota direta
              const methods = Object.keys(middleware.route.methods).join(',').toUpperCase();
              const path = basePath + middleware.route.path;
              console.log(`[AUDITORIA] ${methods.padEnd(7)} ${path}`);
              routeCount++;
            } else if (middleware.name === 'router' && middleware.handle.stack) {
              // Sub-router - extrair base path do regexp
              let subPath = basePath;
              const regexpSource = middleware.regexp.source;
              const match = regexpSource.match(/^\\\/([^\\/?]+)/);
              if (match) {
                subPath = basePath + '/' + match[1];
              }
              printRoutes(middleware.handle.stack, subPath);
            }
          });
        }
        
        printRoutes(app._router.stack);
        console.log(`\n=== TOTAL: ${routeCount} rotas registradas ===\n`);
      }, 100);
      
      if (config.evolutionApi.apiKey) {
        logger.log('📱 Evolution API configurada');
      } else {
        logger.log('⚠️  Evolution API sem chave de acesso');
      }

      // Iniciar cron job de lembretes
      logger.log('\n🔔 Inicializando sistema de lembretes automáticos...');
      reminderJob.start();

      // Iniciar job de limpeza de pagamentos pendentes (Pix)
      logger.log('\n🧹 Inicializando cleanup de pagamentos pendentes (Pix)...');
      pendingPaymentCleanupJob.start();

      // Iniciar job de lista de espera inteligente (Fase 4)
      logger.log('\n⏳ Inicializando sistema de lista de espera inteligente...');
      waitingListJob.start();

      // Iniciar job de higiene de sessões (Sprint 3 - Visibilidade)
      logger.log('\n🧹 Inicializando job de higiene de sessões (reativação automática)...');
      reactivateSessionsJob.start();

      // Iniciar job de limpeza de tokens (Task 3.3 - Fase 2)
      logger.log('\n🧹 Inicializando job de limpeza de tokens (janela móvel 30 dias)...');
      tokenCleanupJob.start();

      // Iniciar job de expiração de pontos (Ação 1.3 - Sistema de Pontos)
      logger.log('\n⏰ Inicializando job de expiração automática de pontos...');
      pointsExpirationJob.start();

      // Iniciar job de atualização de despesas vencidas (Fase 2 - Financeiro)
      logger.log('\n💰 Inicializando job de atualização de despesas vencidas (OVERDUE)...');
      despesaOverdueJob.start();

      whatsappWorker.start();
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.log('🛑 Recebido SIGTERM, encerrando servidor...');
      reminderJob.stop();
      pendingPaymentCleanupJob.stop();
      waitingListJob.stop();
      reactivateSessionsJob.stop();
      tokenCleanupJob.stop();
      pointsExpirationJob.stop();
      despesaOverdueJob.stop();
      server.close(() => {
        logger.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.log('🛑 Recebido SIGINT, encerrando servidor...');
      reminderJob.stop();
      pendingPaymentCleanupJob.stop();
      waitingListJob.stop();
      reactivateSessionsJob.stop();
      tokenCleanupJob.stop();
      pointsExpirationJob.stop();
      despesaOverdueJob.stop();
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

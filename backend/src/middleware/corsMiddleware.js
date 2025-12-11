/**
 * Middleware CORS Restritivo
 * FASE 2.6 - Segurança Avançada
 * 
 * Implementa validação rigorosa de origens permitidas
 * com suporte a whitelist dinâmica por ambiente.
 */

const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Validar se uma origem é permitida
 * @param {string} origin - Origem da requisição
 * @param {Array<string>} allowedOrigins - Lista de origens permitidas
 * @returns {boolean} - True se permitida, false caso contrário
 */
function isOriginAllowed(origin, allowedOrigins) {
  // Se não há origem (requisições do mesmo domínio), permitir
  if (!origin) {
    return true;
  }

  // Verificar se a origem está na whitelist
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Em desenvolvimento, permitir localhost com qualquer porta
  if (process.env.NODE_ENV === 'development') {
    try {
      const url = new URL(origin);
      // Permitir localhost e 127.0.0.1 em qualquer porta
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        logger.warn(`⚠️  [CORS] Origem localhost permitida em DEV: ${origin}`);
        return true;
      }
    } catch (error) {
      // URL inválida
      return false;
    }
  }

  return false;
}

/**
 * Validar formato da origem
 * @param {string} origin - Origem a ser validada
 * @returns {boolean} - True se válida, false caso contrário
 */
function isValidOriginFormat(origin) {
  if (!origin) {
    return true; // Requisições sem origem são permitidas (mesmo domínio)
  }

  // Bloquear origens inseguras
  const insecurePatterns = [
    'file://',
    'null',
    'undefined',
    'chrome-extension://',
    'moz-extension://',
    'safari-extension://'
  ];

  for (const pattern of insecurePatterns) {
    if (origin.startsWith(pattern) || origin === pattern) {
      return false;
    }
  }

  // Validar que começa com http:// ou https://
  if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
    return false;
  }

  // Validar formato de URL
  try {
    new URL(origin);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Middleware CORS com validação restritiva
 * @param {Object} options - Opções de configuração
 * @returns {Function} Middleware Express
 */
function corsMiddleware(options = {}) {
  const {
    allowedOrigins = config.security.corsOrigins || [],
    credentials = true,
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders = ['Content-Range', 'X-Content-Range'],
    maxAge = 86400, // 24 horas
    preflightContinue = false,
    optionsSuccessStatus = 204
  } = options;

  // Log de configuração inicial
  logger.log('🔒 [CORS] Middleware inicializado');
  logger.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`   Origens permitidas: ${allowedOrigins.length}`);
  allowedOrigins.forEach(origin => {
    logger.log(`   ✅ ${origin}`);
  });

  return (req, res, next) => {
    const origin = req.get('origin') || req.get('referer');
    const requestOrigin = origin ? new URL(origin).origin : null;

    // Validar formato da origem
    if (requestOrigin && !isValidOriginFormat(requestOrigin)) {
      logger.warn(`🚫 [CORS] Origem com formato inválido bloqueada: ${requestOrigin}`);
      return res.status(403).json({
        error: 'Origem não permitida',
        message: 'Formato de origem inválido'
      });
    }

    // Verificar se a origem é permitida
    const allowed = isOriginAllowed(requestOrigin, allowedOrigins);

    if (!allowed && requestOrigin) {
      logger.warn(`🚫 [CORS] Origem bloqueada: ${requestOrigin}`);
      logger.warn(`   Método: ${req.method}`);
      logger.warn(`   Path: ${req.path}`);
      logger.warn(`   IP: ${req.ip}`);
      
      // Em produção, bloquear completamente
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          error: 'Origem não permitida',
          message: 'Acesso negado por política CORS'
        });
      }
      
      // Em desenvolvimento, apenas avisar mas permitir (para facilitar debug)
      logger.warn(`⚠️  [CORS] Permitindo em DEV, mas bloquearia em PROD`);
    }

    // Configurar headers CORS
    if (requestOrigin && allowed) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    } else if (!requestOrigin) {
      // Requisições do mesmo domínio
      res.setHeader('Access-Control-Allow-Origin', req.get('host') || '*');
    }

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));

    if (exposedHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    }

    res.setHeader('Access-Control-Max-Age', maxAge.toString());

    // Lidar com requisições preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
      if (!preflightContinue) {
        return res.status(optionsSuccessStatus).end();
      }
    }

    next();
  };
}

/**
 * Middleware específico para arquivos estáticos
 * Permite acesso mais liberal para recursos públicos
 */
function corsStaticFiles() {
  return (req, res, next) => {
    // Para arquivos estáticos, permitir qualquer origem
    // mas apenas para método GET
    if (req.method === 'GET') {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 ano
    }
    next();
  };
}

module.exports = {
  corsMiddleware,
  corsStaticFiles,
  isOriginAllowed,
  isValidOriginFormat
};

/**
 * Middleware CORS Restritivo
 * FASE 2.6 - Segurança Avançada
 * 
 * Implementa validação rigorosa de origens permitidas
 * com suporte a whitelist dinâmica por ambiente.
 */

const logger = require('../utils/logger');
const config = require('../config/config');

function isReservedSubdomain(slug) {
  const reserved = new Set([
    'app',
    'api',
    'admin',
    'www',
    'suporte',
    'static',
    'assets',
    'docs',
    'status',
    'mail'
  ]);

  return reserved.has(slug);
}

function isDnsSafeSubdomainSlug(slug) {
  if (!slug) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
}

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

  // Em produção, permitir subdomínios do domínio base (ex: https://<slug>.tally.com.br)
  // Isso é necessário para o booking público via subdomínio funcionar sem abrir wildcard geral.
  if (process.env.NODE_ENV === 'production') {
    try {
      const url = new URL(origin);
      const baseDomain = (process.env.CORS_BASE_DOMAIN || 'tally.com.br').toLowerCase();
      const hostname = (url.hostname || '').toLowerCase();

      // Restringir a HTTPS (evita liberar origens inseguras em produção)
      if (url.protocol !== 'https:') return false;

      // Permitir o domínio base (se for usado)
      if (hostname === baseDomain) {
        return true;
      }

      // Permitir exatamente um nível de subdomínio: <tenant>.<baseDomain>
      if (hostname.endsWith(`.${baseDomain}`)) {
        const tenant = hostname.slice(0, -(baseDomain.length + 1));
        if (!tenant || tenant.includes('.')) return false;

        const reserved = new Set([
          'app',
          'api',
          'admin',
          'www',
          'suporte',
          'static',
          'assets',
          'docs',
          'status',
          'mail'
        ]);
        if (reserved.has(tenant)) return false;

        const isDnsSafe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenant);
        if (!isDnsSafe) return false;

        return true;
      }
    } catch (error) {
      return false;
    }
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

      // Permitir lvh.me (e subdomínios) para simular tenants localmente
      // Ex: http://cliente.lvh.me:5173
      if (url.hostname === 'lvh.me' || url.hostname.endsWith('.lvh.me')) {
        logger.warn(`⚠️  [CORS] Origem lvh.me permitida em DEV: ${origin}`);
        return true;
      }
    } catch (error) {
      // URL inválida
      return false;
    }
  }

  // Em produção, permitir tenants via subdomínio de forma restrita
  // Ex: https://cliente.tally.com.br
  if (process.env.NODE_ENV === 'production') {
    try {
      const url = new URL(origin);
      const baseDomain = process.env.PUBLIC_BASE_DOMAIN || process.env.VITE_PUBLIC_BASE_DOMAIN;
      if (!baseDomain) {
        return false;
      }

      if (url.protocol !== 'https:') {
        return false;
      }

      const hostname = url.hostname.toLowerCase();
      const base = baseDomain.toLowerCase();

      if (hostname === base) {
        return true;
      }

      if (!hostname.endsWith(`.${base}`)) {
        return false;
      }

      const tenant = hostname.slice(0, hostname.length - (base.length + 1));
      if (!tenant || tenant.includes('.')) {
        return false;
      }

      if (!isDnsSafeSubdomainSlug(tenant) || isReservedSubdomain(tenant)) {
        return false;
      }

      return true;
    } catch (error) {
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
    const isMercadoPagoIntegrationRoute = (() => {
      const p = req.path;
      if (!p) return false;
      if (p === '/api/webhooks/mercadopago/callback') {
        return req.method === 'GET' || req.method === 'OPTIONS';
      }
      if (p === '/api/webhooks/mercadopago') {
        return req.method === 'POST' || req.method === 'OPTIONS';
      }
      return false;
    })();

    if (isMercadoPagoIntegrationRoute) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Signature');
      res.setHeader('Access-Control-Max-Age', maxAge.toString());

      if (req.method === 'OPTIONS') {
        return res.status(optionsSuccessStatus).end();
      }

      return next();
    }

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

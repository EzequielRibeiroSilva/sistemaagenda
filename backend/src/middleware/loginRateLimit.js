const rateLimit = require('express-rate-limit');
const config = require('../config/config');
const logger = require('./../utils/logger');

// Rate limiting específico para login - mais restritivo
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Máximo 5 tentativas por IP em 15 minutos
  skipSuccessfulRequests: true, // Não contar tentativas bem-sucedidas
  skipFailedRequests: false, // Contar tentativas falhadas
  message: {
    error: 'Muitas tentativas de login falhadas',
    message: 'Aguarde 15 minutos antes de tentar novamente',
    retryAfter: 15 * 60 // 15 minutos em segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Função personalizada para identificar tentativas falhadas
  skip: (req, res) => {
    // Se a resposta foi bem-sucedida (2xx), não contar para o rate limit
    return res.statusCode >= 200 && res.statusCode < 300;
  },
  // Headers personalizados
  onLimitReached: (req, res) => {
    logger.warn(`🚨 Rate limit atingido para login - IP: ${req.ip}, User-Agent: ${req.get('User-Agent')}`);
  }
});

// Rate limiting por usuário específico (baseado no email)
const userLoginAttempts = new Map();

const userSpecificRateLimit = (req, res, next) => {
  const email = req.body.email?.toLowerCase().trim();
  
  if (!email) {
    return next();
  }

  const now = Date.now();
  const windowMs = 30 * 60 * 1000; // 30 minutos
  const maxAttempts = 3; // Máximo 3 tentativas por email em 30 minutos

  // Limpar tentativas antigas
  const userAttempts = userLoginAttempts.get(email) || [];
  const recentAttempts = userAttempts.filter(attempt => now - attempt.timestamp < windowMs);

  if (recentAttempts.length >= maxAttempts) {
    const oldestAttempt = Math.min(...recentAttempts.map(a => a.timestamp));
    const retryAfter = Math.ceil((oldestAttempt + windowMs - now) / 1000);

    logger.warn(`🚨 Rate limit por usuário atingido - Email: ${email}, IP: ${req.ip}`);

    return res.status(429).json({
      error: 'Muitas tentativas de login para este email',
      message: `Aguarde ${Math.ceil(retryAfter / 60)} minutos antes de tentar novamente`,
      retryAfter: retryAfter
    });
  }

  // Middleware para registrar tentativa falhada
  const originalSend = res.send;
  res.send = function(data) {
    // Se a resposta indica falha de login, registrar tentativa
    if (res.statusCode === 401 || res.statusCode === 400) {
      recentAttempts.push({
        timestamp: now,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      userLoginAttempts.set(email, recentAttempts);
    } else if (res.statusCode >= 200 && res.statusCode < 300) {
      // Login bem-sucedido, limpar tentativas
      userLoginAttempts.delete(email);
    }

    return originalSend.call(this, data);
  };

  next();
};

// Limpeza periódica do cache de tentativas (executar a cada hora)
setInterval(() => {
  const now = Date.now();
  const windowMs = 30 * 60 * 1000;

  for (const [email, attempts] of userLoginAttempts.entries()) {
    const recentAttempts = attempts.filter(attempt => now - attempt.timestamp < windowMs);
    if (recentAttempts.length === 0) {
      userLoginAttempts.delete(email);
    } else {
      userLoginAttempts.set(email, recentAttempts);
    }
  }
}, 60 * 60 * 1000); // 1 hora

module.exports = {
  loginRateLimit,
  userSpecificRateLimit
};

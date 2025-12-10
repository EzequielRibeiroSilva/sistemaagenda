/**
 * Rate Limiting para Rotas Públicas de Booking
 * 
 * ESTRATÉGIA DE SEGURANÇA:
 * - Busca de cliente: 3 tentativas por IP a cada 5 minutos
 * - Criação de agendamento: 5 tentativas por IP a cada 15 minutos
 * - Validação de cupom: 10 tentativas por IP a cada 15 minutos
 * - Proteção contra enumeração de dados pessoais (LGPD)
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate limit para busca de cliente (CRÍTICO - LGPD)
 * 3 tentativas a cada 5 minutos por IP
 */
const clientSearchRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 3, // 3 tentativas
  message: {
    error: 'Muitas tentativas de busca',
    message: 'Você excedeu o limite de buscas. Tente novamente em 5 minutos.',
    retryAfter: '5 minutos'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Identificar por IP
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  // Log de tentativas bloqueadas
  handler: (req, res) => {
    console.warn(`🚨 [SECURITY] Rate limit excedido para busca de cliente - IP: ${req.ip}, Telefone: ${req.query.telefone}`);
    res.status(429).json({
      error: 'Muitas tentativas de busca',
      message: 'Você excedeu o limite de buscas. Tente novamente em 5 minutos.',
      retryAfter: '5 minutos'
    });
  }
});

/**
 * Rate limit para criação de agendamento
 * 5 tentativas a cada 15 minutos por IP
 */
const createBookingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 tentativas
  message: {
    error: 'Muitas tentativas de agendamento',
    message: 'Você excedeu o limite de agendamentos. Tente novamente em 15 minutos.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  handler: (req, res) => {
    console.warn(`🚨 [SECURITY] Rate limit excedido para criação de agendamento - IP: ${req.ip}`);
    res.status(429).json({
      error: 'Muitas tentativas de agendamento',
      message: 'Você excedeu o limite de agendamentos. Tente novamente em 15 minutos.',
      retryAfter: '15 minutos'
    });
  }
});

/**
 * Rate limit para validação de cupom
 * 10 tentativas a cada 15 minutos por IP
 */
const couponValidationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 tentativas
  message: {
    error: 'Muitas tentativas de validação',
    message: 'Você excedeu o limite de validações de cupom. Tente novamente em 15 minutos.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  handler: (req, res) => {
    console.warn(`🚨 [SECURITY] Rate limit excedido para validação de cupom - IP: ${req.ip}`);
    res.status(429).json({
      error: 'Muitas tentativas de validação',
      message: 'Você excedeu o limite de validações de cupom. Tente novamente em 15 minutos.',
      retryAfter: '15 minutos'
    });
  }
});

/**
 * Rate limit geral para rotas públicas
 * 100 requisições a cada 15 minutos por IP
 */
const generalPublicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requisições
  message: {
    error: 'Muitas requisições',
    message: 'Você excedeu o limite de requisições. Tente novamente em 15 minutos.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  // Pular rate limit para rotas específicas (se necessário)
  skip: (req) => {
    // Não aplicar rate limit geral em rotas que já têm rate limit específico
    const specificRateLimitPaths = [
      '/api/public/cliente/buscar',
      '/api/public/agendamento',
      '/api/public/cupons/validar'
    ];
    return specificRateLimitPaths.some(path => req.path.includes(path));
  }
});

module.exports = {
  clientSearchRateLimit,
  createBookingRateLimit,
  couponValidationRateLimit,
  generalPublicRateLimit
};

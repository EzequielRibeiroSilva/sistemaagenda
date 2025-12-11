const validator = require('validator');
const xss = require('xss');
const logger = require('./../utils/logger');

/**
 * Middleware de validação e sanitização para login
 */
const validateLogin = (req, res, next) => {
  const { email, senha } = req.body;
  const errors = [];

  // Validar presença dos campos obrigatórios
  if (!email) {
    errors.push('Email é obrigatório');
  }

  if (!senha) {
    errors.push('Senha é obrigatória');
  }

  // Se campos básicos estão ausentes, retornar erro
  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Dados inválidos',
      message: 'Campos obrigatórios não preenchidos',
      details: errors
    });
  }

  // Sanitizar e validar email
  let sanitizedEmail = email.toString().trim().toLowerCase();
  
  // Remover caracteres perigosos
  sanitizedEmail = xss(sanitizedEmail, {
    whiteList: {}, // Não permitir nenhuma tag HTML
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script']
  });

  // Validar formato do email
  if (!validator.isEmail(sanitizedEmail)) {
    errors.push('Formato de email inválido');
  }

  // Validar comprimento do email
  if (sanitizedEmail.length > 254) { // RFC 5321 limit
    errors.push('Email muito longo');
  }

  // Validar domínio do email (básico)
  const emailParts = sanitizedEmail.split('@');
  if (emailParts.length === 2) {
    const domain = emailParts[1];
    if (!validator.isFQDN(domain)) {
      errors.push('Domínio do email inválido');
    }
  }

  // Sanitizar senha (sem alterar o conteúdo, apenas verificar)
  const sanitizedSenha = senha.toString();

  // Validar comprimento da senha
  if (sanitizedSenha.length < 6) {
    errors.push('Senha deve ter pelo menos 6 caracteres');
  }

  if (sanitizedSenha.length > 128) {
    errors.push('Senha muito longa');
  }

  // Verificar caracteres suspeitos na senha (possível injeção)
  // ✅ CORREÇÃO 1.9: Permitir caracteres especiais válidos em senhas ($, %, etc.)
  // Bloquear apenas padrões de injeção reais, não caracteres especiais isolados
  const suspiciousPatterns = [
    /(<script|<\/script>)/i,
    /(javascript:|vbscript:|onload=|onerror=)/i,
    /(union\s+select|drop\s+table|insert\s+into|delete\s+from)/i,
    /(\$\{[^}]*\}|\#\{[^}]*\}|<%=|<\?php)/i // ✅ Apenas template literals completos, não $ isolado
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitizedSenha)) {
      errors.push('Senha contém caracteres não permitidos');
      break;
    }
  }

  // Se há erros de validação, retornar
  if (errors.length > 0) {
    // Log de tentativa suspeita
    logger.warn(`🚨 Tentativa de login com dados inválidos - IP: ${req.ip}, Email: ${sanitizedEmail}, Errors: ${errors.join(', ')}`);
    
    return res.status(400).json({
      error: 'Dados inválidos',
      message: 'Verifique os dados informados',
      details: errors
    });
  }

  // Adicionar dados sanitizados ao request
  req.body.email = sanitizedEmail;
  req.body.senha = sanitizedSenha;

  next();
};

/**
 * Função auxiliar para sanitizar recursivamente objetos e arrays
 */
const sanitizeValue = (value) => {
  if (typeof value === 'string') {
    // Sanitizar XSS
    const sanitized = xss(value, {
      whiteList: {}, // Não permitir nenhuma tag HTML
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script']
    });
    // Trim whitespace
    return sanitized.trim();
  } else if (Array.isArray(value)) {
    // Sanitizar cada elemento do array recursivamente
    return value.map(item => sanitizeValue(item));
  } else if (value !== null && typeof value === 'object') {
    // Sanitizar cada propriedade do objeto recursivamente
    const sanitizedObj = {};
    for (const [key, val] of Object.entries(value)) {
      sanitizedObj[key] = sanitizeValue(val);
    }
    return sanitizedObj;
  }
  // Retornar valores não-string sem modificação (números, booleanos, null)
  return value;
};

/**
 * Middleware de validação genérica para outros endpoints
 * ✅ CORREÇÃO 1.4: Sanitização recursiva de objetos aninhados e arrays
 */
const sanitizeInput = (req, res, next) => {
  // Sanitizar todos os campos no body (incluindo objetos aninhados e arrays)
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  // Sanitizar query parameters (incluindo arrays)
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }

  // Sanitizar params
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }

  next();
};

/**
 * Middleware para detectar tentativas de injeção SQL
 * ✅ CORREÇÃO 1.9: Não bloquear caracteres especiais válidos em senhas
 */
const detectSQLInjection = (req, res, next) => {
  const sqlInjectionPatterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
    /((\%27)|(\')|(--)|(\%23))/i, // ✅ Removido \# isolado - permitir em senhas
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(--)|(\%23))/i, // ✅ Removido \# isolado
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i
  ];

  const checkForSQLInjection = (obj, path = '', parentKey = '') => {
    for (const [key, value] of Object.entries(obj)) {
      // ✅ CORREÇÃO 1.9: Não validar SQL injection em campos de senha
      const isPasswordField = ['senha', 'password', 'novaSenha', 'nova_senha', 'senhaAtual'].includes(key);
      
      if (typeof value === 'string' && !isPasswordField) {
        for (const pattern of sqlInjectionPatterns) {
          if (pattern.test(value)) {
            logger.error(`🚨 Possível tentativa de SQL Injection detectada - IP: ${req.ip}, Path: ${path}.${key}, Value: ${value}`);
            return true;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        if (checkForSQLInjection(value, `${path}.${key}`, key)) {
          return true;
        }
      }
    }
    return false;
  };

  // Verificar body, query e params
  const sources = [
    { data: req.body, name: 'body' },
    { data: req.query, name: 'query' },
    { data: req.params, name: 'params' }
  ];

  for (const source of sources) {
    if (source.data && typeof source.data === 'object') {
      if (checkForSQLInjection(source.data, source.name)) {
        return res.status(400).json({
          error: 'Dados inválidos',
          message: 'Requisição contém caracteres não permitidos'
        });
      }
    }
  }

  next();
};

module.exports = {
  validateLogin,
  sanitizeInput,
  detectSQLInjection
};

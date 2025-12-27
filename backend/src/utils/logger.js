/**
 * Logger com Sanitização Automática
 * FASE 2.4 - Sanitizar Logs do Backend
 * 
 * Wrapper para console.log que remove automaticamente dados sensíveis
 * antes de logar no servidor, protegendo senhas, tokens, CPF, etc.
 */

/**
 * Lista de campos sensíveis que devem ser sanitizados
 */
const SENSITIVE_FIELDS = [
  // Senhas
  'senha', 'password', 'senha_hash', 'senha_atual', 'nova_senha', 'novaSenha',
  'senhaAtual', 'currentPassword', 'newPassword', 'oldPassword',
  
  // Tokens e autenticação
  'token', 'accessToken', 'refreshToken', 'authorization', 'auth',
  'bearer', 'jwt', 'apiKey', 'api_key', 'secret', 'secretKey',
  
  // Documentos pessoais
  'cpf', 'rg', 'cnpj', 'passport', 'ssn', 'nationalId',
  
  // Dados financeiros
  'cartao_credito', 'creditCard', 'cardNumber', 'cvv', 'cvc',
  'accountNumber', 'routingNumber', 'iban', 'swift',
  
  // Dados sensíveis adicionais
  'pin', 'otp', 'code', 'verificationCode'
];

/**
 * Padrões regex para detectar dados sensíveis
 */
const SENSITIVE_PATTERNS = [
  // CPF: 000.000.000-00 ou 00000000000
  { pattern: /\d{3}\.\d{3}\.\d{3}-\d{2}/, replacement: '***.***/***-**' },
  { pattern: /\b\d{11}\b/, replacement: '***********' },
  
  // Cartão de crédito: 0000 0000 0000 0000
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, replacement: '**** **** **** ****' },
  
  // Email parcial (manter domínio)
  { pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/, replacement: '***@$2' },
  
  // Telefone: (00) 00000-0000 ou similar
  { pattern: /\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}/, replacement: '(**) *****-****' }
];

/**
 * Sanitizar um valor individual
 * @param {*} value - Valor a ser sanitizado
 * @param {string} key - Chave do valor (para verificar se é sensível)
 * @returns {*} Valor sanitizado
 */
function sanitizeValue(value, key = '') {
  // Se é null ou undefined, retornar como está
  if (value === null || value === undefined) {
    return value;
  }

  // Verificar se a chave indica um campo sensível
  const isSensitiveField = SENSITIVE_FIELDS.some(field => 
    key.toLowerCase().includes(field.toLowerCase())
  );

  if (isSensitiveField) {
    return '***REDACTED***';
  }

  // Se é string, aplicar padrões de sanitização
  if (typeof value === 'string') {
    let sanitized = value;
    
    // Aplicar padrões regex
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    
    return sanitized;
  }

  // Se é array, sanitizar cada elemento
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, `${key}[${index}]`));
  }

  // Se é objeto, sanitizar cada propriedade
  if (typeof value === 'object') {
    const sanitized = {};
    for (const [objKey, objValue] of Object.entries(value)) {
      sanitized[objKey] = sanitizeValue(objValue, objKey);
    }
    return sanitized;
  }

  // Outros tipos (number, boolean, etc.) retornar como está
  return value;
}

/**
 * Sanitizar argumentos de log
 * @param {Array} args - Argumentos passados para o log
 * @returns {Array} Argumentos sanitizados
 */
function sanitizeArgs(...args) {
  return args.map((arg) => sanitizeValue(arg, ''));
}

/**
 * Formatar timestamp para logs
 * @returns {string} Timestamp formatado
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString();
}

/**
 * Logger com sanitização automática
 */
const logger = {
  /**
   * Log de informação (console.log)
   */
  log: (...args) => {
    const sanitized = sanitizeArgs(...args);
    console.log(`[${getTimestamp()}] [INFO]`, ...sanitized);
  },

  /**
   * Log de informação (alias para log)
   */
  info: (...args) => {
    const sanitized = sanitizeArgs(...args);
    console.log(`[${getTimestamp()}] [INFO]`, ...sanitized);
  },

  /**
   * Log de erro (console.error)
   */
  error: (...args) => {
    const sanitized = sanitizeArgs(...args);
    console.error(`[${getTimestamp()}] [ERROR]`, ...sanitized);
  },

  /**
   * Log de aviso (console.warn)
   */
  warn: (...args) => {
    const sanitized = sanitizeArgs(...args);
    console.warn(`[${getTimestamp()}] [WARN]`, ...sanitized);
  },

  /**
   * Log de debug (console.debug)
   */
  debug: (...args) => {
    // Apenas logar em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      const sanitized = sanitizeArgs(...args);
      console.debug(`[${getTimestamp()}] [DEBUG]`, ...sanitized);
    }
  },

  /**
   * Log de sucesso (com emoji)
   */
  success: (...args) => {
    const sanitized = sanitizeArgs(...args);
    console.log(`[${getTimestamp()}] [SUCCESS] ✅`, ...sanitized);
  },

  /**
   * Sanitizar dados manualmente (útil para casos específicos)
   * @param {*} data - Dados a serem sanitizados
   * @returns {*} Dados sanitizados
   */
  sanitize: (data) => {
    return sanitizeValue(data);
  }
};

/**
 * Exportar logger e função de sanitização
 */
module.exports = logger;
module.exports.sanitizeValue = sanitizeValue;
module.exports.sanitizeArgs = sanitizeArgs;

/**
 * Middleware: Password Validation
 * Descrição: Validação robusta de senhas com requisitos de complexidade
 * ✅ CORREÇÃO 1.9: Aumentar requisitos de senha para prevenir ataques de força bruta
 */

/**
 * Valida força da senha
 * ✅ CORREÇÃO 1.9: Requisitos aumentados
 * - Mínimo 8 caracteres (antes: 6)
 * - Pelo menos 1 letra maiúscula
 * - Pelo menos 1 letra minúscula
 * - Pelo menos 1 número
 * - Pelo menos 1 caractere especial
 * 
 * @param {string} password - Senha a ser validada
 * @returns {Object} - { valid: boolean, errors: string[], strength: string }
 */
function validatePasswordStrength(password) {
  const errors = [];
  let strength = 'weak';

  // Validação 1: Comprimento mínimo
  if (!password || password.length < 8) {
    errors.push('A senha deve ter pelo menos 8 caracteres');
  }

  // Validação 2: Comprimento máximo (prevenir DoS)
  if (password && password.length > 128) {
    errors.push('A senha não pode ter mais de 128 caracteres');
  }

  // Validação 3: Letra maiúscula
  if (!/[A-Z]/.test(password)) {
    errors.push('A senha deve conter pelo menos uma letra maiúscula');
  }

  // Validação 4: Letra minúscula
  if (!/[a-z]/.test(password)) {
    errors.push('A senha deve conter pelo menos uma letra minúscula');
  }

  // Validação 5: Número
  if (!/[0-9]/.test(password)) {
    errors.push('A senha deve conter pelo menos um número');
  }

  // Validação 6: Caractere especial
  // ✅ CORREÇÃO: Escapar $ corretamente no regex
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push('A senha deve conter pelo menos um caractere especial (!@#$%^&*...)');
  }

  // Validação 7: Não pode ser senha comum
  const commonPasswords = [
    'password', 'senha', '12345678', 'qwerty', 'abc123', 
    'password1', 'senha123', '123456789', 'admin123', 'admin1234'
  ];
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Esta senha é muito comum. Escolha uma senha mais segura');
  }

  // Validação 8: Não pode ter sequências óbvias
  if (/(.)\1{2,}/.test(password)) { // 3 ou mais caracteres repetidos
    errors.push('A senha não pode ter caracteres repetidos consecutivamente (ex: aaa, 111)');
  }

  // Calcular força da senha
  if (errors.length === 0) {
    // Senha forte: atende todos os requisitos
    if (password.length >= 12) {
      strength = 'very_strong';
    } else if (password.length >= 10) {
      strength = 'strong';
    } else {
      strength = 'medium';
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength
  };
}

/**
 * Middleware Express para validar senha em requisições
 * ✅ CORREÇÃO 1.9: Aplicar em rotas de criação/alteração de senha
 */
const validatePassword = (req, res, next) => {
  // Identificar campo de senha na requisição
  const password = req.body.senha || req.body.novaSenha || req.body.nova_senha || req.body.password;

  if (!password) {
    // Se não há senha na requisição, pular validação
    return next();
  }

  // Validar senha
  const validation = validatePasswordStrength(password);

  if (!validation.valid) {
    console.warn(`🚨 [SECURITY] Senha fraca rejeitada - IP: ${req.ip}, Erros: ${validation.errors.length}`);
    
    return res.status(400).json({
      success: false,
      error: 'Senha não atende aos requisitos de segurança',
      message: 'A senha deve atender aos seguintes requisitos:',
      details: validation.errors
    });
  }

  // Log de senha forte aceita
  console.log(`✅ [SECURITY] Senha forte aceita - IP: ${req.ip}, Força: ${validation.strength}`);

  // Adicionar informações de validação ao request
  req.passwordValidation = validation;

  next();
};

module.exports = {
  validatePasswordStrength,
  validatePasswordMiddleware: validatePassword
};

/**
 * Middleware: Validação de Comissão (ELITE)
 * Descrição: Validação implacável de comissao_percentual com Zod
 * 
 * FASE 1 - BLINDAGEM DE AUDITORIA:
 * - Validação estrita: 0 <= comissao_percentual <= 100
 * - Rejeita valores inválidos com 422 Unprocessable Entity
 * - Previne persistência de dados corrompidos
 */

const { z } = require('zod');
const logger = require('../utils/logger');

/**
 * Schema Zod para validação de comissão
 * REGRA: Comissão deve ser número entre 0 e 100 (inclusive)
 */
const comissaoSchema = z.object({
  comissao_percentual: z
    .number({
      required_error: '[VALOR_OBRIGATORIO] comissao_percentual é obrigatório',
      invalid_type_error: '[TIPO_INVALIDO] comissao_percentual deve ser um número'
    })
    .min(0, {
      message: '[VALOR_INVALIDO] Comissão deve estar entre 0 e 100'
    })
    .max(100, {
      message: '[VALOR_INVALIDO] Comissão deve estar entre 0 e 100'
    })
    .finite('[VALOR_INVALIDO] Comissão não pode ser Infinity ou NaN')
}).strict();

/**
 * Schema Zod para validação opcional de comissão (para UPDATE parcial)
 * Permite undefined, mas se fornecido, deve estar no range válido
 */
const comissaoOptionalSchema = z.object({
  comissao_percentual: z
    .number({
      invalid_type_error: '[TIPO_INVALIDO] comissao_percentual deve ser um número'
    })
    .min(0, {
      message: '[VALOR_INVALIDO] Comissão deve estar entre 0 e 100'
    })
    .max(100, {
      message: '[VALOR_INVALIDO] Comissão deve estar entre 0 e 100'
    })
    .finite('[VALOR_INVALIDO] Comissão não pode ser Infinity ou NaN')
    .optional()
}).strict();

/**
 * Middleware Express para validar comissão obrigatória (CREATE)
 * Uso: router.post('/servicos', validateComissaoRequired, controller.store)
 */
const validateComissaoRequired = (req, res, next) => {
  try {
    // Se comissao_percentual não está presente, ignorar validação
    // (deixar para validação de negócio decidir se é obrigatório)
    if (req.body.comissao_percentual === undefined) {
      return next();
    }

    // Validar tipo e range
    const result = comissaoSchema.safeParse({
      comissao_percentual: req.body.comissao_percentual
    });

    if (!result.success) {
      const firstError = result.error.errors[0];
      
      logger.warn(`🚨 [SECURITY] Comissão inválida rejeitada - IP: ${req.ip}, Valor: ${req.body.comissao_percentual}`);
      
      return res.status(422).json({
        success: false,
        error: firstError.message,
        message: 'Validação de comissão falhou',
        details: result.error.errors.map(err => ({
          campo: err.path.join('.'),
          mensagem: err.message
        }))
      });
    }

    // Validação bem-sucedida
    logger.log(`✅ [SECURITY] Comissão válida aceita - IP: ${req.ip}, Valor: ${req.body.comissao_percentual}%`);
    
    next();
  } catch (error) {
    logger.error('[validateComissaoRequired] Erro inesperado:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Erro na validação de comissão',
      message: error.message
    });
  }
};

/**
 * Middleware Express para validar comissão opcional (UPDATE)
 * Uso: router.put('/servicos/:id', validateComissaoOptional, controller.update)
 */
const validateComissaoOptional = (req, res, next) => {
  try {
    // Se comissao_percentual não está presente, pular validação
    if (req.body.comissao_percentual === undefined) {
      return next();
    }

    // Validar tipo e range
    const result = comissaoOptionalSchema.safeParse({
      comissao_percentual: req.body.comissao_percentual
    });

    if (!result.success) {
      const firstError = result.error.errors[0];
      
      logger.warn(`🚨 [SECURITY] Comissão inválida rejeitada - IP: ${req.ip}, Valor: ${req.body.comissao_percentual}`);
      
      return res.status(422).json({
        success: false,
        error: firstError.message,
        message: 'Validação de comissão falhou',
        details: result.error.errors.map(err => ({
          campo: err.path.join('.'),
          mensagem: err.message
        }))
      });
    }

    // Validação bem-sucedida
    logger.log(`✅ [SECURITY] Comissão válida aceita - IP: ${req.ip}, Valor: ${req.body.comissao_percentual}%`);
    
    next();
  } catch (error) {
    logger.error('[validateComissaoOptional] Erro inesperado:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Erro na validação de comissão',
      message: error.message
    });
  }
};

/**
 * Função helper para validação programática (sem middleware)
 * Uso em controllers que não usam rotas Express
 */
const validateComissaoValue = (value) => {
  if (value === undefined || value === null) {
    return { valid: true }; // Permitir undefined/null (validação de negócio decide)
  }

  const result = comissaoSchema.safeParse({
    comissao_percentual: value
  });

  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map(err => err.message)
    };
  }

  return { valid: true };
};

module.exports = {
  validateComissaoRequired,
  validateComissaoOptional,
  validateComissaoValue,
  comissaoSchema,
  comissaoOptionalSchema
};

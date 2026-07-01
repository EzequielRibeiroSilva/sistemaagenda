const { z } = require('zod');

/**
 * Schema de validação para movimentações financeiras (Despesas)
 * 
 * Regras de Segurança:
 * - Valores devem ser estritamente positivos (mínimo R$ 0,01)
 * - Limite máximo de R$ 1.000.000,00 por transação (prevenção de overflow)
 * - Tipos de movimentação restritos via enum
 * - Strict mode ativado para prevenir Mass Assignment
 */

// Enum de Status permitidos
// ✅ SINCRONIZADO: Incluídos todos os estados operacionais reais do sistema
const StatusEnum = z.enum(['PENDING', 'PAID', 'CANCELLED', 'OVERDUE', 'REVERSED'], {
  errorMap: () => ({ message: 'Status deve ser: PENDING, PAID, CANCELLED, OVERDUE ou REVERSED' })
});

// Enum de Formas de Pagamento permitidas
// ✅ NORMALIZAÇÃO: Aceita variações comuns (maiúsculas/minúsculas)
const FormaPagamentoEnum = z.enum([
  'PIX',
  'Dinheiro',
  'Boleto',
  'DINHEIRO',
  'CREDITO',
  'DEBITO',
  'BOLETO',
  'Pix',  // Variação comum
  'pix'   // Variação lowercase
], {
  errorMap: (issue, ctx) => {
    if (issue.code === z.ZodIssueCode.invalid_enum_value) {
      return {
        message: `Forma de pagamento inválida. Valores aceitos: PIX, Dinheiro, Boleto, CREDITO, DEBITO. Recebido: ${ctx.data}`
      };
    }
    return { message: ctx.defaultError };
  }
});

// Schema base para valores monetários
const ValorMonetarioSchema = z.number({
  required_error: 'Valor é obrigatório',
  invalid_type_error: 'Valor deve ser um número'
})
  .positive({ message: 'Valor deve ser positivo' })
  .min(0.01, { message: 'Valor mínimo é R$ 0,01' })
  .max(1000000, { message: 'Valor máximo é R$ 1.000.000,00' })
  .refine((val) => Number.isFinite(val), {
    message: 'Valor inválido'
  })
  .transform((val) => Number(val.toFixed(2))); // Garante precisão de 2 casas decimais

// Schema para datas no formato YYYY-MM-DD
const DataSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato YYYY-MM-DD' })
  .refine((date) => {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  }, { message: 'Data inválida' });

/**
 * Schema para criação de despesa (POST)
 */
const createDespesaSchema = z.object({
  unidade_id: z.number({
    required_error: 'unidade_id é obrigatório',
    invalid_type_error: 'unidade_id deve ser um número'
  })
    .int({ message: 'unidade_id deve ser um número inteiro' })
    .positive({ message: 'unidade_id deve ser positivo' }),

  descricao: z.string({
    required_error: 'Descrição é obrigatória',
    invalid_type_error: 'Descrição deve ser uma string'
  })
    .trim()
    .min(3, { message: 'Descrição deve ter no mínimo 3 caracteres' })
    .max(500, { message: 'Descrição deve ter no máximo 500 caracteres' }),

  categoria: z.string({
    required_error: 'Categoria é obrigatória',
    invalid_type_error: 'Categoria deve ser uma string'
  })
    .trim()
    .min(2, { message: 'Categoria deve ter no mínimo 2 caracteres' })
    .max(100, { message: 'Categoria deve ter no máximo 100 caracteres' }),

  valor: ValorMonetarioSchema,

  data_vencimento: DataSchema,

  data_pagamento: DataSchema.nullable().optional(),

  status: StatusEnum.default('PENDING'),

  forma_pagamento: FormaPagamentoEnum.nullable().optional()
}).strict(); // CRÍTICO: Impede campos extras (Mass Assignment Prevention)

/**
 * Schema para atualização de despesa (PUT/PATCH)
 * 
 * ✅ CORREÇÃO: unidade_id é OBRIGATÓRIO para validação de permissões multi-tenancy
 */
const updateDespesaSchema = z.object({
  unidade_id: z.number({
    required_error: 'unidade_id é obrigatório',
    invalid_type_error: 'unidade_id deve ser um número'
  })
    .int({ message: 'unidade_id deve ser um número inteiro' })
    .positive({ message: 'unidade_id deve ser positivo' }),

  descricao: z.string()
    .trim()
    .min(3, { message: 'Descrição deve ter no mínimo 3 caracteres' })
    .max(500, { message: 'Descrição deve ter no máximo 500 caracteres' })
    .optional(),

  categoria: z.string()
    .trim()
    .min(2, { message: 'Categoria deve ter no mínimo 2 caracteres' })
    .max(100, { message: 'Categoria deve ter no máximo 100 caracteres' })
    .optional(),

  valor: ValorMonetarioSchema.optional(),

  data_vencimento: DataSchema.optional(),

  data_pagamento: DataSchema.nullable().optional(),

  status: StatusEnum.optional(),

  forma_pagamento: FormaPagamentoEnum.nullable().optional()
}).strict() // CRÍTICO: Impede campos extras (Mass Assignment Prevention)
  .refine((data) => {
    // ✅ Pelo menos 1 campo além de unidade_id deve ser fornecido
    const fields = Object.keys(data).filter(k => k !== 'unidade_id');
    return fields.length > 0;
  }, {
    message: 'Nenhum campo válido fornecido para atualização'
  })
  .refine((data) => {
    // 🔒 SEGURANÇA: Impede alteração para status REVERSED via PUT
    // Estornos só podem ser criados via rota específica POST /despesas/:id/estornar
    if (data.status === 'REVERSED') {
      return false;
    }
    return true;
  }, {
    message: 'Status REVERSED não pode ser definido manualmente. Use a rota de estorno.'
  });

/**
 * Schema para query params de listagem
 */
const listDespesasQuerySchema = z.object({
  unidade_id: z.string()
    .regex(/^\d+$/, { message: 'unidade_id deve ser um número' })
    .transform(Number)
    .refine((val) => val > 0, { message: 'unidade_id deve ser positivo' }),

  status: StatusEnum.optional(),

  data_inicio: DataSchema.optional(),

  data_fim: DataSchema.optional(),

  limit: z.string()
    .regex(/^\d+$/, { message: 'limit deve ser um número' })
    .transform(Number)
    .refine((val) => val > 0 && val <= 500, {
      message: 'limit deve estar entre 1 e 500'
    })
    .optional()
}).strict();

/**
 * Middleware de validação genérico
 * 
 * ✅ RESILIÊNCIA: Protegido contra crashes por erros mal formatados
 */
function validateRequest(schema, source = 'body') {
  return async (req, res, next) => {
    let dataToValidate;
    try {
      dataToValidate = req[source];

      // 🔍 DEBUG: Log do payload recebido
      console.log('[validateRequest] DEBUG - Validando:', {
        source,
        method: req.method,
        path: req.path,
        payload: dataToValidate,
        timestamp: new Date().toISOString()
      });

      const validatedData = await schema.parseAsync(dataToValidate);

      // Substitui os dados originais pelos dados validados
      req[source] = validatedData;

      console.log('[validateRequest] ✅ Validação passou:', {
        validatedData,
        timestamp: new Date().toISOString()
      });

      next();
    } catch (error) {
      // 🛡️ RESILIÊNCIA: Verifica se é erro Zod com Optional Chaining
      if (error instanceof z.ZodError) {
        // ✅ Proteção contra error.errors undefined/null
        const errors = (error?.errors || []).map((err) => ({
          campo: err?.path ? err.path.join('.') : 'desconhecido',
          mensagem: err?.message || 'Erro de validação',
          valor_recebido: err?.received
        }));

        // 🔍 DEBUG: Log detalhado do erro de validação
        console.error('[validateRequest] ❌ Erro de validação Zod:', {
          source,
          method: req.method,
          path: req.path,
          payload_recebido: dataToValidate,
          erros: errors,
          timestamp: new Date().toISOString()
        });

        return res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          detalhes: errors
        });
      }

      // 🛡️ RESILIÊNCIA: Erro inesperado (não Zod)
      // Loga o erro completo mas não expõe detalhes sensíveis ao cliente
      console.error('[validateRequest] Erro inesperado na validação:', {
        error: error?.message || 'Erro desconhecido',
        stack: error?.stack,
        source,
        timestamp: new Date().toISOString()
      });

      return res.status(500).json({
        success: false,
        error: 'Erro ao validar dados',
        message: error?.message || 'Erro interno de validação'
      });
    }
  };
}

module.exports = {
  createDespesaSchema,
  updateDespesaSchema,
  listDespesasQuerySchema,
  validateRequest,
  StatusEnum,
  FormaPagamentoEnum
};

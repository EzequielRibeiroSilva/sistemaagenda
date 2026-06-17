const logger = require('../utils/logger');

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

const PUBLIC_TOOLS = new Set([
  'consultar_disponibilidade',
  'validar_agendamento',
  'notificar_humano',
]);

const PROTECTED_TOOLS = new Set([
  'listar_agendamentos_cliente',
  'cancelar_agendamento',
  'atualizar_preferencias',
  'adicionar_lista_espera',
  'criar_agendamento',
]);

const TOOL_POLICY = {
  listar_agendamentos_cliente: { allowPhoneOnly: true },
  cancelar_agendamento: { requiresAgendamentoId: true },
  atualizar_preferencias: { requiresClienteId: true },
  adicionar_lista_espera: { requiresClienteId: true },
  criar_agendamento: { allowPhoneOnly: true },
};

class ToolAuthorizationValidator {
  /**
   * @param {object} input
   * @param {string} input.toolName
   * @param {object} input.args
   * @param {string} input.senderPhone
   * @param {number|string|null} [input.unidadeId]
   * @param {number|string|null} [input.clienteId]
   * @param {object} deps
   * @param {import('knex').Knex} deps.knex
   * @param {import('knex').Knex.Transaction} [deps.trx]
   */
  static async authorize(input, deps) {
    const { toolName, args, senderPhone, clienteId, unidadeId } = input || {};
    const { knex, trx } = deps || {};

    const db = trx || knex;

    if (!db) {
      return {
        ok: false,
        error: {
          message: 'Falha interna: banco de dados indisponível para validação de segurança.',
          code: 'AUTH_VALIDATION_DB_MISSING',
        },
      };
    }

    const sender = normalizePhone(senderPhone);

    if (!toolName) {
      return {
        ok: false,
        error: {
          message: 'Acesso negado. Tool inválida.',
          code: 'AUTH_TOOL_MISSING',
        },
      };
    }

    // ✅ Whitelist: tools públicas não exigem validação de ownership por ID.
    if (PUBLIC_TOOLS.has(toolName)) {
      // Ainda assim, impede cross-unit quando a tool envia unidade_id.
      const providedUnidadeId = args?.unidade_id ? parseInt(args.unidade_id, 10) : null;
      const ctxUnidadeId = unidadeId ? parseInt(unidadeId, 10) : null;
      if (Number.isInteger(providedUnidadeId) && Number.isInteger(ctxUnidadeId) && providedUnidadeId !== ctxUnidadeId) {
        return {
          ok: false,
          error: {
            message: 'Acesso negado. unidade_id inválida para esta conversa.',
            code: 'AUTH_UNIT_MISMATCH',
          },
        };
      }

      return { ok: true };
    }

    // 🔒 Deny-by-default: se não estiver explicitamente mapeada, bloqueia.
    if (!PROTECTED_TOOLS.has(toolName)) {
      return {
        ok: false,
        error: {
          message: 'Acesso negado. Ferramenta não autorizada.',
          code: 'AUTH_TOOL_NOT_ALLOWED',
        },
      };
    }

    // 🔒 Multi-tenant obrigatório: tools protegidas sempre exigem unidadeId.
    const tenantUnidadeId = unidadeId ? parseInt(unidadeId, 10) : null;
    if (!Number.isInteger(tenantUnidadeId)) {
      return {
        ok: false,
        error: {
          message: 'Acesso negado. Unidade não identificada para validação de segurança.',
          code: 'AUTH_UNIT_MISSING',
        },
      };
    }

    // Trava adicional: se args.unidade_id foi enviado, deve bater com a unidade do contexto.
    const providedUnidadeId = args?.unidade_id ? parseInt(args.unidade_id, 10) : null;
    if (Number.isInteger(providedUnidadeId) && providedUnidadeId !== tenantUnidadeId) {
      return {
        ok: false,
        error: {
          message: 'Acesso negado. unidade_id inválida para esta conversa.',
          code: 'AUTH_UNIT_MISMATCH',
        },
      };
    }

    if (!sender) {
      return {
        ok: false,
        error: {
          message: 'Acesso negado. Não foi possível identificar o telefone do remetente.',
          code: 'AUTH_SENDER_PHONE_MISSING',
        },
      };
    }

    try {
      // Se a tool permitir passar telefone_limpo explicitamente, ele precisa bater com o remetente.
      if (args?.telefone_limpo) {
        const provided = normalizePhone(args.telefone_limpo);
        if (provided && provided !== sender) {
          return {
            ok: false,
            error: {
              message: 'Acesso negado. O telefone informado não corresponde ao telefone desta conversa.',
              code: 'AUTH_PHONE_MISMATCH',
            },
          };
        }
      }

      const agendamentoId = args?.agendamento_id ? parseInt(args.agendamento_id, 10) : null;
      const effectiveClienteId = args?.cliente_id
        ? parseInt(args.cliente_id, 10)
        : (clienteId ? parseInt(clienteId, 10) : null);

      const policy = TOOL_POLICY[toolName] || {};

      if (policy.requiresAgendamentoId && !Number.isInteger(agendamentoId)) {
        return {
          ok: false,
          error: {
            message: 'Acesso negado. Parâmetro agendamento_id é obrigatório para esta ação.',
            code: 'AUTH_AGENDAMENTO_ID_REQUIRED',
          },
        };
      }

      if (policy.requiresClienteId && !Number.isInteger(effectiveClienteId)) {
        return {
          ok: false,
          error: {
            message: 'Acesso negado. Parâmetro cliente_id é obrigatório para esta ação.',
            code: 'AUTH_CLIENTE_ID_REQUIRED',
          },
        };
      }

      // 1) Se há agendamento_id, validar via join com clientes.
      if (Number.isInteger(agendamentoId)) {
        const row = await db('agendamentos')
          .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
          .where('agendamentos.id', agendamentoId)
          .where('agendamentos.unidade_id', tenantUnidadeId)
          .where('clientes.unidade_id', tenantUnidadeId)
          .whereNull('agendamentos.deleted_at')
          .select('agendamentos.id as agendamento_id', 'clientes.id as cliente_id', 'clientes.telefone_limpo')
          .first();

        if (!row) {
          return {
            ok: false,
            error: {
              message: 'Acesso negado. Agendamento não encontrado.',
              code: 'AUTH_APPOINTMENT_NOT_FOUND',
            },
          };
        }

        const ownerPhone = normalizePhone(row.telefone_limpo);
        if (!ownerPhone || ownerPhone !== sender) {
          return {
            ok: false,
            error: {
              message: 'Acesso negado. Este agendamento pertence a outro telefone.',
              code: 'AUTH_APPOINTMENT_PHONE_MISMATCH',
            },
          };
        }
      }

      // 2) Se há cliente_id (direto ou inferido), validar cliente.telefone_limpo.
      if (Number.isInteger(effectiveClienteId)) {
        const cliente = await db('clientes')
          .where('id', effectiveClienteId)
          .where('unidade_id', tenantUnidadeId)
          .whereNull('deleted_at')
          .select('id', 'telefone_limpo')
          .first();

        if (!cliente) {
          return {
            ok: false,
            error: {
              message: 'Acesso negado. Cliente não encontrado.',
              code: 'AUTH_CLIENT_NOT_FOUND',
            },
          };
        }

        const ownerPhone = normalizePhone(cliente.telefone_limpo);
        if (!ownerPhone || ownerPhone !== sender) {
          return {
            ok: false,
            error: {
              message: 'Acesso negado. Este cliente pertence a outro telefone.',
              code: 'AUTH_CLIENT_PHONE_MISMATCH',
            },
          };
        }
      }

      // 3) Tools protegidas que não carregam IDs, mas dependem da identidade do remetente.
      // Ex: listar_agendamentos_cliente / criar_agendamento.
      if (policy.allowPhoneOnly) {
        const cliente = await db('clientes')
          .where('telefone_limpo', sender)
          .where('unidade_id', tenantUnidadeId)
          .whereNull('deleted_at')
          .select('id')
          .first();

        // Se ainda não existe cliente cadastrado na unidade, permitimos (ex: primeiro contato).
        // A tool que criar/consultar precisa lidar com isso no fluxo normal.
        if (cliente) {
          return { ok: true };
        }

        return { ok: true };
      }

      // 4) Política padrão para tools protegidas: se chegou até aqui, passou.
      return { ok: true };
    } catch (err) {
      try {
        logger.error('[ToolAuthorizationValidator] Falha ao validar autorização de tool', {
          toolName,
          error: err?.message,
        });
      } catch {}

      return {
        ok: false,
        error: {
          message: 'Falha ao validar autorização. Tente novamente em instantes.',
          code: 'AUTH_VALIDATION_FAILED',
        },
      };
    }
  }
}

module.exports = ToolAuthorizationValidator;

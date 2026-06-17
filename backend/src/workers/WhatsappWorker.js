const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { db } = require('../config/knex');
const ChatSessionService = require('../services/ChatSessionService');
const aiAgentService = require('../services/AiAgentService');
const ChatCompletionService = require('../services/ChatCompletionService');
const AIAgentSchemas = require('../services/AIAgentSchemas');
const AIAvailabilityService = require('../services/AIAvailabilityService');
const CircuitBreakerService = require('../services/CircuitBreakerService');
const ContextPurgeService = require('../services/ContextPurgeService');
const CreateAppointmentUseCase = require('../useCases/CreateAppointmentUseCase');
const WhatsAppService = require('../services/WhatsAppService');
const AiSanitizer = require('../services/AiSanitizer');
const ToolAuthorizationValidator = require('../services/ToolAuthorizationValidator');
const RateLimitService = require('../services/RateLimitService');
const logger = require('../utils/logger');

let chatMessagesTableChecked = false;
let chatMessagesTableExists = false;

const DEBOUNCE_DELAY_MS = 500;
const debounceState = new Map();

function extrairJson(texto) {
  if (texto === null || texto === undefined) return null;

  if (typeof texto === 'object') {
    return texto;
  }

  const raw = String(texto);
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw;
}

function safeParseJson(str) {
  if (!str) return {};

  try {
    if (typeof str === 'object') return str;
  } catch {}

  const extracted = extrairJson(str);
  if (!extracted) return {};

  try {
    return JSON.parse(extracted);
  } catch {}

  try {
    logger.error('[Worker] safeParseJson falhou ao parsear argumentos de ferramenta', {
      rawArgs: String(str),
      extracted: String(extracted),
    });
  } catch {}

  return {};
}

/**
 * 🔥 FASE 5: MINIFICAÇÃO DE PAYLOAD DE FERRAMENTAS
 * 
 * Remove dados desnecessários dos resultados das ferramentas antes de persistir
 * no histórico. O LLM não precisa de objetos massivos como template_confirmacao,
 * dados completos de PIX, arrays de disponibilidade, etc.
 * 
 * Mantém apenas o essencial para a IA saber:
 * 1. Se a operação foi bem-sucedida (ok: true/false)
 * 2. IDs relevantes (agendamento_id, lista_espera_id, etc.)
 * 3. Mensagens de erro (se houver)
 * 4. Dados mínimos necessários para contexto
 * 
 * @param {string} toolName - Nome da ferramenta executada
 * @param {object} toolResult - Resultado completo da ferramenta
 * @returns {object} - Resultado minificado
 */
function minifyToolResult(toolName, toolResult) {
  if (!toolResult || typeof toolResult !== 'object') {
    return toolResult;
  }

  // Se a operação falhou, mantém apenas ok, error e código
  if (toolResult.ok === false) {
    return {
      ok: false,
      error: toolResult.error || { message: 'Erro desconhecido' }
    };
  }

  // Minificação específica por ferramenta
  switch (toolName) {
    case 'criar_agendamento':
      // Remove template_confirmacao (usado apenas para WhatsApp), pix completo, etc.
      return {
        ok: true,
        agendamento_id: toolResult.agendamento_id,
        message: 'Agendamento criado com sucesso',
        deveCobrarSinal: toolResult.deveCobrarSinal || false
      };

    case 'consultar_disponibilidade':
      // 🧠 PRESERVA system_directive (Chain of Thought Injetada) para combater Attention Decay
      // ⚠️ NÃO cortar os slots: enviar a lista COMPLETA. O .slice(0, 5) anterior
      // omitia horários da tarde/noite e fazia a IA responder "sem horários".
      // Um array de 10-15 horários custa pouquíssimos tokens.
      return {
        ok: true,
        total_slots: Array.isArray(toolResult.slots) ? toolResult.slots.length : 0,
        has_availability: Array.isArray(toolResult.slots) && toolResult.slots.length > 0,
        slots: Array.isArray(toolResult.slots) ? toolResult.slots : [],
        agente_trabalha_neste_dia: toolResult.agente_trabalha_neste_dia,
        system_directive: toolResult.system_directive  // ⚡ CRÍTICO: Regra injetada junto com o dado
      };

    case 'validar_agendamento':
      // Mantém apenas disponibilidade e mensagem
      return {
        ok: true,
        disponivel: toolResult.disponivel,
        message: toolResult.message || (toolResult.disponivel ? 'Horário disponível' : 'Horário indisponível')
      };

    case 'listar_agendamentos_cliente':
      // Mantém a lista completa (necessária para cancelamento), mas remove campos desnecessários
      return {
        ok: true,
        total: toolResult.total || 0,
        agendamentos: Array.isArray(toolResult.agendamentos)
          ? toolResult.agendamentos.map(a => ({
              agendamento_id: a.agendamento_id,
              data_agendamento: a.data_agendamento,
              hora_inicio: a.hora_inicio,
              status: a.status
            }))
          : []
      };

    case 'cancelar_agendamento':
      // Mantém confirmação, IDs e informações de série/estorno
      return {
        ok: true,
        agendamento_id: toolResult.agendamento_id,
        agendamentos_cancelados: toolResult.agendamentos_cancelados || 1,
        cota_consumida: toolResult.cota_consumida || false,
        estorno_aplicado: toolResult.estorno_aplicado || false,
        message: toolResult.message || 'Agendamento cancelado com sucesso'
      };

    case 'adicionar_lista_espera':
      // Mantém apenas confirmação e ID
      return {
        ok: true,
        lista_espera_id: toolResult.lista_espera_id,
        message: 'Cliente adicionado à lista de espera',
        ja_existia: toolResult.ja_existia || false
      };

    case 'atualizar_preferencias':
      // Mantém apenas confirmação
      return {
        ok: true,
        cliente_id: toolResult.cliente_id,
        message: 'Preferências atualizadas com sucesso'
      };

    case 'notificar_humano':
      // Mantém apenas confirmação
      return {
        ok: true,
        message: 'Administrador notificado com sucesso'
      };

    default:
      // Para ferramentas desconhecidas, mantém apenas ok e message
      return {
        ok: toolResult.ok,
        message: toolResult.message || 'Operação concluída'
      };
  }
}

async function loadHistory(chatSessionId) {
  const id = parseInt(chatSessionId, 10);
  if (!id) return [];

  if (!chatMessagesTableChecked) {
    chatMessagesTableChecked = true;
    try {
      chatMessagesTableExists = await db.schema.hasTable('chat_messages');
    } catch {
      chatMessagesTableExists = false;
    }
  }

  if (!chatMessagesTableExists) {
    return [];
  }

  const rows = await db('chat_messages')
    .where('chat_session_id', id)
    .select('role', 'content', 'tool_calls', 'tool_call_id', 'name', 'created_at')
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(30);

  const fullHistory = rows
    .slice()
    .reverse()
    .map(r => {
      const msg = { role: r.role };

      // 🛠️ assistant que dispara ferramentas: inclui tool_calls (array) e
      // pode ter content null (padrão OpenAI/OpenRouter para function calling).
      if (r.role === 'assistant' && r.tool_calls != null) {
        let toolCalls = r.tool_calls;
        if (typeof toolCalls === 'string') {
          try { toolCalls = JSON.parse(toolCalls); } catch { toolCalls = null; }
        }
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          msg.tool_calls = toolCalls;
          msg.content = r.content ?? null; // OpenAI aceita content null aqui
          return msg;
        }
      }

      // 🛠️ resposta de ferramenta: OBRIGATÓRIO tool_call_id (+ name) e content (resultado).
      if (r.role === 'tool') {
        msg.content = r.content ?? '';
        if (r.tool_call_id != null) msg.tool_call_id = r.tool_call_id;
        if (r.name != null) msg.name = r.name;
        return msg;
      }

      // Mensagens comuns (user / assistant textual): apenas content.
      msg.content = r.content;
      return msg;
    })
    .filter(m => {
      if (!m.role) return false;
      // assistant com tool_calls é válido mesmo com content null
      if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return true;
      // resposta de ferramenta precisa do id de ligação
      if (m.role === 'tool') return !!m.tool_call_id;
      // demais precisam de content textual
      return m.content !== null && m.content !== undefined && String(m.content).trim() !== '';
    });

  // 🔥 FASE 5: SMART PRUNING (Poda Inteligente)
  // Limita o histórico às últimas 12 mensagens para evitar estouro de tokens.
  // REGRA DE OURO: O array NUNCA pode começar com role: 'tool' (quebraria a API OpenAI).
  const MAX_MESSAGES = 12;
  
  if (fullHistory.length <= MAX_MESSAGES) {
    return fullHistory;
  }

  // Pegar as últimas MAX_MESSAGES mensagens
  let prunedHistory = fullHistory.slice(-MAX_MESSAGES);

  // 🛡️ INTEGRIDADE DA OPENAI: Remover mensagens 'tool' órfãs do início
  // Se a primeira mensagem for 'tool', significa que cortamos o 'assistant' que a originou.
  // Precisamos remover essas tools órfãs até encontrar um 'user' ou 'assistant' válido.
  while (prunedHistory.length > 0 && prunedHistory[0].role === 'tool') {
    prunedHistory.shift(); // Remove a primeira mensagem
  }

  // 🛡️ PROTEÇÃO ADICIONAL: Se após remover tools órfãs, a primeira mensagem for
  // um 'assistant' com tool_calls mas não temos as tools correspondentes, também removemos
  if (prunedHistory.length > 0 && prunedHistory[0].role === 'assistant' && prunedHistory[0].tool_calls) {
    // Verificar se existem as tools correspondentes logo após
    const firstToolCallId = prunedHistory[0].tool_calls[0]?.id;
    const hasCorrespondingTool = prunedHistory.some(
      (m, idx) => idx > 0 && m.role === 'tool' && m.tool_call_id === firstToolCallId
    );
    
    if (!hasCorrespondingTool) {
      // Assistant com tool_calls órfão (sem as respostas das tools) - remover
      prunedHistory.shift();
    }
  }

  return prunedHistory;
}

/**
 * Monta a linha a ser persistida em `chat_messages` a partir de uma mensagem no
 * formato OpenAI/OpenRouter. Inclui APENAS as colunas relevantes (limpa chaves
 * nulas) e serializa `tool_calls` para JSONB. Deixa o insert pronto para receber
 * os campos estruturais (tool_calls / tool_call_id / name) na Fase 3.
 */
function buildChatMessageRow(chatSessionId, message = {}) {
  const row = {
    chat_session_id: chatSessionId,
    role: message.role,
  };

  // content pode ser null (assistant que só dispara tool_calls).
  if (message.content !== undefined) {
    row.content = message.content;
  }

  if (message.tool_calls != null) {
    row.tool_calls = typeof message.tool_calls === 'string'
      ? message.tool_calls
      : JSON.stringify(message.tool_calls);
  }

  if (message.tool_call_id != null) {
    row.tool_call_id = message.tool_call_id;
  }

  if (message.name != null) {
    row.name = message.name;
  }

  return row;
}

const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  maxRetriesPerRequest: null
};

// ── 🧠 INSTÂNCIA REDIS PARA KILL SWITCH (FASE 2/3) ──────────────────────────
// Usada para verificar se mensagens fromMe são do bot ou de humanos.
let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(redisOptions);
    redisClient.on('error', (err) => {
      logger.error('[Worker] Redis connection error:', err);
    });
  }
  return redisClient;
}

class WhatsappWorker {
  async processPayload(payload, job = null) {
    logger.info(`[Worker] Processando job ${job?.id || 'manual'} - instância: ${payload?.instance}`);

    // ── Capturar instanceName e telefone o mais cedo possível ───────────────
    // (Task 1.3) Rate limit deve ocorrer ANTES de qualquer processamento pesado (DB, LLM).
    const instanceName = payload?.instance || payload?.data?.instance || null;

    const rawPhone = payload?.data?.key?.remoteJid
      || payload?.data?.sender
      || payload?.sender
      || payload?.data?.number
      || payload?.data?.phone
      || payload?.data?.phoneNumber;

    const telefoneLimpo = rawPhone
      ? String(rawPhone).replace(/@s\.whatsapp\.net$/i, '').replace(/\D/g, '')
      : null;

    logger.debug('[Worker] Telefone extraído', { original: rawPhone, limpo: telefoneLimpo });

    if (!telefoneLimpo) {
      logger.info('[Worker] Ignorando payload sem telefone (provável status/system message).');
      return { ok: true, skipped: 'invalid_payload_no_phone' };
    }

    // ── 🚦 RATE LIMITING (TASK 1.3) ─────────────────────────────────────────
    // Regra: no máximo 5 mensagens / 10s por telefone. 6ª envia aviso; 7ª+ drop silencioso.
    try {
      const redis = getRedisClient();
      const rate = await RateLimitService.checkWhatsappRateLimit(redis, telefoneLimpo);

      if (!rate.allowed) {
        if (rate.count === 6) {
          try {
            const whatsAppServiceRate = new WhatsAppService();
            await whatsAppServiceRate.sendMessage(
              instanceName,
              telefoneLimpo,
              'Você está enviando mensagens muito rápido. Aguarde alguns segundos.'
            );
          } catch (warnErr) {
            logger.error('[Worker] Falha ao enviar aviso de rate limit:', warnErr?.message);
          }
        }

        logger.warn('[Worker] Rate limit excedido - dropando mensagem', {
          telefone: telefoneLimpo,
          count: rate.count,
          windowSeconds: rate.windowSeconds,
        });

        return { ok: true, skipped: 'rate_limited', count: rate.count };
      }
    } catch (err) {
      // fail-open: não bloquear o cliente por instabilidade do Redis
      logger.error('[Worker] Erro no rate limiting (fail-open):', err?.message);
    }

    // Resolução de unidade por usuário (fluxo atual: usuario_id fixo).
    // TODO: substituir por resolução via instanceName quando disponível.
    const HARDCODED_USUARIO_ID = 468;

    let unidadeId = null;
    let iaHabilitada = false;

    try {
      // 🚫 GATEKEEPER DA IA: Query otimizada com JOIN para buscar unidade + flag ia_enabled
      // Performance: 1 query apenas (antes eram 2: unidade + usuário separados)
      const unidadeComUsuario = await db('unidades')
        .join('usuarios', 'unidades.usuario_id', 'usuarios.id')
        .where('unidades.usuario_id', HARDCODED_USUARIO_ID)
        .whereIn('unidades.status', ['Ativo', 'ativo', 'active'])
        .select('unidades.id', 'unidades.nome', 'usuarios.ia_enabled')
        .orderBy('unidades.id', 'asc')
        .first();

      if (unidadeComUsuario?.id) {
        unidadeId = unidadeComUsuario.id;
        iaHabilitada = Boolean(unidadeComUsuario.ia_enabled);
        
        logger.debug(`[Worker] Unidade resolvida: ${unidadeId} | IA habilitada: ${iaHabilitada}`);
      }
    } catch (err) {
      logger.error(`[Worker] Erro ao buscar unidade para usuario_id=${HARDCODED_USUARIO_ID}:`, err?.message);
    }

    // ── 🚫 GATEKEEPER: Bloquear processamento se IA desabilitada ────────────
    // Protege contra custos desnecessários ao LLM (OpenRouter)
    if (!iaHabilitada) {
      logger.info(`[Worker] 🚫 IA DESABILITADA para usuario_id=${HARDCODED_USUARIO_ID} | Mensagem ignorada`);
      return { ok: true, skipped: 'ia_disabled' };
    }

    // ── 🛡️ GUARDA DE MENSAGEM (GUARD CLAUSE) ────────────────────────────────
    // A partir daqui unidadeId precisa estar resolvida.
    if (!unidadeId) {
      logger.info('[Worker] Ignorando payload sem unidade (provável status/system message).');
      return { ok: true, skipped: 'invalid_payload_no_unit' };
    }

    // ── 🚨 KILL SWITCH DEFINITIVO (FASE 3) ──────────────────────────────────
    // Extrai a flag fromMe para detectar mensagens enviadas pela própria instância.
    // Consulta o Redis para distinguir se é do BOT (ignorar) ou do HUMANO (pausar).
    const fromMe = payload?.data?.key?.fromMe === true;
    if (fromMe) {
      const messageId = payload?.data?.key?.id;
      
      if (!messageId) {
        logger.warn('[Worker] Mensagem fromMe sem ID - ignorando por segurança');
        return { ok: true, skipped: 'from_me_no_id' };
      }

      // Consultar Redis: essa mensagem foi enviada pelo bot?
      const redis = getRedisClient();
      let isBotMessage = false;
      
      try {
        const exists = await redis.exists(`bot_msg:${messageId}`);
        isBotMessage = exists === 1;
      } catch (redisErr) {
        logger.error('[Worker] Erro ao consultar Redis (Kill Switch):', redisErr.message);
        // Em caso de erro no Redis, assumir que é do bot para evitar pausas incorretas
        return { ok: true, skipped: 'from_me_redis_error' };
      }

      if (isBotMessage) {
        // É uma mensagem enviada pelo bot - apenas ignorar (echo normal)
        logger.debug(`[Worker] Ignorando echo do bot (message_id: ${messageId})`);
        return { ok: true, skipped: 'bot_echo' };
      }

      // ⚠️ NÃO ESTÁ NO REDIS → É DO HUMANO! Ativar Kill Switch
      logger.info(`[Worker] 🛑 KILL SWITCH ATIVADO - Humano assumiu conversa (message_id: ${messageId})`);
      
      try {
        await ChatSessionService.pauseSession(unidadeId, telefoneLimpo, 'human_intervention');
        logger.info(`[Worker] ✅ Sessão pausada com sucesso | unidade=${unidadeId} | telefone=${telefoneLimpo}`);
      } catch (pauseErr) {
        logger.error('[Worker] Erro ao pausar sessão:', pauseErr.message);
      }
      
      return { ok: true, reason: 'kill_switch_activated' };
    }

    const shouldProcess = await ChatSessionService.shouldProcessMessage(unidadeId, telefoneLimpo);
    if (!shouldProcess) {
      return true;
    }

    const chatSession = await ChatSessionService.getOrCreateSession(unidadeId, telefoneLimpo);

    const messageText = payload?.data?.message?.conversation
      || payload?.data?.message?.text
      || payload?.data?.message?.extendedTextMessage?.text
      || payload?.data?.message?.imageMessage?.caption
      || payload?.data?.message?.videoMessage?.caption
      || payload?.data?.text
      || payload?.data?.body
      || payload?.message
      || payload?.text;

    const isDirectTextMessage = Boolean(
      payload?.data?.message?.conversation
      || payload?.data?.message?.text
      || payload?.data?.message?.extendedTextMessage?.text
      || payload?.data?.text
      || payload?.data?.body
      || payload?.message
      || payload?.text
    );

    // ── Detectar mensagens de mídia sem texto ─────────────────────────────────
    const isMediaOnly =
      !messageText &&
      (payload?.data?.message?.imageMessage ||
        payload?.data?.message?.audioMessage ||
        payload?.data?.message?.videoMessage ||
        payload?.data?.message?.documentMessage ||
        payload?.data?.message?.stickerMessage);

    if (isMediaOnly) {
      logger.info('[Worker] Mensagem de mídia sem texto — respondendo com fallback');
      const whatsAppServiceMedia = new WhatsAppService();
      const fallbackText = 'Desculpe, ainda não consigo processar mídias, apenas texto.';
      await whatsAppServiceMedia.sendMessage(instanceName, telefoneLimpo, fallbackText);
      return { ok: true, skipped: 'media_only' };
    }

    if (isDirectTextMessage && messageText) {
      const debounceKey = `${unidadeId}:${telefoneLimpo}`;
      const currentJobId = String(job?.id || `manual:${Date.now()}:${Math.random()}`);
      const existing = debounceState.get(debounceKey);

      if (!existing) {
        const entry = {
          parts: [String(messageText)],
          leaderJobId: currentJobId,
          resolve: null,
          promise: null,
          timer: null,
        };

        entry.promise = new Promise((resolve) => {
          entry.resolve = resolve;
        });

        entry.timer = setTimeout(() => {
          try {
            const aggregated = entry.parts.join('\n');
            debounceState.delete(debounceKey);
            entry.resolve(aggregated);
          } catch (err) {
            debounceState.delete(debounceKey);
            entry.resolve(String(messageText));
          }
        }, DEBOUNCE_DELAY_MS);

        debounceState.set(debounceKey, entry);

        const aggregatedText = await entry.promise;
        payload = {
          ...payload,
          __debounced: true,
          __debouncedText: aggregatedText,
        };
      } else {
        existing.parts.push(String(messageText));
        try {
          clearTimeout(existing.timer);
        } catch {}
        existing.timer = setTimeout(() => {
          try {
            const aggregated = existing.parts.join('\n');
            debounceState.delete(debounceKey);
            existing.resolve(aggregated);
          } catch (err) {
            debounceState.delete(debounceKey);
            existing.resolve(existing.parts.join('\n'));
          }
        }, DEBOUNCE_DELAY_MS);

        return { ok: true, skipped: 'debounced', debounceMs: DEBOUNCE_DELAY_MS };
      }
    }

    const finalMessageText = payload?.__debouncedText || messageText;

    try {
      const content = finalMessageText ? String(finalMessageText).trim() : '';
      if (content && chatSession?.id) {
        await db('chat_messages').insert(
          buildChatMessageRow(chatSession.id, { role: 'user', content })
        );
      }
    } catch (err) {
      logger.error('[Worker] Falha ao persistir mensagem do usuário em chat_messages', {
        error: err?.message,
        chat_session_id: chatSession?.id,
        unidade_id: unidadeId,
        telefone: telefoneLimpo,
      });
    }

    const history = await loadHistory(chatSession?.id);
    
    // ── Buscar contexto da unidade para a IA ────────────────────────────────
    // A IA precisa saber: nome da barbearia, serviços disponíveis, data atual, perfil de atendimento
    let unidadeContexto = null;
    let servicosContexto = [];
    let clienteNome = null;
    let agentesContexto = [];
    let configPerfil = null;
    let clienteId = null;
    // ✅ INICIALIZAÇÃO DEFENSIVA: nunca undefined, sempre objeto seguro
    let preferenciasCliente = { profissional_nome: null, observacoes: null };

    // ⚡ OTIMIZAÇÃO DE LATÊNCIA: unidade, serviços, agentes e cliente são
    // consultas independentes — executadas em paralelo (Promise.all).
    // As preferências dependem do clienteId, por isso ficam fora do batch.
    try {
      const [unidadeRow, servicos, agentes, cliente] = await Promise.all([
        db('unidades')
          .where('id', unidadeId)
          .select('nome', 'config_perfil')
          .first(),
        db('servicos')
          .where('usuario_id', HARDCODED_USUARIO_ID)
          .where('status', 'Ativo')
          .select('id', 'nome', 'duracao_minutos', 'preco')
          .orderBy('nome', 'asc'),
        db('agentes')
          .where('unidade_id', unidadeId)
          .where('status', 'Ativo')
          .select('id', 'nome')
          .orderBy('nome', 'asc'),
        db('clientes')
          .where('telefone_limpo', telefoneLimpo)
          .where('unidade_id', unidadeId)
          .select('id', 'primeiro_nome', 'ultimo_nome')
          .first(),
      ]);

      unidadeContexto = unidadeRow || null;
      servicosContexto = servicos || [];
      agentesContexto = agentes || [];

      // Parse do config_perfil (JSON) — white-label
      if (unidadeContexto?.config_perfil) {
        try {
          configPerfil = typeof unidadeContexto.config_perfil === 'string'
            ? JSON.parse(unidadeContexto.config_perfil)
            : unidadeContexto.config_perfil;
        } catch (parseErr) {
          logger.warn('[Worker] Erro ao parsear config_perfil - usando padrão', { error: parseErr.message });
          configPerfil = null;
        }
      }

      if (cliente) {
        clienteId = cliente.id;
        const primeiroNome = String(cliente.primeiro_nome || '').trim();
        const ultimoNome = String(cliente.ultimo_nome || '').trim();
        clienteNome = `${primeiroNome} ${ultimoNome}`.trim() || null;
      }

      // 🧠 FASE 3: MEMÓRIA DE PREFERÊNCIAS (depende do clienteId)
      if (clienteId) {
        try {
          const preferencias = await db('cliente_preferencias')
            .leftJoin('agentes', 'cliente_preferencias.profissional_preferido_id', 'agentes.id')
            .where('cliente_preferencias.cliente_id', clienteId)
            .select(
              'cliente_preferencias.profissional_preferido_id',
              'cliente_preferencias.observacoes_preferencia',
              db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as profissional_nome")
            )
            .first();

          if (preferencias) {
            preferenciasCliente = {
              profissional_preferido_id: preferencias.profissional_preferido_id,
              profissional_nome: String(preferencias.profissional_nome || '').trim() || null,
              observacoes: preferencias.observacoes_preferencia
            };
          }
        } catch (prefErr) {
          logger.warn('[Worker] Erro ao buscar preferências do cliente', { error: prefErr.message });
        }
      }

      logger.debug('[Worker] Contexto da IA carregado', {
        unidade: unidadeContexto?.nome,
        servicos: servicosContexto.length,
        agentes: agentesContexto.length,
        clienteId,
      });
    } catch (err) {
      logger.error('[Worker] Erro ao buscar contexto da unidade para IA', {
        error: err?.message,
        unidade_id: unidadeId,
      });
    }

    // ── 🎨 CONSTRUÇÃO DINÂMICA DO SYSTEM PROMPT (WHITE-LABEL) ────────────────
    const dataAtual = new Date().toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const nomeUnidade = unidadeContexto?.nome || 'nosso estabelecimento';

    // 🎯 IDENTIDADE DINÂMICA (Fase 1 - White-Label)
    // Extrai configurações do perfil ou usa valores padrão
    const nomeAssistenteRaw = configPerfil?.nome_assistente || 'assistente virtual';
    const tomDeVozRaw = configPerfil?.tom_de_voz || 'Profissional';
    const saudacaoPersonalizadaRaw = configPerfil?.saudacao_personalizada || null;

    // Mapeamento de tom de voz para instruções de comportamento
    const tomsDeVoz = {
      'Formal': 'Seja extremamente profissional, use linguagem formal e evite gírias. Trate o cliente com "senhor" ou "senhora".',
      'Profissional': 'Seja profissional, mas acessível. Use linguagem clara e educada.',
      'Descontraído': 'Seja amigável e descontraído, mas mantenha o profissionalismo. Pode usar emojis ocasionalmente.',
      'Jovem': 'Seja jovem, dinâmico e use uma linguagem mais casual. Use emojis para deixar a conversa mais leve.',
      'Caloroso': 'Seja extremamente acolhedor e empático. Demonstre genuíno interesse pelo cliente.'
    };

    // 🔒 SANITIZAÇÃO DE SEGURANÇA (Sprint 1 - Task 1.1)
    // Aplica sanitização em todas as variáveis dinâmicas antes da injeção no prompt
    const promptContext = {
      nomeAssistente: nomeAssistenteRaw,
      nomeUnidade: nomeUnidade,
      tomDeVoz: tomDeVozRaw,
      saudacaoPersonalizada: saudacaoPersonalizadaRaw,
      unidadeId: unidadeId,
      clienteId: clienteId,
      clienteNome: clienteNome,
      dataAtual: dataAtual
    };

    // Aplica sanitização robusta contra prompt injection
    const sanitizedContext = AiSanitizer.sanitizePromptContext(promptContext);

    // Usa variáveis sanitizadas a partir daqui
    const nomeAssistente = sanitizedContext.nomeAssistente;
    const tomDeVoz = AiSanitizer.sanitizeTone(tomDeVozRaw);
    const saudacaoPersonalizada = sanitizedContext.saudacaoPersonalizada;
    const instrucaoTom = AiSanitizer.sanitizeGenericText(
      tomsDeVoz[tomDeVoz] || tomsDeVoz['Profissional'], 
      300
    );

    const servicosTexto = servicosContexto.length > 0
      ? AiSanitizer.sanitizeGenericText(
          servicosContexto.map(s => `- ${s.nome} (ID: ${s.id}, ${s.duracao_minutos} min, R$ ${parseFloat(s.preco).toFixed(2)})`).join('\n'),
          2000
        )
      : 'Aguarde enquanto verifico os serviços disponíveis';

    const agentesTexto = agentesContexto.length > 0
      ? AiSanitizer.sanitizeGenericText(
          agentesContexto.map(a => `- ${a.nome} (ID: ${a.id})`).join('\n'),
          2000
        )
      : 'Aguarde enquanto verifico os profissionais disponíveis';

    const clienteSaudacao = sanitizedContext.clienteNome 
      ? AiSanitizer.sanitizeGreeting(`O cliente se chama ${sanitizedContext.clienteNome}.`) 
      : '';

    // 🧠 FASE 3: FORMATAÇÃO DE PREFERÊNCIAS PARA O PROMPT
    // ✅ Acesso seguro (preferenciasCliente é sempre objeto, nunca undefined)
    const prefNome = preferenciasCliente?.profissional_nome || 'não definido';
    const temPreferencias = !!(preferenciasCliente?.profissional_nome || preferenciasCliente?.observacoes);

    let preferenciasTexto = '';
    if (temPreferencias) {
      const partes = [];

      if (preferenciasCliente?.profissional_nome) {
        const profissionalNomeSanitizado = AiSanitizer.sanitizeGenericText(preferenciasCliente.profissional_nome, 100);
        const profissionalIdSanitizado = AiSanitizer.sanitizeId(preferenciasCliente.profissional_preferido_id);
        partes.push(`Profissional preferido: ${profissionalNomeSanitizado} (ID: ${profissionalIdSanitizado})`);
      }

      if (preferenciasCliente?.observacoes) {
        const observacoesSanitizadas = AiSanitizer.sanitizePreferences(preferenciasCliente.observacoes);
        partes.push(`Observações: ${observacoesSanitizadas}`);
      }

      if (partes.length > 0) {
        preferenciasTexto = `\n\n🧠 PREFERÊNCIAS DO CLIENTE (MEMÓRIA DE LONGO PRAZO):\n${partes.join('\n')}`;
      }
    }

    // 🎯 SYSTEM PROMPT DINÂMICO E WHITE-LABEL
    const systemPrompt = `Você é ${nomeAssistente} de ${AiSanitizer.sanitizeUnitName(nomeUnidade)}.

📅 Data de hoje: ${AiSanitizer.sanitizeGenericText(dataAtual, 50)}

${clienteSaudacao}${preferenciasTexto}

🏢 ID da Unidade: ${AiSanitizer.sanitizeId(unidadeId)}
${sanitizedContext.clienteId ? `👤 ID do Cliente: ${sanitizedContext.clienteId}` : ''}

[SCOPE] ONLY agendamentos + info da unidade (serviços, profissionais, horários) + lista de espera + preferências. OFFTOPIC -> 1 frase curta + redirecionar para agendar.
[STYLE] ${instrucaoTom}${saudacaoPersonalizada ? ` | Saudação: "${saudacaoPersonalizada}"` : ''}

[TOOLS] Use ferramentas para saber fatos. NUNCA presuma agenda/horários. Para qualquer pergunta de agenda/disponibilidade -> chamar consultar_disponibilidade.
Sempre use unidade_id=${sanitizedContext.unidadeId}. Nunca use IDs fixos.

[PIX_RULE] Se criar_agendamento retornar ok=true e deveCobrarSinal=true:
- Status = PRÉ-RESERVADO (NÃO confirmar).
- Extrair pix.qr_code_copy (string exata começando "00020126...").
- Enviar o código entre crases triplas. Dizer: "Sinal necessário. PIX expira em 15m. Reconhecimento automático; NÃO envie comprovante.".
- Proibido: escrever "pix.qr_code_copy" literalmente, placeholders ({campo}), pedir comprovante, omitir agendamento_id.
Se deveCobrarSinal=false: confirmar normalmente.

[BOOK_FLOW] Para criar agendamento:
1) Perguntar serviço (obrigatório). 2) Cliente escolhe profissional. 3) Consultar disponibilidade. 4) Cliente escolhe horário. 5) Validar_agendamento. 6) Pedir confirmação final. 7) criar_agendamento 1x.
Proibido: criar_agendamento sem serviço, com servicos=[], ou mais de 1 vez. Se já tem agendamento_id -> não chamar novamente.
Cliente novo: só pedir nome se não existir no contexto; usar cliente_nome.

[PREF] Se cliente mencionar preferência NOVA/MUDANÇA -> atualizar_preferencias (cliente_id: ${sanitizedContext.clienteId}).
${temPreferencias ? `Cliente tem preferência; se fizer sentido, ofereça: "Quer marcar com ${AiSanitizer.sanitizeGenericText(prefNome, 50)} como de costume?" (ID ${AiSanitizer.sanitizeId(preferenciasCliente?.profissional_preferido_id)}).` : 'Cliente sem preferências; registre apenas se ele declarar explicitamente.'}

👥 EQUIPE DA UNIDADE (Profissionais Cadastrados):
${agentesTexto}

🎯 Serviços disponíveis:
${servicosTexto}

[LISTAR] Se cliente perguntar "tenho horário?" -> listar_agendamentos_cliente.
[ID] Para cancelar/alterar, usar agendamento_id real (se não tiver -> listar_agendamentos_cliente).

[CANCEL_RETENCAO] Só para cancelamento pacífico: perguntar motivo -> oferecer reagendar -> se insistir, cancelar_agendamento.
Motivo: usar texto real do cliente. Ao cancelar, mencionar agendamento_id.
Série: perguntar "este" vs "todos futuros"; cancelar_serie=true/false.

[WAITLIST_TREE] Após consultar_disponibilidade:
IF agente_trabalha_neste_dia=false -> PROIBIDO lista de espera; oferecer alternativas.
IF true AND slots>0 -> vender horários disponíveis; PROIBIDO lista de espera.
IF true AND slots==0 -> pode oferecer lista de espera; se aceitar -> adicionar_lista_espera.

[CRISE] Se irritação/raiva/xingamento/CAPS/"horrível" etc OU 3 turnos sem resolver:
1) notificar_humano (motivo=mensagem literal, nivel_urgencia=alta/media, mensagem_cliente).
2) Responder empático e finalizar.
Em cancelamento com PIX pago: avisar que estorno PIX não é automático (tratar com estabelecimento).
Exceção: se já concluiu com sucesso (agendamento criado e confirmado com ID), não acionar crise por limite.`;

    const whatsAppService = new WhatsAppService();

    const tools = Array.isArray(AIAgentSchemas)
      ? AIAgentSchemas
      : Object.values(AIAgentSchemas || {});

    const TOOL_CALL_DEPTH_LIMIT = 5;
    let depth = 0;
    let currentHistory = Array.isArray(history) ? [...history] : [];

    const toolCallsExecuted = [];

    // ── 🔒 BLOQUEIO DE DUPLICIDADE ───────────────────────────────────────────
    // Garante que criar_agendamento seja executado no máximo uma vez por rodada,
    // mesmo que a IA dispare a ferramenta várias vezes (pré-validação + confirmação).
    let agendamentoJaCriado = false;
    let agendamentoCriadoResult = null;
    // 🧹 Marca cancelamento bem-sucedido para limpeza de contexto pós-fluxo.
    let agendamentoCancelado = false;
    // 🧹 Garante que a limpeza seletiva de histórico ocorra apenas uma vez por job.
    let historyCleaned = false;

    let aiResult;

    const redis = getRedisClient();
    const circuit = await CircuitBreakerService.isOpen(redis, unidadeId);
    if (circuit.open) {
      try {
        await ChatSessionService.pauseSession(unidadeId, telefoneLimpo, 'circuit_breaker_open');
      } catch (pauseErr) {
        logger.error('[Worker] Erro ao pausar sessão (circuit breaker):', pauseErr?.message);
      }

      try {
        const notifyKey = `circuit_breaker:ia_notified:${unidadeId}`;
        const setNotify = await redis.set(notifyKey, '1', 'EX', Math.max(60, circuit.ttlSeconds || 900), 'NX');
        const shouldNotify = setNotify === 'OK';

        if (shouldNotify) {
          const motivo = 'IA indisponível (circuit breaker)';
          const mensagemCliente = finalMessageText || messageText || 'Não especificado';
          const nivelUrgencia = 'alta';

          let telefonesGerentes = [];
          if (unidadeId) {
            const gerentes = await db('agentes')
              .where('unidade_id', unidadeId)
              .where('status', 'Ativo')
              .where('notifica_crise', true)
              .whereNull('deleted_at')
              .select('id', 'nome', 'telefone');

            if (gerentes && gerentes.length > 0) {
              telefonesGerentes = gerentes
                .filter(g => g.telefone)
                .map(g => ({
                  id: g.id,
                  nome: g.nome,
                  telefone: String(g.telefone).replace(/\D/g, '')
                }))
                .filter(g => g.telefone.length >= 10);
            }
          }

          if (telefonesGerentes.length > 0) {
            const mensagemNotificacao = `🔴 *ALERTA CRÍTICO: A Recepcionista IA está temporariamente inativa. Por favor, assuma os atendimentos no WhatsApp.*

*Unidade:* ${nomeUnidade}
*Cliente:* ${telefoneLimpo}
${clienteNome ? `*Nome:* ${clienteNome}` : ''}
*Nível de Urgência:* ${nivelUrgencia.toUpperCase()}

*Motivo:*
${motivo}

*Última mensagem do cliente:*
"${mensagemCliente}"`;

            await Promise.all(
              telefonesGerentes.map(gerente =>
                whatsAppService.sendMessage(instanceName, gerente.telefone, mensagemNotificacao)
                  .then(() => {
                    logger.info(`[Worker] Alerta de circuito enviado para gerente ${gerente.nome} (${gerente.telefone})`);
                    return true;
                  })
                  .catch(err => {
                    logger.error(`[Worker] Erro ao enviar alerta de circuito para ${gerente.nome}:`, err?.message);
                    return false;
                  })
              )
            );
          }
        }
      } catch (notifyErr) {
        logger.error('[Worker] Erro ao notificar gerentes (circuit breaker):', notifyErr?.message);
      }

      try {
        await whatsAppService.sendMessage(
          instanceName,
          telefoneLimpo,
          'No momento estou com lentidão no sistema, mas um humano da nossa equipe te atenderá em breve.'
        );
      } catch (fallbackErr) {
        logger.error('[Worker] Erro ao enviar fallback ao cliente (circuit breaker):', fallbackErr?.message);
      }

      return { ok: true, skipped: 'circuit_breaker_open', ttlSeconds: circuit.ttlSeconds || null };
    }

    try {
      aiResult = await aiAgentService.processMessage({
        message: finalMessageText,
        history: currentHistory,
        tools,
        systemPrompt,
        unidadeId,
        redis,
      });
    } catch (err) {
      if (err?.circuitBreaker?.openedNow) {
        try {
          await ChatSessionService.pauseSession(unidadeId, telefoneLimpo, 'circuit_breaker_opened_now');
        } catch (pauseErr) {
          logger.error('[Worker] Erro ao pausar sessão (circuit breaker open):', pauseErr?.message);
        }

        try {
          const notifyKey = `circuit_breaker:ia_notified:${unidadeId}`;
          const setNotify = await redis.set(notifyKey, '1', 'EX', Math.max(60, err?.circuitBreaker?.openTtlSeconds || 900), 'NX');
          const shouldNotify = setNotify === 'OK';

          if (!shouldNotify) {
            throw new Error('Circuit breaker openedNow: notificação já enviada nesta janela');
          }

          const motivo = 'IA indisponível (circuit breaker - 3 falhas consecutivas)';
          const mensagemCliente = finalMessageText || messageText || 'Não especificado';
          const nivelUrgencia = 'alta';

          logger.warn('[Worker] Circuit breaker abriu - notificando equipe', {
            unidade_id: unidadeId,
            telefone: telefoneLimpo,
            motivo,
            nivelUrgencia,
          });

          let telefonesGerentes = [];

          if (unidadeId) {
            const gerentes = await db('agentes')
              .where('unidade_id', unidadeId)
              .where('status', 'Ativo')
              .where('notifica_crise', true)
              .whereNull('deleted_at')
              .select('id', 'nome', 'telefone');

            if (gerentes && gerentes.length > 0) {
              telefonesGerentes = gerentes
                .filter(g => g.telefone)
                .map(g => ({
                  id: g.id,
                  nome: g.nome,
                  telefone: String(g.telefone).replace(/\D/g, '')
                }))
                .filter(g => g.telefone.length >= 10);
            }
          }

          if (telefonesGerentes.length > 0) {
            const mensagemNotificacao = `🔴 *ALERTA CRÍTICO: A Recepcionista IA está temporariamente inativa.*

*Unidade:* ${nomeUnidade}
*Cliente:* ${telefoneLimpo}
${clienteNome ? `*Nome:* ${clienteNome}` : ''}

*Última mensagem do cliente:*
"${mensagemCliente}"

*Ação necessária:* Por favor, assuma os atendimentos no WhatsApp.`;

            await Promise.all(
              telefonesGerentes.map(gerente =>
                whatsAppService.sendMessage(instanceName, gerente.telefone, mensagemNotificacao)
                  .then(() => {
                    logger.info(`[Worker] Alerta enviado para gerente ${gerente.nome} (${gerente.telefone})`);
                    return true;
                  })
                  .catch(sendErr => {
                    logger.error(`[Worker] Erro ao enviar alerta para ${gerente.nome}:`, sendErr?.message);
                    return false;
                  })
              )
            );
          }
        } catch (notifyErr) {
          logger.error('[Worker] Erro ao notificar gerentes (circuit breaker openedNow):', notifyErr?.message);
        }

        try {
          await whatsAppService.sendMessage(
            instanceName,
            telefoneLimpo,
            'No momento estou com lentidão no sistema, mas um humano da nossa equipe te atenderá em breve.'
          );
        } catch (fallbackErr) {
          logger.error('[Worker] Erro ao enviar fallback ao cliente (circuit breaker openedNow):', fallbackErr?.message);
        }

        return { ok: true, skipped: 'circuit_breaker_opened_now' };
      }

      const is429 =
        err?.status === 429 ||
        err?.statusCode === 429 ||
        String(err?.message || '').includes('429') ||
        String(err?.message || '').toLowerCase().includes('rate limit');

      if (is429) {
        logger.error('[Worker] Erro de Rate Limit - abortando tentativa para evitar banimento');
        const rateErr = new Error('429 Rate limit atingido no OpenRouter');
        rateErr.status = 429;
        throw rateErr;
      }
      throw err;
    }

    logger.debug('[Worker] AI response received', {
      chat_session_id: chatSession?.id,
      unidade_id: unidadeId,
      telefone: telefoneLimpo,
      has_tool_calls: Array.isArray(aiResult?.toolCalls) && aiResult.toolCalls.length > 0,
    });

    // 🛡️ TRAVA DE INTERCEPÇÃO: FORÇAR USO DA FERRAMENTA QUANDO DETECTAR INTENÇÃO DE AGENDA
    // 
    // Problema: O LLM (GPT-4o-mini) está burlando o System Prompt e respondendo diretamente
    // sobre horários/dias sem consultar a ferramenta consultar_disponibilidade, gerando alucinações.
    // 
    // Solução: Intercepção arquitetural que detecta intenção de agenda no messageText do usuário
    // e FORÇA a IA a reprocessar caso ela tenha respondido sem usar a ferramenta.
    // 
    // Fluxo:
    // 1. Detectar se a mensagem do usuário tem palavras-chave de agenda (regex)
    // 2. Verificar se a IA retornou texto (content) SEM toolCalls
    // 3. Se SIM, descartar a resposta, adicionar ordem do sistema e reprocessar (máx 1 retry)
    const INTENT_AGENDA_REGEX = /\b(horário|agenda|vaga|disponível|disponivel|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|hoje|amanhã|amanha|marcar|agendar|damião|damiao|joão|joao)\b/i;
    
    const hasAgendaIntent = INTENT_AGENDA_REGEX.test(messageText || '');
    const hasToolCalls = Array.isArray(aiResult?.toolCalls) && aiResult.toolCalls.length > 0;
    const hasContent = aiResult?.content && String(aiResult.content).trim() !== '';
    
    // 🚨 DETECÇÃO DE ALUCINAÇÃO: Cliente perguntou sobre agenda, mas IA respondeu texto sem ferramenta
    if (hasAgendaIntent && !hasToolCalls && hasContent) {
      logger.warn('[Worker] ⚠️ INTERCEPÇÃO DE ALUCINAÇÃO: Cliente perguntou sobre agenda, mas IA tentou responder sem consultar ferramenta', {
        message_text: messageText,
        ai_content: aiResult.content,
        chat_session_id: chatSession?.id,
      });
      
      // 🔄 RETRY COM ORDEM FORÇADA DO SISTEMA (máximo 1 tentativa)
      try {
        // Adicionar mensagem invisível do sistema forçando o uso da ferramenta
        const retryHistory = [
          ...currentHistory,
          { role: 'user', content: messageText },
          { 
            role: 'system', 
            content: `🚨 ALERTA DE SISTEMA - VIOLAÇÃO CRÍTICA DETECTADA:

O cliente perguntou sobre horários, dias da semana ou disponibilidade de profissionais.

Você tentou responder com texto direto SEM chamar a ferramenta consultar_disponibilidade.

Isso é ESTRITAMENTE PROIBIDO e gera ALUCINAÇÃO (informação incorreta ao cliente).

📐 ORDEM IMEDIATA (NÃO NEGOCIÁVEL):
1. Chame IMEDIATAMENTE a ferramenta consultar_disponibilidade com os parâmetros relevantes extraídos da mensagem do cliente
2. NÃO responda com texto até receber o resultado da ferramenta
3. Baseie sua resposta EXCLUSIVAMENTE no que a ferramenta retornar

⛔ Se você responder novamente sem chamar a ferramenta, o sistema bloqueará o envio da mensagem ao cliente.

Chame a ferramenta AGORA.` 
          }
        ];
        
        logger.info('[Worker] 🔄 Reprocessando mensagem com ordem forçada do sistema');
        
        aiResult = await aiAgentService.processMessage({
          message: '', // Não repetir a mensagem do usuário (já está no history)
          history: retryHistory,
          tools,
          systemPrompt,
          unidadeId,
          redis,
        });
        
        // Verificar se a IA obedeceu na segunda tentativa
        const hasToolCallsRetry = Array.isArray(aiResult?.toolCalls) && aiResult.toolCalls.length > 0;
        
        if (!hasToolCallsRetry) {
          // IA continuou desobedecendo: bloquear envio e alertar administrador
          logger.error('[Worker] 🔥 BLOQUEIO CRÍTICO: IA ignorou ordem do sistema após retry - bloqueando resposta ao cliente', {
            ai_result: aiResult,
            chat_session_id: chatSession?.id,
          });
          
          // Enviar mensagem de segurança ao cliente
          await whatsAppService.sendMessage(
            instanceName,
            telefoneLimpo,
            'Desculpe, estou com dificuldades técnicas para consultar a agenda no momento. Por favor, aguarde alguns instantes e tente novamente.'
          );
          
          return { ok: true, blocked_hallucination: true, retry_failed: true };
        }
        
        logger.info('[Worker] ✅ Retry bem-sucedido: IA chamou ferramenta após interceptação', {
          tool_calls_count: aiResult.toolCalls.length,
          chat_session_id: chatSession?.id,
        });
        
      } catch (retryErr) {
        logger.error('[Worker] Erro no retry de interceptação - continuando com resposta original (não ideal)', {
          error: retryErr?.message,
          chat_session_id: chatSession?.id,
        });
        // Continua com a resposta original (fallback)
      }
    }

    while (Array.isArray(aiResult?.toolCalls) && aiResult.toolCalls.length > 0 && depth < TOOL_CALL_DEPTH_LIMIT) {
      depth += 1;

      // 🔄 FASE 3: PERSISTÊNCIA IMEDIATA - Salvar a mensagem do assistant com tool_calls
      // ANTES de executar as ferramentas (garante que o histórico estrutural seja preservado)
      const assistantMessage = {
        role: 'assistant',
        content: aiResult?.content || null,
        tool_calls: aiResult.toolCalls,
      };

      // Persistir no banco IMEDIATAMENTE
      if (chatSession?.id) {
        try {
          await db('chat_messages').insert(
            buildChatMessageRow(chatSession.id, assistantMessage)
          );
          logger.debug('[Worker] [FASE 3] Mensagem do assistant com tool_calls persistida no banco');
        } catch (err) {
          logger.error('[Worker] Falha ao persistir assistant tool_calls em chat_messages', {
            error: err?.message,
            chat_session_id: chatSession?.id,
          });
        }
      }

      for (const toolCall of aiResult.toolCalls) {
        const toolName = toolCall?.function?.name;
        const rawArgs = toolCall?.function?.arguments;

        if (toolName) {
          toolCallsExecuted.push(toolName);
        }

        const args = safeParseJson(rawArgs);

        logger.debug(`[Worker] IA chamou ferramenta: ${toolName}`, { args });

        let toolResult;
        try {
          const authorization = await ToolAuthorizationValidator.authorize({
            toolName,
            args,
            senderPhone: telefoneLimpo,
            unidadeId,
            clienteId,
          }, { knex: db });

          if (!authorization?.ok) {
            toolResult = authorization;
          } else if (toolName === 'listar_agendamentos_cliente') {
            // 📋 CONSULTA: Lista os agendamentos futuros (Aprovado) do cliente
            const telefoneParaBusca = String(args?.telefone_limpo || '').replace(/\D/g, '') || telefoneLimpo;
            logger.debug(`[Worker] Listando agendamentos futuros do cliente (telefone_limpo=${telefoneParaBusca})`);

            if (!telefoneParaBusca) {
              toolResult = { ok: false, error: { message: 'Telefone do cliente não disponível para a consulta.', code: 'MISSING_PHONE' } };
            } else {
              const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

              let query = db('agendamentos')
                .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
                .leftJoin('agentes', 'agendamentos.agente_id', 'agentes.id')
                .where('clientes.telefone_limpo', telefoneParaBusca)
                .where('agendamentos.status', 'Aprovado')
                .whereNull('agendamentos.deleted_at')
                .where('agendamentos.data_agendamento', '>=', hoje);

              if (unidadeId) {
                query = query.where('agendamentos.unidade_id', unidadeId);
              }

              const agendamentos = await query
                .select(
                  'agendamentos.id',
                  'agendamentos.data_agendamento',
                  'agendamentos.hora_inicio',
                  'agendamentos.hora_fim',
                  'agendamentos.status',
                  db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome")
                )
                .orderBy('agendamentos.data_agendamento', 'asc')
                .orderBy('agendamentos.hora_inicio', 'asc');

              logger.debug(`[Worker] ${agendamentos.length} agendamento(s) futuro(s) encontrado(s) para o cliente`);

              toolResult = {
                ok: true,
                total: agendamentos.length,
                agendamentos: agendamentos.map(a => ({
                  agendamento_id: a.id,
                  data_agendamento: a.data_agendamento,
                  hora_inicio: a.hora_inicio,
                  hora_fim: a.hora_fim,
                  status: a.status,
                  profissional: String(a.agente_nome || '').trim() || null
                }))
              };
            }
          } else if (toolName === 'validar_agendamento') {
            // 🔍 VALIDAÇÃO SEM CRIAÇÃO: Verifica se o horário está livre
            logger.debug('[Worker] Validando disponibilidade do horário', { args });
            
            const BookingAvailabilityService = require('../services/BookingAvailabilityService');
            const bookingAvailabilityService = new BookingAvailabilityService();
            
            function timeToMinutes(time) {
              const [hours, minutes] = String(time).split(':').map(Number);
              return (hours * 60) + minutes;
            }
            
            function minutesToTime(totalMinutes) {
              const minutes = Math.max(0, Number(totalMinutes) || 0);
              const hh = Math.floor(minutes / 60) % 24;
              const mm = minutes % 60;
              return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            }
            
            const horaFim = minutesToTime(
              timeToMinutes(args.hora_inicio) + (parseInt(args.duracao_minutos, 10) || 60)
            );
            
            try {
              await bookingAvailabilityService.validateOrThrow({
                unidade_id: args.unidade_id,
                agente_id: args.agente_id,
                data_agendamento: args.data_agendamento,
                hora_inicio: args.hora_inicio,
                hora_fim: horaFim
              });
              
              logger.debug(`[Worker] Horário validado: ${args.data_agendamento} ${args.hora_inicio} está livre`);
              
              toolResult = { 
                ok: true, 
                disponivel: true,
                message: 'Horário está disponível e pode ser agendado',
                data_agendamento: args.data_agendamento,
                hora_inicio: args.hora_inicio,
                hora_fim: horaFim
              };
            } catch (validationError) {
              logger.debug(`[Worker] Horário indisponível: ${validationError.message}`);
              
              toolResult = { 
                ok: false, 
                disponivel: false,
                error: {
                  message: 'Horário não está mais disponível. Por favor, escolha outro horário.',
                  code: validationError.code || 'SLOT_UNAVAILABLE',
                  details: validationError.message
                }
              };
            }
          } else if (toolName === 'consultar_disponibilidade') {
            // 🔍 LOG DE FERRAMENTA - Verificar parâmetros recebidos
            logger.debug('[Worker] Consultando disponibilidade', { args });
            
            const resultado = await AIAvailabilityService.getAvailableSlots(args);
            
            // 🎯 CONSULTORIA DE AGENDA: Detectar se resultado tem metadata (novo formato) ou é array legado
            const slots = Array.isArray(resultado) ? resultado : (resultado.slots || []);
            const metadata = resultado.metadata || { 
              agente_trabalha_neste_dia: true, 
              motivo: slots.length > 0 ? 'SLOTS_DISPONIVEIS' : 'AGENDA_LOTADA' 
            };
            
            // ✅ Exibir somente a hora de início (sem "HH:MM às HH:MM")
            const slotsFormatados = slots.map(s => ({
              hora_inicio: s?.inicio || s?.hora_inicio
            }));
            
            // 🧠 CHAIN OF THOUGHT INJETADA (System Injection)
            // 
            // Problema: GPT-4o-mini sofre de "Attention Decay" em System Prompts longos.
            // Mesmo com "Regra 1, 2, 3" no System Prompt, o modelo ignora e segue padrões
            // de comportamento treinados (ex: "barbearia sem horário = lista de espera").
            // 
            // Solução: Injetar a regra de negócio DIRETAMENTE no retorno da tool, como
            // campo system_directive. Isso força o modelo a "ler" a instrução junto com
            // o dado, sobrepondo qualquer "esquecimento" do System Prompt principal.
            let systemDirective;
            
            if (slotsFormatados.length === 0 && metadata.agente_trabalha_neste_dia === false) {
              // 🔴 REGRA 1: PROFISSIONAL DE FOLGA (Bloqueio Absoluto de Lista de Espera)
              systemDirective = `⛔ CRÍTICO - LEIA ESTA INSTRUÇÃO ANTES DE RESPONDER:

O profissional NÃO TRABALHA neste dia (folga/dia off).

É ABSOLUTAMENTE PROIBIDO oferecer lista de espera neste cenário.

AÇÃO OBRIGATÓRIA:
1. Informe ao cliente que o profissional não atende neste dia da semana
2. Ofereça IMEDIATAMENTE uma das duas alternativas:
   a) Verificar outros dias em que o profissional trabalha
   b) Agendar com outro profissional disponível neste dia
3. Seja consultiva: pergunte qual alternativa o cliente prefere

NUNCA use as palavras: "lista de espera", "avisar quando surgir vaga", "desistência".

Esta instrução sobrepõe qualquer regra anterior do System Prompt.`;

            } else if (slotsFormatados.length === 0 && metadata.agente_trabalha_neste_dia === true) {
              // 🟢 REGRA 3: AGENDA LOTADA (Única Situação para Lista de Espera)
              systemDirective = `✅ INSTRUÇÃO - LEIA ANTES DE RESPONDER:

O profissional TRABALHA neste dia, mas todos os horários estão OCUPADOS.

Esta é a ÚNICA situação em que você pode oferecer lista de espera.

AÇÃO OBRIGATÓRIA:
1. Informe que todos os horários com [nome do profissional] estão ocupados neste dia
2. Ofereça a lista de espera: "Posso te colocar na lista de espera! Se surgir uma desistência, te aviso imediatamente via WhatsApp."
3. Aguarde confirmação do cliente para chamar a ferramenta adicionar_lista_espera

Esta instrução sobrepõe qualquer regra anterior do System Prompt.`;

            } else if (slotsFormatados.length > 0) {
              // 🟡 REGRA 2: VENDA ATIVA (Profissional Trabalha e Tem Vagas)
              systemDirective = `💰 INSTRUÇÃO DE VENDA - LEIA ANTES DE RESPONDER:

O profissional TRABALHA neste dia e TEM horários disponíveis.

É PROIBIDO mencionar lista de espera neste cenário.

AÇÃO OBRIGATÓRIA:
1. Apresente os horários disponíveis de forma entusiasmada e vendedora
2. Use linguagem como: "Tenho esses horários livres", "Qual desses funciona melhor pra você?"
3. Se o cliente pediu um horário específico ocupado, venda ativamente os disponíveis
4. NUNCA mencione "lista de espera" quando há horários livres

Esta instrução sobrepõe qualquer regra anterior do System Prompt.`;
            }
            
            toolResult = { 
              ok: true, 
              slots: slotsFormatados,
              agente_trabalha_neste_dia: metadata.agente_trabalha_neste_dia,
              motivo_indisponibilidade: slotsFormatados.length === 0 ? metadata.motivo : null,
              system_directive: systemDirective  // 🧠 Injeção da regra junto com o dado
            };
            
            logger.debug('[Worker] Disponibilidade retornada com System Injection', { 
              slots_count: slotsFormatados.length,
              agente_trabalha: metadata.agente_trabalha_neste_dia,
              motivo: metadata.motivo,
              directive_injected: !!systemDirective
            });
          } else if (toolName === 'criar_agendamento') {
            // 🔒 BLOQUEIO DE DUPLICIDADE NÍVEL 1: se já criamos um agendamento nesta rodada,
            // não criamos outro. Reutilizamos o resultado anterior para a IA confirmar.
            if (agendamentoJaCriado) {
              logger.warn('[Worker] Bloqueio de Duplicidade (Nível 1): criar_agendamento já executado nesta rodada — reutilizando resultado existente.');
              toolResult = agendamentoCriadoResult;
              followupHistory.push({
                role: 'tool',
                tool_call_id: toolCall?.id,
                content: JSON.stringify(toolResult),
              });
              continue;
            }

            // 🔒 BLOQUEIO DE DUPLICIDADE NÍVEL 2: Verificar se já existe agendamento recente
            // para este cliente, profissional, data e horário na sessão atual
            if (chatSession?.id && args?.data_agendamento && args?.hora_inicio && args?.agente_id) {
              try {
                const agendamentoExistente = await db('agendamentos')
                  .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
                  .where('clientes.telefone', telefoneLimpo)
                  .where('agendamentos.agente_id', args.agente_id)
                  .where('agendamentos.data_agendamento', args.data_agendamento)
                  .where('agendamentos.hora_inicio', args.hora_inicio)
                  .where('agendamentos.status', 'Aprovado')
                  .whereNull('agendamentos.deleted_at')
                  .where('agendamentos.created_at', '>=', db.raw("NOW() - INTERVAL '5 minutes'"))
                  .select('agendamentos.id', 'agendamentos.numero_agendamento')
                  .first();

                if (agendamentoExistente) {
                  logger.warn(`[Worker] Bloqueio de Duplicidade (Nível 2): Agendamento #${agendamentoExistente.id} já existe para este horário (criado há menos de 5 minutos) — reutilizando.`);
                  
                  toolResult = { 
                    ok: true, 
                    agendamento_id: agendamentoExistente.id,
                    agendamento: { id: agendamentoExistente.id, numero_agendamento: agendamentoExistente.numero_agendamento },
                    deveCobrarSinal: false,
                    message: 'Agendamento já foi processado anteriormente',
                    // ✅ TEMPLATE ELITE (FALLBACK): mesmo em duplicidade de webhook, devolvemos
                    // um template com os dados dos args para a IA confirmar — nunca alucinar erro.
                    template_confirmacao: {
                      cliente_nome: args?.cliente_nome || 'Cliente',
                      servico: 'Serviço agendado',
                      profissional: 'nossa equipe',
                      data: args?.data_agendamento,
                      hora: args?.hora_inicio,
                      agendamento_id: agendamentoExistente.id
                    }
                  };

                  // Marca como já criado para evitar novas tentativas
                  agendamentoJaCriado = true;
                  agendamentoCriadoResult = toolResult;

                  followupHistory.push({
                    role: 'tool',
                    tool_call_id: toolCall?.id,
                    content: JSON.stringify(toolResult),
                  });
                  continue;
                }
              } catch (checkErr) {
                logger.warn('[Worker] Erro ao verificar agendamento existente (Nível 2):', checkErr.message);
                // Continua com a criação normal se a verificação falhar
              }
            }

            const usuarioId = chatSession?.usuario_id;

            let created;
            try {
              created = await CreateAppointmentUseCase.execute({
                unidadeId: args?.unidade_id,
                agenteId: args?.agente_id,
                dataAgendamento: args?.data_agendamento,
                horaInicio: args?.hora_inicio,
                servicos: args?.servicos,
                clienteTelefone: telefoneLimpo,
                clienteNome: args?.cliente_nome || 'Cliente',
                suppressNotification: true,  // ✅ CONSISTÊNCIA DE DISPARO: Worker envia a mensagem, não o UseCase
                skipAvailabilityValidation: true  // 🔧 NOVO: Pula validação redundante (já validamos com validar_agendamento)
              }, { usuarioId });
            } catch (createError) {
              // 🔧 MELHORIA: Capturar erros de integração de pagamento e fornecer mensagem clara para a IA
              logger.error('[Worker] Erro ao criar agendamento:', {
                message: createError.message,
                code: createError.code,
                httpStatus: createError.httpStatus,
                details: createError.details
              });

              // Identificar erro de integração de pagamento
              if (createError.code === 'INTEGRATION_ERROR' || createError.code === 'MP_NOT_CONNECTED' || 
                  (createError.details && createError.details.reason === 'MP_NOT_CONNECTED')) {
                toolResult = {
                  ok: false,
                  error: 'PAYMENT_INTEGRATION_ERROR',
                  message: 'Falha ao gerar PIX: Lojista sem Mercado Pago configurado. Por favor, entre em contato via WhatsApp para agendar sem pagamento online.',
                  user_friendly_message: 'No momento, não consigo processar o pagamento online para este agendamento. Entre em contato conosco via WhatsApp para agendar sem pagamento antecipado.'
                };
                
                followupHistory.push({
                  role: 'tool',
                  tool_call_id: toolCall?.id,
                  content: JSON.stringify(toolResult),
                });
                continue;
              }

              // Identificar erro de token expirado
              if (createError.code === 'MP_TOKEN_EXPIRED' || 
                  (createError.details && createError.details.reason === 'MP_TOKEN_EXPIRED')) {
                toolResult = {
                  ok: false,
                  error: 'PAYMENT_TOKEN_EXPIRED',
                  message: 'Falha ao gerar PIX: Token do Mercado Pago expirado. Por favor, entre em contato via WhatsApp para agendar sem pagamento online.',
                  user_friendly_message: 'No momento, não consigo processar o pagamento online para este agendamento. Entre em contato conosco via WhatsApp para agendar sem pagamento antecipado.'
                };
                
                followupHistory.push({
                  role: 'tool',
                  tool_call_id: toolCall?.id,
                  content: JSON.stringify(toolResult),
                });
                continue;
              }

              // Para outros erros, relançar
              throw createError;
            }

            // 🔧 CORREÇÃO: Extrair o ID do agendamento e incluir na resposta
            const agendamentoId = created?.agendamento?.id;
            
            logger.info(`[Worker] Agendamento criado com sucesso (ID: ${agendamentoId})`);

            // ✅ TEMPLATE ELITE (BLINDADO): a montagem da mensagem estruturada é
            // isolada em try/catch próprio. Se qualquer consulta ou formatação de
            // data falhar, caímos para os dados crus dos args — o sucesso do
            // agendamento (já comitado no banco) NUNCA é abortado por isso.
            let templateConfirmacao;
            try {
              const agendamentoCompleto = await db('agendamentos')
                .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
                .join('agentes', 'agendamentos.agente_id', 'agentes.id')
                .where('agendamentos.id', agendamentoId)
                .select(
                  'agendamentos.id',
                  'agendamentos.data_agendamento',
                  'agendamentos.hora_inicio',
                  db.raw("CONCAT(clientes.primeiro_nome, ' ', clientes.ultimo_nome) as cliente_nome"),
                  'agentes.nome as agente_nome'
                )
                .first();

              const servicos = await db('agendamento_servicos')
                .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
                .where('agendamento_servicos.agendamento_id', agendamentoId)
                .select('servicos.nome')
                .then(rows => rows.map(r => r.nome).join(', '));

              // 🛡️ DATA SEGURA: o Postgres pode devolver um objeto Date nativo (e não
              // string), o que quebraria o .split('-'). Normalizamos para string antes.
              const rawData = agendamentoCompleto?.data_agendamento;
              const dataStr = typeof rawData === 'string'
                ? rawData
                : new Date(rawData).toISOString().split('T')[0];
              const [ano, mes, dia] = dataStr.split('-');
              const dataFormatada = `${dia}/${mes}/${ano}`;

              templateConfirmacao = {
                cliente_nome: agendamentoCompleto?.cliente_nome || args?.cliente_nome || 'Cliente',
                servico: servicos || 'Serviço agendado',
                profissional: agendamentoCompleto?.agente_nome || 'nossa equipe',
                data: dataFormatada,
                hora: agendamentoCompleto?.hora_inicio || args?.hora_inicio,
                agendamento_id: agendamentoId
              };
            } catch (errTemplate) {
              logger.error('[Worker] Erro ao montar Template Elite (usando fallback dos args):', errTemplate.message);
              templateConfirmacao = {
                cliente_nome: args?.cliente_nome || 'Cliente',
                servico: 'Serviço agendado',
                profissional: 'nossa equipe',
                data: args?.data_agendamento,
                hora: args?.hora_inicio,
                agendamento_id: agendamentoId
              };
            }

            toolResult = {
              ok: true,
              agendamento_id: agendamentoId,
              agendamento: created.agendamento,
              pix: created.pix,
              deveCobrarSinal: created.deveCobrarSinal,
              template_confirmacao: templateConfirmacao
            };

            // 🔒 BLOQUEIO DE DUPLICIDADE: marca que o agendamento já foi criado nesta
            // rodada (sempre — mesmo que a montagem do template tenha caído no fallback).
            agendamentoJaCriado = true;
            agendamentoCriadoResult = toolResult;
          } else if (toolName === 'notificar_humano') {
            // 🚨 FASE 4: GESTÃO DE CRISE - Notificar gerentes com notifica_crise = true
            const motivo = args?.motivo || 'Cliente solicitou atendimento humano';
            const mensagemCliente = args?.mensagem_cliente || messageText || 'Não especificado';
            const nivelUrgencia = args?.nivel_urgencia || 'media';

            logger.warn('[Worker] Notificação humana acionada', { nivelUrgencia, motivo, mensagemCliente });

            try {
              // 🎯 FASE 4: Buscar gerentes da equipe com notifica_crise = true
              let telefonesGerentes = [];
              
              if (unidadeId) {
                const gerentes = await db('agentes')
                  .where('unidade_id', unidadeId)
                  .where('status', 'Ativo')
                  .where('notifica_crise', true)
                  .whereNull('deleted_at')
                  .select('id', 'nome', 'telefone');

                if (gerentes && gerentes.length > 0) {
                  // Extrair e limpar telefones dos gerentes
                  telefonesGerentes = gerentes
                    .filter(g => g.telefone)
                    .map(g => ({
                      id: g.id,
                      nome: g.nome,
                      telefone: String(g.telefone).replace(/\D/g, '')
                    }))
                    .filter(g => g.telefone.length >= 10); // Validação básica de telefone

                  logger.info(`[Worker] Encontrados ${telefonesGerentes.length} gerente(s) com notifica_crise = true`);
                }
              }

              // 🔥 LÓGICA PRINCIPAL: Notificar gerentes configurados
              if (telefonesGerentes.length > 0) {
                // Montar mensagem de notificação
                const emojiUrgencia = {
                  'baixa': '🔵',
                  'media': '🟡',
                  'alta': '🔴'
                };

                const mensagemNotificacao = `${emojiUrgencia[nivelUrgencia]} *NOTIFICAÇÃO DE ATENDIMENTO*

*Unidade:* ${nomeUnidade}
*Cliente:* ${telefoneLimpo}
${clienteNome ? `*Nome:* ${clienteNome}` : ''}
*Nível de Urgência:* ${nivelUrgencia.toUpperCase()}

*Motivo:*
${motivo}

*Última mensagem do cliente:*
"${mensagemCliente}"

*Ação necessária:* Entre em contato com o cliente o mais breve possível.`;

                // 🚀 Enviar notificação para TODOS os gerentes simultaneamente (Promise.all)
                const envios = telefonesGerentes.map(gerente =>
                  whatsAppService.sendMessage(instanceName, gerente.telefone, mensagemNotificacao)
                    .then(() => {
                      logger.info(`[Worker] Notificação enviada para gerente ${gerente.nome} (${gerente.telefone})`);
                      return { ok: true, gerente: gerente.nome };
                    })
                    .catch(err => {
                      logger.error(`[Worker] Erro ao enviar notificação para ${gerente.nome}:`, err.message);
                      return { ok: false, gerente: gerente.nome, error: err.message };
                    })
                );

                const resultados = await Promise.all(envios);
                const enviadosComSucesso = resultados.filter(r => r.ok).length;

                logger.info(`[Worker] Notificações enviadas: ${enviadosComSucesso}/${telefonesGerentes.length} gerentes`);

                toolResult = {
                  ok: true,
                  message: `${enviadosComSucesso} gerente(s) da equipe notificado(s) com sucesso`,
                  gerentes_notificados: enviadosComSucesso,
                  total_gerentes: telefonesGerentes.length,
                  nivel_urgencia: nivelUrgencia
                };
              } else {
                // 🔄 FALLBACK: Nenhum gerente configurado, buscar telefone do dono da unidade
                logger.warn(`[Worker] Nenhum gerente com notifica_crise = true. Usando fallback (dono da unidade)`);
                
                let telefoneAdmin = null;
                
                const unidade = await db('unidades')
                  .where('id', unidadeId)
                  .select('telefone', 'usuario_id')
                  .first();

                if (unidade?.telefone) {
                  telefoneAdmin = String(unidade.telefone).replace(/\D/g, '');
                } else if (unidade?.usuario_id) {
                  // Fallback: buscar telefone do usuário dono da unidade
                  const usuario = await db('usuarios')
                    .where('id', unidade.usuario_id)
                    .select('telefone')
                    .first();
                  
                  if (usuario?.telefone) {
                    telefoneAdmin = String(usuario.telefone).replace(/\D/g, '');
                  }
                }

                if (telefoneAdmin) {
                  // Montar mensagem de notificação para o administrador
                  const emojiUrgencia = {
                    'baixa': '🔵',
                    'media': '🟡',
                    'alta': '🔴'
                  };

                  const mensagemNotificacao = `${emojiUrgencia[nivelUrgencia]} *NOTIFICAÇÃO DE ATENDIMENTO*

*Unidade:* ${nomeUnidade}
*Cliente:* ${telefoneLimpo}
${clienteNome ? `*Nome:* ${clienteNome}` : ''}
*Nível de Urgência:* ${nivelUrgencia.toUpperCase()}

*Motivo:*
${motivo}

*Última mensagem do cliente:*
"${mensagemCliente}"

*Ação necessária:* Entre em contato com o cliente o mais breve possível.`;

                  // Enviar notificação via WhatsApp para o administrador
                  await whatsAppService.sendMessage(instanceName, telefoneAdmin, mensagemNotificacao);

                  logger.info('[Worker] Notificação (fallback) enviada ao dono da unidade.');

                  toolResult = {
                    ok: true,
                    message: 'Dono da unidade notificado (fallback - nenhum gerente configurado)',
                    telefone_admin: telefoneAdmin,
                    nivel_urgencia: nivelUrgencia,
                    fallback: true
                  };
                } else {
                  logger.warn(`[Worker] Telefone do administrador não encontrado para unidade ${unidadeId}`);
                  
                  // Mesmo sem telefone, retorna sucesso para a IA finalizar a conversa
                  toolResult = {
                    ok: true,
                    message: 'Notificação registrada (nenhum telefone configurado)',
                    nivel_urgencia: nivelUrgencia,
                    fallback: true
                  };
                }
              }

              // Registrar notificação no banco (opcional - para auditoria futura)
              // TODO: Criar tabela notificacoes_humanas para histórico
              
            } catch (err) {
              logger.error('[Worker] Erro ao notificar humano:', err.message);
              
              // Mesmo com erro, retorna sucesso para a IA finalizar a conversa
              toolResult = {
                ok: true,
                message: 'Notificação registrada (erro ao enviar)',
                error_details: err.message
              };
            }
          } else if (toolName === 'atualizar_preferencias') {
            // 🧠 FASE 3: MEMÓRIA DE PREFERÊNCIAS - Atualizar/criar preferências do cliente
            const clienteIdPref = parseInt(args?.cliente_id, 10);
            const profissionalPreferidoId = args?.profissional_preferido_id ? parseInt(args.profissional_preferido_id, 10) : null;
            const observacoes = args?.observacoes || null;

            logger.debug(`[Worker] Atualizando preferências do cliente ${clienteIdPref}`);

            try {
              // Verificar se o cliente existe e pertence à unidade (segurança multi-tenant)
              const clienteValido = await db('clientes')
                .where('id', clienteIdPref)
                .where('unidade_id', unidadeId)
                .first();

              if (!clienteValido) {
                logger.warn(`[Worker] Cliente ${clienteIdPref} não encontrado ou não pertence à unidade ${unidadeId}`);
                toolResult = {
                  ok: false,
                  error: {
                    message: 'Cliente não encontrado ou não autorizado',
                    code: 'INVALID_CLIENT'
                  }
                };
              } else {
                // Verificar se já existe preferência cadastrada
                const preferenciaExistente = await db('cliente_preferencias')
                  .where('cliente_id', clienteIdPref)
                  .first();

                if (preferenciaExistente) {
                  // Atualizar preferência existente
                  await db('cliente_preferencias')
                    .where('cliente_id', clienteIdPref)
                    .update({
                      profissional_preferido_id: profissionalPreferidoId,
                      observacoes_preferencia: observacoes,
                      updated_at: db.fn.now()
                    });

                  logger.debug(`[Worker] Preferências do cliente ${clienteIdPref} atualizadas`);
                } else {
                  // Criar nova preferência
                  await db('cliente_preferencias')
                    .insert({
                      cliente_id: clienteIdPref,
                      profissional_preferido_id: profissionalPreferidoId,
                      observacoes_preferencia: observacoes
                    });

                  logger.debug(`[Worker] Preferências do cliente ${clienteIdPref} criadas`);
                }

                toolResult = {
                  ok: true,
                  message: 'Preferências atualizadas com sucesso',
                  cliente_id: clienteIdPref,
                  profissional_preferido_id: profissionalPreferidoId,
                  observacoes: observacoes
                };
              }
            } catch (err) {
              logger.error('[Worker] Erro ao atualizar preferências:', err.message);
              toolResult = {
                ok: false,
                error: {
                  message: `Erro ao atualizar preferências: ${err.message}`,
                  code: 'DB_ERROR'
                }
              };
            }
          } else if (toolName === 'adicionar_lista_espera') {
            // ⏳ FASE 4: LISTA DE ESPERA INTELIGENTE - Adicionar cliente à lista de espera
            const unidadeIdEspera = parseInt(args?.unidade_id, 10);
            const agenteIdEspera = args?.agente_id ? parseInt(args.agente_id, 10) : null;
            const dataDesejada = args?.data_desejada;
            const horaInicio = args?.hora_inicio || null;
            const servicosEspera = args?.servicos || [];

            logger.debug(`[Worker] Adicionando cliente à lista de espera para ${dataDesejada}`);

            try {
              // Validar unidade_id (segurança multi-tenant)
              if (unidadeIdEspera !== unidadeId) {
                logger.warn(`[Worker] Tentativa de adicionar à lista de espera de outra unidade: ${unidadeIdEspera} vs ${unidadeId}`);
                toolResult = {
                  ok: false,
                  error: {
                    message: 'Erro de segurança: unidade_id inválida',
                    code: 'INVALID_UNIT'
                  }
                };
              } else if (!clienteId) {
                logger.warn('[Worker] Cliente não identificado para adicionar à lista de espera');
                toolResult = {
                  ok: false,
                  error: {
                    message: 'Cliente não identificado. Não é possível adicionar à lista de espera.',
                    code: 'MISSING_CLIENT'
                  }
                };
              } else if (!dataDesejada || servicosEspera.length === 0) {
                logger.warn('[Worker] Dados incompletos para lista de espera');
                toolResult = {
                  ok: false,
                  error: {
                    message: 'Dados incompletos: data_desejada e servicos são obrigatórios',
                    code: 'MISSING_DATA'
                  }
                };
              } else {
                // Verificar se já existe entrada pendente para este cliente/data
                const entradaExistente = await db('lista_espera')
                  .where('cliente_id', clienteId)
                  .where('unidade_id', unidadeId)
                  .where('data_desejada', dataDesejada)
                  .where('status', 'pendente')
                  .first();

                if (entradaExistente) {
                  logger.debug(`[Worker] Cliente já está na lista de espera para ${dataDesejada}`);
                  toolResult = {
                    ok: true,
                    message: 'Você já está na lista de espera para esta data',
                    lista_espera_id: entradaExistente.id,
                    ja_existia: true
                  };
                } else {
                  // Inserir na lista de espera
                  const [listaEsperaId] = await db('lista_espera')
                    .insert({
                      unidade_id: unidadeId,
                      cliente_id: clienteId,
                      agente_id: agenteIdEspera,
                      data_desejada: dataDesejada,
                      hora_inicio: horaInicio,
                      servicos: JSON.stringify(servicosEspera),
                      status: 'pendente',
                      telefone_cliente: telefoneLimpo
                    })
                    .returning('id');

                  logger.info(`[Worker] Cliente ${clienteId} adicionado à lista de espera (ID: ${listaEsperaId})`);

                  toolResult = {
                    ok: true,
                    message: 'Cliente adicionado à lista de espera com sucesso',
                    lista_espera_id: listaEsperaId,
                    data_desejada: dataDesejada,
                    hora_inicio: horaInicio,
                    agente_id: agenteIdEspera
                  };
                }
              }
            } catch (err) {
              logger.error('[Worker] Erro ao adicionar à lista de espera:', err.message);
              toolResult = {
                ok: false,
                error: {
                  message: `Erro ao adicionar à lista de espera: ${err.message}`,
                  code: 'DB_ERROR'
                }
              };
            }
          } else if (toolName === 'cancelar_agendamento') {
            // 🔧 IMPLEMENTAÇÃO: Cancelamento inteligente via UseCase
            const agendamentoId = parseInt(args?.agendamento_id, 10);
            const motivo = args?.motivo || 'Cancelado pelo cliente via WhatsApp';
            const cancelarSerie = Boolean(args?.cancelar_serie);

            logger.debug(`[Worker] Tentando cancelar agendamento ID: ${agendamentoId}, Série: ${cancelarSerie}`);

            try {
              // 🛡️ TRAVA DE PROPRIEDADE (ANTI-MISMATCH DE ID) ──────────────────
              // Verificar se o agendamento pertence ao cliente atual
              const hojeCancel = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

              let agendamentosClienteQuery = db('agendamentos')
                .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
                .where('clientes.telefone_limpo', telefoneLimpo)
                .where('agendamentos.status', 'Aprovado')
                .whereNull('agendamentos.deleted_at')
                .where('agendamentos.data_agendamento', '>=', hojeCancel);

              if (unidadeId) {
                agendamentosClienteQuery = agendamentosClienteQuery.where('agendamentos.unidade_id', unidadeId);
              }

              const agendamentosDoCliente = await agendamentosClienteQuery
                .select(
                  'agendamentos.id',
                  'agendamentos.status',
                  'agendamentos.unidade_id',
                  'agendamentos.data_agendamento',
                  'agendamentos.hora_inicio',
                  'agendamentos.recorrencia_group_id'
                )
                .orderBy('agendamentos.data_agendamento', 'asc')
                .orderBy('agendamentos.hora_inicio', 'asc');

              // O agendamento alvo precisa estar DENTRO da lista do próprio cliente.
              const agendamento = agendamentosDoCliente.find(a => a.id === agendamentoId);

              if (!Number.isInteger(agendamentoId) || !agendamento) {
                logger.warn(`[Worker] Cancelamento BLOQUEADO: agendamento_id=${args?.agendamento_id} não pertence ao cliente (telefone=${telefoneLimpo}) ou é inválido.`);
                toolResult = {
                  ok: false,
                  error: {
                    message: 'O agendamento_id informado NÃO pertence a este cliente ou não existe. ATENÇÃO: não use o número do índice da lista (1, 2, 3). Use o campo agendamento_id retornado por listar_agendamentos_cliente.',
                    code: 'ID_NAO_PERTENCE_AO_CLIENTE'
                  },
                  agendamentos_do_cliente: agendamentosDoCliente.map(a => ({
                    agendamento_id: a.id,
                    data_agendamento: a.data_agendamento,
                    hora_inicio: a.hora_inicio,
                    status: a.status,
                    is_recorrente: Boolean(a.recorrencia_group_id)
                  }))
                };
              } else {
                // ✅ Usar o UseCase para cancelamento
                const CancelAppointmentUseCase = require('../useCases/CancelAppointmentUseCase');
                
                const resultado = await CancelAppointmentUseCase.execute({
                  agendamentoId,
                  motivo,
                  origem: 'CLIENTE_PUBLICO',
                  cancelarSerie,
                  userId: null
                });

                logger.info(`[Worker] ✅ Cancelamento concluído:`, resultado);

                agendamentoCancelado = true;

                toolResult = { 
                  ok: true, 
                  agendamento_id: agendamentoId,
                  agendamentos_cancelados: resultado.agendamentos_cancelados,
                  cota_consumida: resultado.cota_consumida,
                  estorno_aplicado: resultado.estorno_aplicado,
                  message: resultado.message,
                  data_agendamento: agendamento.data_agendamento,
                  hora_inicio: agendamento.hora_inicio
                };
              }
            } catch (err) {
              logger.error(`[Worker] Erro ao cancelar agendamento ${agendamentoId}:`, err.message);
              
              toolResult = { 
                ok: false, 
                error: { 
                  message: err.message || 'Erro ao cancelar agendamento',
                  code: err.code || 'CANCEL_ERROR',
                  httpStatus: err.httpStatus
                } 
              };
            }
          } else {
            toolResult = { ok: false, error: { message: `Ferramenta desconhecida: ${toolName}` } };
          }
        } catch (err) {
          toolResult = {
            ok: false,
            error: {
              message: err?.message || 'Falha ao executar ferramenta',
              code: err?.code,
              httpStatus: err?.httpStatus,
              details: err?.details,
            }
          };
        }

        // � FASE 5: MINIFICAÇÃO DO PAYLOAD - Remover dados desnecessários antes de persistir
        // O LLM não precisa de objetos massivos como template_confirmacao, pix completo, etc.
        // Salvamos apenas o essencial para a IA saber o resultado da operação.
        const minifiedToolResult = minifyToolResult(toolName, toolResult);

        // �🔄 FASE 3: PERSISTÊNCIA IMEDIATA - Salvar o resultado da tool no banco
        const toolMessage = {
          role: 'tool',
          tool_call_id: toolCall?.id,
          name: toolName,
          content: JSON.stringify(minifiedToolResult),
        };

        if (chatSession?.id) {
          try {
            await db('chat_messages').insert(
              buildChatMessageRow(chatSession.id, toolMessage)
            );
            logger.debug(`[Worker] [FASE 3] Resultado da tool '${toolName}' persistido no banco`);
          } catch (err) {
            logger.error('[Worker] Falha ao persistir tool result em chat_messages', {
              error: err?.message,
              chat_session_id: chatSession?.id,
              tool_name: toolName,
            });
          }
        }
      }

      // 🔄 FASE 3: RECARREGAR HISTÓRICO DO BANCO - Substituir followupHistory
      // Após executar todas as tools desta rodada, recarregamos o histórico
      // ATUALIZADO direto do banco de dados (inclui as tool_calls e tool results
      // que acabamos de persistir)
      currentHistory = await loadHistory(chatSession?.id);
      logger.debug('[Worker] [FASE 3] Histórico recarregado do banco após execução das tools', {
        history_length: currentHistory.length,
      });


      // 🧹 FASE 3: LIMPEZA DE CONTEXTO COMENTADA
      // A limpeza agressiva de histórico foi REMOVIDA para preservar o contexto
      // estrutural das chamadas de função. Na Fase 5, implementaremos um pruning
      // inteligente que mantém a integridade das tool_calls.
      // Por ora, o histórico completo é mantido no banco e limitado a 30 mensagens
      // no loadHistory() para evitar estouro de tokens.

      // 🧹 LIMPEZA DO JOB: se o agendamento já foi criado nesta rodada, desabilitamos
      // as ferramentas na próxima resposta da IA para impedir tentativas desnecessárias
      // de novas ferramentas (re-agendar, re-validar, etc.). A IA apenas confirma com o ID.
      const toolsParaProximaChamada = agendamentoJaCriado ? null : tools;
      if (agendamentoJaCriado) {
        logger.debug('[Worker] Agendamento já criado nesta rodada — desabilitando ferramentas para a resposta final.');
      }

      let aiResultNext;
      try {
        aiResultNext = await aiAgentService.processMessage({
          message: null,
          history: currentHistory,
          tools: toolsParaProximaChamada,
          systemPrompt,
          unidadeId,
          redis,
        });
      } catch (err) {
        const is429 =
          err?.status === 429 ||
          err?.statusCode === 429 ||
          String(err?.message || '').includes('429') ||
          String(err?.message || '').toLowerCase().includes('rate limit');

        if (is429) {
          logger.error('[Worker] Erro de Rate Limit - abortando tentativa para evitar banimento');
          const rateErr = new Error('429 Rate limit atingido no OpenRouter');
          rateErr.status = 429;
          throw rateErr;
        }
        throw err;
      }
      aiResult = aiResultNext;

      logger.debug('[Worker] AI response after tools', {
        chat_session_id: chatSession?.id,
        unidade_id: unidadeId,
        telefone: telefoneLimpo,
        depth,
        has_tool_calls: Array.isArray(aiResult?.toolCalls) && aiResult.toolCalls.length > 0,
      });
    }

    // ✅ PROTEÇÃO DE FLUXO DE SUCESSO: se o agendamento já foi criado com sucesso,
    // NÃO forçamos a mensagem de ajuda humana mesmo ao atingir o limite de profundidade.
    // A rodada é considerada encerrada com sucesso — evitando pedir desculpas por um
    // "erro" inexistente após uma operação bem-sucedida.
    if (agendamentoJaCriado && Array.isArray(aiResult?.toolCalls) && aiResult.toolCalls.length > 0 && depth >= TOOL_CALL_DEPTH_LIMIT) {
      logger.info('[Worker] Limite de profundidade atingido, porém agendamento já criado com sucesso — encerrando rodada sem acionar gestão de crise.', {
        chat_session_id: chatSession?.id,
        unidade_id: unidadeId,
        telefone: telefoneLimpo,
        depth,
      });
    } else if (Array.isArray(aiResult?.toolCalls) && aiResult.toolCalls.length > 0 && depth >= TOOL_CALL_DEPTH_LIMIT) {
      logger.warn('[Worker] Tool call depth limit reached. Forcing final response without tools.', {
        chat_session_id: chatSession?.id,
        unidade_id: unidadeId,
        telefone: telefoneLimpo,
        depth,
      });

      try {
        aiResult = await aiAgentService.processMessage({
          message: 'Responda ao cliente de forma curta informando que preciso de ajuda humana para continuar e que um atendente irá auxiliar. Não chame ferramentas.',
          history: currentHistory,
          tools: null,
          systemPrompt,
          unidadeId,
          redis,
        });
      } catch (err) {
        const is429 =
          err?.status === 429 ||
          err?.statusCode === 429 ||
          String(err?.message || '').includes('429') ||
          String(err?.message || '').toLowerCase().includes('rate limit');

        if (is429) {
          logger.error('[Worker] Erro de Rate Limit - abortando tentativa para evitar banimento');
          const rateErr = new Error('429 Rate limit atingido no OpenRouter');
          rateErr.status = 429;
          throw rateErr;
        }
        throw err;
      }
    }

    // ✅ TEMPLATE ELITE: Verificar se houve criação de agendamento bem-sucedida
    let templateConfirmacao = null;
    if (toolCallsExecuted.includes('criar_agendamento')) {
      // Buscar o resultado da ferramenta criar_agendamento no histórico
      const toolMessages = currentHistory.filter(m => m.role === 'tool');
      for (const toolMsg of toolMessages) {
        try {
          const result = JSON.parse(toolMsg.content);
          if (result.ok && result.template_confirmacao) {
            templateConfirmacao = result.template_confirmacao;
            break;
          }
        } catch {}
      }
    }

    let finalText = aiResult?.content ? String(aiResult.content).trim() : '';
    
    // ✅ SUBSTITUIR RESPOSTA DA IA POR TEMPLATE FIXO
    if (templateConfirmacao) {
      finalText = `Olá, ${templateConfirmacao.cliente_nome}! Seu agendamento foi confirmado!

✂️ Serviço: ${templateConfirmacao.servico}
👤 Profissional: ${templateConfirmacao.profissional}
📅 Data: ${templateConfirmacao.data} às ${templateConfirmacao.hora}
🎫 ID: #${templateConfirmacao.agendamento_id}

Qualquer dúvida, estamos à disposição!`;
      
      logger.debug(`[Worker] Template Elite aplicado para agendamento #${templateConfirmacao.agendamento_id}`);
    }
    
    if (finalText) {
      // Só persiste se tiver chatSession
      if (chatSession?.id) {
        try {
          const inserted = await db('chat_messages')
            .insert(
              buildChatMessageRow(chatSession.id, { role: 'assistant', content: finalText })
            )
            .returning('id');

          const finalMsgId = Array.isArray(inserted)
            ? (inserted[0]?.id ?? inserted[0])
            : (inserted?.id ?? inserted);

          // 🧹 LIMPEZA DE CONTEXTO PÓS-CRIAÇÃO: após uma CRIAÇÃO bem-sucedida,
          // removemos o histórico antigo desta sessão (mantendo apenas a mensagem
          // de confirmação final). Isso impede a IA de citar IDs antigos
          // (ex: #915, #909) fora de contexto em conversas futuras.
          //
          // ⚠️ INTENCIONALMENTE NÃO limpamos após CANCELAMENTO. Apagar o histórico
          // pós-cancelamento destruía o retorno recente de listar_agendamentos_cliente
          // (a única fonte do agendamento_id REAL), forçando a IA a re-adivinhar IDs
          // a partir do texto puro (índice da lista). O reload já é limitado a 10
          // mensagens e a TRAVA DE PROPRIEDADE no cancelar_agendamento garante que
          // nenhum ID errado seja cancelado. Preservar o contexto aqui é mais seguro.
          const fluxoFinalizado = agendamentoJaCriado;
          if (fluxoFinalizado && finalMsgId) {
            // 🧹 FASE 3: LIMPEZA DE CONTEXTO COMENTADA
            // A limpeza agressiva (.del()) foi COMENTADA para preservar o histórico
            // estrutural. Na Fase 5, implementaremos uma estratégia de pruning inteligente.
            // Por ora, mantemos o histórico completo no banco.
            /*
            try {
              const removidas = await db('chat_messages')
                .where('chat_session_id', chatSession.id)
                .whereNot('id', finalMsgId)
                .del();
              logger.debug(`[Worker] Contexto limpo após criação: ${removidas} mensagem(ns) antiga(s) removida(s).`);
            } catch (cleanErr) {
              logger.error('[Worker] Falha ao limpar contexto pós-fluxo em chat_messages', {
                error: cleanErr?.message,
                chat_session_id: chatSession?.id,
              });
            }
            */
            logger.debug('[Worker] [FASE 3] Limpeza de contexto desabilitada - histórico preservado no banco');
          }
        } catch (err) {
          logger.error('[Worker] Falha ao persistir mensagem do assistant em chat_messages', {
            error: err?.message,
            chat_session_id: chatSession?.id,
            unidade_id: unidadeId,
            telefone: telefoneLimpo,
          });
        }
      }

      logger.info('[Worker] Enviando resposta da IA ao cliente.');
      logger.debug('[Worker] Conteúdo da resposta', { finalText });
      await whatsAppService.sendMessage(instanceName, telefoneLimpo, finalText);
    } else {
      logger.debug('[Worker] AI returned empty content. Skipping WhatsApp send.', {
        chat_session_id: chatSession?.id,
        unidade_id: unidadeId,
        telefone: telefoneLimpo,
      });
    }

    try {
      ContextPurgeService.schedule(redis, chatSession?.id);
    } catch {}

    return {
      ok: true,
      chatSessionId: chatSession?.id,
      telefone: telefoneLimpo,
      unidadeId,
      finalText,
      toolCalls: aiResult?.toolCalls || null,
      toolCallsExecuted,
    };
  }

  start() {
    logger.info('[Worker] Iniciando escuta da fila whatsapp-messages...');

    const connection = new Redis(redisOptions);
    try {
      connection.on('error', (err) => {
        logger.error('[Worker] Redis connection error:', err?.message || err);
      });
    } catch {}
    
    this.worker = new Worker('whatsapp-messages', async (job) => {
      const payload = job.data;
      try {
        await this.processPayload(payload, job);
      } catch (err) {
        // ── Tratamento específico para erro 429 (rate limit do OpenRouter) ──────
        // Não faz sentido retentar imediatamente — descartamos o job com log claro.
        const is429 =
          err?.status === 429 ||
          err?.statusCode === 429 ||
          String(err?.message || '').includes('429') ||
          String(err?.message || '').toLowerCase().includes('rate limit') ||
          String(err?.message || '').toLowerCase().includes('provider returned error');

        if (is429) {
          logger.error('[Worker] Erro de Rate Limit - abortando tentativa para evitar banimento');
          // Retornar sem relançar — BullMQ marca o job como concluído (não falhou)
          // evitando retentativas automáticas que só piorariam o rate limit.
          return { ok: false, reason: 'rate_limit_429' };
        }

        // Para outros erros, relança para o BullMQ gerenciar as retentativas normalmente
        throw err;
      }
      return true;
    }, { connection });

    this.worker.on('completed', job => logger.debug(`[Worker] Job ${job.id} concluído.`));
    this.worker.on('failed', (job, err) => logger.error(`[Worker] Job ${job.id} falhou:`, err.message));
  }
}

module.exports = new WhatsappWorker();
// Exposto para testes/uso da camada de dados (Fase 2). Não altera o consumo
// existente, que usa a instância singleton (ex: whatsappWorker.start()).
module.exports.loadHistory = loadHistory;
module.exports.buildChatMessageRow = buildChatMessageRow;

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { db } = require('../config/knex');
const ChatSessionService = require('../services/ChatSessionService');
const aiAgentService = require('../services/AiAgentService');
const ChatCompletionService = require('../services/ChatCompletionService');
const AIAgentSchemas = require('../services/AIAgentSchemas');
const AIAvailabilityService = require('../services/AIAvailabilityService');
const CreateAppointmentUseCase = require('../useCases/CreateAppointmentUseCase');
const WhatsAppService = require('../services/WhatsAppService');
const logger = require('../utils/logger');

let chatMessagesTableChecked = false;
let chatMessagesTableExists = false;

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
      // Mantém apenas confirmação e ID
      return {
        ok: true,
        agendamento_id: toolResult.agendamento_id,
        message: 'Agendamento cancelado com sucesso'
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

    // Resolução de unidade por usuário (fluxo atual: usuario_id fixo).
    // TODO: substituir por resolução via instanceName quando disponível.
    const HARDCODED_USUARIO_ID = 468;

    let unidadeId = null;

    try {
      const unidade = await db('unidades')
        .where('usuario_id', HARDCODED_USUARIO_ID)
        .whereIn('status', ['Ativo', 'ativo', 'active'])
        .select('id', 'nome')
        .orderBy('id', 'asc')
        .first();

      if (unidade?.id) {
        unidadeId = unidade.id;
      }
    } catch (err) {
      logger.error(`[Worker] Erro ao buscar unidade para usuario_id=${HARDCODED_USUARIO_ID}:`, err?.message);
    }

    // ── Capturar instanceName para uso posterior ────────────────────────────
    const instanceName = payload?.instance || payload?.data?.instance || null;

    // ── Extrair número do cliente (remoteJid) ────────────────────────────────
    // O campo correto é payload.data.key.remoteJid (número do cliente que enviou a mensagem)
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

    // ── 🛡️ GUARDA DE MENSAGEM (GUARD CLAUSE) ────────────────────────────────
    // Ignora payloads sem telefone ou sem unidade (ex.: status@broadcast,
    // mensagens de sistema). Sem isso, o worker quebra ao tentar processar
    // tipos de mensagem inválidos (causa do Job 295).
    if (!telefoneLimpo || !unidadeId) {
      logger.info('[Worker] Ignorando payload sem telefone ou unidade (provável status/system message).');
      return { ok: true, skipped: 'invalid_payload' };
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

    try {
      const content = messageText ? String(messageText).trim() : '';
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
    const nomeAssistente = configPerfil?.nome_assistente || 'assistente virtual';
    const tomDeVoz = configPerfil?.tom_de_voz || 'Profissional';
    const saudacaoPersonalizada = configPerfil?.saudacao_personalizada || null;

    // Mapeamento de tom de voz para instruções de comportamento
    const tomsDeVoz = {
      'Formal': 'Seja extremamente profissional, use linguagem formal e evite gírias. Trate o cliente com "senhor" ou "senhora".',
      'Profissional': 'Seja profissional, mas acessível. Use linguagem clara e educada.',
      'Descontraído': 'Seja amigável e descontraído, mas mantenha o profissionalismo. Pode usar emojis ocasionalmente.',
      'Jovem': 'Seja jovem, dinâmico e use uma linguagem mais casual. Use emojis para deixar a conversa mais leve.',
      'Caloroso': 'Seja extremamente acolhedor e empático. Demonstre genuíno interesse pelo cliente.'
    };

    const instrucaoTom = tomsDeVoz[tomDeVoz] || tomsDeVoz['Profissional'];

    const servicosTexto = servicosContexto.length > 0
      ? servicosContexto.map(s => `- ${s.nome} (ID: ${s.id}, ${s.duracao_minutos} min, R$ ${parseFloat(s.preco).toFixed(2)})`).join('\n')
      : 'Aguarde enquanto verifico os serviços disponíveis';

    const agentesTexto = agentesContexto.length > 0
      ? agentesContexto.map(a => `- ${a.nome} (ID: ${a.id})`).join('\n')
      : 'Aguarde enquanto verifico os profissionais disponíveis';

    const clienteSaudacao = clienteNome ? `O cliente se chama ${clienteNome}.` : '';

    // 🧠 FASE 3: FORMATAÇÃO DE PREFERÊNCIAS PARA O PROMPT
    // ✅ Acesso seguro (preferenciasCliente é sempre objeto, nunca undefined)
    const prefNome = preferenciasCliente?.profissional_nome || 'não definido';
    const temPreferencias = !!(preferenciasCliente?.profissional_nome || preferenciasCliente?.observacoes);

    let preferenciasTexto = '';
    if (temPreferencias) {
      const partes = [];

      if (preferenciasCliente?.profissional_nome) {
        partes.push(`Profissional preferido: ${preferenciasCliente.profissional_nome} (ID: ${preferenciasCliente.profissional_preferido_id})`);
      }

      if (preferenciasCliente?.observacoes) {
        partes.push(`Observações: ${preferenciasCliente.observacoes}`);
      }

      if (partes.length > 0) {
        preferenciasTexto = `\n\n🧠 PREFERÊNCIAS DO CLIENTE (MEMÓRIA DE LONGO PRAZO):\n${partes.join('\n')}`;
      }
    }

    // 🎯 SYSTEM PROMPT DINÂMICO E WHITE-LABEL
    const systemPrompt = `Você é ${nomeAssistente} de ${nomeUnidade}.

📅 Data de hoje: ${dataAtual}

${clienteSaudacao}${preferenciasTexto}

🏢 ID da Unidade: ${unidadeId}
${clienteId ? `👤 ID do Cliente: ${clienteId}` : ''}

🎭 TOM DE VOZ E PERSONALIDADE:
${instrucaoTom}
${saudacaoPersonalizada ? `\nSaudação personalizada: "${saudacaoPersonalizada}"` : ''}

🎯 BLINDAGEM DE ESCOPO (ANTI-ALUCINAÇÃO):
Você é uma recepcionista profissional focada EXCLUSIVAMENTE em:
- Agendamentos (criar, consultar, cancelar, remarcar)
- Informações sobre a unidade (serviços, profissionais, horários)
- Lista de espera
- Preferências do cliente

⛔ PROIBIÇÕES ABSOLUTAS:
Você é ESTRITAMENTE PROIBIDA de elaborar respostas sobre assuntos fora do escopo:
- Filosofia, religião, política, esportes
- Matemática, física, química, ciências em geral
- Receitas culinárias, dicas de saúde, conselhos pessoais
- Piadas complexas, histórias longas, conversas casuais
- Qualquer assunto que não seja relacionado a agendamentos ou à unidade

📐 REGRA DE OURO DO REDIRECIONAMENTO:
Se o cliente fizer uma pergunta fora do escopo:
1. Responda com NO MÁXIMO UMA FRASE curta, bem-humorada e educada
2. Use jogo de cintura para desviar o assunto SEM ser rude
3. Redirecione IMEDIATAMENTE para o agendamento com uma pergunta

✅ EXEMPLOS CORRETOS:
- Pergunta: "Qual é o sentido da vida?"
  Resposta: "Haha, de filosofia eu não entendo muito, minha especialidade é cuidar do seu agendamento! 😅 Como posso te ajudar com os seus horários hoje?"

- Pergunta: "Quanto é 2+2?"
  Resposta: "Matemática não é meu forte, mas agendamentos eu domino! 😄 Quer marcar um horário?"

- Pergunta: "Me conta uma piada"
  Resposta: "Ah, piadas eu deixo pros profissionais! 😆 Mas posso te ajudar a agendar um horário. Topa?"

❌ EXEMPLO ERRADO (NUNCA FAÇA):
- Pergunta: "Qual é o sentido da vida?"
  Resposta: "Essa é uma pergunta profunda que muitas pessoas refletem ao longo de suas vidas. O sentido da vida pode variar de pessoa para pessoa..." [TEXTO LONGO - PROIBIDO]

👥 EQUIPE DA UNIDADE (Profissionais Cadastrados):
${agentesTexto}

⚠️ ATENÇÃO - LEIA COM CUIDADO:
Esses são os profissionais CADASTRADOS na unidade.
Cada um tem sua própria agenda e dias de folga.

🚫 VOCÊ NÃO SABE:
- Quais dias cada um trabalha
- Quais horários estão livres
- Se estão trabalhando hoje

✅ PARA SABER ISSO:
Use a ferramenta consultar_disponibilidade SEMPRE que o cliente perguntar.

💬 NUNCA diga: "O João trabalha na quinta" sem consultar antes!
💬 SEMPRE diga: "Deixa eu conferir a agenda do João pra você!" [e consulte]

🎯 Serviços disponíveis:
${servicosTexto}

⚠️ IMPORTANTE - Ao usar ferramentas:
- SEMPRE use unidade_id: ${unidadeId}
- NUNCA use IDs fixos como 1 ou 2
- Use a data de hoje (${dataAtual}) como referência

🧠 PROTOCOLO DE USO DE PREFERÊNCIAS (FASE 3 - MEMÓRIA):
${temPreferencias ? `
- O cliente TEM preferências cadastradas (veja acima em "PREFERÊNCIAS DO CLIENTE")
- Ao cumprimentar, seja proativo e mencione a preferência: "Olá ${clienteNome || ''}! Tudo bem? ${preferenciasCliente?.profissional_nome ? `Quer marcar com ${prefNome} como de costume?` : 'Como posso ajudar você hoje?'}"
- Se o cliente confirmar que quer o profissional preferido, use o ID ${preferenciasCliente?.profissional_preferido_id} diretamente
- Se o cliente mencionar uma NOVA preferência ou MUDANÇA de preferência (ex: "Agora prefiro o João", "Não gosto mais de café"), chame a ferramenta atualizar_preferencias com cliente_id: ${clienteId}
` : `
- O cliente NÃO tem preferências cadastradas ainda
- Se durante a conversa o cliente mencionar EXPLICITAMENTE uma preferência (ex: "Sempre quero agendar com o João", "Prefiro horários pela manhã"), chame a ferramenta atualizar_preferencias com cliente_id: ${clienteId} para registrar
- NÃO invente preferências - só registre o que o cliente DISSE
`}

🗓️ REGRA DE OURO DA AGENDA (ANTI-ALUCINAÇÃO - PRIORIDADE MÁXIMA):
Você é uma recepcionista que acabou de começar hoje. Você NÃO conhece a agenda de nenhum profissional de cor.
Para QUALQUER pergunta sobre agenda, você é OBRIGADA a consultar o sistema primeiro.

⛔ PROIBIDO RESPONDER SEM CONSULTAR:
- "O [profissional] trabalha na [dia]?"
- "Que dias o [profissional] trabalha?"
- "Tem horário na [dia] com [profissional]?"
- "Qual o primeiro horário disponível com [profissional]?"
- Qualquer variação dessas perguntas

✅ FLUXO CORRETO:
1. Cliente pergunta sobre agenda → "Deixa eu conferir a agenda dele pra você!"
2. Você chama consultar_disponibilidade
3. Você apresenta o resultado baseado no que o sistema retornou

❌ FLUXO PROIBIDO (ALUCINAÇÃO):
1. Cliente: "O Damião trabalha sexta?"
2. Você: "Sim, trabalha!" [SEM CONSULTAR]
❌ Isso é ALUCINAÇÃO. NUNCA faça isso.

🎯 GATILHOS OBRIGATÓRIOS para consultar_disponibilidade:
- Cliente menciona dia da semana + profissional
- Cliente pergunta sobre disponibilidade
- Cliente quer saber se profissional trabalha em determinado dia
- Cliente quer ver horários
- Cliente pergunta "que dias" ou "quais horários" de profissional

💡 REGRA SIMPLES: Na dúvida, consulte. É melhor consultar demais do que alucinar.

🎯 COMO INICIAR UM AGENDAMENTO (TOM DE VENDEDOR):
Quando o cliente manifesta interesse em agendar, seja proativa e entusiasmada!

✅ EXEMPLO CORRETO:
Cliente: "Quero marcar um horário"
Você: "Maravilha! Temos o ${agentesContexto.map(a => a.nome).join(' e o ')} aqui. Com qual dos dois você prefere se atender?"

📌 IMPORTANTE:
- NÃO consulte disponibilidade antes de saber qual profissional o cliente quer
- A escolha do profissional vem PRIMEIRO
- DEPOIS você consulta a agenda dele com consultar_disponibilidade

⚠️ NUNCA pré-selecione automaticamente. Sempre pergunte com qual profissional o cliente quer ser atendido!

🎭 COMO VOCÊ DEVE SE COMPORTAR:
- Seja calorosa, entusiasmada e consultiva (recepcionista de salão, não robô de suporte técnico)
- SEMPRE consulte a agenda antes de responder perguntas sobre disponibilidade
- NUNCA presuma que um profissional trabalha em determinado dia sem consultar
- NUNCA invente horários ou informações sobre agenda
- Trate cada agendamento como uma venda: ofereça alternativas, seja proativa
- Se não der certo com um profissional/dia, ofereça outro (vendedor experiente!)
- Use linguagem natural: "Deixa eu ver aqui pra você", "Vou conferir", não "Executando consulta"

🚫 REGRA ANTIDUPLICIDADE (CRÍTICA):
- NUNCA chame a ferramenta criar_agendamento até que o cliente tenha confirmado EXPLICITAMENTE o serviço, a data e o horário escolhidos.
- A ferramenta consultar_disponibilidade serve APENAS para listar horários. Ela NUNCA agenda.
- A ferramenta criar_agendamento só pode ser chamada UMA ÚNICA VEZ, exatamente quando o cliente confirmar.
- Se o cliente apenas informar um horário (sem confirmar), responda confirmando os detalhes (serviço, data e hora) e AGUARDE o cliente dizer "sim", "pode agendar", "confirmo" ou equivalente antes de chamar criar_agendamento.
- Não chame criar_agendamento para "garantir" ou "pré-reservar" o horário. Isso causa agendamentos duplicados.

🎯 PROTOCOLO DE RESERVA EM DUAS ETAPAS (OBRIGATÓRIO):
1. Cliente escolhe um horário da lista
2. Você DEVE chamar validar_agendamento para verificar se o horário ainda está livre
3. Se disponível, você responde: "Perfeito! O horário [hora] está livre. Posso confirmar para você?"
4. Cliente confirma: "Sim", "Pode agendar", "Confirmo", etc.
5. SOMENTE AGORA você chama criar_agendamento UMA ÚNICA VEZ

⚠️ PROIBIDO - Gatilho Imediato:
- NUNCA chame criar_agendamento na mesma mensagem em que o cliente escolhe o horário
- SEMPRE use validar_agendamento primeiro
- SEMPRE peça confirmação final antes de criar
- Se validar_agendamento retornar indisponível, informe o cliente e ofereça outros horários

🚫 PROIBIÇÃO ABSOLUTA - Re-chamada de Ferramentas:
- NUNCA chame criar_agendamento mais de uma vez na mesma conversa para o mesmo horário
- Se você já chamou criar_agendamento e recebeu um agendamento_id, NUNCA chame novamente
- Se o cliente confirmar após você já ter criado, apenas responda com a mensagem de confirmação
- NÃO tente "re-agendar", "re-confirmar" ou "garantir" o horário chamando a ferramenta novamente
- Uma vez criado o agendamento, sua única função é informar o cliente com o ID recebido

⚠️ OBRIGATÓRIO - Ao criar agendamento para cliente novo:
- Se você já possui o nome do cliente no contexto da conversa ou ele foi recuperado do banco de dados, NÃO peça o nome novamente. Apenas peça o nome se for um cliente novo e o campo nome estiver vazio.
- Antes de perguntar o nome, verifique se você já tem essa informação no histórico da sessão
- Se não tiver o nome e for um cliente novo, pergunte: "Para que eu possa realizar o cadastro, poderia me informar seu nome completo?"
- Use o nome fornecido no parâmetro 'cliente_nome' da ferramenta criar_agendamento

⚠️ OBRIGATÓRIO - Ao confirmar agendamento:
- SEMPRE mencione o ID do agendamento na sua resposta (ex: "Agendamento #123 confirmado!")
- O ID está em 'agendamento_id' no retorno da ferramenta criar_agendamento
- Exemplo: "Pronto! Seu agendamento #123 está confirmado para [data] às [hora]"

📋 CONSULTA DE AGENDAMENTOS (RECEPCIONISTA COMPLETA):
- Você é uma recepcionista COMPLETA e tem acesso ao banco de dados.
- Se o cliente perguntar sobre os agendamentos dele (ex: "tenho algo marcado?", "quais meus horários?", "quando é meu próximo atendimento?"), use a ferramenta listar_agendamentos_cliente para buscar os registros.
- NUNCA diga que não tem acesso a informações que estão no banco de dados. Você TEM acesso — basta usar a ferramenta.
- Apresente os agendamentos de forma natural e amigável ao cliente (ex: "Você tem um agendamento no dia 2 de junho às 14h com o João").

🆔 PROTOCOLO DE INTEGRIDADE DE ID:
- Para cancelar ou alterar um agendamento, você deve usar o ID numérico real do campo "agendamento_id" retornado pela ferramenta listar_agendamentos_cliente.
- Se não tiver o ID no contexto atual da conversa, chame listar_agendamentos_cliente primeiro para obter os IDs corretos antes de cancelar ou alterar.

🔄 PROTOCOLO DE RETENÇÃO (Ao receber pedido de cancelamento):
⚠️ ATENÇÃO - EXCEÇÃO CRÍTICA: Este protocolo SÓ deve ser aplicado para cancelamentos COMUNS e PACÍFICOS. Se o cliente estiver irritado, demonstrando raiva ou usando linguagem agressiva, PULE COMPLETAMENTE este protocolo e vá direto para a 🚨 GESTÃO DE CRISE (abaixo).

Você é uma especialista em retenção, mas NUNCA prende o cliente. Fluxo (apenas para cancelamentos pacíficos):
1. Pergunte gentilmente o MOTIVO do cancelamento (ex: "Sinto muito que precise cancelar! Posso saber o motivo?").
2. Se fizer sentido, ofereça um reagendamento como alternativa (ex: "Quer que eu veja outro horário para você?").
3. Se o cliente insistir em cancelar ou recusar o reagendamento, NÃO insista mais: PRIMEIRO garanta que você tem o agendamento_id REAL (via listar_agendamentos_cliente), depois chame cancelar_agendamento e envie uma mensagem curta e educada de despedida (ex: "Tudo bem! Seu agendamento #123 foi cancelado. Quando quiser, é só chamar. 💙").

📝 CAPTURA DE MOTIVO (OBRIGATÓRIO):
- Ao chamar cancelar_agendamento, preencha o parâmetro 'motivo' com o TEXTO REAL que o cliente escreveu (não invente um motivo genérico).

⚠️ Ao confirmar o cancelamento:
- SEMPRE mencione o ID do agendamento cancelado (ex: "Agendamento #123 cancelado")
- O ID está em 'agendamento_id' no retorno da ferramenta cancelar_agendamento

⏳ ÁRVORE DE DECISÃO DE DISPONIBILIDADE (HIERARQUIA OBRIGATÓRIA):
Após chamar consultar_disponibilidade, você DEVE seguir EXATAMENTE esta ordem de análise:

🔴 REGRA 1 - PROFISSIONAL DE FOLGA (Bloqueio Absoluto de Lista de Espera):
Se agente_trabalha_neste_dia === false:
- ⛔ PROIBIDO mencionar "lista de espera" em qualquer circunstância
- ⛔ PROIBIDO oferecer aguardar vaga
- ⛔ PROIBIDO usar palavras: "espera", "avisar quando surgir vaga", "desistência"
- ✅ OBRIGATÓRIO: Oferecer alternativas imediatamente
  
  Resposta OBRIGATÓRIA (escolha uma das duas):
  a) "O [Nome] não atende na [dia da semana]. Gostaria de verificar outro dia com ele ou agendar com [outro profissional disponível]?"
  b) "Infelizmente o [Nome] não trabalha na [dia da semana]. Posso ver outros dias que ele atende ou mostrar outros profissionais disponíveis nesse dia. Qual você prefere?"
  
  🎯 AÇÃO SEGUINTE: Seja consultiva - pergunte qual alternativa cliente prefere e execute

🟡 REGRA 2 - VENDA ATIVA (Profissional Trabalha, Tem Vagas, Mas Não no Horário Pedido):
Se agente_trabalha_neste_dia === true E slots.length > 0 (mas cliente pediu horário específico ocupado):
- ⛔ PROIBIDO mencionar "lista de espera" 
- ✅ OBRIGATÓRIO: Vender os horários disponíveis ativamente
  
  Resposta OBRIGATÓRIA:
  "Infelizmente o horário das [X] está ocupado, mas tenho esses outros horários disponíveis com [Nome]: [lista os horários]. Qual desses funciona melhor pra você?"
  
  🎯 AÇÃO SEGUINTE: Aguarde escolha do cliente e prossiga com agendamento

🟢 REGRA 3 - AGENDA LOTADA (Única Situação para Lista de Espera):
Se agente_trabalha_neste_dia === true E slots.length === 0 (ZERO horários livres):
- ✅ AUTORIZADO: Oferecer lista de espera
  
  Resposta OBRIGATÓRIA:
  "Infelizmente todos os horários com [Nome] na [dia] estão ocupados, mas posso te colocar na lista de espera! Se surgir uma desistência, eu te aviso imediatamente via WhatsApp. Quer entrar na lista?"
  
  🎯 AÇÃO SEGUINTE: Se cliente aceitar, chame adicionar_lista_espera

⚠️ CHECKPOINT DE VALIDAÇÃO (ANTES DE RESPONDER):
Antes de digitar QUALQUER resposta sobre disponibilidade, pergunte-se mentalmente:
1. ✅ Eu consultei o sistema? (Se não, PARE e consulte)
2. ✅ O profissional trabalha neste dia? (agente_trabalha_neste_dia)
3. ✅ Se NÃO trabalha → Segui REGRA 1? (ofereci alternativas SEM mencionar lista de espera)
4. ✅ Se trabalha e TEM slots → Segui REGRA 2? (vendi os horários disponíveis)
5. ✅ Se trabalha e ZERO slots → Segui REGRA 3? (oferecer lista de espera)

🚨 VIOLAÇÃO CRÍTICA - NUNCA FAÇA ISSO:
❌ "O profissional não trabalha hoje, mas posso colocar você na lista de espera" [ERRADO - REGRA 1 VIOLADA]
❌ "Tem horário às 14h, mas prefere lista de espera?" [ERRADO - REGRA 2 VIOLADA]
❌ Oferecer lista de espera quando agente_trabalha_neste_dia === false [BLOQUEIO ABSOLUTO]

✅ SEMPRE CORRETO:
✅ "O profissional não trabalha hoje. Quer ver outro dia com ele ou outro profissional?" [REGRA 1]
✅ "Esse horário está ocupado, mas tenho 14h e 15h livres. Qual prefere?" [REGRA 2]
✅ "Todos os horários estão ocupados. Quer lista de espera?" [REGRA 3]

🚨 GESTÃO DE CRISE (FASE 2 - Human-in-the-loop) - PRIORIDADE MÁXIMA:

⚡ OVERRIDE DE HIERARQUIA: Esta seção SEMPRE anula o "Protocolo de Retenção" quando o cliente demonstrar irritação.

📍 GATILHOS EXPLÍCITOS (detecção obrigatória):
Você DEVE acionar este protocolo IMEDIATAMENTE ao detectar qualquer um dos seguintes sinais:
1. Palavras-chave de insatisfação severa: "horrível", "péssimo", "ruim", "ridículo", "não funciona", "não resolve nada", "cancela tudo"
2. Xingamentos ou linguagem agressiva (ex: "que merda", "atendimento de bosta")
3. Uso de CAPS LOCK indicando raiva (ex: "CANCELA ISSO AGORA")
4. Múltiplas reclamações na mesma mensagem (ex: "que sistema horrível, atendimento péssimo")
5. Cliente expressa desistência com raiva (ex: "quer saber? esquece", "não quero mais", "desisto")
6. Conversa atingir 3 turnos sem conseguir resolver o problema do cliente

🎯 ORDEM OBRIGATÓRIA DE AÇÃO (NUNCA INVERTA):
1. PRIMEIRO: Chame IMEDIATAMENTE a ferramenta notificar_humano com:
   - motivo: transcreva literalmente a mensagem do cliente
   - nivel_urgencia: "alta" (se houver xingamentos) ou "media" (se houver insatisfação clara)
   - mensagem_cliente: a mensagem completa do cliente

2. DEPOIS: Responda ao cliente com empatia e finalize:
   "Entendo sua frustração. Já notifiquei nossa equipe e alguém entrará em contato com você em breve para resolver isso da melhor forma. Desculpe pelo transtorno."

⛔ PROIBIÇÕES ABSOLUTAS EM CRISE:
- NUNCA tente reter ou argumentar com um cliente irritado
- NUNCA pergunte o motivo da insatisfação (ele já deixou claro que está insatisfeito)
- NUNCA ofereça alternativas ou soluções (escale para humano)
- NUNCA ignore os gatilhos acima tentando "salvar" a situação sozinho

⚠️ EXCEÇÃO (NÃO ACIONE A CRISE APÓS SUCESSO): Se o objetivo do cliente (agendamento) foi concluído com sucesso e você já confirmou o agendamento ao cliente com o ID, NÃO acione este protocolo de crise, mesmo que atinja o limite de interações. Apenas finalize a conversa educadamente.`;

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
    try {
      aiResult = await aiAgentService.processMessage({
        message: messageText,
        history: currentHistory,
        tools,
        systemPrompt,
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
          if (toolName === 'listar_agendamentos_cliente') {
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

            const created = await CreateAppointmentUseCase.execute({
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
            // 🔧 IMPLEMENTAÇÃO: Cancelamento de agendamento
            const agendamentoId = parseInt(args?.agendamento_id, 10);
            const motivo = args?.motivo || 'Cancelado pelo cliente via WhatsApp';

            // 🔄 RETENÇÃO SUAVE: a oferta de reagendamento antes do cancelamento é
            // conduzida pela IA via System Prompt; o cancelamento não é bloqueado aqui.
            logger.debug(`[Worker] Tentando cancelar agendamento ID: ${agendamentoId}`);

            try {
              // 🛡️ TRAVA DE PROPRIEDADE (ANTI-MISMATCH DE ID) ──────────────────
              // O cancelamento SÓ pode atingir um agendamento que pertença ao
              // cliente desta conversa (mesmo telefone_limpo). Isso impede que a
              // IA cancele o agendamento errado ao confundir o ÍNDICE visual da
              // lista (1, 2, 3...) com o ID real do banco (ex: #33).
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
                  'agendamentos.hora_inicio'
                )
                .orderBy('agendamentos.data_agendamento', 'asc')
                .orderBy('agendamentos.hora_inicio', 'asc');

              // O agendamento alvo precisa estar DENTRO da lista do próprio cliente.
              const agendamento = agendamentosDoCliente.find(a => a.id === agendamentoId);

              if (!Number.isInteger(agendamentoId) || !agendamento) {
                // ❌ ID inválido OU não pertence ao cliente: NUNCA cancelar.
                // Devolvemos a lista real para que a IA escolha o ID correto e
                // jamais "adivinhe" a partir do índice da mensagem de texto.
                logger.warn(`[Worker] Cancelamento BLOQUEADO: agendamento_id=${args?.agendamento_id} não pertence ao cliente (telefone=${telefoneLimpo}) ou é inválido.`);
                toolResult = {
                  ok: false,
                  error: {
                    message: 'O agendamento_id informado NÃO pertence a este cliente ou não existe. ATENÇÃO: não use o número do índice da lista (1, 2, 3). Use o campo agendamento_id retornado por listar_agendamentos_cliente. Escolha o ID correto entre os agendamentos abaixo.',
                    code: 'ID_NAO_PERTENCE_AO_CLIENTE'
                  },
                  agendamentos_do_cliente: agendamentosDoCliente.map(a => ({
                    agendamento_id: a.id,
                    data_agendamento: a.data_agendamento,
                    hora_inicio: a.hora_inicio,
                    status: a.status
                  }))
                };
              } else if (agendamento.status === 'Cancelado') {
                logger.debug(`[Worker] Agendamento ${agendamentoId} já está cancelado`);
                toolResult = { 
                  ok: false, 
                  error: { 
                    message: 'Este agendamento já foi cancelado anteriormente.',
                    code: 'ALREADY_CANCELLED'
                  } 
                };
              } else {
                // Cancelar agendamento
                await db('agendamentos')
                  .where('id', agendamentoId)
                  .update({
                    status: 'Cancelado',
                    observacoes: db.raw(`COALESCE(observacoes, '') || '\n[Cancelado via WhatsApp] ' || ?`, [motivo]),
                    updated_at: db.fn.now()
                  });

                logger.info(`[Worker] Agendamento ${agendamentoId} cancelado com sucesso`);

                agendamentoCancelado = true;

                toolResult = { 
                  ok: true, 
                  agendamento_id: agendamentoId,
                  message: 'Agendamento cancelado com sucesso',
                  data_agendamento: agendamento.data_agendamento,
                  hora_inicio: agendamento.hora_inicio
                };
              }
            } catch (err) {
              logger.error(`[Worker] Erro ao cancelar agendamento ${agendamentoId}:`, err.message);
              
              // Verificar se é erro de FK (agendamento tem dependências)
              const isFKError = err.message?.includes('foreign key') || err.code === '23503';
              
              toolResult = { 
                ok: false, 
                error: { 
                  message: isFKError 
                    ? 'Não foi possível cancelar este agendamento devido a restrições do sistema. Entre em contato com o suporte.'
                    : `Erro ao cancelar agendamento: ${err.message}`,
                  code: isFKError ? 'FK_CONSTRAINT' : 'DB_ERROR',
                  technical: err.message
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

const { db } = require('../config/knex');
const crypto = require('crypto');
const Agendamento = require('../models/Agendamento');
const Cliente = require('../models/Cliente');
const BookingAvailabilityService = require('../services/BookingAvailabilityService');
const RecurringAppointmentService = require('../services/RecurringAppointmentService');
const WhatsAppService = require('../services/WhatsAppService');
const ScheduledReminderService = require('../services/ScheduledReminderService');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/encryption');
const { getInstance: getRedisService } = require('../services/RedisService');

function makeError(message, code, httpStatus, details) {
  const err = new Error(message);
  if (code) err.code = code;
  if (httpStatus) err.httpStatus = httpStatus;
  if (details !== undefined) err.details = details;
  return err;
}

class ConflictError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ConflictError';
    this.code = 'RACE_CONDITION_DETECTED';
    this.httpStatus = 409;
    this.details = details;
  }
}

/**
 * Adquirir lock distribuído para prevenir race conditions
 * @param {Object} params - Parâmetros do lock
 * @param {number} params.unidadeId - ID da unidade
 * @param {number} params.agenteId - ID do agente
 * @param {string} params.dataAgendamento - Data do agendamento (YYYY-MM-DD)
 * @param {string} params.horaInicio - Hora de início (HH:MM)
 * @returns {Promise<{lockKey: string, acquired: boolean}>}
 */
async function acquireBookingLock({ unidadeId, agenteId, dataAgendamento, horaInicio }) {
  const redisService = getRedisService();
  const lockKey = `booking_lock:${unidadeId}:${agenteId}:${dataAgendamento}:${horaInicio}`;
  const lockTTL = 10; // 10 segundos - tempo máximo para processar o agendamento

  logger.log(`🔒 [CreateAppointmentUseCase] Tentando adquirir lock: ${lockKey}`);

  try {
    if (redisService.isRedisAvailable && redisService.redis) {
      // Redis disponível: usar SET NX EX para lock atômico
      const result = await redisService.redis.set(lockKey, 'locked', {
        NX: true,  // Only set if key doesn't exist
        EX: lockTTL // Expiration in seconds
      });

      if (result === 'OK') {
        logger.log(`✅ [CreateAppointmentUseCase] Lock adquirido: ${lockKey}`);
        return { lockKey, acquired: true };
      } else {
        logger.warn(`⚠️  [CreateAppointmentUseCase] Lock já existe (outra transação em andamento): ${lockKey}`);
        return { lockKey, acquired: false };
      }
    } else {
      // Redis indisponível: FAIL-CLOSED para garantir consistência
      logger.error(`🔴 [CreateAppointmentUseCase] Redis indisponível - bloqueando agendamento por segurança`);
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Sistema de lock indisponível. Tente novamente em instantes.');
      }
      
      // Em desenvolvimento, permitir prosseguir com warning
      logger.warn(`⚠️  [CreateAppointmentUseCase] DESENVOLVIMENTO: Prosseguindo sem lock (NÃO USAR EM PRODUÇÃO)`);
      return { lockKey, acquired: true };
    }
  } catch (error) {
    logger.error(`❌ [CreateAppointmentUseCase] Erro ao adquirir lock: ${error.message}`);
    
    // CONSISTÊNCIA PRIORITÁRIA: Em caso de erro, bloqueamos o agendamento
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Sistema de proteção de agendamentos temporariamente indisponível. Tente novamente.');
    }
    
    // Em desenvolvimento, permitir prosseguir com warning
    logger.warn(`⚠️  [CreateAppointmentUseCase] DESENVOLVIMENTO: Prosseguindo apesar do erro no lock`);
    return { lockKey, acquired: true };
  }
}

/**
 * Liberar lock distribuído
 * @param {string} lockKey - Chave do lock a ser liberado
 */
async function releaseBookingLock(lockKey) {
  if (!lockKey) return;

  const redisService = getRedisService();
  
  try {
    if (redisService.isRedisAvailable && redisService.redis) {
      await redisService.redis.del(lockKey);
      logger.log(`🔓 [CreateAppointmentUseCase] Lock liberado: ${lockKey}`);
    }
  } catch (error) {
    // Erro ao liberar lock não é crítico (TTL vai expirar automaticamente)
    logger.warn(`⚠️  [CreateAppointmentUseCase] Erro ao liberar lock (TTL vai expirar automaticamente): ${error.message}`);
  }
}

function normalizeTelefoneLimpo(value) {
  if (!value) return null;
  return String(value).replace(/@s\.whatsapp\.net$/i, '').replace(/\D/g, '');
}

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

function normalizeBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return Boolean(value);
}

async function runSideEffects({ agendamentoId, sendConfirmation = true }) {
  try {
    const whatsAppService = new WhatsAppService();
    const scheduledReminderService = new ScheduledReminderService();

    const agendamento = await db('agendamentos')
      .where('id', agendamentoId)
      .whereNull('deleted_at')
      .first();

    if (!agendamento) {
      logger.error('❌ [CreateAppointmentUseCase.runSideEffects] Agendamento não encontrado para disparar notificações', { agendamentoId });
      return { ok: false, reason: 'AGENDAMENTO_NOT_FOUND' };
    }

    const cliente = await db('clientes').where('id', agendamento.cliente_id).first();
    const agente = await db('agentes').where('id', agendamento.agente_id).first();
    const unidade = await db('unidades')
      .where('id', agendamento.unidade_id)
      .select('id', 'nome', 'telefone', 'slug_url', 'endereco')
      .first();

    if (!cliente || !agente || !unidade) {
      logger.error('❌ [CreateAppointmentUseCase.runSideEffects] Dados insuficientes para disparar notificações (cliente/agente/unidade)', {
        agendamentoId,
        hasCliente: !!cliente,
        hasAgente: !!agente,
        hasUnidade: !!unidade
      });
      return { ok: false, reason: 'MISSING_RELATED_DATA' };
    }

    const servicos = await db('agendamento_servicos')
      .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
      .where('agendamento_servicos.agendamento_id', agendamentoId)
      .select('servicos.nome', 'agendamento_servicos.preco_aplicado as preco');

    const nomeCliente = `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim() || 'Cliente';
    const nomeAgente = `${agente.nome || ''} ${agente.sobrenome || ''}`.trim() || 'Agente';

    let pontosGanhos = 0;
    let saldoAtualizado = 0;
    try {
      const pontosRow = await db('pontos_historico')
        .where('agendamento_id', agendamentoId)
        .where('tipo', 'CREDITO')
        .sum('pontos as total')
        .first();

      pontosGanhos = Number(pontosRow?.total || 0) || 0;

      const saldoRow = await db('clientes')
        .where('id', cliente.id)
        .select('saldo_pontos')
        .first();

      saldoAtualizado = Number(saldoRow?.saldo_pontos || 0) || 0;
    } catch (err) {
      logger.error('❌ [CreateAppointmentUseCase.runSideEffects] Erro ao calcular pontosGanhos/saldoAtualizado:', {
        message: err?.message,
        code: err?.code,
        stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
        agendamentoId
      });
    }

    const payload = {
      cliente: { nome: nomeCliente },
      cliente_telefone: cliente.telefone,
      agente: { nome: nomeAgente },
      agente_telefone: agente.telefone,
      unidade: {
        id: unidade.id,
        nome: unidade.nome,
        slug_url: unidade.slug_url
      },
      unidade_id: unidade.id,
      unidade_telefone: unidade.telefone,
      unidade_endereco: unidade.endereco,
      agendamento_id: agendamento.id,
      numero_agendamento: agendamento.numero_agendamento,
      data_agendamento: agendamento.data_agendamento,
      hora_inicio: agendamento.hora_inicio,
      hora_fim: agendamento.hora_fim,
      valor_total: agendamento.valor_total,
      servicos: (servicos || []).map(s => ({ nome: s.nome, preco: s.preco })),
      pontosGanhos,
      saldoAtualizado
    };

    if (sendConfirmation) {
      try {
        await whatsAppService.sendAppointmentConfirmation(payload);
      } catch (err) {
        logger.error('❌ [CreateAppointmentUseCase.runSideEffects] Erro ao enviar confirmação WhatsApp:', {
          message: err?.message,
          code: err?.code,
          httpStatus: err?.httpStatus,
          details: err?.details,
          stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
          agendamentoId
        });
      }
    }

    try {
      await scheduledReminderService.criarLembretesProgramados({
        agendamento_id: agendamento.id,
        unidade_id: agendamento.unidade_id,
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        cliente_telefone: cliente.telefone
      });
    } catch (err) {
      logger.error('❌ [CreateAppointmentUseCase.runSideEffects] Erro ao criar lembretes programados:', {
        message: err?.message,
        code: err?.code,
        constraint: err?.constraint,
        detail: err?.detail,
        stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
        agendamentoId
      });
    }

    return { ok: true };
  } catch (err) {
    logger.error('❌ [CreateAppointmentUseCase.runSideEffects] Erro inesperado em side effects:', {
      message: err?.message,
      code: err?.code,
      httpStatus: err?.httpStatus,
      details: err?.details,
      stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
      agendamentoId
    });
    return { ok: false, reason: 'UNEXPECTED_ERROR' };
  }
}

async function gerarPixSinal({
  trx,
  usuarioId,
  unidadeId,
  agendamentoId,
  cliente,
  amount
}) {
  const integracao = await trx('integracoes_mercadopago')
    .where({ unidade_id: unidadeId, usuario_id: usuarioId, status: 'CONNECTED' })
    .select(
      'id',
      'access_token_ciphertext',
      'access_token_iv',
      'access_token_auth_tag',
      'expires_at'
    )
    .first();

  if (!integracao) {
    throw makeError(
      'Integração Mercado Pago não conectada para esta unidade',
      'INTEGRATION_ERROR',
      400,
      { provider: 'mercadopago', reason: 'MP_NOT_CONNECTED' }
    );
  }

  if (integracao.expires_at && new Date(integracao.expires_at).getTime() <= Date.now()) {
    throw makeError(
      'Token do Mercado Pago expirado. Reconecte a integração.',
      'INTEGRATION_ERROR',
      400,
      { provider: 'mercadopago', reason: 'MP_TOKEN_EXPIRED' }
    );
  }

  const idempotencyKey = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const externalReference = `agendamento_${agendamentoId}`;

  // 🔧 BYPASS DE DESENVOLVIMENTO: Se estivermos em ambiente dev E as credenciais forem mock,
  // gerar PIX falso sem chamar API real nem tentar descriptografar
  const isMockCredentials = integracao.access_token_iv === 'mock_iv_dev' || 
                           integracao.access_token_ciphertext === 'mock_ciphertext_dev';
  const isDevelopment = process.env.NODE_ENV === 'development';

  let mpPaymentId, qrCodeBase64, qrCode;

  if (isDevelopment && isMockCredentials) {
    // ✅ MOCK DE PIX PARA DESENVOLVIMENTO
    logger.info('🔧 [CreateAppointmentUseCase] Gerando PIX MOCK (ambiente de desenvolvimento)');
    
    mpPaymentId = `mock_payment_${agendamentoId}_${Date.now()}`;
    qrCodeBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // Pixel transparente 1x1
    qrCode = `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}520400005303986540${amount.toFixed(2)}5802BR5913MOCK_DEV_PIX6009SAO_PAULO62070503***6304${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    logger.warn('⚠️  [CreateAppointmentUseCase] PIX MOCK gerado - NÃO USAR EM PRODUÇÃO!', {
      agendamento_id: agendamentoId,
      unidade_id: unidadeId,
      amount,
      mp_payment_id: mpPaymentId
    });
  } else {
    // ✅ FLUXO REAL: Descriptografar token e chamar API do Mercado Pago
    const accessToken = decrypt({
      ciphertext: integracao.access_token_ciphertext,
      iv: integracao.access_token_iv,
      authTag: integracao.access_token_auth_tag
    });

    const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description: `Sinal agendamento #${agendamentoId}`,
        payment_method_id: 'pix',
        external_reference: externalReference,
        date_of_expiration: expiresAt.toISOString(),
        payer: {
          first_name: String(cliente?.primeiro_nome || '').trim() || 'Cliente',
          last_name: String(cliente?.ultimo_nome || '').trim() || ' ',
          email: String(cliente?.mp_customer_email || 'cliente@exemplo.com').trim().toLowerCase()
        },
        metadata: {
          unidade_id: Number(unidadeId),
          agendamento_id: Number(agendamentoId),
          cliente_id: Number(cliente.id)
        }
      })
    });

    const mpJson = await mpResp.json().catch(() => null);
    if (!mpResp.ok) {
      const err = new Error('Falha ao gerar Pix no Mercado Pago');
      err.code = 'MP_PIX_CREATE_FAILED';
      err.httpStatus = mpResp.status;
      err.mpError = mpJson;
      throw err;
    }

    mpPaymentId = mpJson?.id != null ? String(mpJson.id) : null;
    qrCodeBase64 = mpJson?.point_of_interaction?.transaction_data?.qr_code_base64 || null;
    qrCode = mpJson?.point_of_interaction?.transaction_data?.qr_code || null;

    if (!mpPaymentId || !qrCodeBase64 || !qrCode) {
      const err = new Error('Resposta inválida do Mercado Pago (dados Pix ausentes)');
      err.code = 'MP_PIX_INVALID_RESPONSE';
      err.mpError = mpJson;
      throw err;
    }
  }

  await trx('agendamento_pagamentos').insert({
    usuario_id: usuarioId,
    unidade_id: unidadeId,
    agendamento_id: agendamentoId,
    mp_payment_id: mpPaymentId,
    external_reference: externalReference,
    status: 'PENDING',
    amount: amount,
    idempotency_key: idempotencyKey,
    pix_qr_code_base64: qrCodeBase64,
    pix_copia_cola: qrCode,
    expires_at: expiresAt,
    created_at: new Date(),
    updated_at: new Date()
  });

  return {
    qr_code: qrCodeBase64,
    qr_code_copy: qrCode,
    expires_at: expiresAt.toISOString()
  };
}

async function execute(data, context) {
  if (!context || !context.usuarioId) {
    throw makeError('Contexto inválido: usuarioId é obrigatório', 'UNAUTHORIZED', 401);
  }

  const {
    unidadeId,
    agenteId,
    clienteId,
    clienteNome,
    clienteTelefone,
    dataNascimento,
    servicos,
    servicoExtraIds,
    dataAgendamento,
    horaInicio,
    horaFim,
    observacoes,
    recorrencia,
    suppressNotification,
    skipPaymentValidation,
    skipAvailabilityValidation  // 🔧 NOVO: Flag para pular validação redundante
  } = data || {};

  const unidadeIdInt = parseInt(unidadeId, 10);
  const agenteIdInt = parseInt(agenteId, 10);
  const usuarioIdInt = parseInt(context.usuarioId, 10);

  if (!unidadeIdInt || !agenteIdInt || !dataAgendamento || !horaInicio) {
    throw makeError('Dados obrigatórios não fornecidos para criar agendamento', 'MISSING_REQUIRED_FIELDS', 400);
  }

  let telefoneLimpo = normalizeTelefoneLimpo(clienteTelefone);

  if (!telefoneLimpo && clienteId) {
    const clienteRow = await db('clientes')
      .where('id', parseInt(clienteId, 10))
      .select('id', 'telefone', 'telefone_limpo')
      .first();

    telefoneLimpo = clienteRow?.telefone_limpo
      ? String(clienteRow.telefone_limpo)
      : normalizeTelefoneLimpo(clienteRow?.telefone);

    if (!telefoneLimpo) {
      throw makeError('Telefone do cliente não encontrado', 'CLIENT_PHONE_NOT_FOUND', 400);
    }
  }

  if (!telefoneLimpo) {
    throw makeError('Telefone do cliente inválido', 'INVALID_CLIENT_PHONE', 400);
  }

  const servicoIds = Array.isArray(servicos)
    ? servicos
      .map((s) => (typeof s === 'object' ? (s.servico_id ?? s.id) : s))
      .map((id) => parseInt(id, 10))
      .filter((n) => Number.isFinite(n))
    : [];

  if (servicoIds.length === 0) {
    throw makeError(
      '🚨 ERRO: Você tentou criar um agendamento sem especificar quais serviços o cliente deseja. AÇÃO NECESSÁRIA: Pergunte ao cliente "Qual serviço você gostaria de fazer?" e aguarde a resposta antes de chamar criar_agendamento novamente. Serviços disponíveis estão listados no System Prompt.',
      'MISSING_SERVICOS',
      400
    );
  }

  const agendamentoModel = new Agendamento();
  const bookingAvailabilityService = new BookingAvailabilityService();

  if (recorrencia && typeof recorrencia === 'object') {
    const recurringService = new RecurringAppointmentService({ agendamentoModel });

    const unidade = await db('unidades')
      .where('id', unidadeIdInt)
      .where('usuario_id', usuarioIdInt)
      .first();

    if (!unidade) {
      throw makeError('Unidade inválida ou não pertence ao usuário', 'UNIDADE_NOT_FOUND', 404);
    }

    const clienteModel = new Cliente();
    let clienteRecord = null;
    if (clienteId) {
      clienteRecord = await db('clientes')
        .where('id', parseInt(clienteId, 10))
        .where('unidade_id', unidadeIdInt)
        .whereNull('deleted_at')
        .first();
    }

    if (!clienteRecord) {
      const nome = String(clienteNome || 'Cliente').trim();
      console.log(`[CreateAppointmentUseCase] 🔍 AUDITORIA CADASTRO: clienteNome recebido="${clienteNome}", nome final="${nome}"`);
      clienteRecord = await clienteModel.findOrCreateForAgendamento(telefoneLimpo, nome, unidadeIdInt);
    }

    if (clienteRecord?.status === 'Bloqueado') {
      throw makeError('Cliente bloqueado', 'CLIENT_BLOCKED', 403);
    }

    const servicosRows = await db('servicos')
      .join('unidade_servicos', 'servicos.id', 'unidade_servicos.servico_id')
      .whereIn('servicos.id', servicoIds)
      .where('servicos.status', 'Ativo')
      .where('unidade_servicos.unidade_id', unidadeIdInt)
      .select('servicos.id', 'servicos.preco', 'servicos.duracao_minutos', 'servicos.comissao_percentual');

    if (servicosRows.length !== servicoIds.length) {
      throw makeError('Um ou mais serviços não estão disponíveis nesta unidade', 'SERVICOS_NOT_AVAILABLE', 400);
    }

    const extraIds = Array.isArray(servicoExtraIds)
      ? servicoExtraIds.map(id => parseInt(id, 10)).filter(n => Number.isFinite(n))
      : [];

    const extrasRows = extraIds.length > 0
      ? await db('servicos_extras')
        .whereIn('id', extraIds)
        .where('status', 'Ativo')
        .where('usuario_id', usuarioIdInt)
        .select('id', 'preco', 'duracao_minutos')
      : [];

    if (extrasRows.length !== extraIds.length) {
      throw makeError('Um ou mais serviços extras não estão disponíveis', 'EXTRAS_NOT_AVAILABLE', 400);
    }

    const horaFimFinal = horaFim
      ? horaFim
      : minutesToTime(
        timeToMinutes(horaInicio)
          + servicosRows.reduce((sum, s) => sum + (Number(s.duracao_minutos) || 0), 0)
          + extrasRows.reduce((sum, e) => sum + (Number(e.duracao_minutos) || 0), 0)
      );

    const result = await recurringService.createRecurringAppointments({
      baseAgendamentoData: {
        cliente_id: clienteRecord.id,
        agente_id: agenteIdInt,
        unidade_id: unidadeIdInt,
        usuario_id: usuarioIdInt,
        data_agendamento: dataAgendamento,
        hora_inicio: horaInicio,
        hora_fim: horaFimFinal,
        status: 'Aprovado',
        valor_total: servicosRows.reduce((sum, s) => sum + (Number(s.preco) || 0), 0)
          + extrasRows.reduce((sum, e) => sum + (Number(e.preco) || 0), 0),
        observacoes: observacoes || null
      },
      servicosData: servicosRows,
      servicosExtrasData: extrasRows,
      servicosLegacy: [] ,
      recurrence: {
        frequency: recorrencia.frequency,
        range: recorrencia.range
      }
    });

    if (!suppressNotification) {
      setImmediate(async () => {
        try {
          const ocorrencias = Array.isArray(result?.ocorrencias) ? result.ocorrencias : [];
          const primeira = ocorrencias[0];
          if (primeira?.id) {
            await runSideEffects({ agendamentoId: primeira.id, sendConfirmation: true });
          }
        } catch {
        }
      });
    }

    return result;
  }

  // ✅ CORREÇÃO: Usar try-finally para garantir que transação sempre seja liberada
  let trx;
  let lockInfo = null;

  try {
    // 🔒 LOCK DISTRIBUÍDO: Adquirir lock antes de iniciar transação
    lockInfo = await acquireBookingLock({
      unidadeId: unidadeIdInt,
      agenteId: agenteIdInt,
      dataAgendamento,
      horaInicio
    });

    if (!lockInfo.acquired) {
      throw new ConflictError(
        'Desculpe, este horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário disponível.',
        {
          unidade_id: unidadeIdInt,
          agente_id: agenteIdInt,
          data_agendamento: dataAgendamento,
          hora_inicio: horaInicio
        }
      );
    }

    trx = await db.transaction();

    const unidade = await trx('unidades')
      .where('id', unidadeIdInt)
      .where('usuario_id', usuarioIdInt)
      .first();

    if (!unidade) {
      throw makeError('Unidade inválida ou não pertence ao usuário', 'UNIDADE_NOT_FOUND', 404);
    }

    const servicosRows = await trx('servicos')
      .join('unidade_servicos', 'servicos.id', 'unidade_servicos.servico_id')
      .whereIn('servicos.id', servicoIds)
      .where('servicos.status', 'Ativo')
      .where('unidade_servicos.unidade_id', unidadeIdInt)
      .select('servicos.id', 'servicos.preco', 'servicos.duracao_minutos', 'servicos.exige_sinal', 'servicos.valor_sinal', 'servicos.comissao_percentual');

    if (servicosRows.length !== servicoIds.length) {
      throw makeError('Um ou mais serviços não estão disponíveis nesta unidade', 'SERVICOS_NOT_AVAILABLE', 400);
    }

    const extraIds = Array.isArray(servicoExtraIds)
      ? servicoExtraIds.map(id => parseInt(id, 10)).filter(n => Number.isFinite(n))
      : [];

    const extrasRows = extraIds.length > 0
      ? await trx('servicos_extras')
        .whereIn('id', extraIds)
        .where('status', 'Ativo')
        .where('usuario_id', usuarioIdInt)
        .select('id', 'preco', 'duracao_minutos')
      : [];

    if (extrasRows.length !== extraIds.length) {
      throw makeError('Um ou mais serviços extras não estão disponíveis', 'EXTRAS_NOT_AVAILABLE', 400);
    }

    const clienteModel = new Cliente();
    let clienteRecord = null;

    if (clienteId) {
      clienteRecord = await trx('clientes')
        .where('id', parseInt(clienteId, 10))
        .where('unidade_id', unidadeIdInt)
        .whereNull('deleted_at')
        .first();
    }

    if (!clienteRecord) {
      const nome = String(clienteNome || 'Cliente').trim();
      console.log(`[CreateAppointmentUseCase] 🔍 AUDITORIA CADASTRO: clienteNome recebido="${clienteNome}", nome final="${nome}"`);
      // ✅ CORREÇÃO CRÍTICA: Passar trx para evitar pool starvation
      clienteRecord = await clienteModel.findOrCreateForAgendamentoWithTrx(trx, telefoneLimpo, nome, unidadeIdInt);

      if (dataNascimento && !clienteRecord.data_nascimento) {
        await trx('clientes')
          .where('id', clienteRecord.id)
          .where('unidade_id', unidadeIdInt)
          .update({ data_nascimento: dataNascimento, updated_at: trx.fn.now() });
      }
    }

    console.log(`[CreateAppointmentUseCase] ✅ Cliente identificado/cadastrado: ID ${clienteRecord.id}, Nome: ${clienteRecord.primeiro_nome || ''} ${clienteRecord.ultimo_nome || ''}`.trim());

    if (!clienteRecord) {
      throw makeError('Cliente não encontrado', 'CLIENT_NOT_FOUND', 404);
    }

    if (clienteRecord.status === 'Bloqueado') {
      throw makeError('Cliente bloqueado', 'CLIENT_BLOCKED', 403);
    }

    const horaFimFinal = horaFim
      ? horaFim
      : minutesToTime(
        timeToMinutes(horaInicio)
          + servicosRows.reduce((sum, s) => sum + (Number(s.duracao_minutos) || 0), 0)
          + extrasRows.reduce((sum, e) => sum + (Number(e.duracao_minutos) || 0), 0)
      );

    // 🔧 VALIDAÇÃO INTELIGENTE: Pula validação se já foi feita pela IA (skipAvailabilityValidation)
    // Isso evita o "Conflito de Dois Mundos" onde a IA valida e depois o UseCase rejeita
    if (skipAvailabilityValidation) {
      console.log(`[CreateAppointmentUseCase] ⚡ VALIDAÇÃO PULADA: skipAvailabilityValidation=true (já validado pela IA)`);
    } else {
      console.log(`[CreateAppointmentUseCase] 🔍 Validando disponibilidade: ${dataAgendamento} ${horaInicio}-${horaFimFinal}`);
      
      try {
        await bookingAvailabilityService.validateOrThrow({
          unidade_id: unidadeIdInt,
          agente_id: agenteIdInt,
          data_agendamento: dataAgendamento,
          hora_inicio: horaInicio,
          hora_fim: horaFimFinal,
          trx
        });
        console.log(`[CreateAppointmentUseCase] ✅ Validação de disponibilidade passou`);
      } catch (validationError) {
        // 🔧 TOLERÂNCIA A CONFLITOS: Se o erro é de conflito e o agendamento é do mesmo cliente,
        // pode ser uma tentativa duplicada da IA. Verificamos se já existe agendamento recente.
        if (validationError.code === 'SLOT_UNAVAILABLE' || validationError.message?.includes('já possui um agendamento')) {
          console.warn(`[CreateAppointmentUseCase] ⚠️ Conflito detectado. Verificando se é duplicata...`);
          
          try {
            const telefoneLimpo = normalizeTelefoneLimpo(clienteTelefone);
            const agendamentoRecente = await trx('agendamentos')
              .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
              .where('clientes.telefone', telefoneLimpo)
              .where('agendamentos.agente_id', agenteIdInt)
              .where('agendamentos.data_agendamento', dataAgendamento)
              .where('agendamentos.hora_inicio', horaInicio)
              .where('agendamentos.status', 'Aprovado')
              .whereNull('agendamentos.deleted_at')
              .where('agendamentos.created_at', '>=', trx.raw("NOW() - INTERVAL '5 minutes'"))
              .select('agendamentos.id', 'agendamentos.numero_agendamento')
              .first();

            if (agendamentoRecente) {
              console.warn(`[CreateAppointmentUseCase] 🔄 DUPLICATA DETECTADA: Agendamento #${agendamentoRecente.id} já existe. Retornando existente em vez de criar novo.`);
              
              // Retorna o agendamento existente em vez de criar novo
              await trx.rollback();
              
              // 🔓 Liberar lock antes de retornar duplicata
              if (lockInfo?.lockKey) {
                await releaseBookingLock(lockInfo.lockKey);
              }
              
              return {
                agendamento: { id: agendamentoRecente.id, numero_agendamento: agendamentoRecente.numero_agendamento },
                pix: null,
                deveCobrarSinal: false,
                isDuplicate: true
              };
            }
          } catch (dupCheckErr) {
            console.error(`[CreateAppointmentUseCase] ❌ Erro ao verificar duplicata:`, dupCheckErr.message);
          }
        }

        // Se não é duplicata, lança o erro original
        console.error(`[CreateAppointmentUseCase] ❌ Validação de disponibilidade falhou:`, {
          error: validationError.message,
          code: validationError.code,
          unidade_id: unidadeIdInt,
          agente_id: agenteIdInt,
          data_agendamento: dataAgendamento,
          hora_inicio: horaInicio,
          hora_fim: horaFimFinal
        });
        throw validationError;
      }
    }

    const valorServicos = servicosRows.reduce((sum, s) => sum + (Number(s.preco) || 0), 0);
    const valorExtras = extrasRows.reduce((sum, e) => sum + (Number(e.preco) || 0), 0);
    const valorTotal = Math.max(0, valorServicos + valorExtras);

    const agendamento = await agendamentoModel.createWithLockUsingTrx(trx, {
      cliente_id: clienteRecord.id,
      agente_id: agenteIdInt,
      unidade_id: unidadeIdInt,
      usuario_id: usuarioIdInt,
      data_agendamento: dataAgendamento,
      hora_inicio: horaInicio,
      hora_fim: horaFimFinal,
      valor_total: valorTotal,
      status: 'Aprovado',
      observacoes: observacoes || null
    });

    const agendamentoServicos = servicosRows.map((s) => ({
      agendamento_id: agendamento.id,
      servico_id: s.id,
      preco_aplicado: s.preco,
      comissao_percentual_aplicada: s.comissao_percentual
    }));

    if (agendamentoServicos.length > 0) {
      await trx('agendamento_servicos').insert(agendamentoServicos);
    }

    const agendamentoExtras = extrasRows.map((e) => ({
      agendamento_id: agendamento.id,
      servico_extra_id: e.id,
      preco_aplicado: e.preco
    }));

    if (agendamentoExtras.length > 0) {
      await trx('agendamento_servicos_extras').insert(agendamentoExtras);
    }

    const configuracoes = await trx('configuracoes_sistema')
      .where('unidade_id', unidadeIdInt)
      .select('pontos_ativo', 'pontos_por_real', 'reais_por_pontos', 'pontos_validade_meses')
      .first();

    // ✅ FASE 16: CASHBACK REMOVIDO
    // Pontos serão creditados APENAS quando agendamento for concluído (status "Concluído")
    // Isso previne a vulnerabilidade de "pontos infinitos por cancelamento"

    const clienteExigeSinalExcecao = normalizeBoolean(clienteRecord?.exige_sinal_excecao);
    const algumServicoExigeSinal = (servicosRows || []).some(s => normalizeBoolean(s?.exige_sinal));
    const exigeSinalLogico = algumServicoExigeSinal || clienteExigeSinalExcecao;
    const deveCobrarSinal = skipPaymentValidation ? false : exigeSinalLogico;

    console.log('--- 🔍 AUDITORIA DE SINAL ---');
    console.log('skipPaymentValidation:', data?.skipPaymentValidation);
    console.log('algumServicoExigeSinal:', algumServicoExigeSinal);
    console.log('clienteExigeSinalExcecao:', clienteExigeSinalExcecao);
    console.log('deveCobrarSinal final:', deveCobrarSinal);
    console.log('------------------------------');

    let pix = null;
    if (deveCobrarSinal) {
      let totalSinal = (servicosRows || [])
        .filter(s => normalizeBoolean(s?.exige_sinal))
        .reduce((sum, s) => sum + (Number(s?.valor_sinal) || 0), 0);

      if (!(totalSinal > 0) && clienteExigeSinalExcecao) {
        totalSinal = Number(valorTotal) || 0;
      }

      const amount = Math.max(0, Number(totalSinal) || 0);
      if (!(amount > 0)) {
        const err = new Error('Sinal calculado inválido. Verifique valor_sinal dos serviços.');
        err.code = 'INVALID_DEPOSIT_AMOUNT';
        throw err;
      }

      pix = await gerarPixSinal({
        trx,
        usuarioId: usuarioIdInt,
        unidadeId: unidadeIdInt,
        agendamentoId: agendamento.id,
        cliente: clienteRecord,
        amount
      });
    }

    // ✅ COMMIT EXPLÍCITO: Finalizar transação antes de retornar
    await trx.commit();
    
    // 🔓 Liberar lock após commit bem-sucedido
    if (lockInfo?.lockKey) {
      await releaseBookingLock(lockInfo.lockKey);
    }
    
    return { agendamento, pix, deveCobrarSinal };
  } catch (error) {
    // ✅ ROLLBACK EXPLÍCITO: Em caso de erro, desfazer alterações
    if (trx) {
      await trx.rollback();
    }
    
    // 🔓 Liberar lock em caso de erro
    if (lockInfo?.lockKey) {
      await releaseBookingLock(lockInfo.lockKey);
    }
    
    throw error;
  }



  if (!suppressNotification) {
    setImmediate(async () => {
      try {
        await runSideEffects({
          agendamentoId: result.agendamento.id,
          sendConfirmation: !result.deveCobrarSinal
        });
      } catch (err) {
        logger.error('❌ [CreateAppointmentUseCase] Erro ao executar side effects:', err);
      }
    });
  }

  if (suppressNotification) {
    setImmediate(async () => {
      try {
        await runSideEffects({
          agendamentoId: result.agendamento.id,
          sendConfirmation: false
        });
      } catch (err) {
        logger.error('❌ [CreateAppointmentUseCase] Erro ao executar lembretes (suppressNotification):', err);
      }
    });
  }

  return result;
}

module.exports = {
  execute
};

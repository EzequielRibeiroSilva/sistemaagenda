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

async function runSideEffects({ agendamentoId, sendConfirmation = true }) {
  const whatsAppService = new WhatsAppService();
  const scheduledReminderService = new ScheduledReminderService();

  const agendamento = await db('agendamentos')
    .where('id', agendamentoId)
    .whereNull('deleted_at')
    .first();

  if (!agendamento) {
    throw new Error('Agendamento não encontrado para disparar notificações');
  }

  const cliente = await db('clientes').where('id', agendamento.cliente_id).first();
  const agente = await db('agentes').where('id', agendamento.agente_id).first();
  const unidade = await db('unidades')
    .where('id', agendamento.unidade_id)
    .select('id', 'nome', 'telefone', 'slug_url', 'endereco')
    .first();

  if (!cliente || !agente || !unidade) {
    throw new Error('Dados insuficientes para disparar notificações (cliente/agente/unidade)');
  }

  const servicos = await db('agendamento_servicos')
    .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
    .where('agendamento_servicos.agendamento_id', agendamentoId)
    .select('servicos.nome', 'agendamento_servicos.preco_aplicado as preco');

  const nomeCliente = cliente.nome || `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim() || 'Cliente';
  const nomeAgente = `${agente.nome || ''} ${agente.sobrenome || ''}`.trim() || 'Agente';

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
    servicos: (servicos || []).map(s => ({ nome: s.nome, preco: s.preco }))
  };

  if (sendConfirmation) {
    await whatsAppService.sendAppointmentConfirmation(payload);
  }

  await scheduledReminderService.criarLembretesProgramados({
    agendamento_id: agendamento.id,
    unidade_id: agendamento.unidade_id,
    data_agendamento: agendamento.data_agendamento,
    hora_inicio: agendamento.hora_inicio,
    cliente_telefone: cliente.telefone
  });
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
    const err = new Error('Integração Mercado Pago não conectada para esta unidade');
    err.code = 'MP_NOT_CONNECTED';
    throw err;
  }

  if (integracao.expires_at && new Date(integracao.expires_at).getTime() <= Date.now()) {
    const err = new Error('Token do Mercado Pago expirado. Reconecte a integração.');
    err.code = 'MP_TOKEN_EXPIRED';
    throw err;
  }

  const accessToken = decrypt({
    ciphertext: integracao.access_token_ciphertext,
    iv: integracao.access_token_iv,
    authTag: integracao.access_token_auth_tag
  });

  const idempotencyKey = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const externalReference = `agendamento_${agendamentoId}`;

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

  const mpPaymentId = mpJson?.id != null ? String(mpJson.id) : null;
  const qrCodeBase64 = mpJson?.point_of_interaction?.transaction_data?.qr_code_base64 || null;
  const qrCode = mpJson?.point_of_interaction?.transaction_data?.qr_code || null;

  if (!mpPaymentId || !qrCodeBase64 || !qrCode) {
    const err = new Error('Resposta inválida do Mercado Pago (dados Pix ausentes)');
    err.code = 'MP_PIX_INVALID_RESPONSE';
    err.mpError = mpJson;
    throw err;
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
    throw new Error('Contexto inválido: usuarioId é obrigatório');
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
    suppressNotification
  } = data || {};

  const unidadeIdInt = parseInt(unidadeId, 10);
  const agenteIdInt = parseInt(agenteId, 10);
  const usuarioIdInt = parseInt(context.usuarioId, 10);

  if (!unidadeIdInt || !agenteIdInt || !dataAgendamento || !horaInicio) {
    throw new Error('Dados obrigatórios não fornecidos para criar agendamento');
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
      throw new Error('Telefone do cliente não encontrado');
    }
  }

  if (!telefoneLimpo) {
    throw new Error('Telefone do cliente inválido');
  }

  const servicoIds = Array.isArray(servicos)
    ? servicos
      .map((s) => (typeof s === 'object' ? (s.servico_id ?? s.id) : s))
      .map((id) => parseInt(id, 10))
      .filter((n) => Number.isFinite(n))
    : [];

  if (servicoIds.length === 0) {
    throw new Error('Serviços não informados');
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
      throw new Error('Unidade inválida ou não pertence ao usuário');
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
      clienteRecord = await clienteModel.findOrCreateForAgendamento(telefoneLimpo, nome, unidadeIdInt);
    }

    if (clienteRecord?.status === 'Bloqueado') {
      throw new Error('Cliente bloqueado');
    }

    const servicosRows = await db('servicos')
      .join('unidade_servicos', 'servicos.id', 'unidade_servicos.servico_id')
      .whereIn('servicos.id', servicoIds)
      .where('servicos.status', 'Ativo')
      .where('unidade_servicos.unidade_id', unidadeIdInt)
      .select('servicos.id', 'servicos.preco', 'servicos.duracao_minutos', 'servicos.comissao_percentual');

    if (servicosRows.length !== servicoIds.length) {
      throw new Error('Um ou mais serviços não estão disponíveis nesta unidade');
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
      throw new Error('Um ou mais serviços extras não estão disponíveis');
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

  const result = await db.transaction(async (trx) => {
    const unidade = await trx('unidades')
      .where('id', unidadeIdInt)
      .where('usuario_id', usuarioIdInt)
      .first();

    if (!unidade) {
      throw new Error('Unidade inválida ou não pertence ao usuário');
    }

    const servicosRows = await trx('servicos')
      .join('unidade_servicos', 'servicos.id', 'unidade_servicos.servico_id')
      .whereIn('servicos.id', servicoIds)
      .where('servicos.status', 'Ativo')
      .where('unidade_servicos.unidade_id', unidadeIdInt)
      .select('servicos.id', 'servicos.preco', 'servicos.duracao_minutos', 'servicos.exige_sinal', 'servicos.valor_sinal', 'servicos.comissao_percentual');

    if (servicosRows.length !== servicoIds.length) {
      throw new Error('Um ou mais serviços não estão disponíveis nesta unidade');
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
      throw new Error('Um ou mais serviços extras não estão disponíveis');
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
      clienteRecord = await clienteModel.findOrCreateForAgendamento(telefoneLimpo, nome, unidadeIdInt);

      if (dataNascimento && !clienteRecord.data_nascimento) {
        await trx('clientes')
          .where('id', clienteRecord.id)
          .where('unidade_id', unidadeIdInt)
          .update({ data_nascimento: dataNascimento, updated_at: trx.fn.now() });
      }
    }

    if (!clienteRecord) {
      throw new Error('Cliente não encontrado');
    }

    if (clienteRecord.status === 'Bloqueado') {
      throw new Error('Cliente bloqueado');
    }

    const horaFimFinal = horaFim
      ? horaFim
      : minutesToTime(
        timeToMinutes(horaInicio)
          + servicosRows.reduce((sum, s) => sum + (Number(s.duracao_minutos) || 0), 0)
          + extrasRows.reduce((sum, e) => sum + (Number(e.duracao_minutos) || 0), 0)
      );

    await bookingAvailabilityService.validateOrThrow({
      unidade_id: unidadeIdInt,
      agente_id: agenteIdInt,
      data_agendamento: dataAgendamento,
      hora_inicio: horaInicio,
      hora_fim: horaFimFinal,
      trx
    });

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
      .select('pontos_ativo', 'pontos_por_real', 'pontos_validade_meses')
      .first();

    if (configuracoes?.pontos_ativo && valorTotal > 0) {
      const pontosPorReal = parseFloat(configuracoes.pontos_por_real) || 1.00;
      const pontosValidade = configuracoes.pontos_validade_meses || 12;
      const pontosGerados = Math.floor(valorTotal * pontosPorReal);

      if (pontosGerados > 0) {
        const dataValidade = new Date();
        dataValidade.setMonth(dataValidade.getMonth() + pontosValidade);

        await trx('pontos_historico').insert({
          cliente_id: clienteRecord.id,
          unidade_id: unidadeIdInt,
          agendamento_id: agendamento.id,
          tipo: 'CREDITO',
          pontos: pontosGerados,
          valor_real: valorTotal,
          descricao: `Pontos ganhos no agendamento #${agendamento.id}`,
          data_validade: dataValidade.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
          expirado: false,
          created_at: new Date()
        });
      }
    }

    const clienteExigeSinalExcecao = Boolean(clienteRecord?.exige_sinal_excecao);
    const algumServicoExigeSinal = (servicosRows || []).some(s => Boolean(s?.exige_sinal));
    const deveCobrarSinal = algumServicoExigeSinal || clienteExigeSinalExcecao;

    let pix = null;
    if (deveCobrarSinal) {
      let totalSinal = (servicosRows || [])
        .filter(s => Boolean(s?.exige_sinal))
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

    return { agendamento, pix, deveCobrarSinal };
  });

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

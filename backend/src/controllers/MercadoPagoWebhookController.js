const crypto = require('crypto');
const logger = require('../utils/logger');
const { db } = require('../config/knex');
const AssinaturaRenovacaoService = require('../services/AssinaturaRenovacaoService');
const WhatsAppService = require('../services/WhatsAppService');
const { decrypt } = require('../utils/encryption');

class MercadoPagoWebhookController {
  constructor() {
    this.assinaturaRenovacaoService = new AssinaturaRenovacaoService();
    this.whatsAppService = new WhatsAppService();
  }

  async resolveUnidadeIdForPaymentId(paymentId) {
    const mpPaymentId = paymentId != null ? String(paymentId) : null;
    if (!mpPaymentId) return null;

    const row = await db('agendamento_pagamentos as ap')
      .join('agendamentos as a', 'ap.agendamento_id', 'a.id')
      .where('ap.mp_payment_id', mpPaymentId)
      .whereNull('a.deleted_at')
      .select('a.unidade_id')
      .first();

    return row?.unidade_id ? Number(row.unidade_id) : null;
  }

  async resolveUnidadeIdForPreapprovalId(preapprovalId) {
    const pId = preapprovalId != null ? String(preapprovalId) : null;
    if (!pId) return null;

    const row = await db('clientes')
      .where('mp_preapproval_id', pId)
      .select('unidade_id')
      .first();

    return row?.unidade_id ? Number(row.unidade_id) : null;
  }

  getWebhookSecret() {
    return process.env.MP_WEBHOOK_SECRET || process.env.MERCADOPAGO_WEBHOOK_SECRET || null;
  }

  parseMercadoPagoSignatureHeader(xSignature) {
    if (!xSignature) return { type: 'missing' };
    const received = Array.isArray(xSignature) ? xSignature[0] : String(xSignature);

    // Formato antigo/simples: "<hex>"
    if (!received.includes('=') && received.length >= 32) {
      return { type: 'simple', signature: received.trim() };
    }

    // Formato documentado pelo MP: "ts=...,v1=..." (às vezes com mais pares)
    const parts = received.split(',').map((p) => p.trim()).filter(Boolean);
    const kv = {};
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) kv[k] = v;
    }

    if (kv.v1 && kv.ts) {
      return { type: 'v1', ts: kv.ts, signature: kv.v1 };
    }

    return { type: 'unknown', raw: received };
  }

  timingSafeEqual(a, b) {
    const ab = Buffer.from(String(a || ''), 'utf8');
    const bb = Buffer.from(String(b || ''), 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  }

  computeHmacSignature(rawBody, secret) {
    return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  }

  computeHmacSignatureWithTs(rawBody, secret, ts) {
    const base = `${String(ts)}.${rawBody.toString('utf8')}`;
    return crypto.createHmac('sha256', secret).update(base).digest('hex');
  }

  validateSignature(req) {
    const secret = this.getWebhookSecret();
    if (!secret) {
      return { ok: false, error: 'Webhook secret não configurado' };
    }

    const xSignature = req.headers['x-signature'];
    const parsed = this.parseMercadoPagoSignatureHeader(xSignature);
    if (parsed.type === 'missing') {
      return { ok: false, error: 'Header x-signature ausente' };
    }

    const raw = req.rawBody;
    if (!raw || !Buffer.isBuffer(raw)) {
      return { ok: false, error: 'rawBody indisponível para validação' };
    }

    // Aceitar 2 formatos para evitar falso-negativo durante rollout:
    // 1) hex puro (compatibilidade)
    // 2) ts=...,v1=... (formato Mercado Pago)
    const expectedSimple = this.computeHmacSignature(raw, secret);
    const receivedSimple = parsed.type === 'simple' ? parsed.signature : null;

    const okSimple = receivedSimple ? this.timingSafeEqual(receivedSimple, expectedSimple) : false;

    let okV1 = false;
    if (parsed.type === 'v1') {
      const expectedV1 = this.computeHmacSignatureWithTs(raw, secret, parsed.ts);
      okV1 = this.timingSafeEqual(parsed.signature, expectedV1);
    }

    if (!okSimple && !okV1) {
      return { ok: false, error: 'Assinatura inválida' };
    }

    return { ok: true };
  }

  extractEventMeta(payload) {
    const topic = payload?.type || payload?.topic || null;
    const action = payload?.action || null;

    const resourceId =
      payload?.data?.id ||
      payload?.resource?.id ||
      payload?.id ||
      payload?.resource_id ||
      null;

    return { topic, action, resourceId: resourceId ? String(resourceId) : null };
  }

  async getAccessTokenForUnidade(unidadeId, trx = null) {
    const uId = Number(unidadeId);
    if (!Number.isFinite(uId) || uId <= 0) {
      const err = new Error('unidade_id inválido');
      err.code = 'INVALID_UNIDADE_ID';
      throw err;
    }

    const q = trx || db;
    const integracao = await q('integracoes_mercadopago')
      .where({ unidade_id: uId, status: 'CONNECTED' })
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

    if (!accessToken) {
      const err = new Error('Token do Mercado Pago inválido');
      err.code = 'MP_TOKEN_INVALID';
      throw err;
    }

    return accessToken;
  }

  async mpFetchJson(url, accessToken) {
    if (!accessToken) {
      const err = new Error('Access token Mercado Pago ausente');
      err.code = 'MP_ACCESS_TOKEN_MISSING';
      throw err;
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = json?.message || json?.error || `HTTP ${resp.status}`;
      throw new Error(`Mercado Pago API erro: ${msg}`);
    }

    return json;
  }

  async fetchPreapproval(preapprovalId, accessToken) {
    if (!preapprovalId) return null;
    return this.mpFetchJson(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(String(preapprovalId))}`,
      accessToken
    );
  }

  async fetchPayment(paymentId, accessToken) {
    if (!paymentId) return null;
    return this.mpFetchJson(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`,
      accessToken
    );
  }

  mapPreapprovalToTally(preapprovalStatus) {
    const s = (preapprovalStatus || '').toLowerCase();
    if (s === 'cancelled' || s === 'canceled' || s === 'paused') return 'Cancelado';
    if (s === 'authorized') return 'Ativo';
    if (s === 'pending') return 'Pagamento Pendente';
    return 'Pagamento Pendente';
  }

  mapPaymentToTally(paymentStatus) {
    const s = (paymentStatus || '').toLowerCase();
    if (s === 'approved' || s === 'authorized') return 'Ativo';
    return 'Pagamento Pendente';
  }

  derivePreapprovalIdFromPayment(payment) {
    const candidate =
      payment?.preapproval_id ||
      payment?.subscription_id ||
      payment?.order?.id ||
      payment?.metadata?.preapproval_id ||
      payment?.metadata?.subscription_id ||
      null;

    return candidate ? String(candidate) : null;
  }

  derivePayerEmail({ preapproval, payment }) {
    const email =
      preapproval?.payer_email ||
      preapproval?.payer?.email ||
      payment?.payer?.email ||
      payment?.additional_info?.payer?.email ||
      null;

    return email ? String(email).trim().toLowerCase() : null;
  }

  buildEventWhereClause(qb, { topic, action, resourceId, xRequestId }) {
    if (topic == null) qb.whereNull('topic');
    else qb.where('topic', topic);

    if (resourceId == null) qb.whereNull('resource_id');
    else qb.where('resource_id', resourceId);

    if (action == null) qb.whereNull('action');
    else qb.where('action', action);

    if (xRequestId == null) qb.whereNull('x_request_id');
    else qb.where('x_request_id', xRequestId);
  }

  async resolveCliente({ preapprovalId, payerEmail }) {
    if (preapprovalId) {
      const cliente = await db('clientes')
        .where('mp_preapproval_id', preapprovalId)
        .first();
      if (cliente) return { cliente, via: 'mp_preapproval_id', ambiguous: false };
    }

    if (payerEmail) {
      const rows = await db('clientes')
        .whereRaw('LOWER(mp_customer_email) = ?', [payerEmail])
        .select('id', 'mp_preapproval_id');

      if (rows.length === 1) {
        const cliente = await db('clientes').where('id', rows[0].id).first();
        return { cliente, via: 'mp_customer_email', ambiguous: false };
      }

      if (rows.length > 1) {
        return { cliente: null, via: 'mp_customer_email', ambiguous: true };
      }
    }

    return { cliente: null, via: null, ambiguous: false };
  }

  computeFinalTallyStatus({ preapproval, payment }) {
    const preapprovalStatus = preapproval?.status;
    const paymentStatus = payment?.status;

    const pre = (preapprovalStatus || '').toLowerCase();
    if (pre === 'cancelled' || pre === 'canceled' || pre === 'paused') {
      return 'Cancelado';
    }

    if (paymentStatus) {
      return this.mapPaymentToTally(paymentStatus);
    }

    if (preapprovalStatus) {
      return this.mapPreapprovalToTally(preapprovalStatus);
    }

    return 'Pagamento Pendente';
  }

  async mercadopago(req, res) {
    let eventRowId = null;
    let eventMetaForUpdate = null;
    try {
      const payload = req.body || {};
      const { topic, action, resourceId } = this.extractEventMeta(payload);

      logger.info('📩 [MercadoPagoWebhook] Evento recebido:', {
        topic,
        action,
        resourceId,
        hasDataId: Boolean(payload?.data?.id),
        hasPaymentInline: Boolean(payload?.payment && typeof payload.payment === 'object'),
        hasPreapprovalInline: Boolean(payload?.preapproval && typeof payload.preapproval === 'object')
      });

      const xRequestId = req.headers['x-request-id'] ? String(req.headers['x-request-id']) : null;
      const xSignature = req.headers['x-signature'] ? String(req.headers['x-signature']) : null;

      eventMetaForUpdate = { topic, action, resourceId, xRequestId };

      const signatureResult = this.validateSignature(req);
      if (!signatureResult.ok) {
        // Importante para troubleshooting: registrar tentativa mesmo com assinatura inválida.
        await db('mercadopago_webhook_events')
          .insert({
            topic,
            action,
            resource_id: resourceId,
            x_request_id: xRequestId,
            x_signature: xSignature,
            payload,
            received_at: new Date(),
            processed_at: new Date(),
            processing_error: signatureResult.error
          })
          .onConflict(['topic', 'resource_id', 'action', 'x_request_id'])
          .ignore();

        return res.status(401).json({ success: false, error: 'Webhook não autorizado' });
      }

      await db('mercadopago_webhook_events')
        .insert({
          topic,
          action,
          resource_id: resourceId,
          x_request_id: xRequestId,
          x_signature: xSignature,
          payload,
          received_at: new Date()
        })
        .onConflict(['topic', 'resource_id', 'action', 'x_request_id'])
        .ignore();

      const eventRow = await db('mercadopago_webhook_events')
        .modify((qb) => this.buildEventWhereClause(qb, { topic, action, resourceId, xRequestId }))
        .orderBy('id', 'desc')
        .first();

      eventRowId = eventRow?.id || null;

      let payment = null;
      let preapproval = null;

      // Suporte a testes internos: permitir objetos inline no payload
      if (payload?.payment && typeof payload.payment === 'object') {
        payment = payload.payment;
      }
      if (payload?.preapproval && typeof payload.preapproval === 'object') {
        preapproval = payload.preapproval;
      }

      const topicLower = topic ? String(topic).toLowerCase() : null;
      if (topicLower === 'payment') {
        if (!payment) {
          const unidadeIdForPayment = await this.resolveUnidadeIdForPaymentId(resourceId);
          if (!unidadeIdForPayment) {
            throw new Error('Não foi possível resolver unidade_id para payment_id');
          }
          const accessToken = await this.getAccessTokenForUnidade(unidadeIdForPayment);
          payment = await this.fetchPayment(resourceId, accessToken);
        }

        // ✅ Sprint 4 (Passo 1): Gancho de aprovação do Pix do sinal
        // Se o pagamento aprovado corresponder a um Pix PENDING em agendamento_pagamentos,
        // atualiza atomicamente o status para APPROVED e libera a confirmação do agendamento.
        const paymentStatusLower = payment?.status ? String(payment.status).toLowerCase() : null;
        const mpPaymentId = payment?.id != null ? String(payment.id) : null;
        if (paymentStatusLower === 'approved' && mpPaymentId) {
          const pendingRow = await db('agendamento_pagamentos')
            .where({ mp_payment_id: mpPaymentId, status: 'PENDING' })
            .select('id', 'agendamento_id')
            .first();

          if (pendingRow?.id && pendingRow?.agendamento_id) {
            await db.transaction(async (trx) => {
              const updated = await trx('agendamento_pagamentos')
                .where({ id: pendingRow.id, status: 'PENDING' })
                .update({ status: 'APPROVED', updated_at: trx.fn.now() });

              if (updated > 0) {
                await trx('agendamentos')
                  .where({ id: pendingRow.agendamento_id })
                  .whereNull('deleted_at')
                  .whereNot('status', 'Cancelado')
                  .update({ status: 'Aprovado', updated_at: trx.fn.now() });
              }
            });

            logger.info('✅ [MercadoPagoWebhook] Pix do sinal aprovado e persistido:', {
              mp_payment_id: mpPaymentId,
              agendamento_pagamento_id: pendingRow.id,
              agendamento_id: pendingRow.agendamento_id
            });

            // Sprint 4 (Passo 2): Enviar confirmação WhatsApp apenas após o sinal ser aprovado
            setImmediate(async () => {
              try {
                const AgendamentoController = require('./AgendamentoController');
                const agendamentoController = new AgendamentoController();
                const dadosCompletos = await agendamentoController.buscarDadosCompletos(pendingRow.agendamento_id);

                if (!dadosCompletos) {
                  logger.error('❌ [MercadoPagoWebhook] (bg) Dados completos não encontrados para agendamento #' + pendingRow.agendamento_id);
                  return;
                }

                if (dadosCompletos?.cliente_telefone || dadosCompletos?.agente_telefone) {
                  await this.whatsAppService.sendAppointmentConfirmation(dadosCompletos);
                  logger.info('✅ [MercadoPagoWebhook] (bg) Confirmação WhatsApp enviada para agendamento #' + pendingRow.agendamento_id);
                } else {
                  logger.error('❌ [MercadoPagoWebhook] (bg) Nenhum telefone encontrado (cliente/agente) para agendamento #' + pendingRow.agendamento_id);
                }
              } catch (whatsappError) {
                logger.error('❌ [MercadoPagoWebhook] (bg) Erro ao enviar confirmação WhatsApp:', whatsappError);
              }
            });

            if (eventRowId) {
              await db('mercadopago_webhook_events')
                .where('id', eventRowId)
                .update({
                  processed_at: new Date(),
                  processing_error: null
                });
            }

            return res.status(200).json({ success: true });
          }
        }

        if (!preapproval) {
          const preapprovalId = this.derivePreapprovalIdFromPayment(payment);
          if (preapprovalId) {
            const unidadeIdForPreapproval = await this.resolveUnidadeIdForPreapprovalId(preapprovalId);
            if (unidadeIdForPreapproval) {
              const accessToken = await this.getAccessTokenForUnidade(unidadeIdForPreapproval);
              preapproval = await this.fetchPreapproval(preapprovalId, accessToken);
            }
          }
        }
      } else if (topicLower === 'preapproval' || topicLower === 'subscription') {
        if (!preapproval) {
          const unidadeIdForPreapproval = await this.resolveUnidadeIdForPreapprovalId(resourceId);
          if (!unidadeIdForPreapproval) {
            throw new Error('Não foi possível resolver unidade_id para preapproval_id');
          }
          const accessToken = await this.getAccessTokenForUnidade(unidadeIdForPreapproval);
          preapproval = await this.fetchPreapproval(resourceId, accessToken);
        }
      } else {
        // Tópico desconhecido: ainda assim tentamos tratar se vier com IDs reconhecíveis
        // (ex.: payload sem 'type' mas com data.id). Preferimos não falhar o endpoint.
        if (resourceId) {
          try {
            if (!preapproval) {
              const unidadeIdForPreapproval = await this.resolveUnidadeIdForPreapprovalId(resourceId);
              if (unidadeIdForPreapproval) {
                const accessToken = await this.getAccessTokenForUnidade(unidadeIdForPreapproval);
                preapproval = await this.fetchPreapproval(resourceId, accessToken);
              }
            }
          } catch (_) {
            try {
              if (!payment) {
                const unidadeIdForPayment = await this.resolveUnidadeIdForPaymentId(resourceId);
                if (unidadeIdForPayment) {
                  const accessToken = await this.getAccessTokenForUnidade(unidadeIdForPayment);
                  payment = await this.fetchPayment(resourceId, accessToken);
                }
              }
            } catch (_) {
              // Ignorar: será marcado como processado sem atualização.
            }
          }
        }
      }

      const preapprovalIdFinal =
        (preapproval?.id ? String(preapproval.id) : null) ||
        (payment ? this.derivePreapprovalIdFromPayment(payment) : null);

      const payerEmail = this.derivePayerEmail({ preapproval, payment });
      const resolveResult = await this.resolveCliente({ preapprovalId: preapprovalIdFinal, payerEmail });

      if (resolveResult.ambiguous) {
        throw new Error('Ambiguidade: múltiplos clientes com o mesmo mp_customer_email');
      }

      if (!resolveResult.cliente) {
        // Não atualizar nada; apenas marcar como processado (evento útil para reconciliação manual)
        if (eventRowId) {
          await db('mercadopago_webhook_events')
            .where('id', eventRowId)
            .update({
              processed_at: new Date(),
              processing_error: 'Cliente não encontrado para o evento'
            });
        }
        return res.status(200).json({ success: true, ignored: true });
      }

      const finalStatus = this.computeFinalTallyStatus({ preapproval, payment });

      const mpStatus =
        (preapproval?.status ? String(preapproval.status) : null) ||
        (payment?.status ? String(payment.status) : null) ||
        null;

      await db.transaction(async (trx) => {
        const updateData = {
          assinatura_status: finalStatus,
          mp_status: mpStatus,
          mp_last_event_at: new Date()
        };

        if (preapprovalIdFinal && !resolveResult.cliente.mp_preapproval_id) {
          updateData.mp_preapproval_id = preapprovalIdFinal;
        }

        if (payerEmail && !resolveResult.cliente.mp_customer_email) {
          updateData.mp_customer_email = payerEmail;
        }

        if (preapproval?.preapproval_plan_id && !resolveResult.cliente.mp_plan_id) {
          updateData.mp_plan_id = String(preapproval.preapproval_plan_id);
        }

        const payerId = preapproval?.payer_id || payment?.payer?.id || null;
        if (payerId && !resolveResult.cliente.mp_payer_id) {
          updateData.mp_payer_id = String(payerId);
        }

        await trx('clientes')
          .where('id', resolveResult.cliente.id)
          .update(updateData);

        if (payment && String(payment.status || '').toLowerCase() === 'approved') {
          const mpPaymentId = payment?.id ? String(payment.id) : null;
          const planoId = resolveResult?.cliente?.assinatura_plano_id || null;

          if (mpPaymentId && planoId) {
            const plano = await trx('planos_assinatura')
              .where('id', planoId)
              .select('id', 'validade_dias')
              .first();

            await this.assinaturaRenovacaoService.registrarPagamento({
              clienteId: resolveResult.cliente.id,
              planoId: planoId,
              mpPaymentId: mpPaymentId,
              mpPreapprovalId: preapprovalIdFinal,
              dataRenovacao: payment?.date_approved || payment?.date_created || null,
              valorPago: payment?.transaction_amount != null ? Number(payment.transaction_amount) : null,
              validadeDias: plano?.validade_dias || 31,
              dbConn: trx
            });
          }
        }
      });

      // Notificações WhatsApp financeiras (idempotentes)
      try {
        const unidade = await db('unidades as u')
          .join('usuarios as us', 'u.usuario_id', 'us.id')
          .where('u.id', resolveResult.cliente.unidade_id)
          .select(
            'u.id as unidade_id',
            'u.nome as unidade_nome',
            'u.telefone as unidade_telefone',
            'us.telefone as admin_telefone'
          )
          .first();

        const clienteNome = `${resolveResult.cliente.primeiro_nome || ''} ${resolveResult.cliente.ultimo_nome || ''}`.trim() || 'Cliente';
        const clienteTelefone = resolveResult.cliente.telefone;
        const unidadeNome = unidade?.unidade_nome || 'Unidade';
        const unidadeTelefone = unidade?.unidade_telefone || unidade?.admin_telefone || null;
        const adminTelefone = unidade?.admin_telefone || null;

        const planoNome = resolveResult?.cliente?.assinatura_plano_id
          ? (await db('planos_assinatura').where('id', resolveResult.cliente.assinatura_plano_id).select('nome').first())?.nome
          : null;

        const wppLocal = unidadeTelefone ? this.whatsAppService.generateWhatsAppLink(unidadeTelefone) : null;
        const valorStr = payment?.transaction_amount != null ? this.whatsAppService.formatCurrencyBRL(payment.transaction_amount) : null;

        const mpPaymentId = payment?.id ? String(payment.id) : null;
        const assinaturaRef = mpPaymentId || preapprovalIdFinal;

        const paymentStatusLower = payment?.status ? String(payment.status).toLowerCase() : null;
        const preapprovalStatusLower = preapproval?.status ? String(preapproval.status).toLowerCase() : null;

        if (assinaturaRef && unidade?.unidade_id && resolveResult.cliente.id) {
          if (paymentStatusLower === 'approved') {
            const msgCliente = this.whatsAppService.generatePagamentoAprovadoClienteMessage({
              clienteNome,
              unidadeNome,
              wppLocal: wppLocal || '-',
              planoNome,
              valorStr
            });
            const msgAdmin = this.whatsAppService.generatePagamentoAprovadoAdminMessage({
              clienteNome,
              unidadeNome,
              planoNome,
              valorStr,
              refId: assinaturaRef
            });

            await this.whatsAppService.sendFinanceNotification({
              unidade_id: unidade.unidade_id,
              cliente_id: resolveResult.cliente.id,
              cliente_telefone: clienteTelefone,
              admin_telefone: adminTelefone,
              unidade_telefone: unidadeTelefone,
              tipoBase: 'assinatura_pagamento_aprovado',
              assinatura_referencia: assinaturaRef,
              messageCliente: msgCliente,
              messageAdmin: msgAdmin
            });
          } else if (paymentStatusLower === 'rejected') {
            const msgCliente = this.whatsAppService.generatePagamentoRecusadoClienteMessage({
              clienteNome,
              unidadeNome,
              wppLocal: wppLocal || '-',
              planoNome,
              valorStr
            });
            const msgAdmin = this.whatsAppService.generatePagamentoRecusadoAdminMessage({
              clienteNome,
              unidadeNome,
              planoNome,
              valorStr,
              refId: assinaturaRef
            });

            await this.whatsAppService.sendFinanceNotification({
              unidade_id: unidade.unidade_id,
              cliente_id: resolveResult.cliente.id,
              cliente_telefone: clienteTelefone,
              admin_telefone: adminTelefone,
              unidade_telefone: unidadeTelefone,
              tipoBase: 'assinatura_pagamento_recusado',
              assinatura_referencia: assinaturaRef,
              messageCliente: msgCliente,
              messageAdmin: msgAdmin
            });
          } else if (preapprovalStatusLower === 'cancelled' || preapprovalStatusLower === 'canceled' || preapprovalStatusLower === 'paused') {
            const statusLabel = preapprovalStatusLower === 'paused' ? 'Suspenso' : 'Cancelado';
            const msgCliente = this.whatsAppService.generateAssinaturaCanceladaClienteMessage({
              clienteNome,
              unidadeNome,
              wppLocal: wppLocal || '-',
              planoNome,
              statusLabel
            });
            const msgAdmin = this.whatsAppService.generateAssinaturaCanceladaAdminMessage({
              clienteNome,
              unidadeNome,
              planoNome,
              statusLabel,
              refId: assinaturaRef
            });

            await this.whatsAppService.sendFinanceNotification({
              unidade_id: unidade.unidade_id,
              cliente_id: resolveResult.cliente.id,
              cliente_telefone: clienteTelefone,
              admin_telefone: adminTelefone,
              unidade_telefone: unidadeTelefone,
              tipoBase: 'assinatura_cancelada',
              assinatura_referencia: assinaturaRef,
              messageCliente: msgCliente,
              messageAdmin: msgAdmin
            });
          }
        }
      } catch (notifyError) {
        logger.error('❌ [MercadoPagoWebhook] Erro ao disparar notificações WhatsApp financeiras:', notifyError);
      }

      if (eventRowId) {
        await db('mercadopago_webhook_events')
          .where('id', eventRowId)
          .update({
            processed_at: new Date(),
            processing_error: null
          });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      if (eventRowId) {
        try {
          await db('mercadopago_webhook_events')
            .where('id', eventRowId)
            .update({
              processed_at: new Date(),
              processing_error: String(error?.message || 'Erro desconhecido')
            });
        } catch (_) {
          // Evitar falha adicional
        }
      }
      logger.error('❌ [MercadoPagoWebhook] Erro ao processar webhook:', error);
      return res.status(500).json({ success: false });
    }
  }
}

module.exports = MercadoPagoWebhookController;

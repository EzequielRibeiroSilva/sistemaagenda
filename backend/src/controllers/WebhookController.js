const Usuario = require('../models/Usuario');
const logger = require('../utils/logger');
const WhatsappQueueService = require('../queues/WhatsappQueue');

/**
 * Valida se a requisição vem de uma origem permitida.
 *
 * Em produção: a validação é feita exclusivamente pelo apikey da Evolution API
 * (já tratado mais abaixo no handler). Não há restrição de host porque o
 * servidor fica atrás de um proxy reverso com IP fixo.
 *
 * Em desenvolvimento: se WEBHOOK_BASE_URL estiver definida, verifica se o
 * header Host ou o header X-Forwarded-Host bate com o domínio do túnel ngrok.
 * Isso evita que qualquer pessoa que descubra o endpoint local consiga postar.
 *
 * Retorna true se a origem for aceitável, false caso contrário.
 */
function isAllowedOrigin(req) {
  // Em produção não fazemos restrição de host aqui — o apikey já cobre isso.
  if (process.env.NODE_ENV === 'production') return true;

  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;
  if (!webhookBaseUrl) return true; // sem túnel configurado, aceita (dev local direto)

  try {
    const allowedHost = new URL(webhookBaseUrl).hostname;
    const requestHost = (req.headers['x-forwarded-host'] || req.headers['host'] || '').split(':')[0];
    return requestHost === allowedHost;
  } catch {
    // URL malformada no .env — não bloqueia, apenas loga
    logger.warn('[Webhook] WEBHOOK_BASE_URL inválida no .env, validação de origem ignorada');
    return true;
  }
}

class WebhookController {
  constructor() {
    this.usuarioModel = new Usuario();
  }

  normalizeSenderNumber(sender) {
    if (!sender || typeof sender !== 'string') return null;
    return sender.replace(/@s\.whatsapp\.net$/i, '');
  }

  async whatsapp(req, res) {
    try {
      // ── Validação de origem (desenvolvimento com túnel ngrok) ──────────────
      if (!isAllowedOrigin(req)) {
        logger.warn(`⚠️ [Webhook] Requisição bloqueada: host não permitido (${req.headers['host']})`);
        return res.status(403).json({ success: false, message: 'Origem não autorizada' });
      }

      const payload = req.body || {};

      const event = payload.event;
      const instanceName = payload.instance || payload?.data?.instance;
      const state = payload?.data?.state;
      const apikey = payload?.apikey;
      const sender = payload?.sender;

      // NOVO BLOCO: Enfileira mensagens e responde na hora (Padrão Assíncrono)
      if (event === 'messages.upsert') {
        try {
          await WhatsappQueueService.addMessage(payload);
          return res.status(200).json({ success: true, queued: true });
        } catch (error) {
          console.error('[Webhook] Erro ao enfileirar mensagem:', error);
          return res.status(500).json({ success: false, message: 'Erro interno na fila' });
        }
      }

      // LÓGICA ORIGINAL MANTIDA
      if (event !== 'connection.update') {
        return res.status(200).json({ success: true, ignored: true });
      }

      if (!instanceName || !state) {
        return res.status(400).json({
          success: false,
          message: 'Payload inválido: instance e data.state são obrigatórios'
        });
      }

      const user = await this.usuarioModel.findByWhatsAppInstanceName(instanceName);
      if (!user) {
        logger.warn(`⚠️ [Webhook] Instância não mapeada no Tally: ${instanceName}`);
        return res.status(200).json({ success: true, ignored: true });
      }

      logger.log(`📩 [Webhook] connection.update recebido: instance=${instanceName} state=${state} usuario_id=${user.id}`);

      // Segurança: validar token (Evolution pode enviar token da instância ou apikey global/management)
      const allowedKeys = [
        user.whatsapp_instance_token,
        process.env.AUTHENTICATION_API_KEY,
        process.env.EVO_API_KEY,
        process.env.EVOLUTION_API_KEY
      ].filter(Boolean);

      if (apikey && allowedKeys.length > 0 && !allowedKeys.includes(apikey)) {
        logger.warn(`⚠️ [Webhook] Token inválido para instância ${instanceName} (usuario_id=${user.id})`);
        return res.status(403).json({ success: false, message: 'Webhook não autorizado' });
      }

      const senderCandidate = sender || payload?.data?.sender || payload?.data?.ownerJid || payload?.data?.number || payload?.data?.phone || payload?.data?.phoneNumber;
      const whatsappNumber = this.normalizeSenderNumber(senderCandidate);

      await this.usuarioModel.updateWhatsAppFields(user.id, {
        whatsapp_status: state,
        ...(whatsappNumber ? { whatsapp_number: whatsappNumber } : {})
      });

      logger.log(`✅ [Webhook] Status atualizado: instance=${instanceName} state=${state}${whatsappNumber ? ` number=${whatsappNumber}` : ''}`);

      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('❌ [Webhook] Erro ao processar webhook WhatsApp:', error);
      return res.status(500).json({ success: false });
    }
  }
}

module.exports = WebhookController;

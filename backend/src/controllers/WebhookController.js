const Usuario = require('../models/Usuario');
const logger = require('../utils/logger');
const WhatsappQueueService = require('../queues/WhatsappQueue');

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

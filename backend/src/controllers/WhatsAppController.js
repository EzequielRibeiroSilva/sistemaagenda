const crypto = require('crypto');
const axios = require('axios');
const Usuario = require('../models/Usuario');
const config = require('../config/config');
const logger = require('../utils/logger');

class WhatsAppController {
  constructor() {
    const baseURL = config?.evolutionApi?.baseUrl || process.env.EVO_API_BASE_URL;
    const managementApiKey = process.env.AUTHENTICATION_API_KEY;
    const apiKey = managementApiKey || config?.evolutionApi?.apiKey || process.env.EVO_API_KEY || process.env.EVOLUTION_API_KEY;

    this.integration = process.env.EVO_API_INTEGRATION || 'WHATSAPP-BAILEYS';

    this.baseURL = baseURL;
    this.apiKey = apiKey;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config?.evolutionApi?.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey
      }
    });

    this.usuarioModel = new Usuario();

    this._fetchInstancesCache = {
      ts: 0,
      data: null,
      inFlight: null
    };

    const ttl = parseInt(process.env.WHATSAPP_STATUS_CACHE_TTL_MS || '10000', 10);
    this._fetchInstancesCacheTtlMs = Number.isFinite(ttl) && ttl >= 0 ? ttl : 10000;
  }

  async fetchInstancesCached() {
    if (!this.baseURL || !this.apiKey) return [];

    const now = Date.now();
    const ttl = this._fetchInstancesCacheTtlMs;
    const cache = this._fetchInstancesCache;

    if (cache.data && ttl > 0 && now - cache.ts < ttl) {
      return cache.data;
    }

    if (cache.inFlight) {
      return cache.inFlight;
    }

    cache.inFlight = (async () => {
      try {
        const instancesResponse = await this.client.get('/instance/fetchInstances');
        const instances = Array.isArray(instancesResponse?.data) ? instancesResponse.data : [];
        cache.data = instances;
        cache.ts = Date.now();
        return instances;
      } finally {
        cache.inFlight = null;
      }
    })();

    return cache.inFlight;
  }

  buildInstanceName(userId) {
    return `tally_user_${userId}`;
  }

  generateInstanceToken() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
  }

  normalizeSenderNumber(sender) {
    if (!sender || typeof sender !== 'string') return null;
    return sender.replace(/@s\.whatsapp\.net$/i, '');
  }

  extractQrBase64(payload) {
    if (!payload) return null;

    if (typeof payload === 'string') return payload;

    const candidates = [
      payload?.base64,
      payload?.qrcode,
      payload?.qrcodeBase64,
      payload?.qr,
      payload?.data?.base64,
      payload?.data?.qrcode,
      payload?.data?.qrcodeBase64,
      payload?.data?.qr,
      payload?.instance?.qrcode,
      payload?.instance?.base64,
      payload?.instance?.qr
    ];

    const found = candidates.find(v => typeof v === 'string' && v.length > 20);
    return found || null;
  }

  async status(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Não autenticado'
        });
      }

      let user = await this.usuarioModel.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      const instanceName = user.whatsapp_instance_name;
      if (this.baseURL && this.apiKey && instanceName) {
        try {
          const instances = await this.fetchInstancesCached();
          const current = instances.find(i => i?.name === instanceName);

          if (current) {
            const nextStatus = current?.connectionStatus || null;
            const nextNumber = current?.ownerJid ? this.normalizeSenderNumber(current.ownerJid) : null;

            const shouldUpdate = (
              (nextStatus && nextStatus !== user.whatsapp_status) ||
              (nextNumber && nextNumber !== user.whatsapp_number)
            );

            if (shouldUpdate) {
              logger.log(`🔄 [WhatsAppController] Sync status via Evolution: usuario_id=${userId} instance=${instanceName} status=${user.whatsapp_status}→${nextStatus || user.whatsapp_status} number=${user.whatsapp_number || '-'}→${nextNumber || user.whatsapp_number || '-'}`);
              await this.usuarioModel.updateWhatsAppFields(userId, {
                ...(nextStatus ? { whatsapp_status: nextStatus } : {}),
                ...(nextNumber ? { whatsapp_number: nextNumber } : {})
              });
              user = await this.usuarioModel.findById(userId);
            }
          }
        } catch (e) {
          logger.warn('⚠️ [WhatsAppController] Falha ao sincronizar status via Evolution (fetchInstances)');
        }
      }

      // Se não há instância configurada, tratar como "nunca configurado".
      // Isso evita que o frontend interprete o default do banco (ex: 'close') como configuração existente.
      const responseStatus = instanceName ? (user.whatsapp_status || null) : null;

      return res.json({
        success: true,
        data: {
          whatsapp_instance_name: user.whatsapp_instance_name || null,
          whatsapp_status: responseStatus,
          whatsapp_number: user.whatsapp_number || null
        }
      });
    } catch (error) {
      logger.error('❌ [WhatsAppController] Erro ao buscar status:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar status do WhatsApp'
      });
    }
  }

  async connect(req, res) {
    try {
      if (!this.baseURL || !this.apiKey) {
        return res.status(500).json({
          success: false,
          message: 'Evolution API não configurada'
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Não autenticado'
        });
      }

      const instanceName = this.buildInstanceName(userId);
      const token = this.generateInstanceToken();

      const user = await this.usuarioModel.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      try {
        await this.client.post('/instance/create', {
          instanceName,
          token,
          qrcode: true,
          integration: this.integration
        });
      } catch (error) {
        const status = error?.response?.status;
        const data = error?.response?.data;
        const msg = JSON.stringify(data || {});

        const messages = data?.response?.message;
        const messageList = Array.isArray(messages) ? messages : (typeof messages === 'string' ? [messages] : []);
        const isInstanceAlreadyExists = messageList.some(m => typeof m === 'string' && m.toLowerCase().includes('already in use'));

        // Se API key está errada/ausente, não adianta seguir
        if (status === 401 || (status === 403 && !isInstanceAlreadyExists)) {
          logger.error(`❌ [WhatsAppController] Evolution API não autorizada ao criar instância: status=${status} data=${msg}`);
          return res.status(500).json({
            success: false,
            message: 'Falha ao autenticar na Evolution API (apikey inválida ou não configurada)',
            ...(process.env.NODE_ENV === 'development'
              ? { debug: { status, response: data || null } }
              : {})
          });
        }

        // Alguns setups retornam erro quando a instância já existe; nesse caso, seguimos para connect
        logger.warn(`⚠️ [WhatsAppController] Falha ao criar instância (pode já existir): status=${status} data=${msg}`);
      }

      const connectResponse = await this.client.get(`/instance/connect/${encodeURIComponent(instanceName)}`);
      const qrBase64 = this.extractQrBase64(connectResponse?.data);

      // Buscar token/número/status reais da instância para persistir no banco
      let persistedToken = token;
      let persistedNumber = null;
      let persistedStatus = 'connecting';

      try {
        const instancesResponse = await this.client.get('/instance/fetchInstances');
        const instances = Array.isArray(instancesResponse?.data) ? instancesResponse.data : [];
        const current = instances.find(i => i?.name === instanceName);

        if (current?.token) persistedToken = current.token;
        if (current?.ownerJid) persistedNumber = this.normalizeSenderNumber(current.ownerJid);
        if (current?.connectionStatus) persistedStatus = current.connectionStatus;
      } catch (e) {
        logger.warn('⚠️ [WhatsAppController] Não foi possível buscar fetchInstances para persistir token/estado');
      }

      await this.usuarioModel.updateWhatsAppFields(userId, {
        whatsapp_instance_name: instanceName,
        whatsapp_instance_token: persistedToken,
        whatsapp_status: persistedStatus || 'connecting',
        whatsapp_number: persistedNumber || null
      });

      return res.json({
        success: true,
        data: {
          instanceName,
          qrcodeBase64: qrBase64,
          raw: qrBase64 ? undefined : connectResponse?.data
        },
        message: qrBase64 ? 'QR Code gerado com sucesso' : 'Resposta recebida, mas QR Code não identificado'
      });
    } catch (error) {
      logger.error('❌ [WhatsAppController] Erro ao conectar WhatsApp:', error?.response?.data || error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao conectar WhatsApp',
        error: process.env.NODE_ENV === 'development' ? (error?.response?.data || error?.message) : undefined
      });
    }
  }

  async disconnect(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Não autenticado'
        });
      }

      const user = await this.usuarioModel.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      const instanceName = user.whatsapp_instance_name || this.buildInstanceName(userId);

      // Best-effort: deletar a instância na Evolution para derrubar sessão e exigir novo QR
      try {
        if (this.baseURL && this.apiKey && instanceName) {
          await this.client.delete(`/instance/delete/${encodeURIComponent(instanceName)}`);
        }
      } catch (e) {
        logger.warn(`⚠️ [WhatsAppController] Falha ao deletar instância no disconnect (best-effort): ${instanceName}`);
      }

      // Limpar dados no Tally; mantém instance_name para recriar a instância com o mesmo nome no próximo connect
      await this.usuarioModel.updateWhatsAppFields(userId, {
        whatsapp_status: 'close',
        whatsapp_number: null,
        whatsapp_instance_token: null
      });

      return res.json({
        success: true,
        message: 'WhatsApp desconectado'
      });
    } catch (error) {
      logger.error('❌ [WhatsAppController] Erro ao desconectar WhatsApp:', error?.response?.data || error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao desconectar WhatsApp'
      });
    }
  }
}

module.exports = WhatsAppController;

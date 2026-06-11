const crypto = require('crypto');
const axios = require('axios');
const Usuario = require('../models/Usuario');
const config = require('../config/config');
const logger = require('../utils/logger');

class WhatsAppController {
  constructor() {
    const baseURL = config?.evolutionApi?.baseUrl || process.env.EVOLUTION_API_URL;
    const apiKey = config?.evolutionApi?.apiKey || process.env.EVOLUTION_API_KEY;

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
        return res.status(503).json({
          success: false,
          error: 'WHATSAPP_NOT_CONFIGURED',
          message: 'Serviço de WhatsApp indisponível no momento'
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

      const createPayload = {
        instanceName,
        token,
        qrcode: true,
        integration: this.integration
      };
      
      console.log('🔍 [AUDITORIA] Payload de Criação:', JSON.stringify(createPayload, null, 2));
      
      try {
        await this.client.post('/instance/create', createPayload);
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
          return res.status(status).json({
            success: false,
            error: 'AUTH_FAILED',
            message: 'Falha na conexão com o serviço de WhatsApp. Clique em "Gerar novo QR" para tentar novamente ou entre em contato com o suporte.',
            ...(process.env.NODE_ENV === 'development'
              ? { debug: { status, response: data || null } }
              : {})
          });
        }

        // Alguns setups retornam erro quando a instância já existe; nesse caso, seguimos para connect
        logger.warn(`⚠️ [WhatsAppController] Falha ao criar instância (pode já existir): status=${status} data=${msg}`);
      }

      // ================================================================
      // CONFIGURAÇÃO DE WEBHOOK COM ANTI-RACE CONDITION + FALLBACK
      // ================================================================
      try {
        const rawBase = process.env.WEBHOOK_BASE_URL;
        const base = rawBase ? String(rawBase).replace(/\/+$/g, '') : null;
        console.log('🔍 [AUDITORIA] WEBHOOK_BASE_URL:', rawBase);
        
        if (base) {
          const webhookUrl = `${base}/api/webhooks/whatsapp`;
          const webhookPayload = {
            webhook: {
              url: webhookUrl,
              enabled: true,
              events: ['messages.upsert', 'connection.update']
            },
            rejectCall: false,
            groupsIgnore: true,
            alwaysOnline: false,
            readMessages: true,
            readStatus: true,
            syncFullHistory: false
          };
          
          console.log('🔍 [AUDITORIA] Payload de Webhook:', JSON.stringify(webhookPayload, null, 2));
          
          // ── DELAY DE SEGURANÇA (ANTI-RACE CONDITION) ──────────────────
          logger.info(`⏳ [WhatsAppController] Aguardando 2s para garantir inicialização completa da instância...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // ═══════════════════════════════════════════════════════════════
          // TESTE 1: ENDPOINT /settings/set/ (MÉTODO ATUAL)
          // ═══════════════════════════════════════════════════════════════
          let webhookPersisted = false;
          
          try {
            console.log('🔄 [TESTE 1] Tentando configurar via /settings/set/');
            const setResponse = await this.client.post(
              `/settings/set/${encodeURIComponent(instanceName)}`, 
              webhookPayload
            );
            console.log('🔍 [AUDITORIA] Resposta do settings/set:', JSON.stringify(setResponse?.data, null, 2));
            console.log('🔍 [AUDITORIA] Status HTTP:', setResponse?.status);
            console.log('🔍 [AUDITORIA] Headers da Resposta:', JSON.stringify(setResponse?.headers, null, 2));
            logger.info(`✅ [WhatsAppController] Webhook configurado com sucesso para ${webhookUrl}`);
            
            // ── VERIFICAÇÃO DE PERSISTÊNCIA ────────────────────────────
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            logger.info(`🔍 [WhatsAppController] Verificando se configuração foi persistida...`);
            const getResponse = await this.client.get(`/settings/find/${encodeURIComponent(instanceName)}`);
            const savedSettings = getResponse?.data;
            
            console.log('🔍 [AUDITORIA] Configurações Salvas (settings/find):', JSON.stringify(savedSettings, null, 2));
            
            const webhookEnabled = savedSettings?.webhook?.enabled;
            const webhookUrlSaved = savedSettings?.webhook?.url;
            
            if (webhookEnabled && webhookUrlSaved === webhookUrl) {
              webhookPersisted = true;
              logger.info(`✅ [TESTE 1] SUCESSO: Webhook está ativo via /settings/set/`);
              console.log('🎯 [AUDITORIA] WEBHOOK CONFIRMADO ATIVO:', {
                method: 'settings/set',
                enabled: webhookEnabled,
                url: webhookUrlSaved,
                events: savedSettings?.webhook?.events
              });
            } else {
              logger.warn(`⚠️ [TESTE 1] FALHOU: Webhook NÃO foi persistido via /settings/set/`);
              console.log('⚠️ [AUDITORIA] WEBHOOK NÃO PERSISTIDO:', {
                method: 'settings/set',
                esperado: { enabled: true, url: webhookUrl },
                recebido: { enabled: webhookEnabled, url: webhookUrlSaved }
              });
            }
          } catch (error) {
            logger.warn(`⚠️ [TESTE 1] ERRO ao usar /settings/set/:`, error?.message);
            console.log('⚠️ [AUDITORIA] Erro no TESTE 1:', {
              method: 'settings/set',
              status: error?.response?.status,
              statusText: error?.response?.statusText,
              data: error?.response?.data,
              message: error?.message
            });
          }
          
          // ═══════════════════════════════════════════════════════════════
          // TESTE 2: ENDPOINT /webhook/update/ (FALLBACK)
          // ═══════════════════════════════════════════════════════════════
          if (!webhookPersisted) {
            try {
              console.log('🔄 [TESTE 2] Tentando configurar via /webhook/update/ (endpoint alternativo)');
              
              // Payload alternativo para /webhook/update/
              const webhookUpdatePayload = {
                url: webhookUrl,
                enabled: true,
                webhookByEvents: true,
                events: ['messages.upsert', 'connection.update']
              };
              
              console.log('🔍 [AUDITORIA] Payload de Webhook (método alternativo):', JSON.stringify(webhookUpdatePayload, null, 2));
              
              const updateResponse = await this.client.post(
                `/webhook/update/${encodeURIComponent(instanceName)}`,
                webhookUpdatePayload
              );
              
              console.log('🔍 [AUDITORIA] Resposta do webhook/update:', JSON.stringify(updateResponse?.data, null, 2));
              console.log('🔍 [AUDITORIA] Status HTTP:', updateResponse?.status);
              
              // Verificar persistência do método alternativo
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              const verifyResponse = await this.client.get(`/settings/find/${encodeURIComponent(instanceName)}`);
              const verifiedSettings = verifyResponse?.data;
              
              console.log('🔍 [AUDITORIA] Configurações Salvas após webhook/update:', JSON.stringify(verifiedSettings, null, 2));
              
              const webhookEnabledAlt = verifiedSettings?.webhook?.enabled;
              const webhookUrlSavedAlt = verifiedSettings?.webhook?.url;
              
              if (webhookEnabledAlt && webhookUrlSavedAlt === webhookUrl) {
                webhookPersisted = true;
                logger.info(`✅ [TESTE 2] SUCESSO: Webhook está ativo via /webhook/update/`);
                console.log('🎯 [AUDITORIA] WEBHOOK CONFIRMADO ATIVO (método alternativo):', {
                  method: 'webhook/update',
                  enabled: webhookEnabledAlt,
                  url: webhookUrlSavedAlt,
                  events: verifiedSettings?.webhook?.events
                });
              } else {
                logger.error(`❌ [TESTE 2] FALHOU: Webhook NÃO foi persistido via /webhook/update/`);
                console.log('⚠️ [AUDITORIA] WEBHOOK NÃO PERSISTIDO (método alternativo):', {
                  method: 'webhook/update',
                  esperado: { enabled: true, url: webhookUrl },
                  recebido: { enabled: webhookEnabledAlt, url: webhookUrlSavedAlt }
                });
              }
              
            } catch (error) {
              logger.error(`❌ [TESTE 2] ERRO ao usar /webhook/update/:`, error?.message);
              console.log('❌ [AUDITORIA] Erro no TESTE 2:', {
                method: 'webhook/update',
                status: error?.response?.status,
                statusText: error?.response?.statusText,
                data: error?.response?.data,
                message: error?.message,
                code: error?.code
              });
            }
          }
          
          // ═══════════════════════════════════════════════════════════════
          // DIAGNÓSTICO FINAL
          // ═══════════════════════════════════════════════════════════════
          if (!webhookPersisted) {
            logger.error(`❌ [WhatsAppController] DIAGNÓSTICO: Webhook NÃO foi configurado em nenhum dos métodos testados`);
            console.log('🔴 [DIAGNÓSTICO FINAL]', {
              message: 'Ambos os endpoints falharam em persistir o webhook',
              testados: ['/settings/set/', '/webhook/update/'],
              possiveisCausas: [
                'API bloqueando URLs externas (SSRF)',
                'Token sem privilégios suficientes',
                'Bug na Evolution API 2.3.7',
                'Configuração global sobrescrevendo',
                'Instância não completamente inicializada'
              ],
              recomendacao: 'Configurar webhook manualmente via interface da Evolution API'
            });
          }
          
        } else {
          logger.warn('[WhatsAppController] WEBHOOK_BASE_URL ausente; pulando configuração automática de webhook');
        }
      } catch (error) {
        logger.error('[WhatsAppController] Falha crítica ao configurar webhook:', JSON.stringify(error?.response?.data, null, 2));
        console.log('❌ [AUDITORIA] Erro crítico na configuração de webhook:', {
          status: error?.response?.status,
          statusText: error?.response?.statusText,
          headers: error?.response?.headers,
          data: error?.response?.data,
          message: error?.message,
          code: error?.code
        });
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
      const upstreamStatus = error?.response?.status;
      const upstreamData = error?.response?.data;
      const upstreamMsg = JSON.stringify(upstreamData || {});

      // Erros semânticos do upstream
      if (upstreamStatus === 401 || upstreamStatus === 403) {
        logger.error(`❌ [WhatsAppController] Evolution auth failed: status=${upstreamStatus} data=${upstreamMsg}`);
        return res.status(upstreamStatus).json({
          success: false,
          error: 'AUTH_FAILED',
          message: 'Falha na conexão com o serviço de WhatsApp. Clique em "Gerar novo QR" para tentar novamente ou entre em contato com o suporte.',
          ...(process.env.NODE_ENV === 'development'
            ? { debug: { status: upstreamStatus, response: upstreamData || null } }
            : {})
        });
      }

      // Timeout / indisponibilidade do upstream
      const code = String(error?.code || '').toUpperCase();
      const isTimeout = code === 'ECONNABORTED' || code === 'ETIMEDOUT';
      const isConnRefused = code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN';

      if (isTimeout) {
        logger.warn(`⚠️ [WhatsAppController] Evolution timeout: code=${code} status=${upstreamStatus || '-'} data=${upstreamMsg}`);
        return res.status(504).json({
          success: false,
          error: 'UPSTREAM_TIMEOUT',
          message: 'Serviço de WhatsApp indisponível no momento'
        });
      }

      if (isConnRefused) {
        logger.warn(`⚠️ [WhatsAppController] Evolution unavailable: code=${code} status=${upstreamStatus || '-'} data=${upstreamMsg}`);
        return res.status(503).json({
          success: false,
          error: 'UPSTREAM_UNAVAILABLE',
          message: 'Serviço de WhatsApp indisponível no momento'
        });
      }

      // Fallback: erro inesperado
      logger.error('❌ [WhatsAppController] Erro inesperado ao conectar WhatsApp:', upstreamData || error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Erro ao conectar WhatsApp',
        errorDetails: process.env.NODE_ENV === 'development' ? (upstreamData || error?.message) : undefined
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

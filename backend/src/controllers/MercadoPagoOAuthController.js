const { db } = require('../config/knex');
const logger = require('../utils/logger');
const MercadoPagoOAuthService = require('../services/MercadoPagoOAuthService');

class MercadoPagoOAuthController {
  constructor() {
    this.service = new MercadoPagoOAuthService();
  }

  // GET /api/integracoes/mercadopago/status?unidade_id=1
  async getStatus(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;

      logger.log('ℹ️ [MercadoPagoOAuthController.getStatus] Status requisitado', {
        usuario_id: usuarioId || null,
        unidade_id: unidadeId || null
      });

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id inválido'
        });
      }

      // Garantia multi-tenant: usuário só pode consultar unidade própria
      const unidade = await db('unidades')
        .where({ id: unidadeId, usuario_id: usuarioId })
        .select('id')
        .first();

      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const integracao = await db('integracoes_mercadopago')
        .where({ unidade_id: unidadeId, usuario_id: usuarioId, status: 'CONNECTED' })
        .select('id')
        .first();

      return res.status(200).json({
        success: true,
        data: {
          conectado: Boolean(integracao)
        }
      });
    } catch (error) {
      logger.error('❌ [MercadoPagoOAuthController.getStatus] Erro:', {
        message: error?.message
      });

      return res.status(500).json({
        success: false,
        error: 'Erro ao consultar status do Mercado Pago',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // DELETE /api/integracoes/mercadopago/disconnect?unidade_id=1
  async disconnect(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id inválido'
        });
      }

      const unidade = await db('unidades')
        .where({ id: unidadeId, usuario_id: usuarioId })
        .select('id')
        .first();

      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      await db('integracoes_mercadopago')
        .where({ unidade_id: unidadeId, usuario_id: usuarioId })
        .update({
          status: 'DISCONNECTED',
          updated_at: db.fn.now()
        });

      logger.log('✅ [MercadoPagoOAuthController.disconnect] Integração Mercado Pago desconectada', {
        usuario_id: usuarioId,
        unidade_id: unidadeId
      });

      return res.status(200).json({
        success: true,
        data: {
          conectado: false
        }
      });
    } catch (error) {
      logger.error('❌ [MercadoPagoOAuthController.disconnect] Erro:', {
        message: error?.message
      });

      return res.status(500).json({
        success: false,
        error: 'Erro ao desconectar Mercado Pago',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  getFrontendBaseUrl() {
    const baseUrl = process.env.FRONTEND_URL;

    if (!baseUrl) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('FRONTEND_URL não configurada em produção');
      }

      return 'http://localhost:5173';
    }

    return String(baseUrl).replace(/\/+$/g, '');
  }

  // GET /api/integracoes/mercadopago/url?unidade_id=1
  async getRedirectUrl(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id inválido'
        });
      }

      // Garantia multi-tenant: usuário só pode conectar unidade própria
      const unidade = await db('unidades')
        .where({ id: unidadeId, usuario_id: usuarioId })
        .select('id')
        .first();

      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const url = this.service.getAuthorizationUrl(unidadeId);

      return res.status(200).json({
        success: true,
        data: {
          url
        }
      });
    } catch (error) {
      logger.error('❌ [MercadoPagoOAuthController.getRedirectUrl] Erro:', {
        message: error?.message
      });

      const message = error?.message ? String(error.message) : '';
      const isEnvError = message.startsWith('MERCADOPAGO_') && message.endsWith('ausente');
      if (isEnvError) {
        return res.status(400).json({
          success: false,
          error: 'Integração Mercado Pago não configurada',
          message
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro ao gerar URL de autorização do Mercado Pago',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET /api/webhooks/mercadopago/callback?code=...&state=unidade_id
  async handleRedirect(req, res) {
    const frontendBaseUrl = (() => {
      try {
        return this.getFrontendBaseUrl();
      } catch {
        return null;
      }
    })();

    try {
      const code = req.query?.code ? String(req.query.code) : '';
      const state = req.query?.state ? String(req.query.state) : '';
      const unidadeId = state ? Number(state) : null;

      if (!code) {
        const url = frontendBaseUrl
          ? `${frontendBaseUrl}/configuracoes?mp_connect=error&reason=missing_code`
          : '/';
        return res.redirect(url);
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        const url = frontendBaseUrl
          ? `${frontendBaseUrl}/configuracoes?mp_connect=error&reason=invalid_state`
          : '/';
        return res.redirect(url);
      }

      await this.service.handleAuthorizationCode(code, unidadeId);

      const successUrl = frontendBaseUrl
        ? `${frontendBaseUrl}/configuracoes?mp_connect=success`
        : '/';

      return res.redirect(successUrl);
    } catch (error) {
      logger.error('❌ [MercadoPagoOAuthController.handleRedirect] Erro:', {
        code: error?.code,
        message: error?.message
      });

      const failUrl = frontendBaseUrl
        ? `${frontendBaseUrl}/configuracoes?mp_connect=error`
        : '/';

      return res.redirect(failUrl);
    }
  }
}

module.exports = MercadoPagoOAuthController;

const { db } = require('../config/knex');
const logger = require('../utils/logger');
const { encrypt } = require('../utils/encryption');

class MercadoPagoOAuthService {
  constructor() {
    this.authorizationBaseUrl = 'https://auth.mercadopago.com.br/authorization';
    this.tokenUrl = 'https://api.mercadopago.com/oauth/token';
  }

  readEnv(name) {
    const raw = process.env[name];
    if (raw == null) return null;
    const value = String(raw).trim();
    if (!value) return null;
    return value.replace(/^['"]|['"]$/g, '');
  }

  get clientId() {
    return this.readEnv('MERCADOPAGO_CLIENT_ID');
  }

  get clientSecret() {
    return this.readEnv('MERCADOPAGO_CLIENT_SECRET');
  }

  get redirectUri() {
    return this.readEnv('MERCADOPAGO_REDIRECT_URI');
  }

  assertEnv() {
    if (!this.clientId) {
      throw new Error('MERCADOPAGO_CLIENT_ID ausente');
    }
    if (!this.clientSecret) {
      throw new Error('MERCADOPAGO_CLIENT_SECRET ausente');
    }
    if (!this.redirectUri) {
      throw new Error('MERCADOPAGO_REDIRECT_URI ausente');
    }
  }

  /**
   * Monta a URL oficial para redirecionamento do OAuth.
   * @param {number|string} unidadeId
   * @returns {string}
   */
  getAuthorizationUrl(unidadeId) {
    this.assertEnv();

    const uId = Number(unidadeId);
    if (!Number.isFinite(uId) || uId <= 0) {
      throw new Error('unidadeId inválido');
    }

    const url = new URL(this.authorizationBaseUrl);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', String(uId));

    return url.toString();
  }

  async resolveTenantByUnidade(unidadeId) {
    const uId = Number(unidadeId);
    if (!Number.isFinite(uId) || uId <= 0) {
      const err = new Error('unidade_id inválido');
      err.code = 'INVALID_UNIDADE_ID';
      throw err;
    }

    const unidade = await db('unidades')
      .where('id', uId)
      .select('id', 'usuario_id')
      .first();

    if (!unidade) {
      const err = new Error('Unidade não encontrada');
      err.code = 'UNIDADE_NOT_FOUND';
      throw err;
    }

    return { unidadeId: Number(unidade.id), usuarioId: Number(unidade.usuario_id) };
  }

  async postToken(payload) {
    const resp = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(payload)
    });

    const json = await resp.json().catch(() => null);

    if (!resp.ok) {
      const err = new Error('Falha ao obter tokens do Mercado Pago');
      err.code = 'MP_OAUTH_TOKEN_FAILED';
      err.httpStatus = resp.status;
      err.mpError = json?.message || json?.error || null;
      throw err;
    }

    return json;
  }

  /**
   * Troca code por tokens, criptografa e faz upsert em integracoes_mercadopago.
   *
   * @param {string} code
   * @param {number|string} unidadeId
   */
  async handleAuthorizationCode(code, unidadeId) {
    this.assertEnv();

    const authorizationCode = String(code || '').trim();
    if (!authorizationCode) {
      const err = new Error('code é obrigatório');
      err.code = 'INVALID_CODE';
      throw err;
    }

    const tenant = await this.resolveTenantByUnidade(unidadeId);

    let tokenResponse;
    try {
      tokenResponse = await this.postToken({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: authorizationCode,
        redirect_uri: this.redirectUri
      });
    } catch (error) {
      logger.error('❌ [MercadoPagoOAuthService] Erro ao trocar code por tokens:', {
        unidade_id: tenant.unidadeId,
        code: error?.code,
        httpStatus: error?.httpStatus,
        message: error?.message
      });
      throw error;
    }

    const accessToken = tokenResponse?.access_token;
    const refreshToken = tokenResponse?.refresh_token;
    const mpUserId = tokenResponse?.user_id != null ? String(tokenResponse.user_id) : null;
    const expiresIn = tokenResponse?.expires_in != null ? Number(tokenResponse.expires_in) : null;

    if (!accessToken || !refreshToken || !mpUserId || !Number.isFinite(expiresIn)) {
      const err = new Error('Resposta inválida do Mercado Pago (tokens ausentes)');
      err.code = 'MP_OAUTH_INVALID_RESPONSE';
      throw err;
    }

    const accessEnc = encrypt(accessToken);
    const refreshEnc = encrypt(refreshToken);

    const expiresAt = new Date(Date.now() + (expiresIn * 1000));

    const rowToUpsert = {
      usuario_id: tenant.usuarioId,
      unidade_id: tenant.unidadeId,
      mp_user_id: mpUserId,

      access_token_ciphertext: accessEnc.ciphertext,
      access_token_iv: accessEnc.iv,
      access_token_auth_tag: accessEnc.authTag,

      refresh_token_ciphertext: refreshEnc.ciphertext,
      refresh_token_iv: refreshEnc.iv,
      refresh_token_auth_tag: refreshEnc.authTag,

      expires_at: expiresAt,
      status: 'CONNECTED',
      updated_at: db.fn.now()
    };

    const result = await db.transaction(async (trx) => {
      // Em Postgres, onConflict precisa bater com a unique key da tabela (unidade_id)
      const inserted = await trx('integracoes_mercadopago')
        .insert({
          ...rowToUpsert,
          created_at: db.fn.now()
        })
        .onConflict('unidade_id')
        .merge(rowToUpsert)
        .returning(['id', 'unidade_id', 'usuario_id', 'mp_user_id', 'status', 'expires_at']);

      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      return row;
    });

    logger.log('✅ [MercadoPagoOAuthService] Integração Mercado Pago conectada', {
      unidade_id: tenant.unidadeId,
      usuario_id: tenant.usuarioId,
      mp_user_id: mpUserId,
      status: 'CONNECTED'
    });

    return {
      success: true,
      data: {
        id: result?.id || null,
        unidade_id: tenant.unidadeId,
        usuario_id: tenant.usuarioId,
        mp_user_id: mpUserId,
        status: 'CONNECTED',
        expires_at: expiresAt,
        live_mode: tokenResponse?.live_mode ?? null
      }
    };
  }
}

module.exports = MercadoPagoOAuthService;

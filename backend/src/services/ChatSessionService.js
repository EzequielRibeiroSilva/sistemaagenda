const { db } = require('../config/knex');
const ChatSession = require('../models/ChatSession');
const logger = require('../utils/logger');

class ChatSessionService {
  constructor() {
    this.chatSessionModel = new ChatSession();
  }

  async getOrCreateSession(unidadeId, telefone) {
    const unidadeIdInt = parseInt(unidadeId);
    if (!unidadeIdInt || !telefone) {
      throw new Error('unidadeId e telefone são obrigatórios');
    }

    const telefoneStr = String(telefone);

    const existing = await this.chatSessionModel.db(this.chatSessionModel.tableName)
      .where('unidade_id', unidadeIdInt)
      .where('cliente_telefone', telefoneStr)
      .where('status', 'active')
      .first();

    if (existing) return existing;

    const unidade = await db('unidades')
      .where('id', unidadeIdInt)
      .select('usuario_id')
      .first();

    const usuarioId = unidade?.usuario_id || null;

    const [created] = await this.chatSessionModel.db(this.chatSessionModel.tableName)
      .insert({
        usuario_id: usuarioId,
        unidade_id: unidadeIdInt,
        cliente_telefone: telefoneStr,
        status: 'active',
        last_interaction_at: this.chatSessionModel.db.fn.now(),
        created_at: this.chatSessionModel.db.fn.now(),
        updated_at: this.chatSessionModel.db.fn.now()
      })
      .returning('*');

    return created;
  }

  async shouldProcessMessage(unidadeId, telefone) {
    const unidadeIdInt = parseInt(unidadeId);
    if (!unidadeIdInt || !telefone) return true;

    const telefoneStr = String(telefone);

    const session = await this.chatSessionModel.db(this.chatSessionModel.tableName)
      .where('unidade_id', unidadeIdInt)
      .where('cliente_telefone', telefoneStr)
      .orderBy('id', 'desc')
      .first();

    if (!session) {
      await this.getOrCreateSession(unidadeIdInt, telefoneStr);
      return true;
    }

    // ✅ Se sessão já está ativa, processar normalmente
    if (session.status === 'active') {
      return true;
    }

    // ⏰ REATIVAÇÃO INLINE (Fase 2): Verificar se sessão pausada já expirou
    if (session.status === 'paused_by_human') {
      // Capturar timeout configurável (com fallback para 15 minutos)
      const timeoutMinutes = parseInt(process.env.SESSION_INACTIVITY_TIMEOUT_MINUTES, 10);
      const defaultTimeout = 15;
      const parsedTimeout = isNaN(timeoutMinutes) ? defaultTimeout : timeoutMinutes;
      const safeTimeout = Math.max(1, Math.min(parsedTimeout, 1440));

      // Calcular minutos de inatividade
      const lastInteractionMs = new Date(session.last_interaction_at).getTime();
      const nowMs = Date.now();
      const inactiveMinutes = Math.floor((nowMs - lastInteractionMs) / 60000);

      // 🔄 Se inatividade >= timeout → Reativar sessão inline
      if (inactiveMinutes >= safeTimeout) {
        logger.info(`[ChatSessionService] 🔄 REATIVAÇÃO INLINE | unidade=${unidadeIdInt} | telefone=${telefoneStr} | inativo_por=${inactiveMinutes}min | timeout=${safeTimeout}min`);

        // Atualizar status da sessão para 'active'
        await this.chatSessionModel.db(this.chatSessionModel.tableName)
          .where('id', session.id)
          .update({
            status: 'active',
            updated_at: this.chatSessionModel.db.fn.now()
          });

        logger.info(`[ChatSessionService] ✅ Sessão reativada com sucesso | session_id=${session.id} | unidade=${unidadeIdInt} | telefone=${telefoneStr}`);

        return true; // ✅ Processar mensagem
      }

      // ⏳ Ainda dentro do timeout → Manter pausado
      logger.debug(`[ChatSessionService] ⏳ Sessão ainda pausada | unidade=${unidadeIdInt} | telefone=${telefoneStr} | inativo_por=${inactiveMinutes}min | aguardar_mais=${safeTimeout - inactiveMinutes}min`);
      return false; // ❌ Não processar
    }

    // 🚫 Outros status (se houver no futuro)
    return session.status === 'active';
  }

  async shouldSuppressOutbound(unidadeId, telefone) {
    const unidadeIdInt = parseInt(unidadeId);
    if (!unidadeIdInt || !telefone) return false;

    const telefoneLimpo = String(telefone).replace(/@s\.whatsapp\.net$/i, '').replace(/\D/g, '');
    if (!telefoneLimpo) return false;

    const session = await this.chatSessionModel.db(this.chatSessionModel.tableName)
      .where('unidade_id', unidadeIdInt)
      .where('cliente_telefone', telefoneLimpo)
      .orderBy('id', 'desc')
      .first();

    return session?.status === 'active';
  }

  async updateLastInteraction(unidadeId, telefone) {
    const unidadeIdInt = parseInt(unidadeId);
    if (!unidadeIdInt || !telefone) {
      throw new Error('unidadeId e telefone são obrigatórios');
    }

    const telefoneStr = String(telefone);

    await this.chatSessionModel.db(this.chatSessionModel.tableName)
      .where('unidade_id', unidadeIdInt)
      .where('cliente_telefone', telefoneStr)
      .update({
        last_interaction_at: this.chatSessionModel.db.fn.now(),
        updated_at: this.chatSessionModel.db.fn.now()
      });

    return true;
  }

  async pauseSession(unidadeId, telefone, reason = 'human_intervention') {
    const unidadeIdInt = parseInt(unidadeId);
    if (!unidadeIdInt || !telefone) {
      throw new Error('unidadeId e telefone são obrigatórios');
    }

    const telefoneStr = String(telefone);

    const updated = await this.chatSessionModel.db(this.chatSessionModel.tableName)
      .where('unidade_id', unidadeIdInt)
      .where('cliente_telefone', telefoneStr)
      .update({
        status: 'paused_by_human',
        last_interaction_at: this.chatSessionModel.db.fn.now(),
        updated_at: this.chatSessionModel.db.fn.now()
      });

    if (updated > 0) {
      logger.info(`[ChatSessionService] 🛑 Sessão pausada | unidade=${unidadeIdInt} | telefone=${telefoneStr} | reason=${reason}`);
    }

    return updated > 0;
  }
}

module.exports = new ChatSessionService();

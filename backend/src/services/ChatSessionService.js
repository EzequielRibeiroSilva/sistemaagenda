const { db } = require('../config/knex');
const ChatSession = require('../models/ChatSession');

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
}

module.exports = new ChatSessionService();

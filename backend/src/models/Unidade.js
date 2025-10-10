const BaseModel = require('./BaseModel');

class Unidade extends BaseModel {
  constructor() {
    super('unidades');
  }

  // Buscar unidades por usuário
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .select('*');
  }

  // Buscar unidades ativas por usuário
  async findActiveByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .where('status', 'Ativo')
      .select('*');
  }

  // Contar unidades ativas por usuário (exclui unidades com status 'Excluido')
  async countByUsuario(usuarioId) {
    const result = await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .where('status', '!=', 'Excluido')
      .count('id as count')
      .first();
    return parseInt(result.count);
  }
}

module.exports = Unidade;

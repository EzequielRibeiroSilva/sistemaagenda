const BaseModel = require('./BaseModel');

class Produto extends BaseModel {
  constructor() {
    super('produtos');
  }

  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .orderBy('nome', 'asc');
  }

  async findByIdAndUsuario(id, usuarioId) {
    return await this.db(this.tableName)
      .where({ id, usuario_id: usuarioId })
      .first();
  }
}

module.exports = Produto;

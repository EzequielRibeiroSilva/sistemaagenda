const BaseModel = require('./BaseModel');

class Categoria extends BaseModel {
  constructor() {
    super('categorias');
  }

  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .orderBy('nome', 'asc');
  }

  async findByNomeAndUsuario(nome, usuarioId) {
    return await this.db(this.tableName)
      .where({ usuario_id: usuarioId, nome })
      .first();
  }
}

module.exports = Categoria;

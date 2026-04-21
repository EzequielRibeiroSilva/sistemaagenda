const BaseModel = require('./BaseModel');

class Produto extends BaseModel {
  constructor() {
    super('produtos');
  }

  async findByUsuario(usuarioId) {
    return await this.db('produtos as p')
      .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
      .where('p.usuario_id', usuarioId)
      .whereNull('p.deleted_at')
      .select('p.*', 'c.nome as categoria')
      .orderBy('p.nome', 'asc');
  }

  async findByIdAndUsuario(id, usuarioId) {
    return await this.db('produtos as p')
      .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
      .where({ 'p.id': id, 'p.usuario_id': usuarioId })
      .whereNull('p.deleted_at')
      .select('p.*', 'c.nome as categoria')
      .first();
  }
}

module.exports = Produto;

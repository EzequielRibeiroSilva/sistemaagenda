const BaseModel = require('./BaseModel');

class Cliente extends BaseModel {
  constructor() {
    super('clientes');
  }

  // Buscar clientes por usuário
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .select('*');
  }

  // Buscar cliente por telefone
  async findByTelefone(telefone, usuarioId) {
    return await this.db(this.tableName)
      .where('telefone', telefone)
      .where('usuario_id', usuarioId)
      .first();
  }

  // Buscar cliente por email
  async findByEmail(email, usuarioId) {
    return await this.db(this.tableName)
      .where('email', email)
      .where('usuario_id', usuarioId)
      .first();
  }

  // Buscar clientes assinantes
  async findAssinantes(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .where('assinante', true)
      .select('*');
  }

  // Buscar clientes com agendamentos
  async findWithAgendamentos(usuarioId) {
    return await this.db(this.tableName)
      .leftJoin('agendamentos', 'clientes.id', 'agendamentos.cliente_id')
      .where('clientes.usuario_id', usuarioId)
      .select('clientes.*')
      .count('agendamentos.id as total_agendamentos')
      .groupBy('clientes.id');
  }
}

module.exports = Cliente;

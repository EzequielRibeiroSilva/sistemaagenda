const BaseModel = require('./BaseModel');
const bcrypt = require('bcryptjs');

class Usuario extends BaseModel {
  constructor() {
    super('usuarios');
  }

  // Buscar usuário por email
  async findByEmail(email) {
    return await this.db(this.tableName).where('email', email).first();
  }

  // Criar usuário com hash da senha
  async create(data) {
    if (data.senha) {
      data.senha_hash = await bcrypt.hash(data.senha, 10);
      delete data.senha;
    }
    
    return await super.create(data);
  }

  // Atualizar usuário com hash da senha se fornecida
  async update(id, data) {
    if (data.senha) {
      data.senha_hash = await bcrypt.hash(data.senha, 10);
      delete data.senha;
    }
    
    return await super.update(id, data);
  }

  // Verificar senha
  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Buscar usuários ativos
  async findActive() {
    return await this.db(this.tableName).where('status', 'Ativo').select('*');
  }
}

module.exports = Usuario;

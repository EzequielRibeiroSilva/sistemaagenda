const BaseModel = require('./BaseModel');
const bcrypt = require('bcryptjs');
const config = require('../config/config');

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
      // ✅ CORREÇÃO 1.9: Validação robusta de senha
      const { validatePasswordStrength } = require('../middleware/passwordValidation');
      const validation = validatePasswordStrength(data.senha);
      
      if (!validation.valid) {
        throw new Error(`Senha não atende aos requisitos: ${validation.errors.join(', ')}`);
      }
      
      // Usar salt rounds da configuração para máxima segurança
      data.senha_hash = await bcrypt.hash(data.senha, config.security.bcryptSaltRounds);
      delete data.senha;
    }

    return await this.db('usuarios').insert(data).returning('*');
  }

  // Atualizar usuário com hash da senha se fornecida
  async update(id, data) {
    if (data.senha) {
      // ✅ CORREÇÃO 1.9: Validação robusta de senha
      const { validatePasswordStrength } = require('../middleware/passwordValidation');
      const validation = validatePasswordStrength(data.senha);
      
      if (!validation.valid) {
        throw new Error(`Senha não atende aos requisitos: ${validation.errors.join(', ')}`);
      }
      
      // Usar salt rounds da configuração para máxima segurança
      data.senha_hash = await bcrypt.hash(data.senha, config.security.bcryptSaltRounds);
      delete data.senha;
    }

    return await this.db('usuarios').where({ id }).update(data).returning('*');
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

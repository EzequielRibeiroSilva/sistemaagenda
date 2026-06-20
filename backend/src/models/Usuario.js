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

    // ✅ VALIDAÇÃO DE TELEFONE: Limpar e validar
    if (data.telefone) {
      const telefoneLimpo = data.telefone.replace(/\D/g, '');
      if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        throw new Error('Telefone inválido. Deve conter 10 ou 11 dígitos (DDD + número)');
      }
      data.telefone = telefoneLimpo;
    }

    // ✅ ENFORCE MODELO SINGLE: Sempre forçar plano Single e limite 1 para role ADMIN
    if (data.role === 'ADMIN') {
      data.plano = 'Single';
      data.limite_unidades = 1;
    }

    // ✅ FEATURE FLAG IA: Garantir default TRUE se não fornecido
    if (data.ia_enabled === undefined) {
      data.ia_enabled = true;
    }

    // ✅ TOKEN BUDGET: Garantir limite padrão se não fornecido (100.000 tokens/dia)
    if (data.max_tokens_daily === undefined) {
      data.max_tokens_daily = 100000;
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

    // ✅ VALIDAÇÃO DE TELEFONE: Limpar e validar
    if (data.telefone) {
      const telefoneLimpo = data.telefone.replace(/\D/g, '');
      if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        throw new Error('Telefone inválido. Deve conter 10 ou 11 dígitos (DDD + número)');
      }
      data.telefone = telefoneLimpo;
    }

    // ✅ ENFORCE MODELO SINGLE: Sempre forçar plano Single e limite 1 para role ADMIN
    if (data.role === 'ADMIN' || data.plano) {
      data.plano = 'Single';
      data.limite_unidades = 1;
    }

    // ✅ FEATURE FLAG IA: Permitir atualização explícita de ia_enabled
    // (se o campo foi enviado como false, boolean ou undefined, o knex lida corretamente)

    // ✅ TOKEN BUDGET: Permitir atualização explícita de max_tokens_daily
    // (permite ajuste dinâmico do limite por painel admin)

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

  // Buscar usuário pela instância WhatsApp/Evolution
  async findByWhatsAppInstanceName(instanceName) {
    if (!instanceName) return null;
    return await this.db(this.tableName)
      .where('whatsapp_instance_name', instanceName)
      .first();
  }

  // Atualizar campos da conexão WhatsApp/Evolution
  async updateWhatsAppFields(id, fields) {
    if (!id) throw new Error('ID do usuário é obrigatório');
    if (!fields || typeof fields !== 'object') throw new Error('Fields inválidos');

    const allowed = new Set([
      'whatsapp_instance_name',
      'whatsapp_instance_token',
      'whatsapp_status',
      'whatsapp_number'
    ]);

    const updateData = {};
    for (const [key, value] of Object.entries(fields)) {
      if (allowed.has(key)) updateData[key] = value;
    }

    if (Object.keys(updateData).length === 0) {
      return await this.db(this.tableName).where({ id }).first();
    }

    const [updated] = await this.db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return updated;
  }
}

module.exports = Usuario;

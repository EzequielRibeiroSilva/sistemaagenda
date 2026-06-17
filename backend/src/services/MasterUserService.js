const bcrypt = require('bcryptjs');
const config = require('../config/config');
const Usuario = require('../models/Usuario');
const Unidade = require('../models/Unidade');
const Cliente = require('../models/Cliente');
const { db: knex } = require('../config/knex');
const logger = require('../utils/logger');

class MasterUserService {
  constructor() {
    this.usuarioModel = new Usuario();
    this.unidadeModel = new Unidade();
    this.clienteModel = new Cliente();
  }

  /**
   * Lista todos os usuários ADMIN com dados calculados
   * @param {string} search - Termo de busca (nome ou email)
   * @param {string} status - Filtro de status ('Ativo', 'Bloqueado', ou null para todos)
   * @returns {Promise<Array>} Lista de usuários com dados calculados
   */
  async getAllUsers(search = '', status = null) {
    try {
      // 🎯 TASK 3.3 - FASE 3.1: JOIN OTIMIZADO COM TOKENS DOS ÚLTIMOS 30 DIAS
      // Subquery para agregar tokens dos últimos 30 dias por usuário
      const tokensSubquery = knex('uso_tokens_diario')
        .select('usuario_id')
        .sum('total_tokens as tokens_sum')
        .where('data', '>=', knex.raw('CURRENT_DATE - INTERVAL \'30 days\''))
        .groupBy('usuario_id')
        .as('tokens_30d');

      let query = knex('usuarios')
        .select(
          'usuarios.id',
          'usuarios.nome as name',
          'usuarios.email',
          'usuarios.telefone as contact',
          'usuarios.status',
          'usuarios.plano as plan',
          'usuarios.limite_unidades as unitLimit',
          'usuarios.ia_enabled as iaEnabled',
          'usuarios.created_at',
          'usuarios.updated_at',
          // 🎯 CAMPOS DE TOKENS: LEFT JOIN para não excluir usuários sem consumo
          knex.raw('COALESCE(tokens_30d.tokens_sum, 0) as tokens_30d'),
          // 💰 CÁLCULO DE CUSTO ESTIMADO: $0.05 por milhão de tokens (GPT-4o-mini)
          knex.raw('ROUND((COALESCE(tokens_30d.tokens_sum, 0) / 1000000.0) * 0.05, 4) as custo_est_usd')
        )
        .leftJoin(tokensSubquery, 'usuarios.id', 'tokens_30d.usuario_id')
        .where('usuarios.role', 'ADMIN');

      // Aplicar filtro de busca se fornecido
      if (search && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        query = query.where(function() {
          this.whereRaw('LOWER(usuarios.nome) LIKE ?', [searchTerm])
              .orWhereRaw('LOWER(usuarios.email) LIKE ?', [searchTerm]);
        });
      }

      // ✅ Aplicar filtro de status se fornecido
      if (status && ['Ativo', 'Bloqueado'].includes(status)) {
        query = query.where('usuarios.status', status);
      }

      const users = await query;

      // Para cada usuário, calcular dados adicionais (mantém compatibilidade)
      const usersWithCalculatedData = await Promise.all(
        users.map(async (user) => {
          // Contar unidades ativas
          const unidadesAtivas = await knex('unidades')
            .where('usuario_id', user.id)
            .where('status', 'Ativo')
            .count('id as count')
            .first();

          // Contar total de clientes através das unidades do usuário
          const totalClientes = await knex('clientes')
            .join('unidades', 'clientes.unidade_id', 'unidades.id')
            .where('unidades.usuario_id', user.id)
            .count('clientes.id as count')
            .first();

          return {
            ...user,
            activeUnits: parseInt(unidadesAtivas.count) || 0,
            clientCount: parseInt(totalClientes.count) || 0,
            // 🎯 CONVERSÃO DE TIPOS PARA GARANTIR CONSISTÊNCIA
            tokens_30d: parseInt(user.tokens_30d) || 0,
            custo_est_usd: parseFloat(user.custo_est_usd) || 0.0
          };
        })
      );

      return usersWithCalculatedData;
    } catch (error) {
      logger.error('Erro ao buscar usuários:', error);
      throw new Error('Erro interno do servidor ao buscar usuários');
    }
  }

  /**
   * Cria um novo usuário ADMIN com transação atômica
   * @param {Object} userData - Dados do usuário
   * @returns {Promise<Object>} Usuário criado
   */
  async createUser(userData) {
    const trx = await knex.transaction();
    
    try {
      const { nome, email, senha, telefone } = userData;

      // Validar dados obrigatórios
      if (!nome || !email || !senha || !telefone) {
        throw new Error('Todos os campos obrigatórios devem ser preenchidos');
      }

      // ✅ VALIDAÇÃO DE TELEFONE: Limpar e validar
      const telefoneLimpo = telefone.replace(/\D/g, '');
      if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        throw new Error('Telefone inválido. Deve conter 10 ou 11 dígitos (DDD + número)');
      }

      // ✅ CORREÇÃO 1.9: Validação robusta de senha
      const { validatePasswordStrength } = require('../middleware/passwordValidation');
      const validation = validatePasswordStrength(senha);
      
      if (!validation.valid) {
        throw new Error(`Senha não atende aos requisitos: ${validation.errors.join(', ')}`);
      }

      // Verificar se email já existe
      const existingUser = await trx('usuarios').where('email', email).first();
      if (existingUser) {
        throw new Error('Email já está em uso');
      }

      // Hash da senha
      const senhaHash = await bcrypt.hash(senha, config.security.bcryptSaltRounds);

      // ✅ ENFORCE MODELO SINGLE: Sempre forçar plano Single e limite 1
      const plano = 'Single';
      const finalLimiteUnidades = 1;

      // Criar usuário
      const [userResult] = await trx('usuarios').insert({
        nome,
        email,
        senha_hash: senhaHash,
        telefone: telefoneLimpo, // ✅ Salvar apenas números no banco
        tipo_usuario: 'salon',
        role: 'ADMIN',
        status: 'Ativo',
        plano,
        limite_unidades: finalLimiteUnidades,
        ia_enabled: userData.ia_enabled !== undefined ? Boolean(userData.ia_enabled) : true, // ✅ Feature Flag IA
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      }).returning('id');

      // Extrair o ID corretamente
      const userId = userResult.id || userResult;

      // Criar unidade inicial (sempre 'Unidade Principal' no modelo Single)
      await trx('unidades').insert({
        nome: 'Unidade Principal',
        endereco: 'A definir',
        telefone: telefoneLimpo,
        usuario_id: userId,
        status: 'Ativo',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });

      await trx.commit();

      // Buscar usuário criado com dados calculados
      const createdUser = await this.getUserById(userId);
      return createdUser;

    } catch (error) {
      // ✅ CORREÇÃO: Garantir rollback antes de propagar erro
      if (trx && !trx.isCompleted()) {
        await trx.rollback();
      }
      logger.error('Erro ao criar usuário:', error);
      throw error;
    }
  }

  /**
   * Atualiza um usuário existente
   * @param {number} id - ID do usuário
   * @param {Object} userData - Dados para atualização
   * @returns {Promise<Object>} Usuário atualizado
   */
  async updateUser(id, userData) {
    try {
      const { nome, email, senha, telefone } = userData;

      // Verificar se usuário existe
      const existingUser = await knex('usuarios').where('id', id).first();
      if (!existingUser) {
        throw new Error('Usuário não encontrado');
      }

      // Verificar se email já está em uso por outro usuário
      if (email && email !== existingUser.email) {
        const emailInUse = await knex('usuarios')
          .where('email', email)
          .where('id', '!=', id)
          .first();
        if (emailInUse) {
          throw new Error('Email já está em uso');
        }
      }

      // Preparar dados para atualização
      const updateData = {
        updated_at: knex.fn.now()
      };

      if (nome) updateData.nome = nome;
      if (email) updateData.email = email;
      
      // ✅ VALIDAÇÃO DE TELEFONE: Limpar e validar
      if (telefone) {
        const telefoneLimpo = telefone.replace(/\D/g, '');
        if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
          throw new Error('Telefone inválido. Deve conter 10 ou 11 dígitos (DDD + número)');
        }
        updateData.telefone = telefoneLimpo;
      }

      // ✅ ENFORCE MODELO SINGLE: Sempre forçar plano Single e limite 1 (ignorar payload)
      updateData.plano = 'Single';
      updateData.limite_unidades = 1;

      // ✅ FEATURE FLAG IA: Permitir atualização de ia_enabled via payload
      if (userData.ia_enabled !== undefined) {
        updateData.ia_enabled = Boolean(userData.ia_enabled);
      }

      // Atualizar senha apenas se fornecida
      if (senha && senha.trim()) {
        // ✅ CORREÇÃO 1.9: Validação robusta de senha
        const { validatePasswordStrength } = require('../middleware/passwordValidation');
        const validation = validatePasswordStrength(senha);
        
        if (!validation.valid) {
          throw new Error(`Senha não atende aos requisitos: ${validation.errors.join(', ')}`);
        }
        
        updateData.senha_hash = await bcrypt.hash(senha, config.security.bcryptSaltRounds);
      }

      // Atualizar usuário
      await knex('usuarios').where('id', id).update(updateData);

      // Retornar usuário atualizado com dados calculados
      const updatedUser = await this.getUserById(id);
      return updatedUser;

    } catch (error) {
      logger.error('Erro ao atualizar usuário:', error);
      throw error;
    }
  }

  /**
   * Altera o status de um usuário
   * @param {number} id - ID do usuário
   * @param {string} status - Novo status ('Ativo' ou 'Bloqueado')
   * @returns {Promise<Object>} Usuário atualizado
   */
  async updateUserStatus(id, status) {
    try {
      if (!['Ativo', 'Bloqueado'].includes(status)) {
        throw new Error('Status inválido. Use "Ativo" ou "Bloqueado"');
      }

      const existingUser = await knex('usuarios').where('id', id).first();
      if (!existingUser) {
        throw new Error('Usuário não encontrado');
      }

      await knex('usuarios')
        .where('id', id)
        .update({
          status,
          updated_at: knex.fn.now()
        });

      const updatedUser = await this.getUserById(id);
      return updatedUser;

    } catch (error) {
      logger.error('Erro ao atualizar status do usuário:', error);
      throw error;
    }
  }

  /**
   * Busca um usuário por ID com dados calculados
   * ✅ RBAC: Filtra APENAS usuários ADMIN (inquilinos/tenants)
   * Usuários MASTER não devem ser expostos por este endpoint
   * @param {number} id - ID do usuário
   * @returns {Promise<Object>} Usuário com dados calculados
   */
  async getUserById(id) {
    try {
      // 🎯 TASK 3.3: Incluir JOIN com tokens igual ao getAllUsers
      const tokensSubquery = knex('uso_tokens_diario')
        .select('usuario_id')
        .sum('total_tokens as tokens_sum')
        .where('data', '>=', knex.raw('CURRENT_DATE - INTERVAL \'30 days\''))
        .groupBy('usuario_id')
        .as('tokens_30d');

      const user = await knex('usuarios')
        .select(
          'usuarios.id',
          'usuarios.nome as name',
          'usuarios.email',
          'usuarios.telefone as contact',
          'usuarios.status',
          'usuarios.plano as plan',
          'usuarios.limite_unidades as unitLimit',
          'usuarios.ia_enabled as iaEnabled',
          'usuarios.created_at',
          'usuarios.updated_at',
          // 🎯 CAMPOS DE TOKENS: LEFT JOIN para não excluir usuários sem consumo
          knex.raw('COALESCE(tokens_30d.tokens_sum, 0) as tokens_30d'),
          // 💰 CÁLCULO DE CUSTO ESTIMADO: $0.05 por milhão de tokens
          knex.raw('ROUND((COALESCE(tokens_30d.tokens_sum, 0) / 1000000.0) * 0.05, 4) as custo_est_usd')
        )
        .leftJoin(tokensSubquery, 'usuarios.id', 'tokens_30d.usuario_id')
        .where('usuarios.id', id)
        .where('usuarios.role', 'ADMIN')
        .first();

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      // Calcular dados adicionais
      const unidadesAtivas = await knex('unidades')
        .where('usuario_id', id)
        .where('status', 'Ativo')
        .count('id as count')
        .first();

      const totalClientes = await knex('clientes')
        .join('unidades', 'clientes.unidade_id', 'unidades.id')
        .where('unidades.usuario_id', id)
        .count('clientes.id as count')
        .first();

      return {
        ...user,
        activeUnits: parseInt(unidadesAtivas.count) || 0,
        clientCount: parseInt(totalClientes.count) || 0,
        // 🎯 CONVERSÃO DE TIPOS PARA GARANTIR CONSISTÊNCIA
        tokens_30d: parseInt(user.tokens_30d) || 0,
        custo_est_usd: parseFloat(user.custo_est_usd) || 0.0
      };

    } catch (error) {
      logger.error('Erro ao buscar usuário por ID:', error);
      throw error;
    }
  }

  /**
   * Lista todas as unidades de um usuário
   * @param {number} userId - ID do usuário
   * @returns {Promise<Array>} Lista de unidades
   */
  async getUserUnits(userId) {
    try {
      const user = await knex('usuarios').where('id', userId).first();
      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      const units = await knex('unidades')
        .select('id', 'nome as name', 'status')
        .where('usuario_id', userId)
        .orderBy('created_at', 'asc');

      return units;

    } catch (error) {
      logger.error('Erro ao buscar unidades do usuário:', error);
      throw error;
    }
  }

  /**
   * Altera o status de uma unidade
   * @param {number} unitId - ID da unidade
   * @param {string} status - Novo status ('Ativo' ou 'Bloqueado')
   * @returns {Promise<Object>} Unidade atualizada
   */
  async updateUnitStatus(unitId, status) {
    try {
      if (!['Ativo', 'Bloqueado'].includes(status)) {
        throw new Error('Status inválido. Use "Ativo" ou "Bloqueado"');
      }

      const existingUnit = await knex('unidades').where('id', unitId).first();
      if (!existingUnit) {
        throw new Error('Unidade não encontrada');
      }

      await knex('unidades')
        .where('id', unitId)
        .update({
          status,
          updated_at: knex.fn.now()
        });

      const updatedUnit = await knex('unidades')
        .select('id', 'nome as name', 'status')
        .where('id', unitId)
        .first();

      return updatedUnit;

    } catch (error) {
      logger.error('Erro ao atualizar status da unidade:', error);
      throw error;
    }
  }
}

module.exports = MasterUserService;

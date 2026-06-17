const MasterUserService = require('../services/MasterUserService');
const logger = require('./../utils/logger');

class MasterUserController {
  constructor() {
    this.masterUserService = new MasterUserService();
  }

  /**
   * GET /api/usuarios - Lista todos os usuários ADMIN
   */
  async getAllUsers(req, res) {
    try {
      const { search, status } = req.query;
      
      logger.log(`[MasterUserController] Buscando usuários - Search: "${search || 'todos'}", Status: "${status || 'todos'}"`);
      
      const users = await this.masterUserService.getAllUsers(search, status);
      
      // 🔍 DEBUG: Log do primeiro usuário com tokens
      if (users.length > 0) {
        const userWithTokens = users.find(u => u.tokens_30d > 0);
        if (userWithTokens) {
          logger.log('[MasterUserController] 🔍 DEBUG - Usuário com tokens:', {
            id: userWithTokens.id,
            name: userWithTokens.name,
            tokens_30d: userWithTokens.tokens_30d,
            custo_est_usd: userWithTokens.custo_est_usd,
            tokens_type: typeof userWithTokens.tokens_30d,
            custo_type: typeof userWithTokens.custo_est_usd
          });
        }
        
        const user468 = users.find(u => u.id === 468);
        if (user468) {
          logger.log('[MasterUserController] 🔍 DEBUG - Usuário 468:', {
            id: user468.id,
            name: user468.name,
            tokens_30d: user468.tokens_30d,
            custo_est_usd: user468.custo_est_usd,
            has_tokens_field: user468.hasOwnProperty('tokens_30d'),
            has_custo_field: user468.hasOwnProperty('custo_est_usd')
          });
        }
      }
      
      logger.log(`[MasterUserController] Encontrados ${users.length} usuários`);
      
      res.status(200).json({
        success: true,
        data: users,
        message: `${users.length} usuários encontrados`
      });

    } catch (error) {
      logger.error('[MasterUserController] Erro ao buscar usuários:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * POST /api/usuarios - Cria um novo usuário ADMIN
   */
  async createUser(req, res) {
    try {
      const userData = req.body;
      
      logger.log('[MasterUserController] Criando novo usuário:', {
        nome: userData.nome,
        email: userData.email,
        plano: userData.plano
      });

      
      const newUser = await this.masterUserService.createUser(userData);
      
      logger.log(`[MasterUserController] Usuário criado com sucesso - ID: ${newUser.id}`);
      
      res.status(201).json({
        success: true,
        data: newUser,
        message: 'Usuário criado com sucesso'
      });

    } catch (error) {
      logger.error('[MasterUserController] Erro ao criar usuário:', error);
      
      // Tratar erros específicos
      if (error.message.includes('Email já está em uso')) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }
      
      if (error.message.includes('campos obrigatórios')) {
        return res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao criar usuário'
      });
    }
  }

  /**
   * PUT /api/usuarios/:id - Atualiza um usuário existente
   */
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const userData = req.body;
      
      logger.log(`[MasterUserController] Atualizando usuário ID: ${id}`);
      
      const updatedUser = await this.masterUserService.updateUser(parseInt(id), userData);
      
      logger.log(`[MasterUserController] Usuário ${id} atualizado com sucesso`);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'Usuário atualizado com sucesso'
      });

    } catch (error) {
      logger.error('[MasterUserController] Erro ao atualizar usuário:', error);
      
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado',
          message: error.message
        });
      }
      
      if (error.message.includes('Email já está em uso')) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao atualizar usuário'
      });
    }
  }

  /**
   * PATCH /api/usuarios/:id/status - Altera o status de um usuário
   */
  async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      logger.log(`[MasterUserController] Alterando status do usuário ${id} para: ${status}`);
      
      const updatedUser = await this.masterUserService.updateUserStatus(parseInt(id), status);
      
      logger.log(`[MasterUserController] Status do usuário ${id} alterado para: ${status}`);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: `Status alterado para ${status}`
      });

    } catch (error) {
      logger.error('[MasterUserController] Erro ao alterar status:', error);
      
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado',
          message: error.message
        });
      }
      
      if (error.message.includes('Status inválido')) {
        return res.status(400).json({
          success: false,
          error: 'Status inválido',
          message: 'Status deve ser "Ativo" ou "Bloqueado"'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao alterar status'
      });
    }
  }

  /**
   * GET /api/usuarios/:id/unidades - Lista unidades de um usuário
   */
  async getUserUnits(req, res) {
    try {
      const { id } = req.params;
      
      logger.log(`[MasterUserController] Buscando unidades do usuário ${id}`);
      
      const units = await this.masterUserService.getUserUnits(parseInt(id));
      
      logger.log(`[MasterUserController] Encontradas ${units.length} unidades para usuário ${id}`);
      
      res.status(200).json({
        success: true,
        data: units,
        message: `${units.length} unidades encontradas`
      });

    } catch (error) {
      logger.error('[MasterUserController] Erro ao buscar unidades:', error);
      
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado',
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar unidades'
      });
    }
  }

  /**
   * PATCH /api/unidades/:id/status - Altera o status de uma unidade
   */
  async updateUnitStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      logger.log(`[MasterUserController] Alterando status da unidade ${id} para: ${status}`);
      
      const updatedUnit = await this.masterUserService.updateUnitStatus(parseInt(id), status);
      
      logger.log(`[MasterUserController] Status da unidade ${id} alterado para: ${status}`);
      
      res.status(200).json({
        success: true,
        data: updatedUnit,
        message: `Status da unidade alterado para ${status}`
      });

    } catch (error) {
      logger.error('[MasterUserController] Erro ao alterar status da unidade:', error);
      
      if (error.message.includes('não encontrada')) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada',
          message: error.message
        });
      }
      
      if (error.message.includes('Status inválido')) {
        return res.status(400).json({
          success: false,
          error: 'Status inválido',
          message: 'Status deve ser "Ativo" ou "Bloqueado"'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao alterar status da unidade'
      });
    }
  }
  /**
   * PATCH /api/usuarios/:id/ia-toggle - Alterna o status da IA de um usuário ADMIN
   * ✅ RBAC: Opera APENAS sobre usuários ADMIN (inquilinos/tenants)
   */
  async toggleIaStatus(req, res) {
    try {
      const { id } = req.params;
      const { ia_enabled } = req.body;
      
      logger.log(`[MasterUserController] Toggle IA do usuário ${id}`);
      
      // Buscar usuário atual via service (já filtra por role='ADMIN')
      const currentUser = await this.masterUserService.getUserById(parseInt(id));
      
      // Determinar novo estado:
      // - Se ia_enabled foi enviado no body, usar esse valor
      // - Caso contrário, inverter o estado atual (toggle)
      const novoEstado = ia_enabled !== undefined 
        ? Boolean(ia_enabled) 
        : !currentUser.iaEnabled;
      
      // Atualizar via service
      const updatedUser = await this.masterUserService.updateUser(parseInt(id), {
        ia_enabled: novoEstado
      });
      
      logger.log(`[MasterUserController] IA do usuário ${id} alterada para: ${novoEstado}`);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: `Recepcionista IA ${novoEstado ? 'habilitada' : 'desabilitada'} com sucesso`
      });

    } catch (error) {
      logger.error('[MasterUserController] Erro ao alternar status da IA:', error);
      
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado',
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao alternar status da IA'
      });
    }
  }
}

module.exports = MasterUserController;

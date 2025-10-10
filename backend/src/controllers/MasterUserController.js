const MasterUserService = require('../services/MasterUserService');

class MasterUserController {
  constructor() {
    this.masterUserService = new MasterUserService();
  }

  /**
   * GET /api/usuarios - Lista todos os usuários ADMIN
   */
  async getAllUsers(req, res) {
    try {
      const { search } = req.query;
      
      console.log(`[MasterUserController] Buscando usuários - Search: "${search || 'todos'}"`);
      
      const users = await this.masterUserService.getAllUsers(search);
      
      console.log(`[MasterUserController] Encontrados ${users.length} usuários`);
      
      res.status(200).json({
        success: true,
        data: users,
        message: `${users.length} usuários encontrados`
      });

    } catch (error) {
      console.error('[MasterUserController] Erro ao buscar usuários:', error);
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
      
      console.log('[MasterUserController] Criando novo usuário:', {
        nome: userData.nome,
        email: userData.email,
        plano: userData.plano
      });

      
      const newUser = await this.masterUserService.createUser(userData);
      
      console.log(`[MasterUserController] Usuário criado com sucesso - ID: ${newUser.id}`);
      
      res.status(201).json({
        success: true,
        data: newUser,
        message: 'Usuário criado com sucesso'
      });

    } catch (error) {
      console.error('[MasterUserController] Erro ao criar usuário:', error);
      
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
      
      console.log(`[MasterUserController] Atualizando usuário ID: ${id}`);
      
      const updatedUser = await this.masterUserService.updateUser(parseInt(id), userData);
      
      console.log(`[MasterUserController] Usuário ${id} atualizado com sucesso`);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'Usuário atualizado com sucesso'
      });

    } catch (error) {
      console.error('[MasterUserController] Erro ao atualizar usuário:', error);
      
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
      
      console.log(`[MasterUserController] Alterando status do usuário ${id} para: ${status}`);
      
      const updatedUser = await this.masterUserService.updateUserStatus(parseInt(id), status);
      
      console.log(`[MasterUserController] Status do usuário ${id} alterado para: ${status}`);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: `Status alterado para ${status}`
      });

    } catch (error) {
      console.error('[MasterUserController] Erro ao alterar status:', error);
      
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
      
      console.log(`[MasterUserController] Buscando unidades do usuário ${id}`);
      
      const units = await this.masterUserService.getUserUnits(parseInt(id));
      
      console.log(`[MasterUserController] Encontradas ${units.length} unidades para usuário ${id}`);
      
      res.status(200).json({
        success: true,
        data: units,
        message: `${units.length} unidades encontradas`
      });

    } catch (error) {
      console.error('[MasterUserController] Erro ao buscar unidades:', error);
      
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
      
      console.log(`[MasterUserController] Alterando status da unidade ${id} para: ${status}`);
      
      const updatedUnit = await this.masterUserService.updateUnitStatus(parseInt(id), status);
      
      console.log(`[MasterUserController] Status da unidade ${id} alterado para: ${status}`);
      
      res.status(200).json({
        success: true,
        data: updatedUnit,
        message: `Status da unidade alterado para ${status}`
      });

    } catch (error) {
      console.error('[MasterUserController] Erro ao alterar status da unidade:', error);
      
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
}

module.exports = MasterUserController;

const BaseController = require('./BaseController');
const Unidade = require('../models/Unidade');

class UnidadeController extends BaseController {
  constructor() {
    super(new Unidade());
  }

  // GET /api/unidades - Buscar unidades do usuário logado
  async index(req, res) {
    try {
      const usuarioId = req.user?.id; // Assumindo middleware de autenticação
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const { page, limit, status } = req.query;
      const filters = { usuario_id: usuarioId };
      
      if (status) {
        filters.status = status;
      }

      if (page && limit) {
        const result = await this.model.findWithPagination(
          parseInt(page), 
          parseInt(limit), 
          filters
        );
        return res.json(result);
      } else {
        const data = await this.model.findByUsuario(usuarioId);
        return res.json({ data });
      }
    } catch (error) {
      console.error('Erro ao buscar unidades:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // POST /api/unidades - Criar nova unidade
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar limite de unidades do usuário
      const totalUnidades = await this.model.countByUsuario(usuarioId);
      const usuario = req.user; // Assumindo que o middleware carrega os dados do usuário
      
      if (usuario.plano === 'Single' && totalUnidades >= 1) {
        return res.status(400).json({ 
          error: 'Limite de unidades excedido',
          message: 'Plano Single permite apenas 1 unidade' 
        });
      }
      
      if (totalUnidades >= usuario.limite_unidades) {
        return res.status(400).json({ 
          error: 'Limite de unidades excedido',
          message: `Limite máximo de ${usuario.limite_unidades} unidades atingido` 
        });
      }

      const dadosUnidade = {
        ...req.body,
        usuario_id: usuarioId
      };

      const data = await this.model.create(dadosUnidade);
      return res.status(201).json({ 
        data,
        message: 'Unidade criada com sucesso' 
      });
    } catch (error) {
      console.error('Erro ao criar unidade:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // PUT /api/unidades/:id - Atualizar unidade
  async update(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se a unidade pertence ao usuário
      const unidade = await this.model.findById(id);
      if (!unidade) {
        return res.status(404).json({ 
          error: 'Unidade não encontrada' 
        });
      }

      if (unidade.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para editar esta unidade' 
        });
      }

      const data = await this.model.update(id, req.body);
      return res.json({ 
        data,
        message: 'Unidade atualizada com sucesso' 
      });
    } catch (error) {
      console.error('Erro ao atualizar unidade:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // DELETE /api/unidades/:id - Deletar unidade
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se a unidade pertence ao usuário
      const unidade = await this.model.findById(id);
      if (!unidade) {
        return res.status(404).json({ 
          error: 'Unidade não encontrada' 
        });
      }

      if (unidade.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para deletar esta unidade' 
        });
      }

      const deleted = await this.model.delete(id);
      
      if (deleted) {
        return res.json({ 
          message: 'Unidade deletada com sucesso' 
        });
      } else {
        return res.status(500).json({ 
          error: 'Erro ao deletar unidade' 
        });
      }
    } catch (error) {
      console.error('Erro ao deletar unidade:', error);
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Não é possível deletar',
          message: 'Esta unidade possui agendamentos ou agentes vinculados' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }
}

module.exports = UnidadeController;

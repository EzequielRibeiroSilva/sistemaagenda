const BaseController = require('./BaseController');
const Servico = require('../models/Servico');

class ServicoController extends BaseController {
  constructor() {
    super(new Servico());
  }

  // GET /api/servicos - Buscar serviços do usuário logado
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const { page, limit, status, categoria_id, agente_id, stats } = req.query;

      let data;

      if (stats === 'true') {
        data = await this.model.findWithStats(usuarioId);
      } else if (agente_id) {
        data = await this.model.findByAgente(parseInt(agente_id));
      } else if (categoria_id) {
        data = await this.model.findByCategoria(parseInt(categoria_id), usuarioId);
      } else if (status === 'Ativo') {
        data = await this.model.findActiveByUsuario(usuarioId);
      } else if (page && limit) {
        const filters = { usuario_id: usuarioId };
        if (status) filters.status = status;
        
        const result = await this.model.findWithPagination(
          parseInt(page), 
          parseInt(limit), 
          filters
        );
        return res.json(result);
      } else {
        data = await this.model.findByUsuario(usuarioId);
      }

      return res.json({ data });
    } catch (error) {
      console.error('Erro ao buscar serviços:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // POST /api/servicos - Criar novo serviço
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const dadosServico = {
        ...req.body,
        usuario_id: usuarioId
      };

      // Validações básicas
      if (!dadosServico.nome) {
        return res.status(400).json({ 
          error: 'Nome é obrigatório' 
        });
      }

      if (!dadosServico.preco || dadosServico.preco < 0) {
        return res.status(400).json({ 
          error: 'Preço deve ser maior que zero' 
        });
      }

      if (!dadosServico.duracao_minutos || dadosServico.duracao_minutos < 1) {
        return res.status(400).json({ 
          error: 'Duração deve ser maior que zero' 
        });
      }

      const data = await this.model.create(dadosServico);
      return res.status(201).json({ 
        data,
        message: 'Serviço criado com sucesso' 
      });
    } catch (error) {
      console.error('Erro ao criar serviço:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // PUT /api/servicos/:id - Atualizar serviço
  async update(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o serviço pertence ao usuário
      const servico = await this.model.findById(id);
      if (!servico) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }

      if (servico.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para editar este serviço' 
        });
      }

      // Validações básicas
      if (req.body.preco !== undefined && req.body.preco < 0) {
        return res.status(400).json({ 
          error: 'Preço deve ser maior ou igual a zero' 
        });
      }

      if (req.body.duracao_minutos !== undefined && req.body.duracao_minutos < 1) {
        return res.status(400).json({ 
          error: 'Duração deve ser maior que zero' 
        });
      }

      const data = await this.model.update(id, req.body);
      return res.json({ 
        data,
        message: 'Serviço atualizado com sucesso' 
      });
    } catch (error) {
      console.error('Erro ao atualizar serviço:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // DELETE /api/servicos/:id - Deletar serviço
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o serviço pertence ao usuário
      const servico = await this.model.findById(id);
      if (!servico) {
        return res.status(404).json({ 
          error: 'Serviço não encontrado' 
        });
      }

      if (servico.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para deletar este serviço' 
        });
      }

      const deleted = await this.model.delete(id);
      
      if (deleted) {
        return res.json({ 
          message: 'Serviço deletado com sucesso' 
        });
      } else {
        return res.status(500).json({ 
          error: 'Erro ao deletar serviço' 
        });
      }
    } catch (error) {
      console.error('Erro ao deletar serviço:', error);
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Não é possível deletar',
          message: 'Este serviço possui agendamentos ou está vinculado a agentes' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/servicos/categoria/:categoriaId - Buscar serviços por categoria
  async byCategoria(req, res) {
    try {
      const { categoriaId } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const data = await this.model.findByCategoria(parseInt(categoriaId), usuarioId);
      return res.json({ data });
    } catch (error) {
      console.error('Erro ao buscar serviços por categoria:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/servicos/agente/:agenteId - Buscar serviços por agente
  async byAgente(req, res) {
    try {
      const { agenteId } = req.params;
      
      const data = await this.model.findByAgente(parseInt(agenteId));
      return res.json({ data });
    } catch (error) {
      console.error('Erro ao buscar serviços por agente:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }
}

module.exports = ServicoController;

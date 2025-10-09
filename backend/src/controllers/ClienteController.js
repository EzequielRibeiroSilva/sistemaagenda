const BaseController = require('./BaseController');
const Cliente = require('../models/Cliente');

class ClienteController extends BaseController {
  constructor() {
    super(new Cliente());
  }

  // GET /api/clientes - Buscar clientes do usuário logado
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const { page, limit, assinante, search } = req.query;
      let data;

      if (assinante === 'true') {
        data = await this.model.findAssinantes(usuarioId);
      } else if (search) {
        // Busca por nome ou telefone
        data = await this.model.db(this.model.tableName)
          .where('usuario_id', usuarioId)
          .where(function() {
            this.where('nome', 'ilike', `%${search}%`)
                .orWhere('telefone', 'ilike', `%${search}%`)
                .orWhere('email', 'ilike', `%${search}%`);
          })
          .select('*');
      } else if (page && limit) {
        const filters = { usuario_id: usuarioId };
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
      console.error('Erro ao buscar clientes:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // POST /api/clientes - Criar novo cliente
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se já existe cliente com mesmo telefone
      const { telefone, email } = req.body;
      
      if (telefone) {
        const clienteExistente = await this.model.findByTelefone(telefone, usuarioId);
        if (clienteExistente) {
          return res.status(400).json({ 
            error: 'Cliente já existe',
            message: 'Já existe um cliente com este telefone' 
          });
        }
      }

      if (email) {
        const clienteExistente = await this.model.findByEmail(email, usuarioId);
        if (clienteExistente) {
          return res.status(400).json({ 
            error: 'Cliente já existe',
            message: 'Já existe um cliente com este email' 
          });
        }
      }

      const dadosCliente = {
        ...req.body,
        usuario_id: usuarioId
      };

      const data = await this.model.create(dadosCliente);
      return res.status(201).json({ 
        data,
        message: 'Cliente criado com sucesso' 
      });
    } catch (error) {
      console.error('Erro ao criar cliente:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // PUT /api/clientes/:id - Atualizar cliente
  async update(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o cliente pertence ao usuário
      const cliente = await this.model.findById(id);
      if (!cliente) {
        return res.status(404).json({ 
          error: 'Cliente não encontrado' 
        });
      }

      if (cliente.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para editar este cliente' 
        });
      }

      // Verificar duplicatas se telefone ou email foram alterados
      const { telefone, email } = req.body;
      
      if (telefone && telefone !== cliente.telefone) {
        const clienteExistente = await this.model.findByTelefone(telefone, usuarioId);
        if (clienteExistente && clienteExistente.id !== parseInt(id)) {
          return res.status(400).json({ 
            error: 'Telefone já existe',
            message: 'Já existe outro cliente com este telefone' 
          });
        }
      }

      if (email && email !== cliente.email) {
        const clienteExistente = await this.model.findByEmail(email, usuarioId);
        if (clienteExistente && clienteExistente.id !== parseInt(id)) {
          return res.status(400).json({ 
            error: 'Email já existe',
            message: 'Já existe outro cliente com este email' 
          });
        }
      }

      const data = await this.model.update(id, req.body);
      return res.json({ 
        data,
        message: 'Cliente atualizado com sucesso' 
      });
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // DELETE /api/clientes/:id - Deletar cliente
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o cliente pertence ao usuário
      const cliente = await this.model.findById(id);
      if (!cliente) {
        return res.status(404).json({ 
          error: 'Cliente não encontrado' 
        });
      }

      if (cliente.usuario_id !== usuarioId) {
        return res.status(403).json({ 
          error: 'Acesso negado',
          message: 'Você não tem permissão para deletar este cliente' 
        });
      }

      const deleted = await this.model.delete(id);
      
      if (deleted) {
        return res.json({ 
          message: 'Cliente deletado com sucesso' 
        });
      } else {
        return res.status(500).json({ 
          error: 'Erro ao deletar cliente' 
        });
      }
    } catch (error) {
      console.error('Erro ao deletar cliente:', error);
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Não é possível deletar',
          message: 'Este cliente possui agendamentos vinculados' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/clientes/stats - Estatísticas dos clientes
  async stats(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const total = await this.model.count({ usuario_id: usuarioId });
      const assinantes = await this.model.findAssinantes(usuarioId);
      const comAgendamentos = await this.model.findWithAgendamentos(usuarioId);

      return res.json({
        data: {
          total,
          assinantes: assinantes.length,
          com_agendamentos: comAgendamentos.length,
          sem_agendamentos: total - comAgendamentos.length
        }
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }
}

module.exports = ClienteController;

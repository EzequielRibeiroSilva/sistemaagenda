class BaseController {
  constructor(model) {
    this.model = model;
  }

  // GET /api/resource
  async index(req, res) {
    try {
      const { page = 1, limit = 10, ...filters } = req.query;
      
      if (page && limit) {
        const result = await this.model.findWithPagination(
          parseInt(page), 
          parseInt(limit), 
          filters
        );
        return res.json(result);
      } else {
        const data = await this.model.findAll(filters);
        return res.json({ data });
      }
    } catch (error) {
      console.error('Erro no index:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/resource/:id
  async show(req, res) {
    try {
      const { id } = req.params;
      const data = await this.model.findById(id);
      
      if (!data) {
        return res.status(404).json({ 
          error: 'Registro não encontrado' 
        });
      }
      
      return res.json({ data });
    } catch (error) {
      console.error('Erro no show:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // POST /api/resource
  async store(req, res) {
    try {
      const data = await this.model.create(req.body);
      return res.status(201).json({ 
        data,
        message: 'Registro criado com sucesso' 
      });
    } catch (error) {
      console.error('Erro no store:', error);
      
      // Verificar se é erro de validação/constraint
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ 
          error: 'Dados duplicados',
          message: 'Já existe um registro com estes dados' 
        });
      }
      
      if (error.code === '23503') { // Foreign key violation
        return res.status(400).json({ 
          error: 'Referência inválida',
          message: 'Dados relacionados não encontrados' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // PUT /api/resource/:id
  async update(req, res) {
    try {
      const { id } = req.params;
      
      // Verificar se o registro existe
      const exists = await this.model.findById(id);
      if (!exists) {
        return res.status(404).json({ 
          error: 'Registro não encontrado' 
        });
      }
      
      const data = await this.model.update(id, req.body);
      return res.json({ 
        data,
        message: 'Registro atualizado com sucesso' 
      });
    } catch (error) {
      console.error('Erro no update:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({ 
          error: 'Dados duplicados',
          message: 'Já existe um registro com estes dados' 
        });
      }
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Referência inválida',
          message: 'Dados relacionados não encontrados' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // DELETE /api/resource/:id
  async destroy(req, res) {
    try {
      const { id } = req.params;
      
      // Verificar se o registro existe
      const exists = await this.model.findById(id);
      if (!exists) {
        return res.status(404).json({ 
          error: 'Registro não encontrado' 
        });
      }
      
      const deleted = await this.model.delete(id);
      
      if (deleted) {
        return res.json({ 
          message: 'Registro deletado com sucesso' 
        });
      } else {
        return res.status(500).json({ 
          error: 'Erro ao deletar registro' 
        });
      }
    } catch (error) {
      console.error('Erro no destroy:', error);
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Não é possível deletar',
          message: 'Este registro possui dados relacionados' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }
}

module.exports = BaseController;

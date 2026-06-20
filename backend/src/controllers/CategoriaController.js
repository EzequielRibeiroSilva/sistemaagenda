const BaseController = require('./BaseController');
const Categoria = require('../models/Categoria');
const logger = require('../utils/logger');

class CategoriaController extends BaseController {
  constructor() {
    super(new Categoria());
  }

  // GET /api/categorias
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const categorias = await this.model.findByUsuario(usuarioId);

      return res.status(200).json({
        success: true,
        data: categorias
      });
    } catch (error) {
      logger.error('❌ [CategoriaController.index] Erro ao listar categorias:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/categorias
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const { nome } = req.body;
      const nomeFinal = nome ? String(nome).trim() : '';

      if (!nomeFinal) {
        return res.status(400).json({
          success: false,
          error: 'Nome é obrigatório'
        });
      }

      const exists = await this.model.findByNomeAndUsuario(nomeFinal, usuarioId);
      if (exists) {
        return res.status(200).json({
          success: true,
          data: exists,
          message: 'Categoria já existe'
        });
      }

      const created = await this.model.db('categorias')
        .insert({
          usuario_id: usuarioId,
          nome: nomeFinal,
          created_at: new Date()
        })
        .returning('*');

      const row = Array.isArray(created) ? created[0] : created;

      // 🗑️ INVALIDAÇÃO DE CACHE FAQ (TASK 3.2)
      // Categorias são globais por usuário: invalidar todas as unidades ativas
      setImmediate(async () => {
        try {
          const { invalidateKnowledgeCache } = require('../middleware/cacheInvalidation');
          const unidades = await this.model.db('unidades')
            .where('usuario_id', usuarioId)
            .where('status', 'Ativo')
            .select('id');
          const unidadeIds = (unidades || []).map(u => u.id);
          await invalidateKnowledgeCache(usuarioId, unidadeIds);
        } catch (err) {
          logger.warn('[Cache] Erro ao invalidar (não-crítico):', err?.message);
        }
      });

      return res.status(201).json({
        success: true,
        data: row,
        message: 'Categoria criada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [CategoriaController.store] Erro ao criar categoria:', error);

      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'Dados duplicados',
          message: 'Já existe uma categoria com este nome'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = CategoriaController;

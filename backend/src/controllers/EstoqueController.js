const { db } = require('../config/knex');
const InventoryService = require('../services/InventoryService');

class EstoqueController {
  // GET /api/estoque/snapshot?unidade_id=1
  async snapshot(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId)) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const rows = await db('produtos as p')
        .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
        .leftJoin('estoque_unidades as eu', function () {
          this.on('eu.produto_id', '=', 'p.id').andOn('eu.unidade_id', '=', db.raw('?', [unidadeId]));
        })
        .where('p.usuario_id', usuarioId)
        .whereNull('p.deleted_at')
        .select(
          'p.id as produto_id',
          'p.nome as produto_nome',
          'p.marca as produto_marca',
          'c.nome as produto_categoria',
          'p.unidade_medida as produto_unidade_medida',
          db.raw('? as unidade_id', [unidadeId]),
          db.raw('COALESCE(eu.saldo_atual, 0) as saldo_atual'),
          'eu.estoque_minimo',
          'eu.estoque_maximo'
        )
        .orderBy('p.nome', 'asc');

      return res.status(200).json({
        success: true,
        data: rows
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/estoque/movimentacoes
  async criarEntrada(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.body?.unidade_id ? Number(req.body.unidade_id) : null;
      const produtoId = req.body?.produto_id ? Number(req.body.produto_id) : null;
      const quantidade = req.body?.quantidade;
      const motivo = req.body?.motivo;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId)) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      if (!produtoId || !Number.isFinite(produtoId)) {
        return res.status(400).json({
          success: false,
          error: 'produto_id é obrigatório'
        });
      }

      const inventoryService = new InventoryService(db);
      const result = await inventoryService.movimentarEstoque({
        usuario_id: usuarioId,
        unidade_id: unidadeId,
        produto_id: produtoId,
        tipo: 'ENTRADA',
        quantidade,
        motivo,
        created_by: usuarioId
      });

      return res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      const status = error?.code === 'INVALID_PARAMS' || error?.code === 'INVALID_TIPO' || error?.code === 'INVALID_QUANTIDADE'
        ? 400
        : error?.code === 'PRODUTO_NOT_FOUND' || error?.code === 'UNIDADE_NOT_FOUND'
          ? 404
          : 500;

      return res.status(status).json({
        success: false,
        error: status === 500 ? 'Erro interno do servidor' : error.message,
        message: error.message
      });
    }
  }

  // GET /api/estoque/movimentacoes?unidade_id=1&limit=200
  async movimentacoes(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;
      const limit = req.query?.limit ? Number(req.query.limit) : 200;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId)) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 500 ? limit : 200;

      const rows = await db('estoque_movimentacoes as em')
        .join('produtos as p', 'p.id', 'em.produto_id')
        .where('em.usuario_id', usuarioId)
        .where('em.unidade_id', unidadeId)
        .select(
          'em.id',
          'em.tipo',
          'em.quantidade',
          'em.motivo',
          'em.origem_id',
          'em.produto_id',
          'p.nome as produto_nome',
          'p.marca as produto_marca',
          'em.unidade_id',
          'em.created_by',
          'em.created_at'
        )
        .orderBy('em.created_at', 'desc')
        .limit(safeLimit);

      return res.status(200).json({
        success: true,
        data: rows
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = EstoqueController;

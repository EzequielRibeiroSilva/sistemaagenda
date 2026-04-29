const { db } = require('../config/knex');
const logger = require('../utils/logger');

function parseMoneyToNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  if (!raw) return NaN;

  // Aceitar formatos PT-BR como "1.234,56" e também "1234.56"
  const normalized = raw
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

class DespesaController {
  // GET /api/financeiro/despesas?unidade_id=1&status=PENDING&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD&limit=200
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;
      const status = req.query?.status ? String(req.query.status).trim() : null;
      const dataInicio = req.query?.data_inicio ? String(req.query.data_inicio).trim() : null;
      const dataFim = req.query?.data_fim ? String(req.query.data_fim).trim() : null;
      const limit = req.query?.limit ? Number(req.query.limit) : 200;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
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

      const q = db('despesas as d')
        .where('d.unidade_id', unidadeId)
        .where('d.usuario_id', usuarioId)
        .select(
          'd.id',
          'd.unidade_id',
          'd.usuario_id',
          'd.descricao',
          'd.categoria',
          'd.valor',
          'd.data_vencimento',
          'd.data_pagamento',
          'd.status',
          'd.forma_pagamento',
          'd.created_at',
          'd.updated_at'
        )
        .orderBy('d.data_vencimento', 'desc')
        .orderBy('d.id', 'desc')
        .limit(safeLimit);

      if (status) {
        q.andWhere('d.status', status);
      }

      if (dataInicio) {
        q.andWhere('d.data_vencimento', '>=', dataInicio);
      }

      if (dataFim) {
        q.andWhere('d.data_vencimento', '<=', dataFim);
      }

      const rows = await q;

      return res.status(200).json({
        success: true,
        data: rows
      });
    } catch (error) {
      logger.error('[DespesaController.index] Erro ao listar despesas:', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        query: req.query
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao listar despesas',
        message: error.message
      });
    }
  }

  // POST /api/financeiro/despesas
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.body?.unidade_id ? Number(req.body.unidade_id) : null;
      const descricao = req.body?.descricao ? String(req.body.descricao).trim() : '';
      const categoria = req.body?.categoria ? String(req.body.categoria).trim() : '';
      const valor = req.body?.valor;
      const dataVencimento = req.body?.data_vencimento ? String(req.body.data_vencimento).trim() : null;
      const dataPagamento = req.body?.data_pagamento ? String(req.body.data_pagamento).trim() : null;
      const status = req.body?.status ? String(req.body.status).trim() : 'PENDING';
      const formaPagamento = req.body?.forma_pagamento ? String(req.body.forma_pagamento).trim() : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
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

      if (!descricao) {
        return res.status(400).json({
          success: false,
          error: 'descricao é obrigatória'
        });
      }

      if (!categoria) {
        return res.status(400).json({
          success: false,
          error: 'categoria é obrigatória'
        });
      }

      const valorNum = parseMoneyToNumber(valor);
      if (!Number.isFinite(valorNum) || valorNum <= 0) {
        return res.status(400).json({
          success: false,
          error: 'valor inválido'
        });
      }

      if (!dataVencimento) {
        return res.status(400).json({
          success: false,
          error: 'data_vencimento é obrigatória'
        });
      }

      const [row] = await db('despesas')
        .insert({
          unidade_id: unidadeId,
          usuario_id: usuarioId,
          descricao,
          categoria,
          valor: valorNum,
          data_vencimento: dataVencimento,
          data_pagamento: dataPagamento || null,
          status,
          forma_pagamento: formaPagamento || null,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        })
        .returning('*');

      return res.status(201).json({
        success: true,
        data: row
      });
    } catch (error) {
      logger.error('[DespesaController.store] Erro ao criar despesa:', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        body: {
          unidade_id: req.body?.unidade_id,
          descricao: req.body?.descricao,
          categoria: req.body?.categoria,
          valor: req.body?.valor,
          data_vencimento: req.body?.data_vencimento,
          status: req.body?.status
        }
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao criar despesa',
        message: error.message
      });
    }
  }

  // PUT /api/financeiro/despesas/:id
  async update(req, res) {
    try {
      const usuarioId = req.user?.id;
      const despesaId = req.params?.id ? Number(req.params.id) : null;
      const unidadeId = req.body?.unidade_id ? Number(req.body.unidade_id) : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!despesaId || !Number.isFinite(despesaId) || despesaId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de despesa inválido'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
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

      const exists = await db('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .first();

      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Despesa não encontrada'
        });
      }

      const patch = {};

      if (req.body?.descricao !== undefined) {
        patch.descricao = String(req.body.descricao || '').trim();
      }

      if (req.body?.categoria !== undefined) {
        patch.categoria = String(req.body.categoria || '').trim();
      }

      if (req.body?.valor !== undefined) {
        const valorNum = parseMoneyToNumber(req.body.valor);
        if (!Number.isFinite(valorNum) || valorNum <= 0) {
          return res.status(400).json({
            success: false,
            error: 'valor inválido'
          });
        }
        patch.valor = valorNum;
      }

      if (req.body?.data_vencimento !== undefined) {
        patch.data_vencimento = req.body.data_vencimento ? String(req.body.data_vencimento).trim() : null;
      }

      if (req.body?.data_pagamento !== undefined) {
        patch.data_pagamento = req.body.data_pagamento ? String(req.body.data_pagamento).trim() : null;
      }

      if (req.body?.status !== undefined) {
        patch.status = String(req.body.status || '').trim();
      }

      if (req.body?.forma_pagamento !== undefined) {
        patch.forma_pagamento = req.body.forma_pagamento ? String(req.body.forma_pagamento).trim() : null;
      }

      patch.updated_at = db.fn.now();

      const [row] = await db('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .update(patch)
        .returning('*');

      return res.status(200).json({
        success: true,
        data: row
      });
    } catch (error) {
      logger.error('[DespesaController.update] Erro ao atualizar despesa:', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        params: req.params,
        body: req.body
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar despesa',
        message: error.message
      });
    }
  }

  // DELETE /api/financeiro/despesas/:id?unidade_id=1
  async destroy(req, res) {
    try {
      const usuarioId = req.user?.id;
      const despesaId = req.params?.id ? Number(req.params.id) : null;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!despesaId || !Number.isFinite(despesaId) || despesaId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de despesa inválido'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
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

      const exists = await db('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .select('id')
        .first();

      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Despesa não encontrada'
        });
      }

      await db('despesas')
        .where({ id: despesaId, usuario_id: usuarioId, unidade_id: unidadeId })
        .del();

      return res.status(200).json({
        success: true,
        message: 'Despesa deletada com sucesso'
      });
    } catch (error) {
      logger.error('[DespesaController.destroy] Erro ao deletar despesa:', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        params: req.params,
        query: req.query
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao deletar despesa',
        message: error.message
      });
    }
  }
}

module.exports = DespesaController;

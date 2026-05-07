const { db } = require('../config/knex');
const InventoryService = require('../services/InventoryService');

class VendaController {
  // GET /api/vendas/avulsas?unidade_id=1&limit=200
  async avulsas(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.query?.unidade_id ? Number(req.query.unidade_id) : null;
      const limit = req.query?.limit ? Number(req.query.limit) : 200;
      const includeItens = String(req.query?.include_itens || '') === '1';

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (unidadeId !== null && (!Number.isFinite(unidadeId) || unidadeId <= 0)) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id inválido'
        });
      }

      const limitFinal = Number.isFinite(limit) && limit > 0 && limit <= 500 ? limit : 200;

      const clienteNomeExpr = db.raw("TRIM(CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))) as cliente_nome");

      const q = db('vendas as v')
        .leftJoin('clientes as c', 'c.id', 'v.cliente_id')
        .where('v.usuario_id', usuarioId)
        .whereNull('v.agendamento_id')
        .select(
          'v.id',
          'v.unidade_id',
          'v.cliente_id',
          'v.total',
          'v.status',
          'v.created_at',
          clienteNomeExpr
        )
        .orderBy('v.created_at', 'desc')
        .limit(limitFinal);

      if (includeItens) {
        q.leftJoin('venda_itens as vi', 'vi.venda_id', 'v.id')
          .groupBy('v.id', 'c.primeiro_nome', 'c.ultimo_nome')
          .select(
            db.raw(
              "COALESCE(json_agg(json_build_object('descricao_snapshot', vi.descricao_snapshot, 'quantidade', vi.quantidade, 'preco_unitario_snapshot', vi.preco_unitario_snapshot, 'total_snapshot', vi.total_snapshot) ORDER BY vi.id) FILTER (WHERE vi.id IS NOT NULL), '[]') as itens"
            )
          );
      }

      if (unidadeId) {
        q.andWhere('v.unidade_id', unidadeId);
      }

      const rows = await q;

      return res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao listar vendas avulsas',
        message: error.message
      });
    }
  }

  // POST /api/vendas
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      const unidadeId = req.body?.unidade_id ? Number(req.body.unidade_id) : null;
      const clienteId = req.body?.cliente_id ? Number(req.body.cliente_id) : null;
      const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
      const pagamentos = Array.isArray(req.body?.pagamentos) ? req.body.pagamentos : [];
      const idempotencyKey = req.body?.idempotency_key ? String(req.body.idempotency_key).trim() : null;

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

      if (!itens.length) {
        return res.status(400).json({
          success: false,
          error: 'Lista de itens é obrigatória'
        });
      }

      if (!pagamentos.length) {
        return res.status(400).json({
          success: false,
          error: 'Lista de pagamentos é obrigatória'
        });
      }

      const unidade = await db('unidades').where({ id: unidadeId, usuario_id: usuarioId }).first();
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const totalPago = pagamentos.reduce((sum, p) => sum + (Number(p?.valor) || 0), 0);

      const result = await db.transaction(async (trx) => {
        if (idempotencyKey) {
          const existingVenda = await trx('vendas')
            .where({ usuario_id: usuarioId, idempotency_key: idempotencyKey })
            .select('id', 'total')
            .first();

          if (existingVenda?.id) {
            return { venda_id: Number(existingVenda.id), total: Number(existingVenda.total) };
          }
        }

        const produtoIds = itens
          .map((i) => Number(i?.produto_id))
          .filter((n) => Number.isFinite(n));

        const produtos = await trx('produtos')
          .where('usuario_id', usuarioId)
          .whereIn('id', produtoIds)
          .whereNull('deleted_at')
          .select('id', 'nome', 'unidade_medida');

        const produtoById = new Map(produtos.map((p) => [Number(p.id), p]));

        const itensInsert = [];
        let subtotal = 0;

        for (const i of itens) {
          const produtoId = Number(i?.produto_id);
          const quantidade = Number(i?.quantidade);
          const precoAplicado = Number(i?.preco_aplicado);
          const agenteId = i?.agente_id ? Number(i.agente_id) : null;

          if (!Number.isFinite(produtoId)) {
            const err = new Error('produto_id inválido');
            err.code = 'INVALID_PRODUTO_ID';
            throw err;
          }

          if (!Number.isFinite(quantidade) || quantidade <= 0) {
            const err = new Error('quantidade inválida');
            err.code = 'INVALID_QUANTIDADE';
            throw err;
          }

          if (!Number.isFinite(precoAplicado) || precoAplicado < 0) {
            const err = new Error('preco_aplicado inválido');
            err.code = 'INVALID_PRECO';
            throw err;
          }

          const produto = produtoById.get(produtoId);
          if (!produto) {
            const err = new Error(`Produto ${produtoId} não encontrado`);
            err.code = 'PRODUTO_NOT_FOUND';
            throw err;
          }

          if (String(produto?.unidade_medida || '').toUpperCase() === 'UN' && !Number.isInteger(quantidade)) {
            const err = new Error('Produtos do tipo Unidade (UN) não podem ser vendidos em quantidades fracionadas.');
            err.code = 'INVALID_UN_FRACTION';
            throw err;
          }

          const totalLinha = Number((quantidade * precoAplicado).toFixed(2));
          subtotal = Number((subtotal + totalLinha).toFixed(2));

          itensInsert.push({
            item_type: 'PRODUTO',
            reference_id: produtoId,
            descricao_snapshot: String(produto.nome || 'Produto'),
            quantidade,
            preco_unitario_snapshot: precoAplicado,
            total_snapshot: totalLinha,
            agente_id: Number.isFinite(agenteId) ? agenteId : null,
            created_at: trx.fn.now()
          });
        }

        const total = subtotal;

        if (Math.abs(Number(totalPago.toFixed(2)) - Number(total.toFixed(2))) >= 0.01) {
          const err = new Error('Soma dos pagamentos precisa ser igual ao total');
          err.code = 'PAGAMENTOS_INVALID';
          throw err;
        }

        const [vendaRow] = await trx('vendas')
          .insert({
            usuario_id: usuarioId,
            unidade_id: unidadeId,
            cliente_id: Number.isFinite(clienteId) ? clienteId : null,
            agendamento_id: null,
            idempotency_key: idempotencyKey,
            status: 'PAID',
            subtotal,
            desconto_total: 0,
            total,
            created_by: usuarioId,
            paid_at: trx.fn.now(),
            created_at: trx.fn.now(),
            updated_at: trx.fn.now()
          })
          .returning('*');

        const vendaId = vendaRow?.id ? Number(vendaRow.id) : null;
        if (!vendaId) {
          const err = new Error('Falha ao criar venda');
          err.code = 'VENDA_CREATE_FAILED';
          throw err;
        }

        await trx('venda_itens').insert(
          itensInsert.map((it) => ({
            ...it,
            venda_id: vendaId
          }))
        );

        await trx('venda_pagamentos').insert(
          pagamentos.map((p) => ({
            venda_id: vendaId,
            metodo: String(p?.metodo || 'Não definido'),
            valor: Number(p?.valor) || 0,
            status: 'CAPTURED',
            paid_at: trx.fn.now(),
            created_at: trx.fn.now()
          }))
        );

        const inventoryService = new InventoryService(db);
        for (const it of itensInsert) {
          const produtoId = Number(it.reference_id);
          const quantidade = Number(it.quantidade);

          await inventoryService.movimentarEstoque({
            usuario_id: usuarioId,
            unidade_id: unidadeId,
            produto_id: produtoId,
            tipo: 'SAIDA',
            quantidade,
            motivo: `VENDA PDV - Venda ${vendaId}`,
            origem_id: `VENDA:${vendaId}`,
            created_by: usuarioId,
            trx
          });
        }

        return { venda_id: vendaId, total };
      });

      return res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      const code = error?.code;

      if (code === 'SALDO_INSUFICIENTE') {
        let produtoNome = null;
        try {
          const produtoId = error?.produto_id ? Number(error.produto_id) : null;
          if (produtoId) {
            const produto = await db('produtos')
              .where({ id: produtoId, usuario_id: req.user?.id })
              .select('nome')
              .first();
            produtoNome = produto?.nome ? String(produto.nome) : null;
          }
        } catch {
          produtoNome = null;
        }

        return res.status(409).json({
          success: false,
          code: 'SALDO_INSUFICIENTE',
          error: 'Saldo insuficiente',
          message: error.message,
          produto_id: error?.produto_id || null,
          produto_nome: produtoNome,
          unidade_id: error?.unidade_id || null,
          quantidade: error?.quantidade || null
        });
      }

      const status = code === 'INVALID_PRODUTO_ID' || code === 'INVALID_QUANTIDADE' || code === 'INVALID_PRECO' || code === 'PAGAMENTOS_INVALID' || code === 'INVALID_UN_FRACTION'
        ? 400
        : code === 'PRODUTO_NOT_FOUND'
          ? 404
          : 500;

      return res.status(status).json({
        success: false,
        error: status === 500 ? 'Erro interno do servidor' : error.message,
        message: error.message
      });
    }
  }

  // POST /api/vendas/:id/estorno
  async estorno(req, res) {
    try {
      const usuarioId = req.user?.id;
      const vendaId = req.params?.id ? Number(req.params.id) : null;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!vendaId || !Number.isFinite(vendaId)) {
        return res.status(400).json({
          success: false,
          error: 'ID de venda inválido'
        });
      }

      const result = await db.transaction(async (trx) => {
        const venda = await trx('vendas')
          .where({ id: vendaId, usuario_id: usuarioId })
          .forUpdate()
          .first();

        if (!venda) {
          const err = new Error('Venda não encontrada');
          err.code = 'VENDA_NOT_FOUND';
          throw err;
        }

        const statusVenda = String(venda.status || '').toUpperCase();
        if (statusVenda === 'REFUNDED') {
          return { venda_id: vendaId, status: 'REFUNDED' };
        }

        if (statusVenda !== 'PAID') {
          const err = new Error('Venda não está paga para estorno');
          err.code = 'VENDA_NOT_PAID';
          throw err;
        }

        const itens = await trx('venda_itens')
          .where('venda_id', vendaId)
          .select('item_type', 'reference_id', 'quantidade');

        const inventoryService = new InventoryService(db);
        const origemId = `ESTORNO:VENDA:${vendaId}`;

        for (const it of itens || []) {
          if (String(it.item_type) !== 'PRODUTO') continue;
          const produtoId = Number(it.reference_id);
          const quantidade = Number(it.quantidade);
          if (!Number.isFinite(produtoId) || !Number.isFinite(quantidade) || quantidade <= 0) continue;

          // Idempotência: se a movimentação já foi registrada, não duplicar retorno ao estoque.
          const movJaExiste = await trx('estoque_movimentacoes')
            .where({
              usuario_id: usuarioId,
              unidade_id: Number(venda.unidade_id),
              produto_id: produtoId,
              tipo: 'ESTORNO',
              origem_id: origemId
            })
            .select('id')
            .first();

          if (movJaExiste?.id) {
            continue;
          }

          await inventoryService.movimentarEstoque({
            usuario_id: usuarioId,
            unidade_id: Number(venda.unidade_id),
            produto_id: produtoId,
            tipo: 'ESTORNO',
            quantidade,
            motivo: `ESTORNO PDV - Venda ${vendaId}`,
            origem_id: origemId,
            created_by: usuarioId,
            trx
          });
        }

        await trx('venda_pagamentos')
          .where('venda_id', vendaId)
          .update({
            status: 'REFUNDED'
          });

        await trx('vendas')
          .where({ id: vendaId, usuario_id: usuarioId })
          .update({
            status: 'REFUNDED',
            updated_at: trx.fn.now()
          });

        return { venda_id: vendaId, status: 'REFUNDED' };
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Estorno realizado com sucesso'
      });
    } catch (error) {
      const code = error?.code;
      const status = code === 'VENDA_NOT_FOUND' ? 404 : code === 'VENDA_NOT_PAID' ? 409 : 500;
      return res.status(status).json({
        success: false,
        error: status === 500 ? 'Erro interno do servidor' : error.message,
        message: error.message
      });
    }
  }
}

module.exports = VendaController;

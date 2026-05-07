const BaseController = require('./BaseController');
const Produto = require('../models/Produto');
const logger = require('../utils/logger');
const InventoryService = require('../services/InventoryService');

class ProdutoController extends BaseController {
  constructor() {
    super(new Produto());
  }

  // POST /api/produtos/:id/ajuste
  // Ajuste manual de estoque (Sprint 2 - Ledger)
  async ajuste(req, res) {
    try {
      const usuarioId = req.user?.id;
      const createdBy = req.user?.id || null;
      const { id } = req.params;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const produto = await this.model.findByIdAndUsuario(parseInt(id), usuarioId);
      if (!produto) {
        return res.status(404).json({
          success: false,
          error: 'Produto não encontrado'
        });
      }

      const { unidade_id, quantidade, motivo, tipo } = req.body;

      if (!unidade_id || Number.isNaN(Number(unidade_id))) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      if (!motivo || !String(motivo).trim()) {
        return res.status(400).json({
          success: false,
          error: 'motivo é obrigatório para ajustes manuais'
        });
      }

      const tipoFinal = tipo || 'AJUSTE';
      if (!['ENTRADA', 'SAIDA', 'AJUSTE', 'ESTORNO'].includes(tipoFinal)) {
        return res.status(400).json({
          success: false,
          error: 'tipo inválido',
          message: 'tipo deve ser ENTRADA, SAIDA, AJUSTE ou ESTORNO'
        });
      }

      const qty = Number(quantidade);
      if (Number.isNaN(qty) || qty <= 0) {
        return res.status(400).json({
          success: false,
          error: 'quantidade inválida',
          message: 'quantidade deve ser um número > 0'
        });
      }

      const inventoryService = new InventoryService(this.model.db);

      const result = await inventoryService.movimentarEstoque({
        usuario_id: usuarioId,
        unidade_id: Number(unidade_id),
        produto_id: parseInt(id),
        tipo: tipoFinal,
        quantidade: qty,
        motivo: String(motivo).trim(),
        origem_id: null,
        created_by: createdBy
      });

      return res.status(201).json({
        success: true,
        data: {
          produto_id: parseInt(id),
          unidade_id: Number(unidade_id),
          movimentacao: result.movimentacao,
          saldo_atual: result.saldo_atual
        },
        message: 'Ajuste de estoque realizado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [ProdutoController.ajuste] Erro ao ajustar estoque:', error);

      if (error.code === 'SALDO_INSUFICIENTE') {
        return res.status(400).json({
          success: false,
          error: 'Saldo insuficiente'
        });
      }

      if (error.code === 'PRODUTO_NOT_FOUND' || error.code === 'UNIDADE_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/produtos
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const produtos = await this.model.findByUsuario(usuarioId);

      return res.status(200).json({
        success: true,
        data: produtos,
        message: `Produtos carregados com sucesso (${produtos.length})`
      });
    } catch (error) {
      logger.error('❌ [ProdutoController.index] Erro ao listar produtos:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/produtos/:id
  async show(req, res) {
    try {
      const usuarioId = req.user?.id;
      const { id } = req.params;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const produto = await this.model.findByIdAndUsuario(parseInt(id), usuarioId);

      if (!produto) {
        return res.status(404).json({
          success: false,
          error: 'Produto não encontrado'
        });
      }

      return res.status(200).json({
        success: true,
        data: produto,
        message: 'Produto carregado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [ProdutoController.show] Erro ao buscar produto:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/produtos
  // Regra ELITE: ao criar produto, criar snapshots em estoque_unidades para TODAS as unidades do usuario_id
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const {
        nome,
        descricao,
        sku_ean,
        marca,
        categoria_id,
        unidade_medida,
        tipo_item,
        uom_consumo,
        fator_conversao,
        preco_custo_medio,
        preco_venda,
        estoque_minimo,
        comissao_percentual
      } = req.body;

      if (!nome || !String(nome).trim()) {
        return res.status(400).json({
          success: false,
          error: 'Nome é obrigatório'
        });
      }

      const unidadeMedidaFinal = unidade_medida || 'UN';
      if (!['UN', 'ML', 'G'].includes(unidadeMedidaFinal)) {
        return res.status(400).json({
          success: false,
          error: 'Unidade de medida inválida',
          message: 'unidade_medida deve ser UN, ML ou G'
        });
      }

      const tipoItemFinal = tipo_item ? String(tipo_item).toUpperCase() : 'VENDA';
      if (!['VENDA', 'CONSUMO', 'AMBOS'].includes(tipoItemFinal)) {
        return res.status(400).json({
          success: false,
          error: 'tipo_item inválido',
          message: "tipo_item deve ser 'VENDA', 'CONSUMO' ou 'AMBOS'"
        });
      }

      const shouldHaveRendimento = tipoItemFinal === 'CONSUMO' || tipoItemFinal === 'AMBOS';

      const fatorConversaoFinal = !shouldHaveRendimento
        ? null
        : (fator_conversao !== undefined && fator_conversao !== null && String(fator_conversao).trim() !== ''
          ? Number(fator_conversao)
          : NaN);

      if (shouldHaveRendimento) {
        if (!Number.isFinite(fatorConversaoFinal) || fatorConversaoFinal <= 0) {
          return res.status(400).json({
            success: false,
            error: 'fator_conversao inválido',
            message: 'fator_conversao deve ser um número > 0 para itens de consumo'
          });
        }
      }

      // Observação: uom_consumo no banco é NOT NULL (migration). Mesmo para VENDA,
      // persistimos um valor válido (default = unidade_medida) e tratamos como "campo inerte".
      const uomConsumoFinal = uom_consumo ? String(uom_consumo).toUpperCase() : unidadeMedidaFinal;

      if (!['UN', 'ML', 'G'].includes(uomConsumoFinal)) {
        return res.status(400).json({
          success: false,
          error: 'uom_consumo inválido',
          message: 'uom_consumo deve ser UN, ML ou G'
        });
      }

      const precoCustoMedioFinal = preco_custo_medio !== undefined && preco_custo_medio !== null
        ? Number(preco_custo_medio)
        : 0;

      const precoVendaFinal = preco_venda !== undefined && preco_venda !== null
        ? Number(preco_venda)
        : 0;

      const estoqueMinimoFinal = estoque_minimo !== undefined && estoque_minimo !== null
        ? Number(estoque_minimo)
        : 0;

      const comissaoPercentualFinal = comissao_percentual !== undefined && comissao_percentual !== null
        ? Number(comissao_percentual)
        : 0;

      if (Number.isNaN(precoCustoMedioFinal) || precoCustoMedioFinal < 0) {
        return res.status(400).json({
          success: false,
          error: 'Preço de custo médio inválido',
          message: 'preco_custo_medio deve ser um número >= 0'
        });
      }

      if (Number.isNaN(precoVendaFinal) || precoVendaFinal < 0) {
        return res.status(400).json({
          success: false,
          error: 'Preço de venda inválido',
          message: 'preco_venda deve ser um número >= 0'
        });
      }

      if (Number.isNaN(estoqueMinimoFinal) || estoqueMinimoFinal < 0) {
        return res.status(400).json({
          success: false,
          error: 'Estoque mínimo inválido',
          message: 'estoque_minimo deve ser um número >= 0'
        });
      }

      if (Number.isNaN(comissaoPercentualFinal) || comissaoPercentualFinal < 0) {
        return res.status(400).json({
          success: false,
          error: 'Comissão inválida',
          message: 'comissao_percentual deve ser um número >= 0'
        });
      }

      const categoriaIdFinal = categoria_id !== undefined && categoria_id !== null && String(categoria_id).trim() !== ''
        ? Number(categoria_id)
        : null;

      if (categoriaIdFinal !== null && (!Number.isFinite(categoriaIdFinal) || categoriaIdFinal <= 0)) {
        return res.status(400).json({
          success: false,
          error: 'categoria_id inválido'
        });
      }

      const db = this.model.db;

      const created = await db.transaction(async (trx) => {
        if (categoriaIdFinal !== null) {
          const categoria = await trx('categorias')
            .where({ id: categoriaIdFinal, usuario_id: usuarioId })
            .select('id')
            .first();

          if (!categoria) {
            return res.status(400).json({
              success: false,
              error: 'Categoria inválida',
              message: 'categoria_id não existe ou não pertence ao usuário'
            });
          }
        }

        const produtoData = {
          usuario_id: usuarioId,
          nome: String(nome).trim(),
          descricao: descricao !== undefined ? (descricao ? String(descricao) : '') : null,
          sku_ean: sku_ean !== undefined && sku_ean !== null && String(sku_ean).trim() !== '' ? String(sku_ean).trim() : null,
          marca: marca !== undefined && marca !== null && String(marca).trim() !== '' ? String(marca).trim() : null,
          categoria_id: categoriaIdFinal,
          unidade_medida: unidadeMedidaFinal,
          tipo_item: tipoItemFinal,
          uom_consumo: uomConsumoFinal,
          fator_conversao: fatorConversaoFinal,
          preco_custo_medio: precoCustoMedioFinal,
          preco_venda: precoVendaFinal,
          estoque_minimo: estoqueMinimoFinal,
          comissao_percentual: comissaoPercentualFinal,
          created_at: new Date(),
          updated_at: new Date()
        };

        const [produtoIdRow] = await trx('produtos')
          .insert(produtoData)
          .returning('id');

        const produtoId = produtoIdRow?.id || produtoIdRow;

        // Buscar todas as unidades do tenant
        const unidades = await trx('unidades')
          .where('usuario_id', usuarioId)
          .select('id');

        if (unidades.length > 0) {
          const snapshots = unidades.map((u) => ({
            produto_id: produtoId,
            unidade_id: u.id,
            saldo_atual: 0,
            estoque_minimo: estoqueMinimoFinal,
            estoque_maximo: null
          }));

          // Evitar erro se, por algum motivo, já existir snapshot (idempotência)
          await trx('estoque_unidades')
            .insert(snapshots)
            .onConflict(['produto_id', 'unidade_id'])
            .ignore();
        }

        const produtoCriado = await trx('produtos')
          .where({ id: produtoId, usuario_id: usuarioId })
          .first();

        return { produto: produtoCriado, unidadesVinculadas: unidades.length };
      });

      return res.status(201).json({
        success: true,
        data: created.produto,
        meta: {
          unidades_vinculadas: created.unidadesVinculadas
        },
        message: 'Produto criado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [ProdutoController.store] Erro ao criar produto:', error);

      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'Dados duplicados',
          message: 'Já existe um produto com este SKU/EAN'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // PUT /api/produtos/:id
  async update(req, res) {
    try {
      const usuarioId = req.user?.id;
      const { id } = req.params;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const produto = await this.model.findByIdAndUsuario(parseInt(id), usuarioId);
      if (!produto) {
        return res.status(404).json({
          success: false,
          error: 'Produto não encontrado'
        });
      }

      const {
        nome,
        descricao,
        sku_ean,
        marca,
        categoria_id,
        unidade_medida,
        tipo_item,
        uom_consumo,
        fator_conversao,
        preco_custo_medio,
        preco_venda,
        estoque_minimo,
        comissao_percentual
      } = req.body;

      if (process.env.NODE_ENV !== 'production') {
        console.log('🔎 [ProdutoController.update] req.body:', req.body);
      }

      const patch = {
        updated_at: new Date()
      };

      if (nome !== undefined) {
        if (!String(nome).trim()) {
          return res.status(400).json({
            success: false,
            error: 'Nome é obrigatório'
          });
        }
        patch.nome = String(nome).trim();
      }

      if (descricao !== undefined) {
        patch.descricao = descricao ? String(descricao) : '';
      }

      if (sku_ean !== undefined) {
        patch.sku_ean = sku_ean !== null && String(sku_ean).trim() !== '' ? String(sku_ean).trim() : null;
      }

      if (marca !== undefined) {
        patch.marca = marca !== null && String(marca).trim() !== '' ? String(marca).trim() : null;
      }

      if (categoria_id !== undefined) {
        const categoriaIdFinal = categoria_id !== null && String(categoria_id).trim() !== ''
          ? Number(categoria_id)
          : null;

        if (categoriaIdFinal !== null && (!Number.isFinite(categoriaIdFinal) || categoriaIdFinal <= 0)) {
          return res.status(400).json({
            success: false,
            error: 'categoria_id inválido'
          });
        }

        if (categoriaIdFinal !== null) {
          const categoria = await this.model.db('categorias')
            .where({ id: categoriaIdFinal, usuario_id: usuarioId })
            .select('id')
            .first();

          if (!categoria) {
            return res.status(400).json({
              success: false,
              error: 'Categoria inválida',
              message: 'categoria_id não existe ou não pertence ao usuário'
            });
          }
        }

        patch.categoria_id = categoriaIdFinal;
      }

      if (unidade_medida !== undefined) {
        const unidadeMedidaFinal = unidade_medida || 'UN';
        if (!['UN', 'ML', 'G'].includes(unidadeMedidaFinal)) {
          return res.status(400).json({
            success: false,
            error: 'Unidade de medida inválida',
            message: 'unidade_medida deve ser UN, ML ou G'
          });
        }
        patch.unidade_medida = unidadeMedidaFinal;
      }

      if (tipo_item !== undefined) {
        const tipoItemFinal = tipo_item ? String(tipo_item).toUpperCase() : 'VENDA';
        if (!['VENDA', 'CONSUMO', 'AMBOS'].includes(tipoItemFinal)) {
          return res.status(400).json({
            success: false,
            error: 'tipo_item inválido',
            message: "tipo_item deve ser 'VENDA', 'CONSUMO' ou 'AMBOS'"
          });
        }
        patch.tipo_item = tipoItemFinal;

        const shouldHaveRendimento = tipoItemFinal === 'CONSUMO' || tipoItemFinal === 'AMBOS';
        if (!shouldHaveRendimento) {
          patch.fator_conversao = null;
          // uom_consumo é NOT NULL: manter default coerente com unidade_medida
          patch.uom_consumo = patch.unidade_medida || produto.unidade_medida || 'UN';
        }
      }

      if (fator_conversao !== undefined) {
        const tipoItemNow = String(patch.tipo_item || produto.tipo_item || 'VENDA').toUpperCase();
        const shouldHaveRendimento = tipoItemNow === 'CONSUMO' || tipoItemNow === 'AMBOS';

        if (!shouldHaveRendimento) {
          patch.fator_conversao = null;
        } else {
          const fator = fator_conversao !== null && String(fator_conversao).trim() !== '' ? Number(fator_conversao) : NaN;
          if (!Number.isFinite(fator) || fator <= 0) {
            return res.status(400).json({
              success: false,
              error: 'fator_conversao inválido',
              message: 'fator_conversao deve ser um número > 0 para itens de consumo'
            });
          }
          patch.fator_conversao = fator;
        }
      }

      if (uom_consumo !== undefined) {
        const tipoItemNow = String(patch.tipo_item || produto.tipo_item || 'VENDA').toUpperCase();
        const shouldHaveRendimento = tipoItemNow === 'CONSUMO' || tipoItemNow === 'AMBOS';

        if (!shouldHaveRendimento) {
          patch.uom_consumo = patch.unidade_medida || produto.unidade_medida || 'UN';
        } else {
          const uom = uom_consumo ? String(uom_consumo).toUpperCase() : null;
          const uomFinal = uom || patch.unidade_medida || produto.unidade_medida || 'UN';

          if (!['UN', 'ML', 'G'].includes(uomFinal)) {
            return res.status(400).json({
              success: false,
              error: 'uom_consumo inválido',
              message: 'uom_consumo deve ser UN, ML ou G'
            });
          }
          patch.uom_consumo = uomFinal;
        }
      }

      if (preco_custo_medio !== undefined) {
        const preco = Number(preco_custo_medio);
        if (Number.isNaN(preco) || preco < 0) {
          return res.status(400).json({
            success: false,
            error: 'Preço de custo médio inválido',
            message: 'preco_custo_medio deve ser um número >= 0'
          });
        }
        patch.preco_custo_medio = preco;
      }

      if (preco_venda !== undefined) {
        const preco = Number(preco_venda);
        if (Number.isNaN(preco) || preco < 0) {
          return res.status(400).json({
            success: false,
            error: 'Preço de venda inválido',
            message: 'preco_venda deve ser um número >= 0'
          });
        }
        patch.preco_venda = preco;
      }

      if (estoque_minimo !== undefined) {
        const minimo = Number(estoque_minimo);
        if (Number.isNaN(minimo) || minimo < 0) {
          return res.status(400).json({
            success: false,
            error: 'Estoque mínimo inválido',
            message: 'estoque_minimo deve ser um número >= 0'
          });
        }
        patch.estoque_minimo = minimo;
      }

      if (comissao_percentual !== undefined) {
        const comissao = Number(comissao_percentual);
        if (Number.isNaN(comissao) || comissao < 0) {
          return res.status(400).json({
            success: false,
            error: 'Comissão inválida',
            message: 'comissao_percentual deve ser um número >= 0'
          });
        }
        patch.comissao_percentual = comissao;
      }

      await this.model.db('produtos')
        .where({ id: parseInt(id), usuario_id: usuarioId })
        .update(patch);

      const produtoAtualizado = await this.model.findByIdAndUsuario(parseInt(id), usuarioId);

      return res.status(200).json({
        success: true,
        data: produtoAtualizado,
        message: 'Produto atualizado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [ProdutoController.update] Erro ao atualizar produto:', error);

      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'Dados duplicados',
          message: 'Já existe um produto com este SKU/EAN'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // DELETE /api/produtos/:id
  async destroy(req, res) {
    try {
      const usuarioId = req.user?.id;
      const { id } = req.params;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      const produto = await this.model.findByIdAndUsuario(parseInt(id), usuarioId);
      if (!produto) {
        return res.status(404).json({
          success: false,
          error: 'Produto não encontrado'
        });
      }

      await this.model.db('produtos')
        .where({ id: parseInt(id), usuario_id: usuarioId })
        .update({
          deleted_at: new Date()
        });

      return res.status(200).json({
        success: true,
        message: 'Produto deletado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [ProdutoController.destroy] Erro ao deletar produto:', error);

      if (error.code === '23503') {
        return res.status(400).json({
          success: false,
          error: 'Não é possível deletar',
          message: 'Este produto possui dados relacionados'
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

module.exports = ProdutoController;

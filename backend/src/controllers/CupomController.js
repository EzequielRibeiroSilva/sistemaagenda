const Cupom = require('../models/Cupom');
const CupomService = require('../services/CupomService');
const logger = require('./../utils/logger');

/**
 * Controller para gerenciamento de cupons de desconto
 * 
 * Endpoints:
 * - GET /api/cupons - Listar cupons (ADMIN)
 * - GET /api/cupons/:id - Buscar cupom específico (ADMIN)
 * - POST /api/cupons - Criar cupom (ADMIN)
 * - PUT /api/cupons/:id - Atualizar cupom (ADMIN)
 * - DELETE /api/cupons/:id - Deletar cupom (ADMIN)
 * - GET /api/cupons/:id/historico - Histórico de uso (ADMIN)
 * - POST /api/public/cupons/validar - Validar cupom (público)
 */
class CupomController {
  constructor() {
    this.cupomModel = new Cupom();
    this.cupomService = new CupomService();
  }

  /**
   * GET /api/cupons
   * Listar cupons do usuário com paginação e filtros
   */
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      const { page = 1, limit = 10, status, tipo_desconto, search, unidade_id } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (tipo_desconto) filters.tipo_desconto = tipo_desconto;
      if (search) filters.search = search;
      if (unidade_id) filters.unidade_id = parseInt(unidade_id);

      const result = await this.cupomModel.findByUsuarioWithPagination(
        usuarioId,
        parseInt(page),
        parseInt(limit),
        filters
      );

      // Adicionar servico_ids e unidade_ids para cada cupom
      let cuponsComRelacionamentos = result.data;
      
      // Verificar se as tabelas de relacionamento existem antes de buscar
      try {
        const tabelaExiste = await this.cupomModel.db.schema.hasTable('cupom_servicos');
        
        if (tabelaExiste && result.data.length > 0) {
          cuponsComRelacionamentos = await Promise.all(
            result.data.map(async (cupom) => {
              try {
                const servicoIds = await this.cupomModel.buscarServicos(cupom.id);
                const unidadeIds = await this.cupomModel.buscarUnidades(cupom.id);
                return {
                  ...cupom,
                  servico_ids: servicoIds,
                  unidade_ids: unidadeIds
                };
              } catch (err) {
                logger.error(`[CupomController] Erro ao buscar relacionamentos do cupom ${cupom.id}:`, err.message);
                return {
                  ...cupom,
                  servico_ids: [],
                  unidade_ids: []
                };
              }
            })
          );
        } else {
          // Se tabela não existe, retornar cupons sem relacionamentos
          cuponsComRelacionamentos = result.data.map(cupom => ({
            ...cupom,
            servico_ids: [],
            unidade_ids: []
          }));
        }
      } catch (schemaError) {
        logger.error('[CupomController] Erro ao verificar schema:', schemaError.message);
        // Em caso de erro, retornar cupons sem relacionamentos
        cuponsComRelacionamentos = result.data.map(cupom => ({
          ...cupom,
          servico_ids: [],
          unidade_ids: []
        }));
      }

      return res.json({
        success: true,
        data: cuponsComRelacionamentos,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('[CupomController] Erro ao listar cupons:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * GET /api/cupons/:id
   * Buscar cupom específico
   */
  async show(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      const cupom = await this.cupomModel.findById(id);

      if (!cupom) {
        return res.status(404).json({
          success: false,
          error: 'Cupom não encontrado'
        });
      }

      // Verificar se o cupom pertence ao usuário
      if (cupom.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para acessar este cupom'
        });
      }

      // Buscar serviços e unidades relacionados com verificação de existência da tabela
      let servicoIds = [];
      let unidadeIds = [];
      
      try {
        const tabelaExiste = await this.cupomModel.db.schema.hasTable('cupom_servicos');
        if (tabelaExiste) {
          servicoIds = await this.cupomModel.buscarServicos(id);
          unidadeIds = await this.cupomModel.buscarUnidades(id);
        }
      } catch (err) {
        logger.error(`[CupomController.show] Erro ao buscar relacionamentos:`, err.message);
        // Continuar sem relacionamentos em caso de erro
      }

      return res.json({
        success: true,
        data: {
          ...cupom,
          servico_ids: servicoIds,
          unidade_ids: unidadeIds
        }
      });
    } catch (error) {
      logger.error('[CupomController] Erro ao buscar cupom:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * POST /api/cupons
   * Criar novo cupom
   */
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      
      logger.log('🔍 [CupomController.store] Recebendo requisição:', {
        usuarioId,
        body: req.body,
        dias_semana_permitidos: req.body.dias_semana_permitidos,
        tipo_dias: typeof req.body.dias_semana_permitidos
      });
      
      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      const cupom = await this.cupomService.criarCupom(req.body, usuarioId);

      logger.log('✅ [CupomController.store] Cupom criado com sucesso:', cupom.id);

      return res.status(201).json({
        success: true,
        data: cupom,
        message: 'Cupom criado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [CupomController.store] Erro ao criar cupom:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        stack: error.stack
      });

      // Erros de validação retornam 400
      if (error.message.startsWith('Dados inválidos:')) {
        return res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          message: error.message
        });
      }

      // Erro de código duplicado (constraint unique por usuário)
      if (error.code === '23505' || error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
        return res.status(400).json({
          success: false,
          error: 'Código duplicado',
          message: 'Você já possui um cupom com este código. Escolha outro código.'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * PUT /api/cupons/:id
   * Atualizar cupom
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      
      logger.log('🔍 [CupomController.update] Recebendo requisição:', {
        cupomId: id,
        usuarioId,
        body: req.body,
        dias_semana_permitidos: req.body.dias_semana_permitidos,
        tipo_dias: typeof req.body.dias_semana_permitidos
      });
      
      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      const cupom = await this.cupomService.atualizarCupom(
        parseInt(id),
        req.body,
        usuarioId
      );

      logger.log('✅ [CupomController.update] Cupom atualizado com sucesso:', cupom.id);

      return res.json({
        success: true,
        data: cupom,
        message: 'Cupom atualizado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [CupomController.update] Erro ao atualizar cupom:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        stack: error.stack
      });

      // Erros de validação e permissão retornam 400/403
      if (error.message === 'Cupom não encontrado') {
        return res.status(404).json({
          success: false,
          error: 'Cupom não encontrado',
          message: error.message
        });
      }

      if (error.message.includes('permissão')) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: error.message
        });
      }

      if (error.message.startsWith('Dados inválidos:')) {
        return res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          message: error.message
        });
      }

      // Erro de código duplicado (constraint unique por usuário)
      if (error.code === '23505' || error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
        return res.status(400).json({
          success: false,
          error: 'Código duplicado',
          message: 'Você já possui um cupom com este código. Escolha outro código.'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/cupons/:id
   * Deletar cupom
   */
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      // Verificar se cupom existe e pertence ao usuário
      const cupom = await this.cupomModel.findById(id);

      if (!cupom) {
        return res.status(404).json({
          success: false,
          error: 'Cupom não encontrado'
        });
      }

      if (cupom.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para deletar este cupom'
        });
      }

      const deleted = await this.cupomModel.delete(id);

      if (deleted) {
        return res.json({
          success: true,
          message: 'Cupom deletado com sucesso'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Erro ao deletar cupom'
        });
      }
    } catch (error) {
      logger.error('[CupomController] Erro ao deletar cupom:', error);

      // Erro de constraint (cupom tem usos registrados)
      if (error.code === '23503') {
        return res.status(400).json({
          success: false,
          error: 'Não é possível deletar',
          message: 'Este cupom possui histórico de uso e não pode ser deletado'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * GET /api/cupons/:id/historico
   * Buscar histórico de uso de um cupom
   */
  async historico(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const { page = 1, limit = 10 } = req.query;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Verificar se cupom existe e pertence ao usuário
      const cupom = await this.cupomModel.findById(id);
      
      if (!cupom) {
        return res.status(404).json({
          success: false,
          error: 'Cupom não encontrado'
        });
      }

      if (cupom.usuario_id !== usuarioId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você não tem permissão para acessar este histórico'
        });
      }

      const result = await this.cupomModel.buscarHistoricoUso(
        parseInt(id),
        parseInt(page),
        parseInt(limit)
      );

      return res.json({
        success: true,
        cupom: {
          id: cupom.id,
          codigo: cupom.codigo,
          descricao: cupom.descricao,
          uso_atual: cupom.uso_atual,
          limite_uso_total: cupom.limite_uso_total
        },
        ...result
      });
    } catch (error) {
      logger.error('[CupomController] Erro ao buscar histórico:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * POST /api/public/cupons/validar
   * Validar cupom para uso (endpoint público)
   */
  async validar(req, res) {
    try {
      const { codigo, cliente_id, valor_pedido, unidade_id, servico_ids, data_agendamento } = req.body;

      logger.log('🔍 [CupomController.validar] Payload recebido (public):', {
        codigo,
        cliente_id,
        valor_pedido,
        unidade_id,
        servico_ids,
        data_agendamento,
        tipos: {
          codigo: typeof codigo,
          cliente_id: typeof cliente_id,
          valor_pedido: typeof valor_pedido,
          unidade_id: typeof unidade_id,
          servico_ids: Array.isArray(servico_ids) ? 'array' : typeof servico_ids,
          data_agendamento: typeof data_agendamento
        }
      });

      const unidadeIdNum = parseInt(unidade_id, 10);
      const clienteIdNum = cliente_id ? parseInt(cliente_id, 10) : null;
      const valorPedidoNum = typeof valor_pedido === 'number'
        ? valor_pedido
        : parseFloat(String(valor_pedido).replace(',', '.'));
      const servicoIdsNum = Array.isArray(servico_ids)
        ? servico_ids.map(s => parseInt(s, 10)).filter(n => Number.isFinite(n))
        : [];

      // Validar parâmetros obrigatórios
      if (!codigo || valor_pedido === undefined || !unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          message: 'Código do cupom, valor do pedido e ID da unidade são obrigatórios'
        });
      }

      if (!Number.isFinite(unidadeIdNum) || unidadeIdNum <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          message: 'ID da unidade inválido'
        });
      }

      if (!Number.isFinite(valorPedidoNum) || valorPedidoNum <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valor inválido',
          message: 'Valor do pedido deve ser maior que zero'
        });
      }

      // ✅ NOVO: Validar uso do cupom com contexto completo incluindo data do agendamento
      const validacao = await this.cupomService.validarUsoCupom(
        codigo,
        clienteIdNum,
        valorPedidoNum,
        unidadeIdNum,
        servicoIdsNum,
        data_agendamento || null // ✅ Passar data do agendamento para validar dia da semana
      );

      if (!validacao.valido) {
        return res.status(400).json({
          success: false,
          valido: false,
          error: validacao.erro,
          codigo_erro: validacao.codigo_erro,
          valor_minimo: validacao.valor_minimo,
          dias_permitidos: validacao.dias_permitidos // ✅ Retornar dias permitidos se erro for de dia da semana
        });
      }

      return res.json({
        success: true,
        valido: true,
        cupom: validacao.cupom,
        desconto: validacao.desconto,
        message: `Cupom ${codigo} válido!`
      });
    } catch (error) {
      logger.error('[CupomController] Erro ao validar cupom:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = CupomController;

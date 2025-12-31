const BaseController = require('./BaseController');
const Unidade = require('../models/Unidade');
const UnidadeService = require('../services/UnidadeService');
const HorarioFuncionamentoUnidade = require('../models/HorarioFuncionamentoUnidade');
const logger = require('./../utils/logger');

class UnidadeController extends BaseController {
  constructor() {
    super(new Unidade());
    this.unidadeService = new UnidadeService();
  }

  // GET /api/unidades - Buscar unidades do usuário logado com informações de limite
  // ✅ CORREÇÃO: ADMIN, MASTER e AGENTE podem ver unidades da empresa
  async index(req, res) {
    try {
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      const include = req.query.include;
      const includeHorarios = typeof include === 'string' && include.split(',').includes('horarios_funcionamento');

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }



      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, retornar a unidade onde ele trabalha
      if (userRole === 'AGENTE' && userAgenteId) {
        // Buscar o agente para pegar sua unidade_id
        const agente = await this.model.db('agentes')
          .where('id', userAgenteId)
          .first();

        if (!agente || !agente.unidade_id) {
          return res.json([]);
        }

        // Buscar a unidade do agente
        const unidade = await this.model.db('unidades')
          .where('id', agente.unidade_id)
          .where('status', '!=', 'Excluido')
          .first();

        if (!unidade) {
          return res.json([]);
        }

        if (includeHorarios) {
          unidade.horarios_funcionamento = await HorarioFuncionamentoUnidade.findByUnidade(unidade.id);
        }

        // Aplicar filtros adicionais se fornecidos
        const { status } = req.query;
        if (status && unidade.status !== status) {
          return res.json([]);
        }

        // Retornar no formato esperado pelo frontend (array direto)
        return res.json([unidade]);
      }

      const { status } = req.query;
      const filters = {};

      if (status) {
        filters.status = status;
      }

      // Para MASTER, listar todas as unidades; para ADMIN/AGENTE, apenas unidades da empresa
      let result;
      if (userRole === 'MASTER') {
        // MASTER vê todas as unidades do sistema
        const unidades = await this.model.findAll(filters);
        result = {
          data: unidades,
          limitInfo: {
            currentCount: unidades.length,
            limit: null, // MASTER não tem limite
            canCreateMore: true,
            plano: 'MASTER'
          }
        };
      } else {
        // ✅ CORREÇÃO: ADMIN e AGENTE veem unidades da empresa (filtradas por usuario_id)
        // Para AGENTE, req.user.id é o ID do usuário ADMIN que criou o agente

        result = await this.unidadeService.listUnidadesWithLimit(usuarioId, filters);
      }

      if (includeHorarios) {
        const unidades = Array.isArray(result)
          ? result
          : (Array.isArray(result?.data) ? result.data : []);

        const unidadeIds = unidades
          .map(u => u?.id)
          .filter(id => Number.isFinite(id));

        const horariosRows = await HorarioFuncionamentoUnidade.findByUnidades(unidadeIds);
        const horariosByUnidadeId = new Map();
        for (const row of horariosRows) {
          const id = row.unidade_id;
          if (!horariosByUnidadeId.has(id)) {
            horariosByUnidadeId.set(id, []);
          }
          horariosByUnidadeId.get(id).push(row);
        }

        for (const unidade of unidades) {
          unidade.horarios_funcionamento = horariosByUnidadeId.get(unidade.id) || [];
        }
      }



      return res.json(result);
    } catch (error) {
      logger.error('❌ [UnidadeController] Erro ao buscar unidades:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/unidades - Criar nova unidade com validação de limite
  async store(req, res) {
    try {
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Validar dados obrigatórios
      const { nome, endereco, telefone } = req.body;

      if (!nome || !nome.trim()) {
        return res.status(400).json({
          error: 'Dados inválidos',
          message: 'Nome da unidade é obrigatório'
        });
      }

      const unidadeData = {
        nome: nome.trim(),
        endereco: endereco?.trim() || '',
        telefone: telefone?.trim() || '',
        status: req.body.status || 'Ativo',
        horarios_funcionamento: req.body.horarios_funcionamento || null,
        agentes_ids: req.body.agentes_ids || null,
        servicos_ids: req.body.servicos_ids || null,
        excecoes_calendario: req.body.excecoes_calendario || null
      };

      // Log para debug
      if (req.body.excecoes_calendario) {
        logger.log(`📅 [UnidadeController] Criando unidade com exceções:`, {
          isArray: Array.isArray(req.body.excecoes_calendario),
          length: req.body.excecoes_calendario?.length,
          data: req.body.excecoes_calendario
        });
      }

      // Usar service para ambos MASTER e ADMIN (MASTER terá limite bypass no service)
      const result = await this.unidadeService.createUnidade(usuarioId, unidadeData, userRole);

      return res.status(201).json({
        data: result.unidade,
        limitInfo: result.limitInfo,
        message: 'Unidade criada com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao criar unidade:', error);

      // Tratar erro específico de limite excedido
      if (error.code === 'UNIT_LIMIT_EXCEEDED') {
        return res.status(400).json({
          error: 'Limite de unidades excedido',
          message: error.message,
          details: error.details
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/unidades/:id - Buscar unidade específica
  async show(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Buscar unidade com horários usando service
      const unidadeCompleta = await this.unidadeService.getUnidadeById(usuarioId, parseInt(id), userRole);

      if (!unidadeCompleta) {
        return res.status(404).json({
          error: 'Unidade não encontrada',
          message: 'Unidade não existe ou você não tem permissão para visualizá-la'
        });
      }



      return res.json({
        success: true, // ✅ CORREÇÃO: Adicionar flag success
        data: unidadeCompleta
      });
    } catch (error) {
      logger.error('Erro ao buscar unidade:', error);
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
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }



      // Validar dados se fornecidos
      const updateData = {};

      if (req.body.nome !== undefined) {
        if (!req.body.nome || !req.body.nome.trim()) {
          return res.status(400).json({
            error: 'Dados inválidos',
            message: 'Nome da unidade não pode estar vazio'
          });
        }
        updateData.nome = req.body.nome.trim();
      }

      if (req.body.endereco !== undefined) {
        updateData.endereco = req.body.endereco?.trim() || '';
      }

      if (req.body.telefone !== undefined) {
        updateData.telefone = req.body.telefone?.trim() || '';
      }

      // Suporte para atualização de status
      if (req.body.status !== undefined) {
        const validStatuses = ['Ativo', 'Bloqueado', 'Excluido'];
        if (!validStatuses.includes(req.body.status)) {
          return res.status(400).json({
            error: 'Dados inválidos',
            message: 'Status deve ser: Ativo, Bloqueado ou Excluido'
          });
        }
        updateData.status = req.body.status;
      }

      if (req.body.horarios_funcionamento !== undefined) {
        updateData.horarios_funcionamento = req.body.horarios_funcionamento;
      }

      // Suporte para horarios_semanais (formato do frontend)
      if (req.body.horarios_semanais !== undefined) {
        updateData.horarios_funcionamento = req.body.horarios_semanais;
      }

      if (req.body.agentes_ids !== undefined) {
        updateData.agentes_ids = req.body.agentes_ids;
      }

      if (req.body.servicos_ids !== undefined) {
        updateData.servicos_ids = req.body.servicos_ids;
      }

      // Suporte para exceções de calendário
      if (req.body.excecoes_calendario !== undefined) {
        updateData.excecoes_calendario = req.body.excecoes_calendario;
      }

      // Usar service para atualizar com verificação de permissões
      const unidadeAtualizada = await this.unidadeService.updateUnidade(
        usuarioId,
        parseInt(id),
        updateData,
        userRole
      );



      return res.json({
        success: true,
        data: unidadeAtualizada,
        message: 'Unidade atualizada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [UnidadeController] Erro ao atualizar unidade:', {
        unidadeId: req.params?.id,
        usuarioId: req.user?.id,
        role: req.user?.role,
        message: error?.message,
        stack: error?.stack
      });

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // PATCH /api/unidades/:id/status - Alterar status da unidade
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      if (!status || !['Ativo', 'Bloqueado'].includes(status)) {
        return res.status(400).json({
          error: 'Status inválido',
          message: 'Status deve ser "Ativo" ou "Bloqueado"'
        });
      }

      // Usar service para alterar status com verificação de permissões
      const unidadeAtualizada = await this.unidadeService.changeUnidadeStatus(
        usuarioId,
        parseInt(id),
        status,
        userRole
      );

      return res.json({
        data: unidadeAtualizada,
        message: `Status da unidade alterado para ${status}`
      });
    } catch (error) {
      logger.error('Erro ao alterar status da unidade:', error);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      if (error.code === 'INVALID_STATUS') {
        return res.status(400).json({
          error: 'Status inválido',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // DELETE /api/unidades/:id - Soft delete da unidade (ADMIN pode deletar suas próprias)
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // ADMIN pode deletar suas próprias unidades, MASTER pode deletar qualquer uma
      // Usar soft delete alterando status para 'Excluido'
      const unidadeAtualizada = await this.unidadeService.changeUnidadeStatus(
        usuarioId,
        parseInt(id),
        'Excluido',
        userRole
      );

      return res.json({
        data: unidadeAtualizada,
        message: 'Unidade excluída com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao excluir unidade:', error);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      if (error.code === 'INVALID_STATUS') {
        return res.status(400).json({
          error: 'Status inválido',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // ========================================
  // MÉTODOS PARA EXCEÇÕES DE CALENDÁRIO
  // ========================================

  // POST /api/unidades/:id/excecoes - Criar exceção de calendário
  async createExcecao(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Validar dados obrigatórios
      const { data_inicio, data_fim, hora_inicio, hora_fim, tipo, descricao } = req.body;

      if (!data_inicio || !data_fim) {
        return res.status(400).json({
          error: 'Dados inválidos',
          message: 'data_inicio e data_fim são obrigatórios'
        });
      }

      const excecaoData = {
        data_inicio,
        data_fim,
        hora_inicio: hora_inicio || null,
        hora_fim: hora_fim || null,
        tipo: tipo || 'Outro',
        descricao: descricao || null
      };

      // Criar exceção usando service
      const excecao = await this.unidadeService.createExcecaoCalendario(
        usuarioId,
        parseInt(id),
        excecaoData,
        userRole
      );

      return res.status(201).json({
        success: true,
        data: excecao,
        message: 'Exceção de calendário criada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [UnidadeController] Erro ao criar exceção:', error.message);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      if (error.code === 'EXCECAO_SOBREPOSTA') {
        return res.status(400).json({
          error: 'Conflito de datas',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/unidades/:id/excecoes - Listar exceções de calendário
  async listExcecoes(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Filtros opcionais
      const filters = {};
      if (req.query.dataInicio) {
        filters.dataInicio = req.query.dataInicio;
      }
      if (req.query.dataFim) {
        filters.dataFim = req.query.dataFim;
      }

      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, passar agente_id ao invés de usuario_id
      const userIdForService = userRole === 'AGENTE' && userAgenteId ? userAgenteId : usuarioId;

      // Buscar exceções usando service
      const excecoes = await this.unidadeService.listExcecoesCalendario(
        userIdForService,
        parseInt(id),
        filters,
        userRole
      );

      return res.json({
        success: true,
        data: excecoes
      });
    } catch (error) {
      logger.error('❌ [UnidadeController] Erro ao listar exceções:', error.message);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // PUT /api/unidades/:id/excecoes/:excecaoId - Atualizar exceção
  async updateExcecao(req, res) {
    try {
      const { excecaoId } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Dados para atualização
      const excecaoData = {};
      if (req.body.data_inicio !== undefined) {
        excecaoData.data_inicio = req.body.data_inicio;
      }
      if (req.body.data_fim !== undefined) {
        excecaoData.data_fim = req.body.data_fim;
      }
      if (req.body.hora_inicio !== undefined) {
        excecaoData.hora_inicio = req.body.hora_inicio || null;
      }
      if (req.body.hora_fim !== undefined) {
        excecaoData.hora_fim = req.body.hora_fim || null;
      }
      if (req.body.tipo !== undefined) {
        excecaoData.tipo = req.body.tipo;
      }
      if (req.body.descricao !== undefined) {
        excecaoData.descricao = req.body.descricao;
      }

      // Atualizar exceção usando service
      const excecaoAtualizada = await this.unidadeService.updateExcecaoCalendario(
        usuarioId,
        parseInt(excecaoId),
        excecaoData,
        userRole
      );

      return res.json({
        success: true,
        data: excecaoAtualizada,
        message: 'Exceção de calendário atualizada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [UnidadeController] Erro ao atualizar exceção:', error.message);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      if (error.code === 'EXCECAO_NAO_ENCONTRADA') {
        return res.status(404).json({
          error: 'Exceção não encontrada',
          message: error.message
        });
      }

      if (error.code === 'EXCECAO_SOBREPOSTA') {
        return res.status(400).json({
          error: 'Conflito de datas',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // DELETE /api/unidades/:id/excecoes/:excecaoId - Deletar exceção
  async deleteExcecao(req, res) {
    try {
      const { excecaoId } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // Deletar exceção usando service
      const deleted = await this.unidadeService.deleteExcecaoCalendario(
        usuarioId,
        parseInt(excecaoId),
        userRole
      );

      if (!deleted) {
        return res.status(404).json({
          error: 'Exceção não encontrada'
        });
      }

      return res.json({
        success: true,
        message: 'Exceção de calendário deletada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [UnidadeController] Erro ao deletar exceção:', error.message);

      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: error.message
        });
      }

      if (error.code === 'EXCECAO_NAO_ENCONTRADA') {
        return res.status(404).json({
          error: 'Exceção não encontrada',
          message: error.message
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

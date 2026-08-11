const Agente = require('../models/Agente');
const AgenteExcecaoCalendario = require('../models/AgenteExcecaoCalendario');
const bcrypt = require('bcryptjs');
const { deleteOldAvatar } = require('../middleware/formDataMiddleware');
const logger = require('../utils/logger');
const { logAgenteDelete } = require('../utils/auditLogger');

class AgenteController {
  constructor() {
    this.agenteModel = new Agente();
  }

  buildTodayStr() {
    const hoje = new Date();
    return hoje.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  getDiaSemanaLocal() {
    const hoje = new Date();
    const localStr = hoje.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const dtLocal = new Date(localStr);
    return dtLocal.getDay();
  }

  normalizePeriodos(periodos) {
    try {
      const parsed = typeof periodos === 'string' ? JSON.parse(periodos) : periodos;
      if (!Array.isArray(parsed)) return [];
      return parsed.map((p) => ({
        start: p.start || p.inicio || '09:00',
        end: p.end || p.fim || '17:00'
      }));
    } catch {
      return [];
    }
  }

  formatTodayHoursFromPeriodos(periodos) {
    const normalizados = this.normalizePeriodos(periodos);
    if (!Array.isArray(normalizados) || normalizados.length === 0) return '';
    return normalizados.map((p) => `${p.start}-${p.end}`).join(' ');
  }

  buildAvailabilityFromHorarios(horarios) {
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const periodosByDia = new Map();

    for (const h of horarios || []) {
      const dia = Number(h.dia_semana);
      if (!Number.isFinite(dia)) continue;
      const periodos = this.normalizePeriodos(h.periodos);
      if (!periodosByDia.has(dia)) periodosByDia.set(dia, []);
      periodosByDia.get(dia).push(...periodos);
    }

    return Array.from({ length: 7 }, (_, i) => ({
      day: diasSemana[i],
      available: (periodosByDia.get(i) || []).length > 0
    }));
  }

  async enrichAgentsBatch(agentesBase) {
    const agentes = Array.isArray(agentesBase) ? agentesBase : [];
    const agentIds = agentes.map((a) => Number(a.id)).filter((n) => Number.isFinite(n));
    if (agentIds.length === 0) {
      return [];
    }

    const [unidadesRows, horariosRows, agendamentosHojeRows] = await Promise.all([
      this.agenteModel.db('agente_unidades')
        .whereIn('agente_id', agentIds)
        .select('agente_id', 'unidade_id'),
      this.agenteModel.db('horarios_funcionamento')
        .whereIn('agente_id', agentIds)
        .where('ativo', true)
        .select('agente_id', 'dia_semana', 'periodos', 'unidade_id'),
      this.agenteModel.db('agendamentos')
        .whereIn('agente_id', agentIds)
        .whereNull('deleted_at')
        .where('status', 'Aprovado')
        .where('data_agendamento', this.buildTodayStr())
        .groupBy('agente_id')
        .select('agente_id')
        .count('* as total')
    ]);

    const unidadesByAgente = new Map();
    for (const row of unidadesRows || []) {
      const agenteId = Number(row.agente_id);
      const unidadeId = Number(row.unidade_id);
      if (!Number.isFinite(agenteId) || !Number.isFinite(unidadeId)) continue;
      if (!unidadesByAgente.has(agenteId)) unidadesByAgente.set(agenteId, new Set());
      unidadesByAgente.get(agenteId).add(unidadeId);
    }

    const horariosByAgente = new Map();
    for (const row of horariosRows || []) {
      const agenteId = Number(row.agente_id);
      if (!Number.isFinite(agenteId)) continue;
      if (!horariosByAgente.has(agenteId)) horariosByAgente.set(agenteId, []);
      horariosByAgente.get(agenteId).push(row);
    }

    const reservasHojeByAgente = new Map();
    for (const row of agendamentosHojeRows || []) {
      const agenteId = Number(row.agente_id);
      const total = Number(row.total) || 0;
      if (!Number.isFinite(agenteId)) continue;
      reservasHojeByAgente.set(agenteId, total);
    }

    const diaSemanaHoje = this.getDiaSemanaLocal();

    return agentes.map((agente) => {
      const agenteId = Number(agente.id);

      const unidadesSet = unidadesByAgente.get(agenteId) || new Set();
      if (agente.unidade_id && !unidadesSet.has(Number(agente.unidade_id))) {
        unidadesSet.add(Number(agente.unidade_id));
      }

      const horarios = horariosByAgente.get(agenteId) || [];
      const horariosHoje = horarios.find((h) => Number(h.dia_semana) === diaSemanaHoje);

      return {
        ...agente,
        unidades_ids: Array.from(unidadesSet).map((n) => n.toString()),
        horarios_funcionamento: horarios,
        reservations: reservasHojeByAgente.get(agenteId) || 0,
        todayHours: this.formatTodayHoursFromPeriodos(horariosHoje?.periodos),
        availability: this.buildAvailabilityFromHorarios(horarios)
      };
    });
  }

  // ========================================
  // MÉTODOS PARA EXCEÇÕES DE CALENDÁRIO (AGENTE)
  // ========================================

  // POST /api/agentes/:id/excecoes - Criar exceção de calendário
  async createExcecao(req, res) {
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

      // Permissões
      if (userRole === 'AGENTE') {
        if (!userAgenteId || parseInt(id) !== parseInt(userAgenteId)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você só pode gerenciar as exceções do seu próprio calendário'
          });
        }
      } else if (userRole === 'ADMIN') {
        const agente = await this.agenteModel.findByIdComplete(id);
        if (!agente || agente.unidade_usuario_id !== usuarioId) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para editar este agente'
          });
        }
      }

      const { data_inicio, data_fim, hora_inicio, hora_fim, tipo, descricao } = req.body;

      if (!data_inicio || !data_fim) {
        return res.status(400).json({
          error: 'Dados inválidos',
          message: 'data_inicio e data_fim são obrigatórios'
        });
      }

      const excecao = await AgenteExcecaoCalendario.create({
        agente_id: parseInt(id),
        data_inicio,
        data_fim,
        hora_inicio: hora_inicio || null,
        hora_fim: hora_fim || null,
        tipo: tipo || 'Outro',
        descricao: descricao || null
      });

      return res.status(201).json({
        success: true,
        data: excecao,
        message: 'Exceção de calendário criada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AgenteController] Erro ao criar exceção do agente:', error?.message);

      if (error.code === 'EXCECAO_SOBREPOSTA') {
        return res.status(400).json({
          error: 'Conflito de datas',
          message: error.message
        });
      }

      if (error.code === 'AGENDAMENTO_CONFLITANTE') {
        return res.status(409).json({
          error: 'Conflito com agendamento',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/agentes/:id/excecoes - Listar exceções de calendário
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

      if (userRole === 'AGENTE') {
        if (!userAgenteId || parseInt(id) !== parseInt(userAgenteId)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você só pode acessar as exceções do seu próprio calendário'
          });
        }
      } else if (userRole === 'ADMIN') {
        const agente = await this.agenteModel.findByIdComplete(id);
        if (!agente || agente.unidade_usuario_id !== usuarioId) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para acessar este agente'
          });
        }
      }

      const filters = {};
      if (req.query.dataInicio) {
        filters.dataInicio = req.query.dataInicio;
      }
      if (req.query.dataFim) {
        filters.dataFim = req.query.dataFim;
      }

      const excecoes = await AgenteExcecaoCalendario.findByAgente(parseInt(id), filters);

      return res.json({
        success: true,
        data: excecoes
      });
    } catch (error) {
      logger.error('❌ [AgenteController] Erro ao listar exceções do agente:', error?.message);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // PUT /api/agentes/:id/excecoes/:excecaoId - Atualizar exceção
  async updateExcecao(req, res) {
    try {
      const { id, excecaoId } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      if (userRole === 'AGENTE') {
        if (!userAgenteId || parseInt(id) !== parseInt(userAgenteId)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você só pode gerenciar as exceções do seu próprio calendário'
          });
        }
      } else if (userRole === 'ADMIN') {
        const agente = await this.agenteModel.findByIdComplete(id);
        if (!agente || agente.unidade_usuario_id !== usuarioId) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para editar este agente'
          });
        }
      }

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

      const excecaoAtualizada = await AgenteExcecaoCalendario.update(parseInt(excecaoId), excecaoData);

      return res.json({
        success: true,
        data: excecaoAtualizada,
        message: 'Exceção de calendário atualizada com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AgenteController] Erro ao atualizar exceção do agente:', error?.message);

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

      if (error.code === 'AGENDAMENTO_CONFLITANTE') {
        return res.status(409).json({
          error: 'Conflito com agendamento',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // DELETE /api/agentes/:id/excecoes/:excecaoId - Deletar exceção
  async deleteExcecao(req, res) {
    try {
      const { id, excecaoId } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      if (userRole === 'AGENTE') {
        if (!userAgenteId || parseInt(id) !== parseInt(userAgenteId)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você só pode gerenciar as exceções do seu próprio calendário'
          });
        }
      } else if (userRole === 'ADMIN') {
        const agente = await this.agenteModel.findByIdComplete(id);
        if (!agente || agente.unidade_usuario_id !== usuarioId) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para editar este agente'
          });
        }
      }

      const deleted = await AgenteExcecaoCalendario.delete(parseInt(excecaoId));

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
      logger.error('❌ [AgenteController] Erro ao deletar exceção do agente:', error?.message);

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * GET /api/agentes/list - Listagem leve de agentes para formulários (com RBAC)
   * ADMIN: Retorna todos os agentes da unidade
   * AGENTE: Retorna apenas o próprio agente
   */
  async list(req, res) {
    try {
      let usuarioId = req.user.id;
      const userRole = req.user.role;
      const userAgenteId = req.user.agente_id;

      // ✅ FASE 3: Paginação obrigatória (máx 100 registros por página)
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = (page - 1) * limit;

      // ✅ CORREÇÃO: Para AGENTE, buscar o usuario_id do ADMIN que o criou
      if (userRole === 'AGENTE' && userAgenteId) {
        const agente = await this.agenteModel.findById(userAgenteId);
        if (agente && agente.usuario_id) {
          usuarioId = agente.usuario_id;

        }
      }

      let agentesBase;
      let totalCount = 0;

      if (userRole === 'AGENTE' && userAgenteId) {
        const agenteData = await this.agenteModel.findById(userAgenteId);
        agentesBase = agenteData ? [agenteData] : [];
        totalCount = agentesBase.length;
      } else {
        const baseQuery = this.agenteModel.db('agentes')
          .leftJoin('unidades', 'agentes.unidade_id', 'unidades.id')
          .where(function() {
            this.where('agentes.usuario_id', usuarioId)
              .orWhere('unidades.usuario_id', usuarioId);
          })
          .whereNull('agentes.deleted_at');

        const countRow = await baseQuery.clone()
          .clearSelect()
          .clearOrder()
          .countDistinct('agentes.id as total')
          .first();
        totalCount = Number(countRow?.total) || 0;

        agentesBase = await baseQuery
          .clone()
          .select('agentes.id', 'agentes.nome', 'agentes.sobrenome', 'agentes.avatar_url', 'agentes.unidade_id')
          .orderBy('agentes.nome', 'asc')
          .limit(limit)
          .offset(offset);
      }

      // TEMPORÁRIO: enrichAgentsBatch desabilitado até implementação
      const agentesComDados = agentesBase;

      // Formatar dados mínimos para formulários
      const agentesLeves = agentesComDados.map(agente => ({
        id: agente.id,
        nome: `${agente.nome} ${agente.sobrenome || ''}`.trim(),
        avatar_url: agente.avatar_url || null,
        unidades: [], // TEMPORÁRIO: sem unidades até enrichAgentsBatch ser implementado
        unidade_id: agente.unidade_id, // ✅ Incluir unidade_id principal (fallback)
        // ✅ NOVO: Horários por unidade para filtro de disponibilidade no Novo Agendamento
        horarios_funcionamento: [] // TEMPORÁRIO: sem horários até enrichAgentsBatch ser implementado
      }));



      res.status(200).json({
        success: true,
        data: agentesLeves,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 0
        },
        message: `Lista de agentes carregada com sucesso (${agentesLeves.length} agentes)`
      });
    } catch (error) {
      logger.error('[AgenteController] Erro ao carregar lista de agentes:', error);

      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao carregar lista de agentes',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /api/agentes - Listagem de agentes (Grid)
   * ✅ CORREÇÃO: ADMIN e AGENTE podem ver todos os agentes da empresa
   * O frontend faz o filtro por loggedInAgentId quando necessário
   */
  async index(req, res) {
    try {
      let usuarioId = req.user.id;
      const userRole = req.user.role;
      const userAgenteId = req.user.agente_id;

      // ✅ FASE 3: Paginação obrigatória (máx 100 registros por página)
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = (page - 1) * limit;
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, buscar o usuario_id do ADMIN que o criou
      if (userRole === 'AGENTE' && userAgenteId) {
        const agente = await this.agenteModel.findById(userAgenteId);

        if (agente && agente.usuario_id) {
          usuarioId = agente.usuario_id;
        }
      }

      const baseQuery = this.agenteModel.db('agentes')
        .leftJoin('unidades', 'agentes.unidade_id', 'unidades.id')
        .where(function() {
          this.where('agentes.usuario_id', usuarioId)
            .orWhere('unidades.usuario_id', usuarioId);
        })
        .whereNull('agentes.deleted_at')
        .modify((qb) => {
          if (search) {
            qb.where(function() {
              this.whereILike('agentes.nome', `%${search}%`)
                .orWhereILike('agentes.sobrenome', `%${search}%`)
                .orWhereILike('agentes.email', `%${search}%`);
            });
          }
        });

      const countRow = await baseQuery.clone()
        .clearSelect()
        .clearOrder()
        .countDistinct('agentes.id as total')
        .first();
      const totalCount = Number(countRow?.total) || 0;

      const agentesBase = await baseQuery.clone()
        .select(
          'agentes.*',
          'unidades.nome as unidade_nome'
        )
        .orderBy('agentes.nome', 'asc')
        .limit(limit)
        .offset(offset);

      const agentesComDados = await this.enrichAgentsBatch(agentesBase);

      // Formatar dados para o frontend
      const agentesFormatados = agentesComDados.map(agente => ({
        id: agente.id,
        name: `${agente.nome} ${agente.sobrenome || ''}`.trim(),
        email: agente.email,
        phone: agente.telefone,
        avatar: agente.avatar_url || null,
        status: agente.status,
        reservations: agente.reservations,
        todayHours: agente.todayHours,
        availability: agente.availability,
        unidade_nome: agente.unidade_nome,
        biografia: agente.biografia,
        nome_exibicao: agente.nome_exibicao,
        data_admissao: agente.data_admissao,
        comissao_percentual: agente.comissao_percentual,
        unidades: agente.unidades_ids, // ✅ CRÍTICO: Array de IDs das unidades onde o agente trabalha
        unidade_id: agente.unidade_id, // ✅ CORREÇÃO CRÍTICA: Incluir unidade_id principal para auto-seleção
        // ✅ NOVO: Horários de trabalho por dia da semana e unidade
        // ✅ CORREÇÃO CRÍTICA: Normalizar períodos para usar "start" e "end" (não "inicio" e "fim")
        horarios_funcionamento: (agente.horarios_funcionamento || []).map(h => ({
          dia_semana: h.dia_semana,
          unidade_id: h.unidade_id,
          periodos: this.normalizePeriodos(h.periodos)
        }))
      }));
      
      res.status(200).json({
        success: true,
        data: agentesFormatados,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 0
        },
        message: `Agentes listados com sucesso (${agentesFormatados.length} agentes)`
      });
    } catch (error) {
      logger.error('❌ [AgenteController] Erro ao listar agentes:', error);
      logger.error('Stack trace:', error.stack);
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao listar agentes',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /api/agentes/:id - Visualização de agente específico (para edição)
   */
  async show(req, res) {
    try {
      const agenteId = req.params.id;
      const usuarioId = req.user.id;
      const userRole = req.user.role;
      const userAgenteId = req.user.agente_id;

      const agente = await this.agenteModel.findByIdComplete(agenteId);

      if (!agente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      // ✅ CORREÇÃO CRÍTICA: Permitir que AGENTE acesse seus próprios dados
      // Verificar permissão baseada no role
      if (userRole === 'AGENTE') {
        // AGENTE só pode acessar seu próprio perfil
        if (userAgenteId && parseInt(agenteId) !== parseInt(userAgenteId)) {
          return res.status(403).json({
            success: false,
            error: 'Acesso negado',
            message: 'Você só pode acessar seu próprio perfil'
          });
        }
      } else {
        // ADMIN/MASTER: Verificar se o agente pertence a uma unidade do usuário logado
        if (agente.unidade_usuario_id !== usuarioId) {
          return res.status(403).json({
            success: false,
            error: 'Acesso negado',
            message: 'Você não tem permissão para acessar este agente'
          });
        }
      }

      // ✅ CORREÇÃO: Buscar serviços do usuário correto
      const Servico = require('../models/Servico');
      const servicoModel = new Servico();

      // Para AGENTE: buscar serviços do ADMIN que criou a unidade
      // Para ADMIN/MASTER: buscar serviços do próprio usuário
      const usuarioIdParaServicos = userRole === 'AGENTE' ? agente.unidade_usuario_id : usuarioId;

      const servicosDisponiveis = await servicoModel.findActiveByUsuario(usuarioIdParaServicos);

      // Formatar dados para o frontend
      const agenteFormatado = {
        id: agente.id,
        nome: agente.nome,
        sobrenome: agente.sobrenome,
        email: agente.email,
        telefone: agente.telefone,
        avatar_url: agente.avatar_url,
        biografia: agente.biografia,
        nome_exibicao: agente.nome_exibicao,
        status: agente.status,
        unidade_id: agente.unidade_id,
        unidade_nome: agente.unidade_nome,
        agenda_personalizada: agente.agenda_personalizada,
        observacoes: agente.observacoes,
        data_admissao: agente.data_admissao,
        comissao_percentual: agente.comissao_percentual,
        notifica_crise: agente.notifica_crise || false, // ✅ GESTÃO DE CRISE: Incluir flag no retorno
        // Serviços para pré-seleção
        servicos_disponiveis: servicosDisponiveis.map(s => ({
          id: s.id,
          nome: s.nome,
          preco: s.preco,
          duracao_minutos: s.duracao_minutos
        })),
        servicos_atuais_ids: agente.servicos_oferecidos.map(s => s.id),
        // Horários formatados - ✅ CORREÇÃO: Normalizar para formato "start/end" + incluir unidade_id
        horarios_funcionamento: agente.horarios_funcionamento.map(h => {
          const periodos = typeof h.periodos === 'string' ? JSON.parse(h.periodos) : h.periodos;
          // Normalizar períodos para usar "start" e "end" (não "inicio" e "fim")
          const periodosNormalizados = Array.isArray(periodos) ? periodos.map(p => ({
            start: p.start || p.inicio || '09:00',
            end: p.end || p.fim || '17:00'
          })) : [];
          
          return {
            dia_semana: h.dia_semana,
            unidade_id: h.unidade_id, // ✅ CRÍTICO: Incluir unidade_id para suporte multi-unidade
            periodos: periodosNormalizados
          };
        })
      };
      
      res.status(200).json({
        success: true,
        data: agenteFormatado,
        message: 'Agente encontrado com sucesso'
      });
    } catch (error) {
      logger.error('[AgenteController] Erro ao buscar agente:', error);
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar agente'
      });
    }
  }

  /**
   * POST /api/agentes - Criação de agente
   */
  async store(req, res) {
    try {
      const usuarioId = req.user.id;

      // ✅ CORREÇÃO DE SEGURANÇA: Usar unidade_id do token JWT
      const unidadeIdDoToken = req.user.unidade_id;

      if (!unidadeIdDoToken) {
        return res.status(403).json({
          success: false,
          error: 'Usuário sem unidade',
          message: 'Usuário não possui unidade associada'
        });
      }

      // Extrair dados do body (pode ser JSON ou FormData)
      // ✅ SEGURANÇA: unidade_id removido do req.body - será forçado do token
      const {
        nome,
        sobrenome,
        email,
        telefone,
        senha,
        avatar_url,
        biografia,
        nome_exibicao,
        // unidade_id, // ❌ REMOVIDO: Não confiar no frontend
        agenda_personalizada,
        observacoes,
        data_admissao,
        comissao_percentual,
        servicos_oferecidos,
        horarios_funcionamento
      } = req.body;

      // Parse de dados JSON se vieram como string (FormData)
      let servicosIds = [];
      let horariosData = [];
      let agendasMultiUnidade = [];

      try {
        servicosIds = typeof servicos_oferecidos === 'string'
          ? JSON.parse(servicos_oferecidos)
          : (servicos_oferecidos || []);
      } catch (e) {
        logger.error('Erro ao parsear servicos_oferecidos:', e);
      }

      // ✅ ETAPA 6: Suporte para agendas_multi_unidade
      const { agendas_multi_unidade } = req.body;
      try {
        if (agendas_multi_unidade) {
          agendasMultiUnidade = typeof agendas_multi_unidade === 'string'
            ? JSON.parse(agendas_multi_unidade)
            : agendas_multi_unidade;
        }
      } catch (e) {
        logger.error('Erro ao parsear agendas_multi_unidade:', e);
      }

      // Usar agendas_multi_unidade se disponível, senão usar formato legado
      try {
        const { horarios_funcionamento } = req.body;
        if (!agendasMultiUnidade.length && horarios_funcionamento) {
          horariosData = typeof horarios_funcionamento === 'string'
            ? JSON.parse(horarios_funcionamento)
            : horarios_funcionamento;
        }
      } catch (e) {
        logger.error('Erro ao parsear horarios_funcionamento:', e);
      }



      // ✅ CORREÇÃO DE SEGURANÇA: Usar unidade_id do token (já validado)
      const unidadeIdNum = parseInt(unidadeIdDoToken);

      // Validações básicas
      if (!nome || !email || isNaN(unidadeIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios',
          message: 'Nome e email são obrigatórios'
        });
      }

      // ✅ SEGURANÇA: Não precisa verificar se unidade pertence ao usuário
      // porque unidadeIdDoToken já vem do JWT validado

      // ✅ VERIFICAÇÃO: Checar se email já existe
      const emailExistente = await this.agenteModel.db('agentes')
        .where('email', email)
        .first();

      if (emailExistente) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }

      // Verificar também na tabela de usuários
      const emailUsuarioExistente = await this.agenteModel.db('usuarios')
        .where('email', email)
        .first();

      if (emailUsuarioExistente) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }

      // Hash da senha se fornecida
      let senhaHash = null;
      if (senha) {
        // ✅ CORREÇÃO 1.9: Validação robusta de senha
        const { validatePasswordStrength } = require('../middleware/passwordValidation');
        const validation = validatePasswordStrength(senha);
        
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            error: 'Senha não atende aos requisitos de segurança',
            message: 'A senha deve atender aos seguintes requisitos:',
            details: validation.errors
          });
        }
        
        senhaHash = await bcrypt.hash(senha, 12);
      }

      // URL do avatar (do upload ou padrão)
      const finalAvatarUrl = req.avatarUrl || avatar_url || null;

      // ✅ GESTÃO DE CRISE: Extrair notifica_crise do body com cast para boolean
      const notificaCrise = req.body.notifica_crise === 'true' || 
                            req.body.notifica_crise === true || 
                            false;

      // Dados do agente
      const agenteData = {
        nome,
        sobrenome,
        email,
        telefone,
        senha_hash: senhaHash,
        avatar_url: finalAvatarUrl,
        biografia,
        nome_exibicao,
        unidade_id: unidadeIdNum,
        agenda_personalizada: agenda_personalizada === 'true' || agenda_personalizada === true || agenda_personalizada === '1',
        observacoes,
        data_admissao,
        comissao_percentual: comissao_percentual ? parseFloat(comissao_percentual) : 0,
        notifica_crise: notificaCrise, // ✅ GESTÃO DE CRISE: Flag para receber notificações de emergência
        status: 'Ativo'
      };

      // ✅ ETAPA 6: Validar conflitos de agenda multi-unidade
      const horariosParaValidar = agendasMultiUnidade.length > 0 ? agendasMultiUnidade : horariosData;
      
      if (horariosParaValidar.length > 0) {
        const conflito = this.validateScheduleConflicts(horariosParaValidar);
        if (conflito) {
          return res.status(400).json({
            success: false,
            error: 'Conflito de agenda',
            message: conflito
          });
        }
      }

      // Criar agente com transação (incluindo usuário para login)
      const agenteId = await this.agenteModel.createWithTransaction(
        agenteData,
        servicosIds,
        agendasMultiUnidade.length > 0 ? agendasMultiUnidade : horariosData
      );



      // 🗑️ INVALIDAÇÃO DE CACHE FAQ (TASK 3.2)
      setImmediate(async () => {
        try {
          const { invalidateKnowledgeCache } = require('../middleware/cacheInvalidation');
          await invalidateKnowledgeCache(usuarioId, unidadeId);
        } catch (err) {
          logger.warn('[Cache] Erro ao invalidar (não-crítico):', err?.message);
        }
      });

      res.status(201).json({
        success: true,
        data: { id: agenteId, ...agenteData },
        message: 'Agente criado com sucesso'
      });
    } catch (error) {
      logger.error('[AgenteController] Erro ao criar agente:', error);

      // Tratar erros específicos
      if (error.message.includes('duplicate key') && error.message.includes('email')) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao criar agente'
      });
    }
  }

  /**
   * PUT /api/agentes/:id - Edição de agente
   */
  async update(req, res) {
    try {
      logger.log('🔍 [AgenteController] ===== INÍCIO UPDATE AGENTE =====');
      logger.log('🔍 [AgenteController] req.body:', JSON.stringify(req.body, null, 2));
      logger.log('🔍 [AgenteController] req.body.senha:', req.body.senha ? `[PRESENTE - ${req.body.senha.length} chars]` : '[AUSENTE]');
      
      const agenteId = req.params.id;
      const usuarioId = req.user.id;
      const userRole = req.user.role;
      const userAgenteId = req.user.agente_id;
      

      
      const {
        nome,
        sobrenome,
        email,
        telefone,
        senha,
        status,
        avatar_url,
        biografia,
        nome_exibicao,
        unidade_id,
        agenda_personalizada,
        observacoes,
        data_admissao,
        comissao_percentual,
        servicos_oferecidos,
        horarios_funcionamento
      } = req.body;

      // Parse de dados JSON se vieram como string (FormData)
      let servicosIds = [];
      let horariosData = [];
      let agendasMultiUnidade = [];

      try {
        servicosIds = typeof servicos_oferecidos === 'string'
          ? JSON.parse(servicos_oferecidos)
          : (servicos_oferecidos || []);
      } catch (e) {
        logger.error('Erro ao parsear servicos_oferecidos:', e);
        servicosIds = [];
      }

      // ✅ ETAPA 6: Suporte para agendas_multi_unidade
      const { agendas_multi_unidade } = req.body;
      try {
        if (agendas_multi_unidade) {
          agendasMultiUnidade = typeof agendas_multi_unidade === 'string'
            ? JSON.parse(agendas_multi_unidade)
            : agendas_multi_unidade;
        }
      } catch (e) {
        logger.error('Erro ao parsear agendas_multi_unidade:', e);
      }

      // Usar agendas_multi_unidade se disponível, senão usar formato legado
      try {
        const { horarios_funcionamento } = req.body;
        if (!agendasMultiUnidade.length && horarios_funcionamento) {
          horariosData = typeof horarios_funcionamento === 'string'
            ? JSON.parse(horarios_funcionamento)
            : horarios_funcionamento;
        }
      } catch (e) {
        logger.error('❌ Erro ao parsear horarios_funcionamento:', e);
        horariosData = [];
      }

      // Verificar se o agente existe e pertence ao usuário
      const agenteExistente = await this.agenteModel.findByIdComplete(agenteId);

      if (!agenteExistente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      // ✅ CORREÇÃO CRÍTICA: Permitir que AGENTE edite seus próprios dados
      // Verificar permissão baseada no role
      if (userRole === 'AGENTE') {
        // AGENTE só pode editar seu próprio perfil
        if (userAgenteId && parseInt(agenteId) !== parseInt(userAgenteId)) {

          return res.status(403).json({
            success: false,
            error: 'Acesso negado',
            message: 'Você só pode editar seu próprio perfil'
          });
        }

      } else {
        // ADMIN/MASTER: Verificar se o agente pertence a uma unidade do usuário logado
        if (agenteExistente.unidade_usuario_id !== usuarioId) {
          logger.log(`❌ [AgenteController.update] ADMIN tentando editar agente de outro usuário`);
          return res.status(403).json({
            success: false,
            error: 'Acesso negado',
            message: 'Você não tem permissão para editar este agente'
          });
        }

      }

      // Validações básicas
      if (!nome || !email || !unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios',
          message: 'Nome, email e unidade são obrigatórios'
        });
      }

      // ✅ CORREÇÃO: Converter unidade_id para número (pode vir como string do FormData)
      const unidadeIdNum = parseInt(unidade_id);

      // ✅ CORREÇÃO: AGENTE não pode mudar de unidade, apenas ADMIN pode
      if (userRole === 'AGENTE') {
        // AGENTE: Manter unidade_id atual (não permitir mudança)
        if (unidadeIdNum !== parseInt(agenteExistente.unidade_id)) {

          return res.status(403).json({
            success: false,
            error: 'Acesso negado',
            message: 'Você não pode alterar sua unidade'
          });
        }
      } else {
        // ADMIN/MASTER: Verificar se a unidade pertence ao usuário logado
        const unidade = await this.agenteModel.db('unidades')
          .where('id', unidadeIdNum)
          .where('usuario_id', usuarioId)
          .first();

        if (!unidade) {
          return res.status(403).json({
            success: false,
            error: 'Unidade inválida',
            message: 'A unidade selecionada não pertence ao seu usuário'
          });
        }
      }

      // Gerenciar avatar (upload ou manter existente)
      let finalAvatarUrl = agenteExistente.avatar_url; // Manter existente por padrão

      if (req.avatarUrl) {
        // Novo upload - deletar avatar antigo se existir
        if (agenteExistente.avatar_url) {
          deleteOldAvatar(agenteExistente.avatar_url);
        }
        finalAvatarUrl = req.avatarUrl;
      } else if (avatar_url && avatar_url !== agenteExistente.avatar_url) {
        // URL fornecida via body (diferente da atual)
        finalAvatarUrl = avatar_url;
      }

      // Hash da senha apenas se fornecida
      let senhaHash = agenteExistente.senha_hash; // Manter existente por padrão
      if (senha && senha.trim() !== '') {
        logger.log(`🔐 [AgenteController] Senha fornecida para atualização - Comprimento: ${senha.length}`);

        // ✅ CORREÇÃO 1.9: Validação robusta de senha
        const { validatePasswordStrength } = require('../middleware/passwordValidation');
        const validation = validatePasswordStrength(senha);
        
        logger.log(`🔐 [AgenteController] Validação de senha - Válida: ${validation.valid}, Erros: ${validation.errors.length}`);
        
        if (!validation.valid) {
          logger.warn(`🚨 [AgenteController] Senha rejeitada:`, validation.errors);
          return res.status(400).json({
            success: false,
            error: 'Senha não atende aos requisitos de segurança',
            message: 'A senha deve atender aos seguintes requisitos:',
            details: validation.errors
          });
        }
        
        logger.log(`✅ [AgenteController] Senha validada com sucesso - Força: ${validation.strength}`);
        senhaHash = await bcrypt.hash(senha, 12);
      }

      // ✅ CORREÇÃO: Converter agenda_personalizada de string para boolean corretamente
      // FormData envia "true"/"false" como strings, não como booleanos
      const agendaPersonalizadaBool = agenda_personalizada === true ||
                                       agenda_personalizada === 'true' ||
                                       agenda_personalizada === '1';

      // ✅ GESTÃO DE CRISE - REGRA DE SEGURANÇA CRÍTICA (RBAC):
      // Apenas ADMIN/MASTER podem alterar notifica_crise.
      // Um AGENTE NUNCA pode promover a si mesmo como receptor de notificações de crise.
      let notificaCrise = agenteExistente.notifica_crise || false; // Manter valor atual por padrão

      if (userRole === 'ADMIN' || userRole === 'MASTER') {
        // ADMIN/MASTER podem alterar a flag
        if (req.body.notifica_crise !== undefined) {
          notificaCrise = req.body.notifica_crise === 'true' || 
                          req.body.notifica_crise === true || 
                          false;
          logger.log(`✅ [AgenteController.update] ${userRole} alterando notifica_crise para: ${notificaCrise}`);
        }
      } else {
        // AGENTE: ignorar tentativa de alteração (manter valor do banco)
        if (req.body.notifica_crise !== undefined && req.body.notifica_crise !== notificaCrise) {
          logger.warn(`🚨 [AgenteController.update] AGENTE tentou alterar notifica_crise - BLOQUEADO por RBAC`);
        }
      }

      // Preparar dados para atualização
      const agenteData = {
        nome,
        sobrenome,
        email,
        telefone,
        status: status || 'Ativo', // Incluir status
        senha_hash: senhaHash, // Já processado acima
        avatar_url: finalAvatarUrl,
        biografia,
        nome_exibicao,
        unidade_id: unidadeIdNum, // ✅ CORREÇÃO: Usar variável já convertida para número
        agenda_personalizada: agendaPersonalizadaBool,
        observacoes,
        data_admissao,
        comissao_percentual: comissao_percentual ? parseFloat(comissao_percentual) : 0,
        notifica_crise: notificaCrise, // ✅ GESTÃO DE CRISE: Flag para receber notificações de emergência
        updated_at: new Date()
      };

      // ✅ ETAPA 6: Validar conflitos de agenda multi-unidade
      const horariosParaValidar = agendasMultiUnidade.length > 0 ? agendasMultiUnidade : horariosData;
      if (horariosParaValidar.length > 0) {
        const conflito = this.validateScheduleConflicts(horariosParaValidar);
        if (conflito) {
          return res.status(400).json({
            success: false,
            error: 'Conflito de agenda',
            message: conflito
          });
        }
      }

      // Atualizar agente com transação
      await this.agenteModel.updateWithTransaction(
        agenteId,
        agenteData,
        servicosIds,
        agendasMultiUnidade.length > 0 ? agendasMultiUnidade : horariosData
      );

      // 🗑️ INVALIDAÇÃO DE CACHE FAQ (TASK 3.2)
      setImmediate(async () => {
        try {
          const { invalidateKnowledgeCache } = require('../middleware/cacheInvalidation');
          await invalidateKnowledgeCache(usuarioId, unidadeId);
        } catch (err) {
          logger.warn('[Cache] Erro ao invalidar (não-crítico):', err?.message);
        }
      });

      res.status(200).json({
        success: true,
        data: { id: agenteId, ...agenteData },
        message: 'Agente atualizado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AgenteController] Erro ao atualizar agente:', error);
      logger.error('❌ Stack trace:', error.stack);
      logger.error('❌ Mensagem:', error.message);

      // Tratar erros específicos
      if (error.message.includes('duplicate key') && error.message.includes('email')) {
        return res.status(400).json({
          success: false,
          error: 'Email já está em uso',
          message: 'Este email já está cadastrado no sistema'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message || 'Erro ao atualizar agente',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * DELETE /api/agentes/:id - Exclusão completa de agente (agente + usuário)
   * Apenas usuários ADMIN podem excluir agentes (usuários do tipo AGENTE)
   */
  async destroy(req, res) {
    try {
      const agenteId = req.params.id;
      const usuarioLogado = req.user;

      // Verificar se o usuário logado é ADMIN
      if (usuarioLogado.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Apenas administradores podem excluir agentes'
        });
      }

      // Verificar se o agente existe
      const agente = await this.agenteModel.findByIdComplete(agenteId);

      if (!agente) {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'O agente solicitado não foi encontrado'
        });
      }

      // Verificar se o agente pertence a uma unidade do usuário ADMIN logado
      if (agente.unidade_usuario_id !== usuarioLogado.id) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Você só pode excluir agentes da sua unidade'
        });
      }

      // [ELITE-PHASE-1] Trava de integridade: verificar agendamentos futuros ativos
      const agendamentosFuturos = await this.agenteModel.db('agendamentos')
        .where('agente_id', agenteId)
        .where('data_agendamento', '>=', this.agenteModel.db.fn.now())
        .whereIn('status', ['Aprovado', 'confirmado', 'pendente'])
        .whereNull('deleted_at')
        .count('id as total')
        .first();

      const totalAgendamentosFuturos = parseInt(agendamentosFuturos?.total || 0);

      if (totalAgendamentosFuturos > 0) {
        return res.status(409).json({
          success: false,
          error: '[INTEGRIDADE] Não é possível excluir agente com agendamentos futuros confirmados',
          message: `Este agente possui ${totalAgendamentosFuturos} agendamento(s) futuro(s) confirmado(s). Transfira a responsabilidade antes de excluir.`,
          data: {
            agendamentos_futuros: totalAgendamentosFuturos
          }
        });
      }

      // Soft delete (ELITE): manter histórico e impedir cascades perigosos
      const updated = await this.agenteModel.db('agentes')
        .where('id', agenteId)
        .whereNull('deleted_at')
        .update({
          deleted_at: new Date(),
          updated_at: new Date()
        });

      if (!updated) {
        return res.status(200).json({
          success: true,
          message: 'Agente já estava excluído'
        });
      }

      // [ELITE-PHASE-1] Auditoria forense: registrar exclusão de agente
      await logAgenteDelete({
        usuario_id: usuarioLogado.id,
        usuario_email: usuarioLogado.email || 'N/A',
        usuario_nome: usuarioLogado.nome || 'N/A',
        usuario_role: usuarioLogado.role,
        agente_id: parseInt(agenteId),
        agente_nome: agente.nome,
        agente_email: agente.email || 'N/A',
        unidade_id: agente.unidade_id,
        ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        method: 'DELETE',
        endpoint: req.originalUrl
      });

      res.status(200).json({
        success: true,
        message: 'Agente excluído com sucesso'
      });
    } catch (error) {
      logger.error('[AgenteController] Erro ao excluir agente:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao excluir agente'
      });
    }
  }

  /**
   * ✅ ETAPA 6: Validar conflitos de agenda multi-unidade
   * Garante que um agente não esteja alocado em dois lugares no mesmo horário/dia
   * @param {Array} agendas - Array de agendas com dia_semana, unidade_id e periodos
   * @returns {string|null} - Mensagem de erro se houver conflito, null caso contrário
   */
  validateScheduleConflicts(agendas) {
    if (!agendas || agendas.length === 0) {
      return null;
    }

    // Agrupar agendas por dia da semana
    const agendasPorDia = {};
    
    agendas.forEach(agenda => {
      const diaSemana = agenda.dia_semana;
      if (!agendasPorDia[diaSemana]) {
        agendasPorDia[diaSemana] = [];
      }
      agendasPorDia[diaSemana].push(agenda);
    });

    // Verificar conflitos em cada dia
    for (const [diaSemana, agendasDoDia] of Object.entries(agendasPorDia)) {
      // Se há apenas uma agenda no dia, não há conflito
      if (agendasDoDia.length < 2) {
        continue;
      }

      // Verificar sobreposição de períodos entre diferentes unidades
      for (let i = 0; i < agendasDoDia.length; i++) {
        for (let j = i + 1; j < agendasDoDia.length; j++) {
          const agenda1 = agendasDoDia[i];
          const agenda2 = agendasDoDia[j];

          // Verificar se são unidades diferentes
          if (agenda1.unidade_id !== agenda2.unidade_id) {
            // Verificar sobreposição de períodos
            for (const periodo1 of agenda1.periodos) {
              for (const periodo2 of agenda2.periodos) {
                const inicio1 = periodo1.inicio;
                const fim1 = periodo1.fim;
                const inicio2 = periodo2.inicio;
                const fim2 = periodo2.fim;

                // Verificar sobreposição: (inicio1 < fim2) && (inicio2 < fim1)
                if (inicio1 < fim2 && inicio2 < fim1) {
                  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
                  return `Conflito de agenda: o agente já está alocado na Unidade ${agenda1.unidade_id} na ${diasSemana[diaSemana]} das ${inicio1} às ${fim1}, e você tentou alocar ele na Unidade ${agenda2.unidade_id} no mesmo dia das ${inicio2} às ${fim2}.`;
                }
              }
            }
          }
        }
      }
    }

    return null; // Sem conflitos
  }
}

module.exports = AgenteController;

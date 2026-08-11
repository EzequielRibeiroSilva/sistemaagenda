const Cliente = require('../models/Cliente');
const logger = require('./../utils/logger');
const { db } = require('../config/knex');
const PlanoAssinatura = require('../models/PlanoAssinatura');
const AssinaturaSaldoService = require('../services/AssinaturaSaldoService');

/**
 * Controller para gerenciamento de clientes
 * Implementa CRUD completo com suporte a Multi-Tenant e Assinantes
 *
 * Endpoints:
 * - GET /clientes - Listagem com filtros
 * - POST /clientes - Criação manual
 * - GET /clientes/:id - Detalhe para edição
 * - PUT /clientes/:id - Atualização
 * - DELETE /clientes/:id - Exclusão (soft delete)
 * - POST /clientes/agendamento - Criação rápida para agendamento
 */
class ClienteController {
  constructor() {
    this.clienteModel = new Cliente();
    this.planoAssinaturaModel = new PlanoAssinatura();
    this.assinaturaSaldoService = new AssinaturaSaldoService({
      db,
      getDateStrInTimeZone: this.getDateStrInTimeZone.bind(this),
      normalizeDateStr: this.normalizeDateStr.bind(this),
      getCycleBounds: this.getCycleBounds.bind(this)
    });
  }

  normalizeDateStr(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue.toISOString().slice(0, 10);
    const s = String(dateValue);
    if (s.length >= 10 && s.includes('T')) return s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return null;
  }

  addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const pad = (num) => num.toString().padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  dayNumberFromDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }

  diffDays(a, b) {
    return this.dayNumberFromDateStr(a) - this.dayNumberFromDateStr(b);
  }

  getCycleBounds({ startDateStr, validadeDias, referenceDateStr }) {
    const ref = referenceDateStr;
    const start = startDateStr;
    const delta = this.diffDays(ref, start);
    const idx = delta > 0 ? Math.floor(delta / validadeDias) : 0;
    const cycleStart = this.addDays(start, idx * validadeDias);
    const cycleEndExclusive = this.addDays(cycleStart, validadeDias);
    const cycleEndInclusive = this.addDays(cycleEndExclusive, -1);
    return { cycleStart, cycleEndExclusive, cycleEndInclusive, cycleIndex: idx };
  }

  getDateStrInTimeZone(tz, date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  /**
   * GET /api/clientes/search - Busca de clientes para modal de agendamento
   * Busca por nome ou telefone para uso no NewAppointmentModal
   */
  async search(req, res) {
    try {
      const usuarioId = req.user.id;
      const unidadeId = req.user.unidade_id;
      const userRole = req.user.role;
      const userAgenteId = req.user.agente_id;
      const { q } = req.query; // Query de busca



      // Validar se usuário tem unidade_id (Multi-Tenant)
      if (!unidadeId) {
        logger.error('❌ [ClienteController.search] Usuário sem unidade_id');
        return res.status(400).json({
          success: false,
          message: 'Usuário deve estar associado a uma unidade para acessar clientes'
        });
      }

      if (!q || q.trim().length < 2) {
        return res.json({
          success: true,
          data: [],
          message: 'Digite pelo menos 2 caracteres para buscar'
        });
      }

      // Buscar clientes por nome ou telefone
      const clientes = await this.clienteModel.searchByNameOrPhone(unidadeId, q.trim());



      res.json({
        success: true,
        data: clientes,
        message: `${clientes.length} clientes encontrados`
      });

    } catch (error) {
      logger.error('❌ [ClienteController.search] Erro na busca de clientes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * GET /api/clientes - Listagem de clientes com filtros e paginação
   * Suporta filtros por nome, telefone, ID, status de assinante
   * Suporta paginação via query params: page e limit
   */
  async list(req, res) {
    try {
      const usuarioId = req.user.id;
      const unidadeId = req.user.unidade_id;

      // Validar se usuário tem unidade_id (Multi-Tenant)
      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          message: 'Usuário deve estar associado a uma unidade para acessar clientes'
        });
      }

      // ✅ NOVO: Extrair parâmetros de paginação
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const offset = (page - 1) * limit;

      // Extrair filtros da query string
      const filtros = {
        nome: req.query.nome || req.query.name,
        telefone: req.query.telefone || req.query.phone,
        id: req.query.id ? parseInt(req.query.id) : null,
        is_assinante: req.query.is_assinante === 'true' ? true :
                     req.query.is_assinante === 'false' ? false : null,
        status: req.query.status,
        // ✅ NOVO: Adicionar limit e offset aos filtros
        limit,
        offset
      };

      // Buscar clientes e contadores
      const [clientes, contadores] = await Promise.all([
        this.clienteModel.findByUnidade(unidadeId, filtros),
        this.clienteModel.countByUnidade(unidadeId, filtros)
      ]);

      const clienteIds = clientes.map(c => c.id).filter(Boolean);
      const renovacoesRows = clienteIds.length > 0
        ? await db('assinatura_renovacoes')
          .whereIn('cliente_id', clienteIds)
          .distinct('cliente_id')
        : [];
      const clientesComRenovacao = new Set((renovacoesRows || []).map(r => r.cliente_id));

      // Formatar dados para o frontend

      const clientesFormatados = clientes.map(cliente => ({
        id: cliente.id,
        name: `${cliente.primeiro_nome} ${cliente.ultimo_nome}`.trim(),
        firstName: cliente.primeiro_nome,
        lastName: cliente.ultimo_nome,
        phone: cliente.telefone,
        birthDate: cliente.data_nascimento,
        isSubscriber: cliente.is_assinante,
        exigeSinalExcecao: Boolean(cliente.exige_sinal_excecao),
        assinaturaStatus: (cliente.is_assinante && !clientesComRenovacao.has(cliente.id))
          ? 'Pagamento Pendente'
          : cliente.assinatura_status,
        subscriptionStartDate: cliente.data_inicio_assinatura,
        subscriptionPlanId: cliente.assinatura_plano_id,
        status: cliente.status,
        whatsappId: cliente.whatsapp_id,
        createdAt: cliente.created_at,
        updatedAt: cliente.updated_at,
        saldoPontos: Number(cliente.saldo_pontos || 0),
        pontosDisponiveis: Number(cliente.saldo_pontos || 0),
        // Campos calculados para compatibilidade com frontend existente
        totalApps: 0, // TODO: Implementar contagem de agendamentos
        nextAppStatus: 'n/a',
        timeToNext: 'n/a',
        socialAlert: cliente.is_assinante
      }));

      // ✅ NOVO: Calcular informações de paginação
      const totalPages = Math.ceil(contadores.total / limit);

      res.status(200).json({
        success: true,
        data: clientesFormatados,
        meta: {
          total: contadores.total,
          subscribers: contadores.assinantes,
          nonSubscribers: contadores.naoAssinantes,
          filters: filtros
        },
        // ✅ NOVO: Adicionar objeto pagination
        pagination: {
          page: page,
          limit: limit,
          total: contadores.total,
          pages: totalPages
        },
        message: `${contadores.total} cliente(s) encontrado(s)`
      });

    } catch (error) {
      logger.error('❌ [ClienteController.list] Erro ao listar clientes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao listar clientes',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /api/clientes - Criar novo cliente
   */
  async create(req, res) {
    try {
      const usuarioId = req.user.id;
      const unidadeId = req.user.unidade_id;

      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          message: 'Usuário deve estar associado a uma unidade para criar clientes'
        });
      }

      // Validar dados obrigatórios
      const { primeiro_nome, telefone } = req.body;
      if (!primeiro_nome?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Primeiro nome é obrigatório'
        });
      }

      if (!telefone?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Telefone é obrigatório'
        });
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'exige_sinal_excecao') && typeof req.body.exige_sinal_excecao !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'exige_sinal_excecao deve ser boolean'
        });
      }

      // Criar cliente
      const novoCliente = await this.clienteModel.create(req.body, unidadeId);

      res.status(201).json({
        success: true,
        data: {
          id: novoCliente.id,
          name: `${novoCliente.primeiro_nome} ${novoCliente.ultimo_nome}`.trim(),
          firstName: novoCliente.primeiro_nome,
          lastName: novoCliente.ultimo_nome,
          phone: novoCliente.telefone,
          mpCustomerEmail: novoCliente.mp_customer_email,
          birthDate: novoCliente.data_nascimento,
          isSubscriber: novoCliente.is_assinante,
          exigeSinalExcecao: Boolean(novoCliente.exige_sinal_excecao),
          subscriptionStartDate: novoCliente.data_inicio_assinatura,
          subscriptionPlanId: novoCliente.assinatura_plano_id,
          status: novoCliente.status
        },
        message: 'Cliente criado com sucesso'
      });

    } catch (error) {
      logger.error('❌ [ClienteController.create] Erro ao criar cliente:', error);

      // Tratar erros específicos
      if (error.message.includes('telefone nesta unidade')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao criar cliente',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /api/clientes/:id - Buscar cliente específico
   */
  async show(req, res) {
    try {
      const clienteId = parseInt(req.params.id);
      const unidadeId = req.user.unidade_id;

      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          message: 'Usuário deve estar associado a uma unidade'
        });
      }

      if (!clienteId || isNaN(clienteId)) {
        return res.status(400).json({
          success: false,
          message: 'ID do cliente inválido'
        });
      }

      const cliente = await this.clienteModel.findByIdAndUnidade(clienteId, unidadeId);

      if (!cliente) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: cliente.id,
          name: `${cliente.primeiro_nome} ${cliente.ultimo_nome}`.trim(),
          firstName: cliente.primeiro_nome,
          lastName: cliente.ultimo_nome,
          phone: cliente.telefone,
          mpCustomerEmail: cliente.mp_customer_email,
          birthDate: cliente.data_nascimento,
          isSubscriber: cliente.is_assinante,
          exigeSinalExcecao: Boolean(cliente.exige_sinal_excecao),
          assinaturaStatus: cliente.assinatura_status,
          subscriptionStartDate: cliente.data_inicio_assinatura,
          subscriptionPlanId: cliente.assinatura_plano_id,
          status: cliente.status,
          whatsappId: cliente.whatsapp_id,
          createdAt: cliente.created_at,
          updatedAt: cliente.updated_at
        },
        message: 'Cliente encontrado'
      });

    } catch (error) {
      logger.error('❌ [ClienteController.show] Erro ao buscar cliente:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao buscar cliente',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * PUT /api/clientes/:id - Atualizar cliente
   */
  async update(req, res) {
    try {
      const clienteId = parseInt(req.params.id);
      const unidadeId = req.user.unidade_id;

      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          message: 'Usuário deve estar associado a uma unidade'
        });
      }

      if (!clienteId || isNaN(clienteId)) {
        return res.status(400).json({
          success: false,
          message: 'ID do cliente inválido'
        });
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'exige_sinal_excecao') && typeof req.body.exige_sinal_excecao !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'exige_sinal_excecao deve ser boolean'
        });
      }

      // Atualizar cliente
      const clienteAtualizado = await this.clienteModel.update(clienteId, req.body, unidadeId);

      res.status(200).json({
        success: true,
        data: {
          id: clienteAtualizado.id,
          name: `${clienteAtualizado.primeiro_nome} ${clienteAtualizado.ultimo_nome}`.trim(),
          firstName: clienteAtualizado.primeiro_nome,
          lastName: clienteAtualizado.ultimo_nome,
          phone: clienteAtualizado.telefone,
          mpCustomerEmail: clienteAtualizado.mp_customer_email,
          birthDate: clienteAtualizado.data_nascimento,
          isSubscriber: clienteAtualizado.is_assinante,
          exigeSinalExcecao: Boolean(clienteAtualizado.exige_sinal_excecao),
          assinaturaStatus: clienteAtualizado.assinatura_status,
          subscriptionStartDate: clienteAtualizado.data_inicio_assinatura,
          subscriptionPlanId: clienteAtualizado.assinatura_plano_id,
          status: clienteAtualizado.status
        },
        message: 'Cliente atualizado com sucesso'
      });

    } catch (error) {
      logger.error('❌ [ClienteController.update] Erro ao atualizar cliente:', error);

      // Tratar erros específicos
      if (error.message.includes('não encontrado') || error.message.includes('telefone nesta unidade')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao atualizar cliente',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * DELETE /api/clientes/:id - Excluir cliente (soft delete)
   */
  async delete(req, res) {
    try {
      const clienteId = parseInt(req.params.id);
      const unidadeId = req.user.unidade_id;

      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          message: 'Usuário deve estar associado a uma unidade'
        });
      }

      if (!clienteId || isNaN(clienteId)) {
        return res.status(400).json({
          success: false,
          message: 'ID do cliente inválido'
        });
      }

      // [ELITE-PHASE-1] Trava de integridade: verificar agendamentos futuros ativos
      const agendamentosFuturos = await this.clienteModel.db('agendamentos')
        .where('cliente_id', clienteId)
        .where('data_agendamento', '>=', this.clienteModel.db.fn.now())
        .whereIn('status', ['Aprovado', 'confirmado', 'pendente'])
        .whereNull('deleted_at')
        .count('id as total')
        .first();

      const totalAgendamentosFuturos = parseInt(agendamentosFuturos?.total || 0);

      if (totalAgendamentosFuturos > 0) {
        return res.status(409).json({
          success: false,
          error: '[INTEGRIDADE] Não é possível excluir cliente com agendamentos futuros confirmados',
          message: `Este cliente possui ${totalAgendamentosFuturos} agendamento(s) futuro(s) confirmado(s). Cancele os agendamentos antes de excluir.`,
          data: {
            agendamentos_futuros: totalAgendamentosFuturos
          }
        });
      }

      const sucesso = await this.clienteModel.delete(clienteId, unidadeId);

      if (!sucesso) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Cliente excluído com sucesso'
      });

    } catch (error) {
      logger.error('❌ [ClienteController.delete] Erro ao excluir cliente:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor ao excluir cliente',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /api/clientes/agendamento - Criar cliente rápido para agendamento
   */
  async createForAgendamento(req, res) {
    try {
      const unidadeId = req.user.unidade_id;
      const { telefone, nome } = req.body;

      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          message: 'Usuário deve estar associado a uma unidade'
        });
      }

      if (!telefone || !nome) {
        return res.status(400).json({
          success: false,
          message: 'Telefone e nome são obrigatórios'
        });
      }

      const cliente = await this.clienteModel.findOrCreateForAgendamento(telefone, nome, unidadeId);

      res.status(200).json({
        success: true,
        data: {
          id: cliente.id,
          name: `${cliente.primeiro_nome} ${cliente.ultimo_nome}`.trim(),
          phone: cliente.telefone,
          birthDate: cliente.data_nascimento,
          isSubscriber: cliente.is_assinante
        },
        message: 'Cliente encontrado/criado para agendamento'
      });

    } catch (error) {
      logger.error('❌ [ClienteController.createForAgendamento] Erro ao criar cliente para agendamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /api/clientes/:id/pontos - Buscar pontos disponíveis de um cliente
   * Query params: unidade_id (obrigatório)
   */
  async getPontos(req, res) {
    try {
      const clienteId = parseInt(req.params.id);
      const unidadeId = parseInt(req.query.unidade_id);

      if (!clienteId || isNaN(clienteId)) {
        return res.status(400).json({
          success: false,
          message: 'ID do cliente inválido'
        });
      }

      if (!unidadeId || isNaN(unidadeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID da unidade é obrigatório'
        });
      }

      // Calcular pontos disponíveis
      const pontosDisponiveis = await this.clienteModel.calcularPontosDisponiveis(clienteId, unidadeId);

      // Verificar se é o primeiro agendamento
      const isPrimeiroAgendamento = await this.clienteModel.isPrimeiroAgendamento(clienteId, unidadeId);

      res.status(200).json({
        success: true,
        pontos_disponiveis: pontosDisponiveis,
        is_primeiro_agendamento: isPrimeiroAgendamento,
        pode_usar_pontos: !isPrimeiroAgendamento, // Só pode usar pontos se NÃO for o primeiro
        message: `Cliente tem ${pontosDisponiveis} pontos disponíveis`
      });

    } catch (error) {
      logger.error('❌ [ClienteController.getPontos] Erro ao buscar pontos do cliente:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async getAssinaturaSaldo(req, res) {
    try {
      const clienteId = parseInt(req.params.id, 10);
      const unidadeId = parseInt(req.query?.unidade_id, 10);
      const { data_referencia, servico_ids, servico_extra_ids } = req.query;

      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          message: 'unidade_id é obrigatório'
        });
      }

      if (!clienteId || Number.isNaN(clienteId)) {
        return res.status(400).json({
          success: false,
          message: 'ID do cliente inválido'
        });
      }

      const unidade = await db('unidades')
        .where('id', unidadeId)
        .select('id', 'usuario_id', 'status')
        .first();

      if (!unidade || unidade.status !== 'Ativo') {
        return res.status(404).json({
          success: false,
          message: 'Unidade não encontrada'
        });
      }

      const cliente = await db('clientes')
        .leftJoin('unidades as u', 'clientes.unidade_id', 'u.id')
        .where('clientes.id', clienteId)
        .where('u.usuario_id', unidade.usuario_id)
        .select(
          'clientes.id',
          'clientes.primeiro_nome',
          'clientes.ultimo_nome',
          'clientes.telefone',
          'clientes.data_nascimento',
          'clientes.is_assinante',
          'clientes.assinatura_status',
          'clientes.data_inicio_assinatura',
          'clientes.assinatura_plano_id',
          'clientes.status',
          'clientes.unidade_id'
        )
        .first();

      const result = await this.assinaturaSaldoService.compute({
        cliente,
        unidadeUsuarioId: unidade.usuario_id,
        unidadeId,
        dataReferencia: data_referencia ? String(data_referencia) : null,
        servicoIds: servico_ids,
        servicoExtraIds: servico_extra_ids
      });

      return res.json(result);
    } catch (error) {
      logger.error('❌ [ClienteController.getAssinaturaSaldo] Erro ao buscar saldo de assinatura:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = ClienteController;

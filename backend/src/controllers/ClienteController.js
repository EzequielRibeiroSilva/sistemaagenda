const Cliente = require('../models/Cliente');
const logger = require('./../utils/logger');
const { db } = require('../config/knex');
const PlanoAssinatura = require('../models/PlanoAssinatura');

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

      // Calcular pontos disponíveis para cada cliente (em paralelo)
      const clientesComPontos = await Promise.all(
        clientes.map(async (cliente) => {
          const pontosDisponiveis = await this.clienteModel.calcularPontosDisponiveis(cliente.id, unidadeId);
          return { ...cliente, pontos_disponiveis: pontosDisponiveis };
        })
      );

      // Formatar dados para o frontend
      const clientesFormatados = clientesComPontos.map(cliente => ({
        id: cliente.id,
        name: `${cliente.primeiro_nome} ${cliente.ultimo_nome}`.trim(),
        firstName: cliente.primeiro_nome,
        lastName: cliente.ultimo_nome,
        phone: cliente.telefone,
        birthDate: cliente.data_nascimento,
        isSubscriber: cliente.is_assinante,
        subscriptionStartDate: cliente.data_inicio_assinatura,
        subscriptionPlanId: cliente.assinatura_plano_id,
        status: cliente.status,
        whatsappId: cliente.whatsapp_id,
        createdAt: cliente.created_at,
        updatedAt: cliente.updated_at,
        pontosDisponiveis: cliente.pontos_disponiveis || 0, // Pontos disponíveis do cliente
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
          birthDate: novoCliente.data_nascimento,
          isSubscriber: novoCliente.is_assinante,
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
          birthDate: cliente.data_nascimento,
          isSubscriber: cliente.is_assinante,
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
          birthDate: clienteAtualizado.data_nascimento,
          isSubscriber: clienteAtualizado.is_assinante,
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
      const unidadeId = req.user?.unidade_id;

      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          message: 'Usuário deve estar associado a uma unidade'
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
          'clientes.data_inicio_assinatura',
          'clientes.assinatura_plano_id',
          'clientes.status',
          'clientes.unidade_id'
        )
        .first();

      if (!cliente || !cliente.is_assinante || !cliente.assinatura_plano_id || !cliente.data_inicio_assinatura || cliente.status !== 'Ativo') {
        return res.json({
          success: true,
          data: {
            cliente: cliente
              ? {
                  id: cliente.id,
                  nome: `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim(),
                  telefone: cliente.telefone,
                  data_nascimento: cliente.data_nascimento,
                  is_assinante: Boolean(cliente.is_assinante)
                }
              : null,
            assinatura_ativa: false,
            plano: null,
            ciclo: null,
            saldos: []
          }
        });
      }

      const plano = await db('planos_assinatura')
        .where('id', cliente.assinatura_plano_id)
        .where('usuario_id', unidade.usuario_id)
        .where('status', 'Ativo')
        .select('id', 'nome', 'validade_dias')
        .first();

      if (!plano) {
        return res.json({
          success: true,
          data: {
            cliente: {
              id: cliente.id,
              nome: `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim(),
              telefone: cliente.telefone,
              data_nascimento: cliente.data_nascimento,
              is_assinante: Boolean(cliente.is_assinante)
            },
            assinatura_ativa: false,
            plano: null,
            ciclo: null,
            saldos: []
          }
        });
      }

      const validadeDias = parseInt(plano.validade_dias, 10) || 31;
      const tz = 'America/Sao_Paulo';
      const referencia = this.getDateStrInTimeZone(tz);

      const dataInicioAssinaturaStr = this.normalizeDateStr(cliente.data_inicio_assinatura);
      if (!dataInicioAssinaturaStr) {
        return res.json({
          success: true,
          data: {
            cliente: {
              id: cliente.id,
              nome: `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim(),
              telefone: cliente.telefone,
              data_nascimento: cliente.data_nascimento,
              is_assinante: Boolean(cliente.is_assinante),
              data_inicio_assinatura: cliente.data_inicio_assinatura,
              assinatura_plano_id: cliente.assinatura_plano_id
            },
            assinatura_ativa: false,
            plano: null,
            ciclo: null,
            saldos: []
          }
        });
      }

      const { cycleStart, cycleEndExclusive, cycleEndInclusive, cycleIndex } = this.getCycleBounds({
        startDateStr: dataInicioAssinaturaStr,
        validadeDias,
        referenceDateStr: referencia
      });

      const itens = await this.planoAssinaturaModel.findItens(plano.id);
      const itemIds = (itens || []).map(i => i.id);

      const servicoIds = (itens || [])
        .filter(i => i.tipo === 'SERVICO' && i.servico_id)
        .map(i => parseInt(i.servico_id, 10))
        .filter(n => Number.isFinite(n));

      const extraIds = (itens || [])
        .filter(i => i.tipo === 'EXTRA' && i.servico_extra_id)
        .map(i => parseInt(i.servico_extra_id, 10))
        .filter(n => Number.isFinite(n));

      const [servicos, extras] = await Promise.all([
        servicoIds.length > 0
          ? db('servicos').whereIn('id', servicoIds).select('id', 'nome')
          : Promise.resolve([]),
        extraIds.length > 0
          ? db('servicos_extras').whereIn('id', extraIds).select('id', 'nome')
          : Promise.resolve([])
      ]);

      const servicoNomeById = (servicos || []).reduce((acc, row) => {
        acc[String(row.id)] = row.nome;
        return acc;
      }, {});

      const extraNomeById = (extras || []).reduce((acc, row) => {
        acc[String(row.id)] = row.nome;
        return acc;
      }, {});

      let usadosRows = [];
      if (itemIds.length > 0) {
        usadosRows = await db('assinatura_usos')
          .where('cliente_id', cliente.id)
          .whereIn('plano_item_id', itemIds)
          .where('data_uso', '>=', cycleStart)
          .where('data_uso', '<', cycleEndExclusive)
          .groupBy('plano_item_id')
          .select('plano_item_id')
          .sum({ total: 'quantidade' });
      }

      const usadosByItemId = (usadosRows || []).reduce((acc, row) => {
        const id = String(row.plano_item_id);
        acc[id] = parseInt(row.total, 10) || 0;
        return acc;
      }, {});

      const saldos = (itens || []).map(i => {
        const usados = usadosByItemId[String(i.id)] || 0;
        const quota = i.quantidade_por_ciclo === null || i.quantidade_por_ciclo === undefined
          ? null
          : parseInt(i.quantidade_por_ciclo, 10);
        const restante = quota === null ? null : Math.max(0, quota - usados);

        let nomeItem = null;
        if (i.tipo === 'SERVICO' && i.servico_id) {
          nomeItem = servicoNomeById[String(i.servico_id)] || null;
        }
        if (i.tipo === 'EXTRA' && i.servico_extra_id) {
          nomeItem = extraNomeById[String(i.servico_extra_id)] || null;
        }

        return {
          plano_item_id: i.id,
          tipo: i.tipo,
          servico_id: i.servico_id,
          servico_extra_id: i.servico_extra_id,
          nome: nomeItem,
          quantidade_por_ciclo: quota,
          usados,
          restantes: restante
        };
      });

      return res.json({
        success: true,
        data: {
          cliente: {
            id: cliente.id,
            nome: `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim(),
            telefone: cliente.telefone,
            data_nascimento: cliente.data_nascimento,
            is_assinante: Boolean(cliente.is_assinante),
            data_inicio_assinatura: cliente.data_inicio_assinatura,
            assinatura_plano_id: cliente.assinatura_plano_id
          },
          assinatura_ativa: true,
          plano: {
            id: plano.id,
            nome: plano.nome,
            validade_dias: validadeDias
          },
          ciclo: {
            referencia,
            inicio: cycleStart,
            fim: cycleEndInclusive,
            indice: cycleIndex
          },
          saldos
        }
      });
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

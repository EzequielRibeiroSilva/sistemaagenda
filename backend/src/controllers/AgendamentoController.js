const BaseController = require('./BaseController');
const Agendamento = require('../models/Agendamento');
const WhatsAppService = require('../services/WhatsAppService'); // 
const AuthService = require('../services/AuthService');
const logger = require('../utils/logger');
const RecurringAppointmentService = require('../services/RecurringAppointmentService');
const ScheduledReminderService = require('../services/ScheduledReminderService');
const BookingAvailabilityService = require('../services/BookingAvailabilityService');
const AssinaturaSaldoService = require('../services/AssinaturaSaldoService');
const AssinaturaEstornoService = require('../services/AssinaturaEstornoService');
const AgendamentoConclusaoService = require('../services/AgendamentoConclusaoService');
const InventoryService = require('../services/InventoryService');
const { assertPeriodoAberto, parseYmdToLocalDate } = require('../utils/periodLock');
const CreateAppointmentUseCase = require('../useCases/CreateAppointmentUseCase');

const toCents = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
};

class AgendamentoController extends BaseController {
  constructor() {
    super(new Agendamento());
    this.whatsAppService = new WhatsAppService(); // 
    this.authService = new AuthService();
    this.scheduledReminderService = new ScheduledReminderService();
    this.bookingAvailabilityService = new BookingAvailabilityService();
    this.assinaturaEstornoService = new AssinaturaEstornoService();
    this.agendamentoConclusaoService = new AgendamentoConclusaoService({ db: this.model.db });
  }

  // GET /api/agendamentos/numero/:numero - Buscar agendamento pelo número visível (com RBAC)
  async showByNumero(req, res) {
    try {
      const numero = parseInt(req.params.numero, 10);
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;
      let usuarioId = req.user?.id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!Number.isFinite(numero)) {
        return res.status(400).json({
          success: false,
          error: 'Número inválido'
        });
      }

      // --- RBAC ---
      let agendamentoQuery = this.model.db(this.model.tableName)
        .where('agendamentos.numero_agendamento', numero);

      if (userRole === 'AGENTE' && userAgenteId) {
        // AGENTE: só consegue encontrar seus próprios agendamentos
        agendamentoQuery = agendamentoQuery.where('agendamentos.agente_id', userAgenteId);
      } else if (userRole === 'ADMIN' || userRole === 'MASTER') {
        // ADMIN/MASTER: buscar dentro da empresa (usuario_id dono)
        // obs: agendamentos.usuario_id já está materializado na tabela
        agendamentoQuery = agendamentoQuery.where('agendamentos.usuario_id', usuarioId);
      } else {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }

      const agendamento = await agendamentoQuery.select('agendamentos.*').first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado ou acesso negado'
        });
      }

      const agendamentoCompleto = await this.model.findWithServicos(agendamento.id);

      return res.json({
        success: true,
        data: agendamentoCompleto
      });
    } catch (error) {
      logger.error(' [AgendamentoController.showByNumero] Erro ao buscar agendamento:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/agendamentos - Buscar agendamentos do usuário logado
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      const {
        page,
        limit,
        data_agendamento,
        agente_id,
        cliente_id,
        status,
        unidade_id,
        time_filter,
        // CORREÇÃO CRÍTICA: Adicionar filtros de período e serviço
        data_inicio,
        data_fim,
        servico_id
      } = req.query;

      let data;

      if (data_agendamento) {
        // CORREÇÃO CRÍTICA: Para AGENTE, filtrar por agente_id diretamente
        if (userRole === 'AGENTE') {
          // Para AGENTE, usar sempre req.user.agente_id (id da tabela agentes)
          // Fallback: se token não tiver agente_id, buscar na tabela agentes por usuario_id
          let agenteIdFinal = userAgenteId;
          if (!agenteIdFinal) {
            logger.warn(` [AgendamentoController] AGENTE sem agente_id no token, buscando na tabela agentes...`);
            const agenteRecord = await this.model.db('agentes')
              .where('usuario_id', usuarioId)
              .select('id')
              .first();
            agenteIdFinal = agenteRecord?.id;
          }

          if (agenteIdFinal) {
            const allAgendamentos = await this.model.findByAgente(agenteIdFinal);

            // Filtrar apenas pela data específica
            data = allAgendamentos.filter(agendamento => {
              const agendamentoDate = new Date(agendamento.data_agendamento);
              const dateString = agendamentoDate instanceof Date
                ? agendamentoDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
                : agendamentoDate;
              return dateString === data_agendamento;
            });
          } else {
            logger.error(` [AgendamentoController] AGENTE não encontrado para usuario_id=${usuarioId}`);
            data = [];
          }
        } else {
          // Para ADMIN/MASTER, usar o método original
          data = await this.model.findByData(data_agendamento, usuarioId);
        }
      } else if (agente_id && !unidade_id && !page && !limit && !data_inicio && !data_fim) {
        // CORREÇÃO CRÍTICA: Este bloco só deve ser executado quando:
        // - Tem APENAS agente_id (sem page/limit, sem data_inicio/data_fim, sem unidade_id)
        // - Isso evita bloquear requests legítimos de AGENTE com filtros de período
        
        // CORREÇÃO CRÍTICA: Multi-tenant safety: nunca permitir que query param bypass o isolamento
        if (userRole === 'MASTER') {
          data = await this.model.findByAgente(parseInt(agente_id));
        } else if (userRole === 'ADMIN') {
          data = await this.model.findByAgente(parseInt(agente_id), usuarioId);

          if (Array.isArray(data) && data.length === 0) {
            const agenteExisteEmOutroTenant = await this.model.db('agentes')
              .leftJoin('unidades', 'agentes.unidade_id', 'unidades.id')
              .where('agentes.id', parseInt(agente_id))
              .where(function() {
                this.whereNotNull('unidades.usuario_id')
                  .whereNot('unidades.usuario_id', usuarioId);
              })
              .select('agentes.id', 'unidades.usuario_id')
              .first();

            if (agenteExisteEmOutroTenant) {
              logger.warn(` [AgendamentoController.index] Tentativa suspeita: ADMIN usuario_id=${usuarioId} consultou agendamentos por agente_id=${agente_id} de outro tenant`);
            }
          }
        } else {
          // CORREÇÃO: AGENTE não pode usar APENAS agente_id isolado, mas pode usar com data_inicio/data_fim
          return res.status(403).json({ error: 'Acesso negado' });
        }
      } else if (cliente_id && !unidade_id && !page && !limit && !data_inicio && !data_fim) {
        // CORREÇÃO CRÍTICA: Este bloco só deve ser executado quando:
        // - Tem APENAS cliente_id (sem page/limit, sem data_inicio/data_fim, sem unidade_id)
        // - Isso evita bloquear requests legítimos com filtros de período
        
        // CORREÇÃO CRÍTICA: Multi-tenant safety: nunca permitir que query param bypass o isolamento
        if (userRole === 'MASTER') {
          data = await this.model.findByCliente(parseInt(cliente_id));
        } else if (userRole === 'ADMIN') {
          data = await this.model.findByCliente(parseInt(cliente_id), usuarioId);

          if (Array.isArray(data) && data.length === 0) {
            const clienteExisteEmOutroTenant = await this.model.db('clientes')
              .join('unidades', 'clientes.unidade_id', 'unidades.id')
              .where('clientes.id', parseInt(cliente_id))
              .whereNot('unidades.usuario_id', usuarioId)
              .select('clientes.id', 'unidades.usuario_id')
              .first();

            if (clienteExisteEmOutroTenant) {
              logger.warn(` [AgendamentoController.index] Tentativa suspeita: ADMIN usuario_id=${usuarioId} consultou agendamentos por cliente_id=${cliente_id} de outro tenant`);
            }
          }
        } else {
          // CORREÇÃO: Bloquear apenas uso isolado de cliente_id
          return res.status(403).json({ error: 'Acesso negado' });
        }
      } else if (page && limit) {
        // Para paginação, precisamos filtrar por usuário através das unidades
        const filters = {};
        if (status) filters.status = status;

        // Buscar agendamentos do usuário com paginação
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // IMPLEMENTAÇÃO RBAC E ORDENAÇÃO INTELIGENTE
        // CORREÇÃO: Removido JOIN com agente_unidades que excluía agendamentos de agentes
        // que pertencem à unidade apenas via coluna agentes.unidade_id (não via M:N)
        let baseQuery = this.model.db(this.model.tableName)
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
          .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
          .join('agentes', 'agendamentos.agente_id', 'agentes.id')
          .whereNull('agendamentos.deleted_at')
          .whereNull('clientes.deleted_at')
          .whereNull('agentes.deleted_at');

        // RBAC: Aplicar filtros baseados no role do usuário
        let agenteIdFinal = null;
        if (req.user?.role === 'AGENTE') {
          // Para AGENTE, usar sempre req.user.agente_id (id da tabela agentes)
          // Fallback: se token não tiver agente_id, buscar na tabela agentes por usuario_id
          agenteIdFinal = userAgenteId;
          if (!agenteIdFinal) {
            logger.warn(` [AgendamentoController] AGENTE sem agente_id no token (paginação), buscando na tabela agentes...`);
            const agenteRecord = await this.model.db('agentes')
              .where('usuario_id', req.user.id)
              .select('id')
              .first();
            agenteIdFinal = agenteRecord?.id;
          }

          if (agenteIdFinal) {
            baseQuery = baseQuery.where('agendamentos.agente_id', agenteIdFinal);
          } else {
            // Se não encontrou agente, retornar vazio
            logger.error(` [AgendamentoController] AGENTE não encontrado para usuario_id=${req.user.id} (paginação)`);
            return res.json({
              data: [],
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: 0,
                pages: 0
              }
            });
          }
        } else {
          // ADMIN/MASTER: Ver todos da unidade
          baseQuery = baseQuery.where('unidades.usuario_id', usuarioId);
        }

        // Aplicar filtros adicionais
        baseQuery = baseQuery.modify(function(queryBuilder) {
          if (status) {
            queryBuilder.where('agendamentos.status', status);
          }

          // CORREÇÃO: Filtrar por unidade_id se fornecido
          if (unidade_id) {
            queryBuilder.where('agendamentos.unidade_id', parseInt(unidade_id));
          }

          // CORREÇÃO: Filtro temporal (futuro/passado/hoje)
          if (time_filter) {

            const now = new Date();
            const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
            const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS


            switch (time_filter) {
              case 'soon': // Próximo/Agora (hoje que ainda não passou + futuro)
                queryBuilder.where(function() {
                  this.where('agendamentos.data_agendamento', '>', today)
                      .orWhere(function() {
                        this.where('agendamentos.data_agendamento', '=', today)
                            .where('agendamentos.hora_inicio', '>=', currentTime);
                      });
                });
                break;
              case 'overdue': // Passado (dias passados + hoje que já passou)
                queryBuilder.where(function() {
                  this.where('agendamentos.data_agendamento', '<', today)
                      .orWhere(function() {
                        this.where('agendamentos.data_agendamento', '=', today)
                            .where('agendamentos.hora_fim', '<', currentTime);
                      });
                });
                break;
              case 'pending': // Futuro (apenas dias futuros, não inclui hoje)
                queryBuilder.where('agendamentos.data_agendamento', '>', today);
                break;
              case 'today': // Apenas hoje
                queryBuilder.where('agendamentos.data_agendamento', '=', today);
                break;
            }
          }

          // CORREÇÃO CRÍTICA: REMOVER filtro de agendamentos passados
          // Todos os agendamentos do dia devem ser exibidos para permitir edição
          // O usuário pode editar agendamentos no final do expediente
          // Comentado o filtro que estava ocultando agendamentos passados:
          /*
          if (!status) {
            queryBuilder.where(function() {
              this.where('agendamentos.data_agendamento', '>', this.client.raw('CURRENT_DATE'))
                  .orWhere(function() {
                    this.where('agendamentos.data_agendamento', '=', this.client.raw('CURRENT_DATE'))
                        .where('agendamentos.hora_fim', '>', this.client.raw('CURRENT_TIME'));
                  });
            });
          }
          */
        });

        const dataQuery = baseQuery.clone();

        data = await dataQuery
          .select(
            'agendamentos.*',
            this.model.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
            'clientes.telefone as cliente_telefone',
            'clientes.data_nascimento as cliente_data_nascimento',
            this.model.db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome"),
            'agentes.avatar_url as agente_avatar_url', // CORREÇÃO CRÍTICA: Incluir avatar do agente
            'unidades.nome as unidade_nome'
          )
          .limit(parseInt(limit))
          .offset(offset)
          // CORREÇÃO: ORDENAÇÃO INTELIGENTE: Agendamentos mais próximos da data atual primeiro
          // Ordena por proximidade: futuros próximos > hoje > passados recentes
          // Correção: usar diferença de dias (INTEGER) ao invés de EPOCH
          .orderBy(this.model.db.raw("ABS(agendamentos.data_agendamento - CURRENT_DATE)"), 'asc')
          .orderBy('agendamentos.data_agendamento', 'desc')
          .orderBy('agendamentos.hora_inicio', 'asc');

        await this.model.attachServicosAndExtras(data, { includeComissao: true, includeExtras: true });
        await this.model.attachAssinaturaCobertura(data);

        const total = await baseQuery.clone()
          .clearSelect()
          .clearOrder()
          .countDistinct('agendamentos.id as count')
          .first();

        return res.json({
          data,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(total.count),
            pages: Math.ceil(parseInt(total.count) / parseInt(limit))
          }
        });
      } else {
        // CORREÇÃO CRÍTICA: Implementar filtros de período, agente e serviço

        // Construir query base com RBAC
        // CORREÇÃO: Removido JOIN com agente_unidades que excluía agendamentos de agentes
        // que pertencem à unidade apenas via coluna agentes.unidade_id (não via M:N)
        let baseQuery = this.model.db('agendamentos')
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
          .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
          .join('agentes', 'agendamentos.agente_id', 'agentes.id')
          .whereNull('agendamentos.deleted_at');

        // Aplicar RBAC
        if (userRole === 'AGENTE') {
          // AGENTE: Buscar o agente_id através da tabela agentes
          const agenteRecord = await this.model.db('agentes')
            .where('usuario_id', usuarioId)
            .select('id')
            .first();

          if (agenteRecord) {
            baseQuery = baseQuery.where('agendamentos.agente_id', agenteRecord.id);
          } else {
            return res.json({ data: [] });
          }
        } else {
          // ADMIN/MASTER: Ver todos da unidade
          baseQuery = baseQuery.where('unidades.usuario_id', usuarioId);
        }

        // CORREÇÃO CRÍTICA: APLICAR FILTROS DE PERÍODO
        if (data_inicio && data_fim) {
          baseQuery = baseQuery
            .where('agendamentos.data_agendamento', '>=', data_inicio)
            .where('agendamentos.data_agendamento', '<=', data_fim);
        }

        // CORREÇÃO CRÍTICA: APLICAR FILTRO DE UNIDADE
        if (unidade_id) {
          baseQuery = baseQuery.where('agendamentos.unidade_id', parseInt(unidade_id));
        }

        // CORREÇÃO CRÍTICA: APLICAR FILTRO DE AGENTE
        if (agente_id) {
          baseQuery = baseQuery.where('agendamentos.agente_id', parseInt(agente_id));
        }

        // CORREÇÃO CRÍTICA: APLICAR FILTRO DE SERVIÇO
        if (servico_id) {
          // Evitar duplicação de linhas (1 agendamento pode ter múltiplos serviços)
          // e manter a query eficiente usando EXISTS em vez de JOIN
          baseQuery = baseQuery.whereExists(function() {
            this.select(1)
              .from('agendamento_servicos')
              .whereRaw('agendamento_servicos.agendamento_id = agendamentos.id')
              .where('agendamento_servicos.servico_id', parseInt(servico_id));
          });
        }

        // Executar query
        data = await baseQuery
          .select(
            'agendamentos.*',
            this.model.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
            'clientes.telefone as cliente_telefone',
            'clientes.data_nascimento as cliente_data_nascimento',
            this.model.db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome"),
            'agentes.avatar_url as agente_avatar_url',
            'unidades.nome as unidade_nome'
          )
          .orderBy('agendamentos.data_agendamento', 'desc')
          .orderBy('agendamentos.hora_inicio', 'asc');

        await this.model.attachServicosAndExtras(data, { includeComissao: true, includeExtras: true });
        await this.model.attachAssinaturaCobertura(data);

      }

      return res.json({ data });
    } catch (error) {
      logger.error(' [AgendamentoController.index] Erro ao buscar agendamentos:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // GET /api/agendamentos/:id - Buscar agendamento com serviços (com RBAC)
  async show(req, res) {
    try {
      const { id } = req.params;
      const agendamentoIdNum = parseInt(id, 10);
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;


      if (!Number.isFinite(agendamentoIdNum)) {
        return res.status(400).json({
          error: 'ID inválido',
          message: 'O id do agendamento deve ser um número válido.'
        });
      }

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // CORREÇÃO CRÍTICA: Para AGENTE, buscar o usuario_id do ADMIN que o criou
      if (userRole === 'AGENTE' && userAgenteId) {
        const Agente = require('../models/Agente');
        const agenteModel = new Agente();
        const agente = await agenteModel.findById(userAgenteId);

        if (agente && agente.usuario_id) {
          usuarioId = agente.usuario_id;
        }
      }

      const data = await this.model.findWithServicos(agendamentoIdNum);

      if (!data) {
        return res.status(404).json({
          error: 'Agendamento não encontrado'
        });
      }

      // CORREÇÃO CRÍTICA: Clube: indicar explicitamente se este agendamento teve consumo de assinatura
      try {
        await this.model.attachAssinaturaCobertura([data]);
      } catch (e) {
        // Falha ao anexar cobertura não deve bloquear o show
      }


      // CORREÇÃO CRÍTICA: Verificação de permissões específica por role
      if (userRole === 'AGENTE') {
        // Para AGENTE: verificar se o agendamento é dele
        if (userAgenteId && data.agente_id !== userAgenteId) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Agentes só podem ver seus próprios agendamentos'
          });
        }
      } else {
        // Para ADMIN/MASTER: verificar se o agendamento pertence ao usuário (através da unidade)
        const agendamento = await this.model.db(this.model.tableName)
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
          .where('agendamentos.id', agendamentoIdNum)
          .where('unidades.usuario_id', usuarioId)
          .whereNull('agendamentos.deleted_at')
          .first();


        if (!agendamento) {

          // DEBUG: Buscar informações adicionais para debug
          const debugInfo = await this.model.db(this.model.tableName)
            .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
            .where('agendamentos.id', agendamentoIdNum)
            .select('agendamentos.id', 'agendamentos.unidade_id', 'unidades.usuario_id', 'unidades.nome as unidade_nome')
            .first();


          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para ver este agendamento'
          });
        }
      }

      // ✅ PDV (E2E): anexar produtos vendidos e pagamentos (para reabrir agendamento concluído)
      try {
        let produtosVendidos = [];
        try {
          produtosVendidos = await this.model.db('agendamento_produtos as ap')
            .leftJoin('produtos as p', 'ap.produto_id', 'p.id')
            .where('ap.agendamento_id', agendamentoIdNum)
            .select(
              'ap.produto_id',
              'ap.quantidade',
              'ap.preco_aplicado',
              'ap.agente_id',
              'p.nome as produto_nome'
            );
        } catch (err) {
          // Se a tabela não existir em algum ambiente, não quebrar o show
          if (!(err && (err.code === '42P01' || String(err.message || '').includes('agendamento_produtos')))) {
            throw err;
          }
          produtosVendidos = [];
        }

        let vendaId = data?.venda_id ? Number(data.venda_id) : null;
        if (!vendaId) {
          try {
            const vendaRow = await this.model.db('vendas')
              .where('agendamento_id', agendamentoIdNum)
              .select('id')
              .first();
            vendaId = vendaRow?.id ? Number(vendaRow.id) : null;
          } catch (err) {
            if (!(err && (err.code === '42P01' || String(err.message || '').includes('vendas')))) {
              throw err;
            }
            vendaId = null;
          }
        }

        let pagamentos = [];
        if (vendaId) {
          try {
            pagamentos = await this.model.db('venda_pagamentos')
              .where('venda_id', vendaId)
              .orderBy('id', 'asc')
              .select('metodo', 'valor');
          } catch (err) {
            if (!(err && (err.code === '42P01' || String(err.message || '').includes('venda_pagamentos')))) {
              throw err;
            }
            pagamentos = [];
          }
        }

        data.produtos_vendidos = (produtosVendidos || []).map((p) => ({
          produto_id: p.produto_id,
          nome: p.produto_nome,
          quantidade: Number(p.quantidade),
          preco_aplicado: Number(p.preco_aplicado),
          agente_id: p.agente_id
        }));

        data.pagamentos = (pagamentos || []).map((p) => ({
          metodo: p.metodo,
          valor: Number(p.valor)
        }));
      } catch (e) {
        // Não bloquear a visualização do agendamento por falha de hidratação do PDV
      }

      return res.json({
        success: true,
        data: data
      });
    } catch (error) {
      logger.error(' [AgendamentoController.show] Erro no show:', error);
      return res.status(500).json({
        error: 'Interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/agendamentos - Criar novo agendamento
  async store(req, res) {
    try {
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      if (userRole === 'AGENTE' && userAgenteId && req.body?.unidade_id) {
        const unidadeInfo = await this.model.db('unidades')
          .where('id', req.body.unidade_id)
          .select('usuario_id')
          .first();

        if (unidadeInfo?.usuario_id) {
          usuarioId = unidadeInfo.usuario_id;
        }
      }

      const data = {
        unidadeId: req.body.unidade_id,
        agenteId: req.body.agente_id,
        clienteId: req.body.cliente_id,
        clienteTelefone: req.body.cliente_telefone,
        servicos: req.body.servico_ids || req.body.servicos,
        servicoExtraIds: req.body.servico_extra_ids,
        dataAgendamento: req.body.data_agendamento,
        horaInicio: req.body.hora_inicio,
        horaFim: req.body.hora_fim,
        recorrencia: req.body.recorrencia,
        suppressNotification: false
      };

      const context = { usuarioId };
      const resultado = await CreateAppointmentUseCase.execute(data, context);
      return res.status(201).json(resultado);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  // PUT /api/agendamentos/:id - Atualizar agendamento
  async update(req, res) {
    try {
      const { id } = req.params;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;
      let usuarioId = req.user?.id; // ID do usuário logado (ADMIN ou AGENTE)
      
      
      if (!usuarioId) {
        return res.status(401).json({ 
          success: false,
          error: 'Usuário não autenticado' 
        });
      }

      // --- RBAC: FILTRO DE BUSCA POR AGENDAMENTO ---
      
      // 1. Iniciar busca
      let agendamentoQuery = this.model.db(this.model.tableName)
        .where('agendamentos.id', id)
        .whereNull('agendamentos.deleted_at');

      // 2. Aplicar filtro de escopo para encontrar o agendamento
      if (userRole === 'AGENTE' && userAgenteId) {
        // SOLUÇÃO CRÍTICA: AGENTE só pode encontrar agendamentos em seu nome.
        // Foca o filtro diretamente na coluna do agente.
        agendamentoQuery = agendamentoQuery.where('agendamentos.agente_id', userAgenteId);
      } else if (userRole === 'ADMIN' || userRole === 'MASTER') {
        // ADMIN/MASTER: Filtro pela unidade (propriedade do ADMIN)
        // Requer o join para verificar a propriedade da unidade
        agendamentoQuery = agendamentoQuery
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
          .where('unidades.usuario_id', usuarioId); // usuarioId aqui é o ID do ADMIN
      } else {
         return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
      
      const agendamento = await agendamentoQuery.select('agendamentos.*').first();


      if (!agendamento) {
        // CORREÇÃO: O 404 agora significa que o agendamento não existe DENTRO DO ESCOPO DO USUÁRIO
        return res.status(404).json({ 
          success: false,
          error: 'Agendamento não encontrado ou acesso negado' 
        });
      }

      await assertPeriodoAberto({
        unidadeId: Number(agendamento.unidade_id),
        recordDate: parseYmdToLocalDate(agendamento.data_agendamento),
        userRole,
        errorMessage: 'Período fechado: não é permitido alterar/cancelar agendamentos de meses anteriores.'
      });
      
      // A verificação de RBAC (userAgenteId && agendamento.agente_id !== userAgenteId) não é mais
      // estritamente necessária aqui, pois o filtro na query já garante o escopo,
      // mas se o usuário for ADMIN, ele já passou pelo filtro de unidade.
      // Manter apenas o filtro no SQL simplifica.

      // CORREÇÃO: Extrair apenas campos válidos da tabela agendamentos
      const {
        hora_inicio,
        hora_fim,
        agente_id,
        data_agendamento,
        servico_ids,
        servico_extra_ids,
        status,
        forma_pagamento, // Frontend envia forma_pagamento
        pagamentos,
        produtos_vendidos,
        observacoes,
        cliente_id,
        unidade_id
      } = req.body;

      // REGRA DE NEGÓCIO (FINANCEIRO):
      // - Concluído: exige método de pagamento e força status_pagamento = 'Pago'
      // - Aprovado/Cancelado/Não Compareceu: NÃO pode ter pagamento (limpar metodo_pagamento/status_pagamento)
      const statusFinal = status !== undefined ? status : agendamento.status;

      // CORREÇÃO: Mapear forma_pagamento para metodo_pagamento (nome correto na tabela)
      const dadosParaAtualizar = {};

      if (hora_inicio !== undefined) dadosParaAtualizar.hora_inicio = hora_inicio;
      if (hora_fim !== undefined) dadosParaAtualizar.hora_fim = hora_fim;
      
      // REGRA DE NEGÓCIO: AGENTE só pode atualizar seu próprio agente_id. ADMIN pode trocar.
      if (userRole === 'AGENTE' && agente_id !== undefined && agente_id !== userAgenteId) {
         return res.status(403).json({ success: false, error: 'Acesso negado: AGENTE não pode alterar agente_id' });
      } else if (agente_id !== undefined) {
         dadosParaAtualizar.agente_id = agente_id; // ADMIN pode alterar
      }
      
      if (data_agendamento !== undefined) dadosParaAtualizar.data_agendamento = data_agendamento;
      if (status !== undefined) dadosParaAtualizar.status = status;

      // REGRA DE NEGÓCIO: Pagamento só existe quando status = 'Concluído'
      if (statusFinal === 'Concluído') {
        const pagamentosRows = Array.isArray(pagamentos) ? pagamentos : [];
        const pagamentosValidos = pagamentosRows
          .map((p) => ({
            metodo: String(p?.metodo || '').trim(),
            valor: Number(p?.valor)
          }))
          .filter((p) => p.metodo && Number.isFinite(p.valor) && p.valor > 0);

        const metodoPagamentoFinal = (forma_pagamento !== undefined ? forma_pagamento : agendamento.metodo_pagamento);

        // Concluído exige método de pagamento definido
        if (!metodoPagamentoFinal) {
          return res.status(400).json({
            success: false,
            error: 'Pagamento obrigatório',
            message: 'Para finalizar como Concluído, é obrigatório definir a forma de pagamento.'
          });
        }

        if (forma_pagamento !== undefined) {
          dadosParaAtualizar.metodo_pagamento = pagamentosValidos.length > 1 ? 'Split' : forma_pagamento; // CORREÇÃO
        }

        // Concluído implica pagamento confirmado
        dadosParaAtualizar.status_pagamento = 'Pago';
      } else {
        // Para qualquer status diferente de Concluído, pagamento é inválido
        // Importante: o schema legado usa defaults e pode não aceitar NULL
        // e pode não ter colunas de pontos/cupom. Manter compatível.
        dadosParaAtualizar.metodo_pagamento = 'Não definido';
        dadosParaAtualizar.status_pagamento = 'Não Pago';
      }

      if (observacoes !== undefined) dadosParaAtualizar.observacoes = observacoes;
      if (cliente_id !== undefined) dadosParaAtualizar.cliente_id = cliente_id;
      if (unidade_id !== undefined) dadosParaAtualizar.unidade_id = unidade_id;

      const shouldUpdateServicos = Array.isArray(servico_ids);
      const shouldUpdateExtras = Array.isArray(servico_extra_ids);

      const unidadeIdFinal = unidade_id !== undefined ? unidade_id : agendamento.unidade_id;

      if ((shouldUpdateServicos || shouldUpdateExtras) && !unidadeIdFinal) {
        return res.status(400).json({
          success: false,
          error: 'Unidade inválida',
          message: 'unidade_id é obrigatório para atualizar serviços'
        });
      }

      if (shouldUpdateServicos && servico_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Serviços obrigatórios',
          message: 'Deve selecionar pelo menos um serviço'
        });
      }

      let servicosData = null;
      let servicosExtrasData = null;

      if (shouldUpdateServicos) {
        servicosData = await this.model.db('servicos')
          .join('unidade_servicos', 'servicos.id', 'unidade_servicos.servico_id')
          .whereIn('servicos.id', servico_ids)
          .where('servicos.status', 'Ativo')
          .where('unidade_servicos.unidade_id', unidadeIdFinal)
          .select('servicos.id', 'servicos.nome', 'servicos.preco', 'servicos.duracao_minutos', 'servicos.comissao_percentual');

        if (servicosData.length !== servico_ids.length) {
          return res.status(400).json({
            success: false,
            error: 'Serviços inválidos',
            message: 'Um ou mais serviços não estão disponíveis nesta unidade'
          });
        }
      }

      if (shouldUpdateExtras) {
        const unidadeForExtras = await this.model.db('unidades')
          .where('id', unidadeIdFinal)
          .select('usuario_id')
          .first();

        const tenantUsuarioId = unidadeForExtras?.usuario_id || usuarioId;

        servicosExtrasData = await this.model.db('servicos_extras')
          .whereIn('id', servico_extra_ids)
          .where('status', 'Ativo')
          .where('usuario_id', tenantUsuarioId)
          .select('id', 'nome', 'preco', 'duracao_minutos');

        if (servicosExtrasData.length !== servico_extra_ids.length) {
          return res.status(400).json({
            success: false,
            error: 'Serviços extras inválidos',
            message: 'Um ou mais serviços extras não estão disponíveis'
          });
        }
      }

      if (shouldUpdateServicos || shouldUpdateExtras) {
        const valorServicos = Array.isArray(servicosData)
          ? servicosData.reduce((total, servico) => total + parseFloat(servico.preco), 0)
          : 0;

        const valorExtras = Array.isArray(servicosExtrasData)
          ? servicosExtrasData.reduce((total, extra) => total + parseFloat(extra.preco), 0)
          : 0;

        dadosParaAtualizar.valor_total = valorServicos + valorExtras;
      }

      const shouldValidateDisponibilidade = (
        (hora_inicio && hora_inicio !== agendamento.hora_inicio) ||
        (hora_fim && hora_fim !== agendamento.hora_fim) ||
        (agente_id && agente_id !== agendamento.agente_id) ||
        (data_agendamento && data_agendamento !== agendamento.data_agendamento)
      );

      const novoAgenteId = shouldValidateDisponibilidade ? (agente_id || agendamento.agente_id) : null;
      const novaData = shouldValidateDisponibilidade ? (data_agendamento || agendamento.data_agendamento) : null;
      const novaHoraInicio = shouldValidateDisponibilidade ? (hora_inicio || agendamento.hora_inicio) : null;
      const novaHoraFim = shouldValidateDisponibilidade ? (hora_fim || agendamento.hora_fim) : null;

      const statusAnterior = agendamento.status;

      const db = this.model.db;

      await db.transaction(async (trx) => {
        const inventoryService = new InventoryService(db);
        const produtosRows = Array.isArray(produtos_vendidos) ? produtos_vendidos : [];
        const produtosValidos = produtosRows
          .map((p) => ({
            produto_id: Number(p?.produto_id),
            quantidade: Number(p?.quantidade),
            preco_aplicado: Number(p?.preco_aplicado),
            agente_id: p?.agente_id ? Number(p.agente_id) : null
          }))
          .filter((p) => Number.isFinite(p.produto_id) && Number.isFinite(p.quantidade) && p.quantidade > 0);

        if (shouldValidateDisponibilidade) {
          await this.bookingAvailabilityService.validateOrThrow({
            unidade_id: unidadeIdFinal,
            agente_id: novoAgenteId,
            data_agendamento: novaData,
            hora_inicio: novaHoraInicio,
            hora_fim: novaHoraFim,
            exclude_agendamento_id: parseInt(id),
            trx
          });
        }

        await trx(this.model.tableName)
          .where('id', id)
          .update({
            ...dadosParaAtualizar,
            updated_at: new Date()
          });

        // ✅ ESTORNO AUTOMÁTICO (PDV): se sair de Concluído, devolver produtos vendidos ao estoque.
        const statusMudou = (status !== undefined && status !== statusAnterior);
        const deveEstornarVenda = statusMudou && statusAnterior === 'Concluído' && statusFinal !== 'Concluído';

        if (deveEstornarVenda) {
          let vendaId = agendamento.venda_id ? Number(agendamento.venda_id) : null;
          if (!vendaId) {
            const vendaRow = await trx('vendas')
              .where('agendamento_id', parseInt(id, 10))
              .select('id')
              .first();
            vendaId = vendaRow?.id ? Number(vendaRow.id) : null;
          }

          if (vendaId) {
            const venda = await trx('vendas')
              .where({ id: vendaId })
              .forUpdate()
              .first();

            const statusVenda = String(venda?.status || '').toUpperCase();
            if (venda && statusVenda === 'PAID') {
              const itens = await trx('venda_itens')
                .where('venda_id', vendaId)
                .select('item_type', 'reference_id', 'quantidade');

              const origemId = `ESTORNO:VENDA:${vendaId}`;

              for (const it of itens || []) {
                if (String(it.item_type) !== 'PRODUTO') continue;
                const produtoId = Number(it.reference_id);
                const quantidade = Number(it.quantidade);
                if (!Number.isFinite(produtoId) || !Number.isFinite(quantidade) || quantidade <= 0) continue;

                const movJaExiste = await trx('estoque_movimentacoes')
                  .where({
                    usuario_id: venda.usuario_id,
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
                  usuario_id: venda.usuario_id,
                  unidade_id: Number(venda.unidade_id),
                  produto_id: produtoId,
                  tipo: 'ESTORNO',
                  quantidade,
                  motivo: `ESTORNO AUTOMÁTICO - Venda ${vendaId} (Agendamento ${id})`,
                  origem_id: origemId,
                  created_by: req.user?.id || null,
                  trx
                });
              }

              await trx('venda_pagamentos')
                .where('venda_id', vendaId)
                .update({ status: 'REFUNDED' });

              await trx('vendas')
                .where('id', vendaId)
                .update({
                  status: 'REFUNDED',
                  updated_at: trx.fn.now()
                });
            }
          }

          // Permitir reconclusão futura criando uma nova venda.
          await trx('agendamentos')
            .where('id', parseInt(id, 10))
            .update({ venda_id: null });
        }

        // Motor de Estados (Clube): gerenciar assinatura_usos de forma atômica com o status
        // - Cancelado (Painel/Admin): estorno total (DELETE)
        // - Não Compareceu (No-Show): punição (manter uso no ciclo), mas desvincular agendamento_id (NULL)
        // - Concluído: baixa definitiva já foi registrada no momento do agendamento (manter vínculo)
        if (status !== undefined && status !== statusAnterior) {
          let agendamentoConsumiuCota = false;
          try {
            const usoRow = await trx('assinatura_usos')
              .where('agendamento_id', parseInt(id, 10))
              .select('id')
              .first();
            agendamentoConsumiuCota = Boolean(usoRow?.id);
          } catch (err) {
            if (!(err && err.code === '42P01')) {
              throw err;
            }
          }

          if (agendamentoConsumiuCota) {
            if (status === 'Cancelado') {
              await this.assinaturaEstornoService.aplicarEstornoOuRetencao({
                agendamentoId: parseInt(id, 10),
                deveEstornar: true,
                dbConn: trx
              });
            } else if (status === 'Não Compareceu') {
              await this.assinaturaEstornoService.aplicarEstornoOuRetencao({
                agendamentoId: parseInt(id, 10),
                deveEstornar: false,
                dbConn: trx
              });
            }
          }
        }

        if (shouldUpdateServicos) {
          await trx('agendamento_servicos')
            .where('agendamento_id', id)
            .del();

          if (servicosData && servicosData.length > 0) {
            const agendamentoServicos = servicosData.map(servico => ({
              agendamento_id: parseInt(id),
              servico_id: servico.id,
              preco_aplicado: servico.preco,
              comissao_percentual_aplicada: servico.comissao_percentual
            }));

            await trx('agendamento_servicos').insert(agendamentoServicos);
          }
        }

        if (shouldUpdateExtras) {
          await trx('agendamento_servicos_extras')
            .where('agendamento_id', id)
            .del();

          if (servicosExtrasData && servicosExtrasData.length > 0) {
            const agendamentoServicosExtras = servicosExtrasData.map(extra => ({
              agendamento_id: parseInt(id),
              servico_extra_id: extra.id,
              preco_aplicado: extra.preco
            }));

            await trx('agendamento_servicos_extras').insert(agendamentoServicosExtras);
          }
        }

        if (produtosRows && Array.isArray(produtosRows)) {
          await trx('agendamento_produtos')
            .where('agendamento_id', parseInt(id, 10))
            .del();

          if (produtosValidos.length > 0) {
            const produtoIds = produtosValidos
              .map((p) => Number(p?.produto_id))
              .filter((n) => Number.isFinite(n));

            const produtos = produtoIds.length > 0
              ? await trx('produtos')
                .where('usuario_id', usuarioId)
                .whereIn('id', produtoIds)
                .whereNull('deleted_at')
                .select('id', 'comissao_percentual')
              : [];

            const produtoById = new Map((produtos || []).map((p) => [Number(p.id), p]));

            const produtosInsert = produtosValidos.map((p) => {
                const produtoId = Number(p.produto_id);
                const quantidade = Number(Number(p.quantidade).toFixed(3));
                const precoAplicado = Number((Number.isFinite(p.preco_aplicado) ? p.preco_aplicado : 0).toFixed(2));
                const totalLinha = Number((quantidade * precoAplicado).toFixed(2));

                const produto = produtoById.get(produtoId);
                const comissaoPercentualSnapshot = Number(produto?.comissao_percentual) || 0;
                const comissaoValorSnapshot = Number((totalLinha * (comissaoPercentualSnapshot / 100)).toFixed(2));

                return {
                  agendamento_id: parseInt(id, 10),
                  produto_id: produtoId,
                  quantidade,
                  preco_aplicado: precoAplicado,
                  comissao_percentual_snapshot: comissaoPercentualSnapshot,
                  comissao_valor_snapshot: comissaoValorSnapshot,
                  agente_id: Number.isFinite(p.agente_id) ? p.agente_id : null,
                  created_at: trx.fn.now()
                };
              });

            // Penny Accuracy: evitar que a soma de comissões de produtos (em centavos) passe do total base.
            // O centavo de diferença deve ficar com a Casa (reduzindo o último item com comissão).
            const totalBaseCents = toCents(
              typeof dadosParaAtualizar?.valor_total === 'number'
                ? dadosParaAtualizar.valor_total
                : agendamento.valor_total
            );
            if (totalBaseCents > 0) {
              const commissionIdx = produtosInsert
                .map((it, idx) => ({ it, idx }))
                .filter(({ it }) => Number.isFinite(Number(it.agente_id)) && toCents(it.comissao_valor_snapshot) > 0)
                .map(({ idx }) => idx);

              if (commissionIdx.length > 0) {
                const sumCommissionsCents = commissionIdx.reduce(
                  (acc, idx) => acc + toCents(produtosInsert[idx].comissao_valor_snapshot),
                  0
                );
                const diffCents = sumCommissionsCents - totalBaseCents;
                if (diffCents > 0) {
                  const lastIdx = commissionIdx[commissionIdx.length - 1];
                  const current = toCents(produtosInsert[lastIdx].comissao_valor_snapshot);
                  const next = Math.max(0, current - diffCents);
                  produtosInsert[lastIdx].comissao_valor_snapshot = Number((next / 100).toFixed(2));
                }
              }
            }

            await trx('agendamento_produtos').insert(produtosInsert);
          }
        }

// ...
        // ✅ PATCH ESTOQUE (Sprint 3+): Reconciliação atômica e síncrona quando envolver Concluído ou troca de serviços
        const envolveConcluido = (
          (statusMudou && (statusAnterior === 'Concluído' || status === 'Concluído')) ||
          ((shouldUpdateServicos || shouldUpdateExtras) && statusFinal === 'Concluído')
        );

        if (envolveConcluido) {
          await this.agendamentoConclusaoService.reconcileEstoque({
            agendamentoId: parseInt(id, 10),
            triggeredByUserId: req.user?.id,
            pagamentos: Array.isArray(pagamentos) ? pagamentos : [],
            trx
          });
        }
      });

      const data = await this.model.findWithServicos(parseInt(id));
      
      // PRIORIDADE 1: Verificar se o status mudou para "Cancelado"
      const foiCancelado = (status === 'Cancelado' && agendamento.status !== 'Cancelado');
      const foiConcluido = (statusFinal === 'Concluído' && agendamento.status !== 'Concluído');

      // OTIMIZAÇÃO: NUNCA bloquear a resposta aguardando WhatsApp.
      // O envio pode ter delay em DEV e fila, causando "Salvando..." por muito tempo.
      // Disparar em background para manter UX rápida.
      const houveReagendamento = !foiCancelado && (
        (hora_inicio && hora_inicio !== agendamento.hora_inicio) ||
        (hora_fim && hora_fim !== agendamento.hora_fim) ||
        (data_agendamento && data_agendamento !== agendamento.data_agendamento)
      );

      if (foiCancelado || houveReagendamento) {
        setImmediate(async () => {
          try {
            const dadosCompletos = await this.buscarDadosCompletos(id);
            if (!dadosCompletos) return;

            if (foiCancelado) {
              await this.whatsAppService.sendCancellationNotification(dadosCompletos);
            } else if (houveReagendamento) {
              await this.whatsAppService.sendRescheduleNotification(dadosCompletos);
            }
          } catch (whatsappError) {
            logger.error(` [AgendamentoController] Erro ao enviar notificações em background:`, whatsappError);
          }
        });
      }

      // Convite de retorno: agendar quando status mudar para Concluído
      // Executar em background para não bloquear a resposta HTTP
      if (foiConcluido) {
        setImmediate(async () => {
          try {
            await this.agendamentoConclusaoService.scheduleConviteRetorno({
              agendamentoId: parseInt(id, 10)
            });
          } catch (error) {
            logger.error(` [AgendamentoController] Erro ao agendar convite de retorno em background:`, error);
          }
        });
      }

      return res.json({
        success: true,
        data,
        message: 'Agendamento atualizado com sucesso' 
      });
    } catch (error) {
      if (error && error.code === 'SALDO_INSUFICIENTE') {
        return res.status(409).json({
          success: false,
          code: 'SALDO_INSUFICIENTE',
          error: 'Saldo insuficiente',
          message: error.message,
          produto_id: error.produto_id || null,
          unidade_id: error.unidade_id || null,
          quantidade: error.quantidade || null
        });
      }

      if (error?.code === 'PERIODO_FECHADO') {
        return res.status(409).json({
          success: false,
          code: 'PERIODO_FECHADO',
          error: error.message
        });
      }

      if (error && error.httpStatus) {
        return res.status(error.httpStatus).json({
          success: false,
          error: 'Horário indisponível',
          message: error.message
        });
      }

      logger.error(' [AgendamentoController.update] Erro ao atualizar agendamento:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'production'
          ? 'Erro ao processar serviços extras'
          : error.message 
      });
    }
  }

  // PATCH /api/agendamentos/:id/cancel - Cancelar agendamento
  async cancel(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      // Buscar agendamento com filtro de escopo
      let agendamentoQuery = this.model.db(this.model.tableName)
        .where('agendamentos.id', id)
        .whereNull('agendamentos.deleted_at');

      if (userRole === 'AGENTE' && userAgenteId) {
        agendamentoQuery = agendamentoQuery.where('agendamentos.agente_id', userAgenteId);
      } else {
        agendamentoQuery = agendamentoQuery
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
          .where('unidades.usuario_id', usuarioId);
      }

      const agendamento = await agendamentoQuery.select('agendamentos.*').first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado'
        });
      }

      await assertPeriodoAberto({
        unidadeId: Number(agendamento.unidade_id),
        recordDate: parseYmdToLocalDate(agendamento.data_agendamento),
        userRole,
        errorMessage: 'Período fechado: não é permitido cancelar agendamentos de meses anteriores.'
      });

      if (agendamento.status === 'Cancelado') {
        return res.status(400).json({
          success: false,
          error: 'Agendamento já está cancelado'
        });
      }

      const trxResult = await this.model.db.transaction(async (trx) => {
        const inventoryService = new InventoryService(trx);

        const agendamentoRow = await trx('agendamentos')
          .where('id', parseInt(id, 10))
          .forUpdate()
          .select('id', 'venda_id', 'unidade_id')
          .first();

        let vendaId = agendamentoRow?.venda_id ? Number(agendamentoRow.venda_id) : null;
        if (!vendaId) {
          const vendaRow = await trx('vendas')
            .where('agendamento_id', parseInt(id, 10))
            .select('id')
            .first();
          vendaId = vendaRow?.id ? Number(vendaRow.id) : null;
        }

        if (vendaId) {
          const venda = await trx('vendas')
            .where({ id: vendaId })
            .forUpdate()
            .first();

          const statusVenda = String(venda?.status || '').toUpperCase();

          if (venda && statusVenda === 'PAID') {
            const itens = await trx('venda_itens')
              .where('venda_id', vendaId)
              .select('item_type', 'reference_id', 'quantidade');

            const origemId = `ESTORNO:VENDA:${vendaId}`;

            for (const it of itens || []) {
              if (String(it.item_type) !== 'PRODUTO') continue;
              const produtoId = Number(it.reference_id);
              const quantidade = Number(it.quantidade);
              if (!Number.isFinite(produtoId) || !Number.isFinite(quantidade) || quantidade <= 0) continue;

              const movJaExiste = await trx('estoque_movimentacoes')
                .where({
                  usuario_id: venda.usuario_id,
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
                usuario_id: venda.usuario_id,
                unidade_id: Number(venda.unidade_id),
                produto_id: produtoId,
                tipo: 'ESTORNO',
                quantidade,
                motivo: `ESTORNO AUTOMÁTICO - Venda ${vendaId} (Agendamento ${id})`,
                origem_id: origemId,
                created_by: req.user?.id || null,
                trx
              });
            }

            await trx('venda_pagamentos')
              .where('venda_id', vendaId)
              .update({ status: 'REFUNDED' });

            await trx('vendas')
              .where('id', vendaId)
              .update({
                status: 'REFUNDED',
                updated_at: trx.fn.now()
              });
          }
        }

        await this.assinaturaEstornoService.aplicarEstornoOuRetencao({
          agendamentoId: parseInt(id, 10),
          deveEstornar: true,
          dbConn: trx
        });

        await trx(this.model.tableName)
          .where('id', id)
          .update({
            status: 'Cancelado',
            updated_at: new Date()
          });

        await this.agendamentoConclusaoService.reconcileEstoque({
          agendamentoId: parseInt(id, 10),
          triggeredByUserId: req.user?.id,
          pagamentos: [],
          trx
        });

        return { ok: true };
      });

      if (trxResult?.notFound) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado'
        });
      }

      if (trxResult?.alreadyCancelled) {
        return res.status(400).json({
          success: false,
          error: 'Agendamento já está cancelado'
        });
      }

      // Buscar dados completos para enviar notificações
      const dadosCompletos = await this.buscarDadosCompletos(id);

      if (dadosCompletos) {
        // Enviar notificações de cancelamento para cliente e agente
        try {
          await this.whatsAppService.sendCancellationNotification(dadosCompletos);
        } catch (whatsappError) {
          logger.error(` [AgendamentoController] Erro ao enviar notificações de cancelamento:`, whatsappError);
          // Não falhar a requisição se o WhatsApp falhar
        }
      }

      return res.json({
        success: true,
        message: 'Agendamento cancelado com sucesso',
        data: {
          id: parseInt(id),
          status: 'Cancelado'
        }
      });

    } catch (error) {
      if (error?.code === 'PERIODO_FECHADO') {
        return res.status(409).json({
          success: false,
          code: 'PERIODO_FECHADO',
          error: error.message
        });
      }

      logger.error(' [AgendamentoController.cancel] Erro ao cancelar agendamento:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // Método auxiliar para buscar dados completos do agendamento
  async buscarDadosCompletos(agendamentoId) {
    try {

      // CORREÇÃO CRÍTICA: Buscar dados separadamente para evitar problemas de JOIN
      const agendamento = await this.model.db('agendamentos')
        .where('id', agendamentoId)
        .whereNull('deleted_at')
        .first();

      if (!agendamento) {
        return null;
      }

      // Buscar cliente separadamente
      const cliente = await this.model.db('clientes')
        .where('id', agendamento.cliente_id)
        .first();

      // Buscar agente separadamente
      const agente = await this.model.db('agentes')
        .where('id', agendamento.agente_id)
        .first();

      // Buscar unidade separadamente (incluindo slug_url para link de booking)
      const unidade = await this.model.db('unidades')
        .where('id', agendamento.unidade_id)
        .select('id', 'nome', 'endereco', 'telefone', 'slug_url')
        .first();


      if (!cliente || !agente || !unidade) {
        return null;
      }

      // CORREÇÃO: Buscar serviços separadamente
      const servicos = await this.model.db('agendamento_servicos')
        .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .where('agendamento_servicos.agendamento_id', agendamentoId)
        .select('servicos.nome', 'servicos.preco');

      // CORREÇÃO: Lidar com estrutura antiga e nova da tabela clientes
      const nomeCliente = cliente.nome || `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();

      // NOVO: Calcular informações de pontos do cliente
      let pontosInfo = null;
      try {
        const ClienteModel = require('../models/Cliente');
        const clienteModel = new ClienteModel(this.model.db);
        
        // Calcular saldo atual de pontos
        const saldoPontos = await clienteModel.calcularPontosDisponiveis(agendamento.cliente_id, agendamento.unidade_id);
        
        // Verificar se é o primeiro agendamento (para saber se pode usar pontos)
        const isPrimeiro = await clienteModel.isPrimeiroAgendamento(agendamento.cliente_id, agendamento.unidade_id);
        
        // Buscar pontos ganhos neste agendamento específico
        const pontosGanhos = await this.model.db('pontos_historico')
          .where('agendamento_id', agendamentoId)
          .where('tipo', 'CREDITO')
          .sum('pontos as total')
          .first();
        
        const ganhos = parseInt(pontosGanhos?.total || 0);
        
        pontosInfo = {
          saldo: saldoPontos,
          ganhos: ganhos,
          podeUsar: !isPrimeiro // Pode usar se NÃO for o primeiro
        };
      } catch (pontosError) {
        logger.error(' [AgendamentoController] Erro ao calcular pontos:', pontosError);
        // Continuar sem informação de pontos
      }

      // NOVO: Calcular informações de assinatura do cliente
      let assinaturaSaldo = null;
      try {
        const assinaturaStatus = cliente?.assinatura_status || null;
        if (cliente?.is_assinante && cliente?.assinatura_plano_id && cliente?.data_inicio_assinatura && cliente?.status === 'Ativo' && assinaturaStatus === 'Ativo') {
          const addDaysStr = (dateStr, days) => {
            const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
            const dt = new Date(y, m - 1, d);
            dt.setDate(dt.getDate() + days);
            const pad = (num) => num.toString().padStart(2, '0');
            return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
          };

          const getDateStrInTimeZone = (tz, date = new Date()) => {
            return new Intl.DateTimeFormat('en-CA', {
              timeZone: tz,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).format(date);
          };

          const normalizeDateStr = (dateValue) => {
            if (!dateValue) return null;
            if (dateValue instanceof Date) return dateValue.toISOString().slice(0, 10);
            const s = String(dateValue);
            if (s.length >= 10 && s.includes('T')) return s.slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const dt = new Date(s);
            if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
            return null;
          };

          const dayNumberFromDateStr = (dateStr) => {
            const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
            return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
          };

          const diffDays = (a, b) => {
            return dayNumberFromDateStr(a) - dayNumberFromDateStr(b);
          };

          const getCycleBounds = ({ startDateStr, validadeDias, referenceDateStr }) => {
            const delta = diffDays(referenceDateStr, startDateStr);
            const idx = delta > 0 ? Math.floor(delta / validadeDias) : 0;
            const cycleStart = addDaysStr(startDateStr, idx * validadeDias);
            const cycleEndExclusive = addDaysStr(cycleStart, validadeDias);
            const cycleEndInclusive = addDaysStr(cycleEndExclusive, -1);
            return { cycleStart, cycleEndExclusive, cycleEndInclusive, cycleIndex: idx };
          };

          const unidadeTenant = await this.model.db('unidades')
            .where('id', agendamento.unidade_id)
            .select('id', 'usuario_id')
            .first();

          if (unidadeTenant?.usuario_id) {
            const assinaturaSaldoService = new AssinaturaSaldoService({
              db: this.model.db,
              getDateStrInTimeZone,
              normalizeDateStr,
              getCycleBounds
            });

            const result = await assinaturaSaldoService.compute({
              cliente,
              unidadeUsuarioId: unidadeTenant.usuario_id,
              unidadeId: agendamento.unidade_id,
              dataReferencia: null,
              servicoIds: null,
              servicoExtraIds: null
            });

            if (result?.data?.assinatura_ativa) {
              assinaturaSaldo = {
                assinatura_ativa: true,
                plano: result.data.plano,
                ciclo: result.data.ciclo,
                saldos: result.data.saldos
              };
            }
          }
        }
      } catch (assinaturaError) {
        logger.error('❌ [AgendamentoController] Erro ao calcular assinatura:', assinaturaError);
        // Continuar sem informação de assinatura
      }

      // ✅ NOVO: Formatar dados para as novas mensagens do Tally
      return {
        // Dados do cliente
        cliente: {
          nome: nomeCliente
        },
        cliente_telefone: cliente.telefone,
        
        // Dados do agente
        agente: {
          nome: `${agente.nome} ${agente.sobrenome || ''}`.trim()
        },
        agente_telefone: agente.telefone,
        
        // Dados da unidade
        unidade: {
          id: unidade.id,
          nome: unidade.nome,
          endereco: unidade.endereco,
          slug_url: unidade.slug_url
        },
        unidade_id: unidade.id,
        unidade_telefone: unidade.telefone,
        unidade_endereco: unidade.endereco,
        unidade_slug: unidade.slug_url,
        
        // Dados do agendamento
        agendamento_id: agendamento.id,
        numero_agendamento: agendamento.numero_agendamento || null,
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        hora_fim: agendamento.hora_fim,
        valor_total: agendamento.valor_total,
        
        // Serviços
        servicos: servicos.map(s => ({
          nome: s.nome,
          preco: s.preco
        })),
        
        // ✅ NOVO: Informações de pontos
        pontos: pontosInfo,

        // ✅ NOVO: Informações de assinatura (se aplicável)
        assinatura_saldo: assinaturaSaldo
      };

    } catch (error) {
      logger.error('❌ [AgendamentoController.buscarDadosCompletos] Erro ao buscar dados completos:', error);
      return null;
    }
  }

  // DELETE /api/agendamentos/:id - Deletar agendamento (hard delete)
  // ✅ CORREÇÃO 1.3: Apenas ADMIN pode deletar (validação de propriedade por unidade)
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      // ✅ CORREÇÃO 1.3: Apenas ADMIN pode deletar (hard delete)
      if (userRole !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Apenas ADMIN pode deletar agendamentos'
        });
      }

      // Buscar agendamento com filtro de escopo (apenas da unidade do ADMIN)
      const agendamento = await this.model.db(this.model.tableName)
        .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
        .where('agendamentos.id', id)
        .where('unidades.usuario_id', usuarioId)
        .whereNull('agendamentos.deleted_at')
        .select('agendamentos.*')
        .first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado ou você não tem permissão para deletá-lo'
        });
      }

      await assertPeriodoAberto({
        unidadeId: Number(agendamento.unidade_id),
        recordDate: parseYmdToLocalDate(agendamento.data_agendamento),
        userRole,
        errorMessage: 'Período fechado: não é permitido excluir agendamentos de meses anteriores.'
      });

      if (agendamento.deleted_at) {
        return res.json({
          success: true,
          message: 'Agendamento deletado com sucesso',
          data: {
            id: parseInt(id)
          }
        });
      }

      try {
        const venda = await this.model.db('vendas')
          .where('agendamento_id', parseInt(id, 10))
          .select('id', 'status')
          .first();

        const statusVenda = String(venda?.status || '').toUpperCase();
        if (venda?.id && (statusVenda === 'PAID' || statusVenda === 'PARTIAL')) {
          return res.status(400).json({
            success: false,
            error: 'Não é possível deletar um agendamento com venda paga/parcial',
            message: `Agendamento vinculado à venda #${venda.id} (${statusVenda}). Estorne a venda antes de excluir a comanda.`
          });
        }
      } catch (err) {
        if (!(err && (err.code === '42P01' || String(err.message || '').includes('vendas')))) {
          throw err;
        }
      }

      // Soft delete (append-only): marcar deleted_at
      await this.model.db(this.model.tableName)
        .where('id', id)
        .update({
          deleted_at: this.model.db.fn.now(),
          updated_at: new Date()
        });

      return res.json({
        success: true,
        message: 'Agendamento deletado com sucesso',
        data: {
          id: parseInt(id)
        }
      });

    } catch (error) {
      if (error?.code === 'PERIODO_FECHADO') {
        return res.status(409).json({
          success: false,
          code: 'PERIODO_FECHADO',
          error: error.message
        });
      }

      logger.error('❌ [AgendamentoController.destroy] Erro ao deletar agendamento:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = AgendamentoController;

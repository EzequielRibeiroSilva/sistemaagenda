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
          .join('agentes', 'agendamentos.agente_id', 'agentes.id');

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
          .join('agentes', 'agendamentos.agente_id', 'agentes.id');

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
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const {
        cliente_id,
        cliente_nome,
        cliente_telefone,
        agente_id,
        unidade_id,
        data_agendamento,
        hora_inicio,
        hora_fim,
        servico_ids = [],
        servico_extra_ids = [],
        servicos = [], // Formato antigo para compatibilidade
        recorrencia,
        usar_assinatura_itens,
        ...outrosDados
      } = req.body;

      // Validações básicas - cliente_id OU (cliente_nome + cliente_telefone)
      if (!agente_id || !unidade_id || !data_agendamento || !hora_inicio || !hora_fim) {
        return res.status(400).json({
          error: 'Dados obrigatórios não fornecidos',
          message: 'agente_id, unidade_id, data_agendamento, hora_inicio e hora_fim são obrigatórios'
        });
      }

      // Validar cliente: deve ter cliente_id OU (cliente_nome + cliente_telefone)
      if (!cliente_id && (!cliente_nome || !cliente_telefone)) {
        return res.status(400).json({
          error: 'Dados do cliente obrigatórios',
          message: 'Deve fornecer cliente_id OU (cliente_nome + cliente_telefone)'
        });
      }

      // CORREÇÃO CRÍTICA: Para AGENTE, buscar o usuario_id do ADMIN dono da unidade
      if (userRole === 'AGENTE' && userAgenteId) {
        // Buscar o usuario_id do ADMIN dono da unidade onde o AGENTE trabalha
        const unidadeInfo = await this.model.db('unidades').where('id', unidade_id).first();

        if (unidadeInfo && unidadeInfo.usuario_id) {
          usuarioId = unidadeInfo.usuario_id;
        }
      }

      // Verificar se a unidade pertence ao usuário (agora usando usuario_id do ADMIN para AGENTE)
      const unidade = await this.model.db('unidades').where('id', unidade_id).where('usuario_id', usuarioId).first();

      if (!unidade) {
        return res.status(400).json({
          error: 'Unidade inválida',
          message: 'A unidade não pertence ao usuário ou não existe'
        });
      }

      // CRIAR CLIENTE AUTOMATICAMENTE SE NECESSÁRIO
      let clienteIdFinal = cliente_id;
      if (!cliente_id && cliente_nome && cliente_telefone) {
        try {
          const ClienteModel = require('../models/Cliente');
          const clienteModel = new ClienteModel();

          // Criar ou encontrar cliente
          const clienteCriado = await clienteModel.findOrCreateForAgendamento(
            cliente_telefone,
            cliente_nome,
            unidade_id
          );

          clienteIdFinal = clienteCriado.id;

        } catch (clienteError) {
          return res.status(400).json({
            error: 'Erro ao criar cliente',
            message: 'Não foi possível criar o cliente automaticamente'
          });
        }
      }

      // BARREIRA: Cliente bloqueado (painel interno)
      if (clienteIdFinal) {
        const clienteRecord = await this.model.db('clientes')
          .where('id', clienteIdFinal)
          .where('unidade_id', unidade_id)
          .select('id', 'status')
          .first();

        if (clienteRecord?.status === 'Bloqueado') {
          return res.status(403).json({
            error: 'Cliente bloqueado',
            message: 'Este cliente está marcado como Bloqueado no sistema.'
          });
        }
      }

      // NOTA: A verificação de conflito agora é feita DENTRO da transação
      // no método createWithLock() para evitar race conditions

      // Buscar dados dos serviços principais
      let servicosData = [];
      if (servico_ids.length > 0) {
        // NOVA ARQUITETURA MANY-TO-MANY: Verificar se os serviços estão associados à unidade
        servicosData = await this.model.db('servicos')
          .join('unidade_servicos', 'servicos.id', 'unidade_servicos.servico_id')
          .whereIn('servicos.id', servico_ids)
          .where('servicos.status', 'Ativo')
          .where('unidade_servicos.unidade_id', unidade_id)
          .select('servicos.id', 'servicos.nome', 'servicos.preco', 'servicos.duracao_minutos', 'servicos.comissao_percentual');

        if (servicosData.length !== servico_ids.length) {
          return res.status(400).json({
            error: 'Serviços inválidos',
            message: 'Um ou mais serviços não estão disponíveis nesta unidade'
          });
        }
      }

      // Buscar dados dos serviços extras
      let servicosExtrasData = [];
      if (servico_extra_ids.length > 0) {
        servicosExtrasData = await this.model.db('servicos_extras')
          .whereIn('id', servico_extra_ids)
          .where('status', 'Ativo')
          .where('usuario_id', unidade.usuario_id)
          .select('id', 'nome', 'preco', 'duracao_minutos');

        if (servicosExtrasData.length !== servico_extra_ids.length) {
          return res.status(400).json({
            error: 'Serviços extras inválidos',
            message: 'Um ou mais serviços extras não estão disponíveis'
          });
        }
      }

      // Calcular valor total
      const valorServicos = servicosData.reduce((total, servico) => total + parseFloat(servico.preco), 0);
      const valorExtras = servicosExtrasData.reduce((total, extra) => total + parseFloat(extra.preco), 0);
      const valorTotalBase = valorServicos + valorExtras;
      let valorTotalFinal = valorTotalBase;

      // REGRA DE NEGÓCIO: Verificar se cliente pode usar pontos (apenas a partir do 2º agendamento)
      const pontosUsados = parseInt(outrosDados.pontos_usados || 0);
      if (pontosUsados > 0) {
        const ClienteModel = require('../models/Cliente');
        const clienteModel = new ClienteModel(this.model.db);
        
        const isPrimeiro = await clienteModel.isPrimeiroAgendamento(clienteIdFinal, unidade_id);
        
        if (isPrimeiro) {
          return res.status(400).json({
            error: 'Pontos não disponíveis',
            message: 'Pontos só podem ser usados a partir do segundo agendamento'
          });
        }
      }

      let dadosAgendamento = {
        cliente_id: clienteIdFinal, // USAR O ID DO CLIENTE (CRIADO OU EXISTENTE)
        agente_id,
        unidade_id,
        data_agendamento,
        hora_inicio,
        hora_fim,
        usuario_id: usuarioId,
        valor_total: valorTotalFinal,
        ...outrosDados
      };

      // NOVO: Agendamento recorrente (MVP: fail_all com rollback)
      // Se o payload incluir "recorrencia", criar série materializada.
      if (recorrencia && typeof recorrencia === 'object') {
        const recurringService = new RecurringAppointmentService({ agendamentoModel: this.model });

        try {
          const result = await recurringService.createRecurringAppointments({
            baseAgendamentoData: dadosAgendamento,
            servicosData,
            servicosExtrasData,
            servicosLegacy: servicos,
            recurrence: {
              frequency: recorrencia.frequency,
              range: recorrencia.range
            }
          });

          // Background: confirmação apenas da 1ª ocorrência + lembretes para todas as ocorrências
          // - Confirmação: apenas primeira data da série
          // - Lembretes: programar 24h e 1h (tipo_lembrete=2h) para CADA ocorrência
          // Não bloqueia a resposta e funciona mesmo com WhatsApp desconectado (programação no DB).
          setImmediate(async () => {
            try {
              const ocorrencias = Array.isArray(result?.ocorrencias) ? result.ocorrencias : [];

              // 1) Enviar confirmação apenas para a 1ª ocorrência
              const primeira = ocorrencias[0];
              if (primeira?.id) {
                try {
                  const dadosCompletosPrimeira = await this.buscarDadosCompletos(primeira.id);
                  if (dadosCompletosPrimeira?.cliente_telefone || dadosCompletosPrimeira?.agente_telefone) {
                    await this.whatsAppService.sendAppointmentConfirmation(dadosCompletosPrimeira);
                  }
                } catch (confirmErr) {
                  logger.error(' [AgendamentoController] (bg/recorrencia) Erro ao enviar confirmação da 1ª ocorrência:', confirmErr);
                }
              }

              // 2) Programar lembretes para todas as ocorrências
              for (const occ of ocorrencias) {
                if (!occ?.id) continue;
                try {
                  await this.scheduledReminderService.criarLembretesProgramados({
                    agendamento_id: occ.id,
                    unidade_id: unidade_id,
                    data_agendamento: occ.data_agendamento,
                    hora_inicio: occ.hora_inicio,
                    cliente_telefone: cliente_telefone
                  });
                } catch (scheduleErr) {
                  logger.error(` [AgendamentoController] (bg/recorrencia) Erro ao programar lembretes para ocorrência #${occ.id}:`, scheduleErr);
                }
              }
            } catch (bgErr) {
              logger.error(' [AgendamentoController] (bg/recorrencia) Erro geral no fluxo de notificação/lembretes:', bgErr);
            }
          });

          return res.status(201).json({
            success: true,
            data: {
              recorrencia_group_id: result.recorrencia_group_id,
              recorrencia_config: result.recorrencia_config,
              ocorrencias: result.ocorrencias
            },
            message: 'Agendamentos recorrentes criados com sucesso'
          });
        } catch (err) {
          if (err && (err.code === 'RECURRENCE_CONFLICT' || err.code === 'CONFLICT')) {
            return res.status(400).json({
              success: false,
              error: 'Conflito de horário',
              message: 'Um ou mais agendamentos da recorrência colidem com horários já ocupados',
              conflict: err.conflict
            });
          }

          if (err && (err.code === 'INVALID_FREQUENCY' || err.code === 'INVALID_RANGE_MODE' || err.code === 'INVALID_RANGE_COUNT' || err.code === 'INVALID_RANGE_UNTIL' || err.code === 'INVALID_START_DATE')) {
            return res.status(400).json({
              success: false,
              error: 'Recorrência inválida',
              message: err.message
            });
          }

          logger.error(' [AgendamentoController.store] Erro ao criar recorrência:', err);
          return res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: 'Não foi possível criar agendamentos recorrentes'
          });
        }
      }

      // FASE 3: Persistência transacional (agendamento + vínculos em uma única trx)
      const db = this.model.db;
      let agendamento;

      await db.transaction(async (trx) => {
        await this.bookingAvailabilityService.validateOrThrow({
          unidade_id,
          agente_id,
          data_agendamento,
          hora_inicio,
          hora_fim,
          trx
        });

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

        const shouldTryAssinatura = Boolean(usar_assinatura_itens) && typeof usar_assinatura_itens === 'object';
        const requestedServicoIds = Array.isArray(usar_assinatura_itens?.servico_ids)
          ? usar_assinatura_itens.servico_ids.map(id => parseInt(id, 10)).filter(n => Number.isFinite(n))
          : [];
        const requestedExtraIds = Array.isArray(usar_assinatura_itens?.servico_extra_ids)
          ? usar_assinatura_itens.servico_extra_ids.map(id => parseInt(id, 10)).filter(n => Number.isFinite(n))
          : [];

        let coveredServicoIds = [];
        let coveredExtraIds = [];
        let planItemIdsToConsume = [];
        let assinaturaCycleStart = null;
        let assinaturaCycleEndExclusive = null;
        let assinaturaCycleStartTs = null;
        let assinaturaCycleEndExclusiveTs = null;
        let planoId = null;

        if (shouldTryAssinatura) {
          const cliente = await trx('clientes')
            .leftJoin('unidades as u', 'clientes.unidade_id', 'u.id')
            .where('clientes.id', clienteIdFinal)
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

          const assinaturaStatus = cliente?.assinatura_status || null;
          const assinaturaElegivel = Boolean(cliente?.is_assinante)
            && assinaturaStatus === 'Ativo'
            && Boolean(cliente?.assinatura_plano_id)
            && Boolean(cliente?.data_inicio_assinatura)
            && cliente?.status === 'Ativo';

          if (assinaturaElegivel) {
            await trx.raw('SELECT pg_advisory_xact_lock(?::int, ?::int)', [7001, parseInt(cliente.id, 10)]);

            const assinaturaSaldoService = new AssinaturaSaldoService({
              db: this.model.db,
              getDateStrInTimeZone,
              normalizeDateStr,
              getCycleBounds
            });

            const saldoResult = await assinaturaSaldoService.compute({
              cliente,
              unidadeUsuarioId: unidade.usuario_id,
              unidadeId: unidade_id,
              dataReferencia: null,
              servicoIds: requestedServicoIds,
              servicoExtraIds: requestedExtraIds,
              dbConn: trx
            });

            const cobertura = saldoResult?.data?.cobertura_sugerida;
            coveredServicoIds = Array.isArray(cobertura?.servico_ids) ? cobertura.servico_ids : [];
            coveredExtraIds = Array.isArray(cobertura?.servico_extra_ids) ? cobertura.servico_extra_ids : [];

            planoId = saldoResult?.data?.plano?.id || null;
            const validadeDias = saldoResult?.data?.plano?.validade_dias || null;
            assinaturaCycleStart = saldoResult?.data?.ciclo?.inicio || null;
            assinaturaCycleStartTs = saldoResult?.data?.ciclo?.inicio_ts || null;
            assinaturaCycleEndExclusiveTs = saldoResult?.data?.ciclo?.fim_exclusivo_ts || null;
            if (assinaturaCycleStart && validadeDias) {
              assinaturaCycleEndExclusive = addDaysStr(assinaturaCycleStart, parseInt(validadeDias, 10) || 31);
            }

            const saldos = Array.isArray(saldoResult?.data?.saldos) ? saldoResult.data.saldos : [];
            const planItemByServicoId = new Map();
            const planItemByExtraId = new Map();
            for (const s of saldos) {
              if (s.tipo === 'SERVICO' && s.servico_id) {
                planItemByServicoId.set(parseInt(s.servico_id, 10), parseInt(s.plano_item_id, 10));
              }
              if (s.tipo === 'EXTRA' && s.servico_extra_id) {
                planItemByExtraId.set(parseInt(s.servico_extra_id, 10), parseInt(s.plano_item_id, 10));
              }
            }

            const planItemIds = [];
            for (const sid of coveredServicoIds) {
              const itemId = planItemByServicoId.get(parseInt(sid, 10));
              if (itemId) planItemIds.push(itemId);
            }
            for (const eid of coveredExtraIds) {
              const itemId = planItemByExtraId.get(parseInt(eid, 10));
              if (itemId) planItemIds.push(itemId);
            }
            planItemIdsToConsume = Array.from(new Set(planItemIds)).filter(n => Number.isFinite(n));

            const descontoServicos = servicosData
              .filter(s => coveredServicoIds.includes(parseInt(s.id, 10)))
              .reduce((acc, s) => acc + (parseFloat(s.preco) || 0), 0);
            const descontoExtras = servicosExtrasData
              .filter(e => coveredExtraIds.includes(parseInt(e.id, 10)))
              .reduce((acc, e) => acc + (parseFloat(e.preco) || 0), 0);

            valorTotalFinal = Math.max(0, valorTotalBase - (descontoServicos + descontoExtras));
            dadosAgendamento = { ...dadosAgendamento, valor_total: valorTotalFinal };
          }
        }

        // Criar agendamento com proteção contra race conditions dentro da trx
        agendamento = await this.model.createWithLockUsingTrx(trx, dadosAgendamento);

        // Criar relacionamentos com serviços principais
        if (servicosData.length > 0) {
          const agendamentoServicos = servicosData.map(servico => ({
            agendamento_id: agendamento.id,
            servico_id: servico.id,
            preco_aplicado: (coveredServicoIds || []).includes(parseInt(servico.id, 10)) ? 0 : servico.preco,
            comissao_percentual_aplicada: servico.comissao_percentual
          }));

          await trx('agendamento_servicos').insert(agendamentoServicos);
        }

        // Criar relacionamentos com serviços extras
        if (servicosExtrasData.length > 0) {
          const agendamentoServicosExtras = servicosExtrasData.map(extra => ({
            agendamento_id: agendamento.id,
            servico_extra_id: extra.id,
            preco_aplicado: (coveredExtraIds || []).includes(parseInt(extra.id, 10)) ? 0 : extra.preco
          }));

          await trx('agendamento_servicos_extras').insert(agendamentoServicosExtras);
        }

        if (planoId && planItemIdsToConsume.length > 0 && assinaturaCycleStart && assinaturaCycleEndExclusive) {
          const usoRows = [];

          const saldosRows = await trx('planos_assinatura_itens')
            .where('plano_id', planoId)
            .select('id', 'tipo', 'servico_id', 'servico_extra_id', 'quantidade_por_ciclo');

          const itemByServicoId = new Map();
          const itemByExtraId = new Map();
          for (const row of (saldosRows || [])) {
            if (row.tipo === 'SERVICO' && row.servico_id) {
              itemByServicoId.set(parseInt(row.servico_id, 10), row);
            }
            if (row.tipo === 'EXTRA' && row.servico_extra_id) {
              itemByExtraId.set(parseInt(row.servico_extra_id, 10), row);
            }
          }

          for (const sid of coveredServicoIds) {
            const item = itemByServicoId.get(parseInt(sid, 10));
            if (!item?.id) continue;
            usoRows.push({
              cliente_id: clienteIdFinal,
              plano_id: planoId,
              plano_item_id: item.id,
              agendamento_id: agendamento.id,
              data_uso: new Date(`${data_agendamento}T${hora_inicio || '00:00'}:00-03:00`),
              quantidade: 1,
              created_at: new Date()
            });
          }

          for (const eid of coveredExtraIds) {
            const item = itemByExtraId.get(parseInt(eid, 10));
            if (!item?.id) continue;
            usoRows.push({
              cliente_id: clienteIdFinal,
              plano_id: planoId,
              plano_item_id: item.id,
              agendamento_id: agendamento.id,
              data_uso: new Date(`${data_agendamento}T${hora_inicio || '00:00'}:00-03:00`),
              quantidade: 1,
              created_at: new Date()
            });
          }

          if (usoRows.length > 0) {
            try {
              const planItemsToConsume = await trx('planos_assinatura_itens')
                .whereIn('id', planItemIdsToConsume)
                .select('id', 'quantidade_por_ciclo');

              const requiredByItemId = usoRows.reduce((acc, row) => {
                const key = String(row.plano_item_id);
                acc[key] = (acc[key] || 0) + (parseInt(row.quantidade, 10) || 0);
                return acc;
              }, {});

              const usadosRows = await trx('assinatura_usos')
                .where('cliente_id', clienteIdFinal)
                .whereIn('plano_item_id', planItemIdsToConsume)
                .where('data_uso', '>=', assinaturaCycleStartTs ? new Date(assinaturaCycleStartTs) : assinaturaCycleStart)
                .where('data_uso', '<', assinaturaCycleEndExclusiveTs ? new Date(assinaturaCycleEndExclusiveTs) : assinaturaCycleEndExclusive)
                .groupBy('plano_item_id')
                .select('plano_item_id')
                .sum({ total: 'quantidade' });

              const usadosByItemId = (usadosRows || []).reduce((acc, row) => {
                acc[String(row.plano_item_id)] = parseInt(row.total, 10) || 0;
                return acc;
              }, {});

              const semSaldo = (planItemsToConsume || []).some((item) => {
                const quota = item.quantidade_por_ciclo === null || item.quantidade_por_ciclo === undefined
                  ? null
                  : parseInt(item.quantidade_por_ciclo, 10);
                if (quota === null) return false;
                const used = usadosByItemId[String(item.id)] || 0;
                const required = requiredByItemId[String(item.id)] || 0;
                return (quota - used - required) < 0;
              });

              if (semSaldo) {
                throw new Error('Cota do clube esgotada.');
              }

              await trx('assinatura_usos').insert(usoRows);
            } catch (err) {
              if (err && err.code === '42P01') {
                logger.warn('[AgendamentoController] Tabela assinatura_usos não existe ainda; ignorando registro de uso de assinatura.');
              } else if (String(err?.message || '') === 'Cota do clube esgotada.') {
                valorTotalFinal = valorTotalBase;

                await trx('agendamentos')
                  .where('id', agendamento.id)
                  .update({ valor_total: valorTotalFinal, updated_at: new Date() });

                for (const servico of servicosData) {
                  await trx('agendamento_servicos')
                    .where({ agendamento_id: agendamento.id, servico_id: servico.id })
                    .update({ preco_aplicado: servico.preco });
                }

                for (const extra of servicosExtrasData) {
                  await trx('agendamento_servicos_extras')
                    .where({ agendamento_id: agendamento.id, servico_extra_id: extra.id })
                    .update({ preco_aplicado: extra.preco });
                }
              } else {
                throw err;
              }
            }
          }
        }

        // Compatibilidade com formato antigo de serviços
        if (servicos.length > 0) {
          const legacyServicoIds = (servicos || [])
            .map((s) => Number(s?.servico_id))
            .filter((id) => Number.isFinite(id) && id > 0);

          const legacyServicosRows = legacyServicoIds.length > 0
            ? await trx('servicos').whereIn('id', legacyServicoIds).select('id', 'comissao_percentual')
            : [];

          const legacyPercentById = (legacyServicosRows || []).reduce((acc, row) => {
            acc[String(row.id)] = row.comissao_percentual;
            return acc;
          }, {});

          const agendamentoServicos = servicos.map(servico => ({
            agendamento_id: agendamento.id,
            servico_id: servico.servico_id,
            preco_aplicado: servico.preco_aplicado,
            comissao_percentual_aplicada: legacyPercentById[String(servico.servico_id)]
          }));

          await trx('agendamento_servicos').insert(agendamentoServicos);
        }
      });

      // Buscar agendamento completo para retorno
      const agendamentoCompleto = await this.model.findWithServicos(agendamento.id);

      // NOVO: GATILHO DE PONTOS - Gerar pontos automaticamente ao criar agendamento
      try {
        // Buscar configurações de pontos da unidade
        const ConfiguracaoSistema = require('../models/ConfiguracaoSistema');
        const configuracaoModel = new ConfiguracaoSistema(this.model.db); // CORREÇÃO: Passar db
        const configuracao = await configuracaoModel.findByUnidade(unidade_id);

        if (configuracao && configuracao.pontos_ativo && valorTotalFinal > 0) {
          // Calcular pontos: pontos = valor_total * pontos_por_real
          const pontosPorReal = parseFloat(configuracao.pontos_por_real) || 1.00;
          const pontosValidade = configuracao.pontos_validade_meses || 12;
          const pontosGerados = Math.floor(valorTotalFinal * pontosPorReal);

          // Calcular data de validade
          const dataValidade = new Date();
          dataValidade.setMonth(dataValidade.getMonth() + pontosValidade);

          // Inserir crédito de pontos na tabela pontos_historico
          await this.model.db('pontos_historico').insert({
            cliente_id: clienteIdFinal,
            unidade_id: unidade_id,
            agendamento_id: agendamento.id,
            tipo: 'CREDITO',
            pontos: pontosGerados,
            valor_real: valorTotalFinal,
            descricao: `Pontos ganhos no agendamento #${agendamento.id}`,
            data_validade: dataValidade.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
            expirado: false,
            created_at: new Date()
          });

        }
      } catch (pontosError) {
        logger.error(' [AgendamentoController] Erro ao gerar pontos:', pontosError);
        // Não falhar a criação do agendamento por erro nos pontos
      }

      // GATILHO 1: Novo Agendamento Criado (Cliente)
      // Enviar notificação WhatsApp para o cliente
      // OTIMIZAÇÃO: NUNCA bloquear a resposta aguardando WhatsApp.
      // Em DEV pode haver delay proposital (15-40s) e fila, causando "Salvando..." por muito tempo.
      // Responder imediatamente e disparar envio em background.
      res.status(201).json({
        success: true,
        data: agendamentoCompleto,
        message: 'Agendamento criado com sucesso'
      });

      setImmediate(async () => {
        try {
          const dadosCompletos = await this.buscarDadosCompletos(agendamento.id);

          if (!dadosCompletos) {
            logger.error(' [AgendamentoController] (bg) Dados completos não encontrados para agendamento #' + agendamento.id);
            return;
          }

          if (dadosCompletos?.cliente_telefone || dadosCompletos?.agente_telefone) {
            const resultadoWhatsApp = await this.whatsAppService.sendAppointmentConfirmation(dadosCompletos);
          } else {
            logger.error(' [AgendamentoController] (bg) Nenhum telefone encontrado (cliente/agente) nos dados completos');
          }
        } catch (whatsappError) {
          logger.error(' [AgendamentoController] (bg) Erro no envio de WhatsApp:', whatsappError);
        }
      });

      return;
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

      if (error && error.httpStatus) {
        return res.status(error.httpStatus).json({
          success: false,
          error: 'Horário indisponível',
          message: error.message
        });
      }

      logger.error(' [AgendamentoController.store] Erro ao criar agendamento:', error);

      // Tratar erro de conflito do createWithLock ou da constraint do banco
      if (error && (error.code === 'CONFLICT' || error.code === '23P01' || error.constraint === 'agendamentos_no_overlap')) {
        return res.status(409).json({
          error: 'Conflito de horário',
          message: 'O agente já possui um agendamento neste horário'
        });
      }
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'production'
          ? 'Erro ao processar serviços extras'
          : error.message
      });
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
        .where('agendamentos.id', id);

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
            await trx('agendamento_produtos').insert(
              produtosValidos.map((p) => ({
                agendamento_id: parseInt(id, 10),
                produto_id: p.produto_id,
                quantidade: Number(Number(p.quantidade).toFixed(3)),
                preco_aplicado: Number((Number.isFinite(p.preco_aplicado) ? p.preco_aplicado : 0).toFixed(2)),
                agente_id: Number.isFinite(p.agente_id) ? p.agente_id : null,
                created_at: trx.fn.now()
              }))
            );
          }
        }

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
        .where('agendamentos.id', id);

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

      if (agendamento.status === 'Cancelado') {
        return res.status(400).json({
          success: false,
          error: 'Agendamento já está cancelado'
        });
      }

      const trxResult = await this.model.db.transaction(async (trx) => {
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
        .select('agendamentos.*')
        .first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado ou você não tem permissão para deletá-lo'
        });
      }

      // Deletar agendamento (hard delete)
      await this.model.db(this.model.tableName)
        .where('id', id)
        .del();

      return res.json({
        success: true,
        message: 'Agendamento deletado com sucesso',
        data: {
          id: parseInt(id)
        }
      });

    } catch (error) {
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

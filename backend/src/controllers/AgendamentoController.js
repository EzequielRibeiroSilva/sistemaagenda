const BaseController = require('./BaseController');
const Agendamento = require('../models/Agendamento');
const WhatsAppService = require('../services/WhatsAppService'); // ✅ CORREÇÃO: Usar WhatsAppService
const AuthService = require('../services/AuthService');

class AgendamentoController extends BaseController {
  constructor() {
    super(new Agendamento());
    this.whatsAppService = new WhatsAppService(); // ✅ CORREÇÃO: Usar WhatsAppService
    this.authService = new AuthService();
  }

  // GET /api/agendamentos - Buscar agendamentos do usuário logado
  async index(req, res) {
    try {
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;


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
        // ✅ CORREÇÃO CRÍTICA: Adicionar filtros de período e serviço
        data_inicio,
        data_fim,
        servico_id
      } = req.query;


      let data;

      if (data_agendamento) {
        // ✅ CORREÇÃO CRÍTICA: Para AGENTE, filtrar por agente_id diretamente
        if (userRole === 'AGENTE') {
          // Buscar o agente_id do usuário logado
          const agenteRecord = await this.model.db('agentes')
            .where('usuario_id', usuarioId)
            .select('id')
            .first();

          if (agenteRecord) {
            const allAgendamentos = await this.model.findByAgente(agenteRecord.id);

            // Filtrar apenas pela data específica
            data = allAgendamentos.filter(agendamento => {
              const agendamentoDate = agendamento.data_agendamento;
              // Converter Date para string no formato YYYY-MM-DD
              const dateString = agendamentoDate instanceof Date
                ? agendamentoDate.toISOString().split('T')[0]
                : agendamentoDate;
              return dateString === data_agendamento;
            });
          } else {
            data = [];
          }
        } else {
          // Para ADMIN/MASTER, usar o método original
          data = await this.model.findByData(data_agendamento, usuarioId);
        }
      } else if (agente_id && !unidade_id && !page && !limit) {
        // ✅ CORREÇÃO: Só usar findByAgente se NÃO há unidade_id nem paginação
        data = await this.model.findByAgente(parseInt(agente_id));
      } else if (cliente_id && !unidade_id && !page && !limit) {
        // ✅ CORREÇÃO: Só usar findByCliente se NÃO há unidade_id nem paginação
        data = await this.model.findByCliente(parseInt(cliente_id));
      } else if (page && limit) {
        // Para paginação, precisamos filtrar por usuário através das unidades
        const filters = {};
        if (status) filters.status = status;

        // Buscar agendamentos do usuário com paginação
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // IMPLEMENTAÇÃO RBAC E ORDENAÇÃO INTELIGENTE
        let baseQuery = this.model.db(this.model.tableName)
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
          .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
          .join('agentes', 'agendamentos.agente_id', 'agentes.id');

        // RBAC: Aplicar filtros baseados no role do usuário
        if (req.user?.role === 'AGENTE') {
          // AGENTE: Buscar o agente_id através da tabela agentes
          const agenteRecord = await this.model.db('agentes')
            .where('usuario_id', req.user.id)
            .select('id')
            .first();

          if (agenteRecord) {
            baseQuery = baseQuery.where('agendamentos.agente_id', agenteRecord.id);
          } else {
            // Se não encontrou agente, retornar vazio
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

          // ✅ NOVO: Filtrar por unidade_id se fornecido
          if (unidade_id) {
            queryBuilder.where('agendamentos.unidade_id', parseInt(unidade_id));
          }

          // ✅ NOVO: Filtro temporal (futuro/passado/hoje)
          if (time_filter) {

            const now = new Date();
            const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
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

          // ✅ CORREÇÃO CRÍTICA: REMOVER filtro de agendamentos passados
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

        data = await baseQuery
          .select(
            'agendamentos.*',
            this.model.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
            'clientes.telefone as cliente_telefone',
            this.model.db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome"),
            'agentes.avatar_url as agente_avatar_url', // ✅ CORREÇÃO CRÍTICA: Incluir avatar do agente
            'unidades.nome as unidade_nome'
          )
          .limit(parseInt(limit))
          .offset(offset)
          // ✅ ORDENAÇÃO INTELIGENTE: Agendamentos mais próximos da data atual primeiro
          // Ordena por proximidade: futuros próximos > hoje > passados recentes
          // Correção: usar diferença de dias (INTEGER) ao invés de EPOCH
          .orderBy(this.model.db.raw("ABS(agendamentos.data_agendamento - CURRENT_DATE)"), 'asc')
          .orderBy('agendamentos.data_agendamento', 'desc')
          .orderBy('agendamentos.hora_inicio', 'asc');


        // ✅ CORREÇÃO CRÍTICA: Incluir serviços para cada agendamento
        for (const agendamento of data) {
          const servicos = await this.model.db('agendamento_servicos')
            .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
            .where('agendamento_servicos.agendamento_id', agendamento.id)
            .select(
              'servicos.id',
              'servicos.nome',
              'agendamento_servicos.preco_aplicado as preco',
              'servicos.comissao_percentual'
            );
          
          // 🔍 DEBUG: Log para verificar comissão
          if (servicos.length > 0 && agendamento.status === 'Concluído') {
          }
          
          agendamento.servicos = servicos;
        }

        // Aplicar os mesmos filtros RBAC na contagem total
        let totalQuery = this.model.db(this.model.tableName)
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id');

        // RBAC: Aplicar filtros baseados no role do usuário
        if (req.user?.role === 'AGENTE') {
          // AGENTE: Buscar o agente_id através da tabela agentes
          const agenteRecord = await this.model.db('agentes')
            .where('usuario_id', req.user.id)
            .select('id')
            .first();

          if (agenteRecord) {
            totalQuery = totalQuery.where('agendamentos.agente_id', agenteRecord.id);
          } else {
            // Se não encontrou agente, total é 0
            const total = { count: 0 };
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
          totalQuery = totalQuery.where('unidades.usuario_id', usuarioId);
        }

        const total = await totalQuery
          .modify(function(queryBuilder) {
            if (status) {
              queryBuilder.where('agendamentos.status', status);
            }

            // ✅ NOVO: Filtrar por unidade_id se fornecido (mesma lógica da query principal)
            if (unidade_id) {
              queryBuilder.where('agendamentos.unidade_id', parseInt(unidade_id));
            }

            // ✅ NOVO: Filtro temporal (mesma lógica da query principal)
            if (time_filter) {
              const now = new Date();
              const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
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

            // ✅ CORREÇÃO CRÍTICA: REMOVER filtro de agendamentos passados no total também
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
          })
          .count('agendamentos.id as count')
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
        // ✅ CORREÇÃO CRÍTICA: Implementar filtros de período, agente e serviço

        // Construir query base com RBAC
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

        // ✅ APLICAR FILTROS DE PERÍODO
        if (data_inicio && data_fim) {
          baseQuery = baseQuery
            .where('agendamentos.data_agendamento', '>=', data_inicio)
            .where('agendamentos.data_agendamento', '<=', data_fim);
        }

        // ✅ APLICAR FILTRO DE UNIDADE
        if (unidade_id) {
          baseQuery = baseQuery.where('agendamentos.unidade_id', parseInt(unidade_id));
        }

        // ✅ APLICAR FILTRO DE AGENTE
        if (agente_id) {
          baseQuery = baseQuery.where('agendamentos.agente_id', parseInt(agente_id));
        }

        // ✅ APLICAR FILTRO DE SERVIÇO
        if (servico_id) {
          baseQuery = baseQuery
            .join('agendamento_servicos', 'agendamentos.id', 'agendamento_servicos.agendamento_id')
            .where('agendamento_servicos.servico_id', parseInt(servico_id));
        }

        // Executar query
        data = await baseQuery
          .select(
            'agendamentos.*',
            this.model.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
            'clientes.telefone as cliente_telefone',
            this.model.db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome"),
            'agentes.avatar_url as agente_avatar_url',
            'unidades.nome as unidade_nome'
          )
          .orderBy('agendamentos.data_agendamento', 'desc')
          .orderBy('agendamentos.hora_inicio', 'asc');

        // ✅ INCLUIR SERVIÇOS PARA CADA AGENDAMENTO
        for (const agendamento of data) {
          const servicos = await this.model.db('agendamento_servicos')
            .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
            .where('agendamento_servicos.agendamento_id', agendamento.id)
            .select(
              'servicos.id',
              'servicos.nome',
              'agendamento_servicos.preco_aplicado as preco',
              'servicos.comissao_percentual'
            );

          // 🔍 DEBUG: Log para verificar comissão
          if (servicos.length > 0) {
          }

          agendamento.servicos = servicos;
        }

      }

      return res.json({ data });
    } catch (error) {
      console.error('❌ [AgendamentoController.index] Erro ao buscar agendamentos:', error);
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
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;


      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, buscar o usuario_id do ADMIN que o criou
      if (userRole === 'AGENTE' && userAgenteId) {
        const Agente = require('../models/Agente');
        const agenteModel = new Agente();
        const agente = await agenteModel.findById(userAgenteId);

        if (agente && agente.usuario_id) {
          usuarioId = agente.usuario_id;
        }
      }

      const data = await this.model.findWithServicos(id);

      if (!data) {
        return res.status(404).json({
          error: 'Agendamento não encontrado'
        });
      }


      // ✅ CORREÇÃO CRÍTICA: Verificação de permissões específica por role
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
          .where('agendamentos.id', id)
          .where('unidades.usuario_id', usuarioId)
          .first();


        if (!agendamento) {

          // 🔍 DEBUG: Buscar informações adicionais para debug
          const debugInfo = await this.model.db(this.model.tableName)
            .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
            .where('agendamentos.id', id)
            .select('agendamentos.id', 'agendamentos.unidade_id', 'unidades.usuario_id', 'unidades.nome as unidade_nome')
            .first();


          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para ver este agendamento'
          });
        }
      }

      return res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('❌ [AgendamentoController.show] Erro no show:', error);
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

      // ✅ CORREÇÃO CRÍTICA: Para AGENTE, buscar o usuario_id do ADMIN dono da unidade
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

      // 🔧 CRIAR CLIENTE AUTOMATICAMENTE SE NECESSÁRIO
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

      // Verificar conflito de horário
      const hasConflict = await this.model.checkConflict(agente_id, data_agendamento, hora_inicio, hora_fim);
      if (hasConflict) {
        return res.status(400).json({ 
          error: 'Conflito de horário',
          message: 'O agente já possui um agendamento neste horário' 
        });
      }

      // Buscar dados dos serviços principais
      let servicosData = [];
      if (servico_ids.length > 0) {
        // ✅ NOVA ARQUITETURA MANY-TO-MANY: Verificar se os serviços estão associados à unidade
        servicosData = await this.model.db('servicos')
          .join('unidade_servicos', 'servicos.id', 'unidade_servicos.servico_id')
          .whereIn('servicos.id', servico_ids)
          .where('servicos.status', 'Ativo')
          .where('unidade_servicos.unidade_id', unidade_id)
          .select('servicos.id', 'servicos.nome', 'servicos.preco', 'servicos.duracao_minutos');

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
          .where('unidade_id', unidade_id)
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
      const valorTotal = valorServicos + valorExtras;

      const dadosAgendamento = {
        cliente_id: clienteIdFinal, // ✅ USAR O ID DO CLIENTE (CRIADO OU EXISTENTE)
        agente_id,
        unidade_id,
        data_agendamento,
        hora_inicio,
        hora_fim,
        valor_total: valorTotal,
        ...outrosDados
      };

      // Criar agendamento
      const agendamento = await this.model.create(dadosAgendamento);

      // Criar relacionamentos com serviços principais
      if (servicosData.length > 0) {
        const agendamentoServicos = servicosData.map(servico => ({
          agendamento_id: agendamento.id,
          servico_id: servico.id,
          preco_aplicado: servico.preco
        }));

        await this.model.db('agendamento_servicos').insert(agendamentoServicos);
      }

      // Criar relacionamentos com serviços extras
      if (servicosExtrasData.length > 0) {
        const agendamentoServicosExtras = servicosExtrasData.map(extra => ({
          agendamento_id: agendamento.id,
          servico_extra_id: extra.id,
          preco_aplicado: extra.preco
        }));

        await this.model.db('agendamento_servicos_extras').insert(agendamentoServicosExtras);
      }

      // Compatibilidade com formato antigo de serviços
      if (servicos.length > 0) {
        const agendamentoServicos = servicos.map(servico => ({
          agendamento_id: agendamento.id,
          servico_id: servico.servico_id,
          preco_aplicado: servico.preco_aplicado
        }));

        await this.model.db('agendamento_servicos').insert(agendamentoServicos);
      }

      // Buscar agendamento completo para retorno
      const agendamentoCompleto = await this.model.findWithServicos(agendamento.id);


      // 🚀 GATILHO 1: Novo Agendamento Criado (Cliente)
      // Enviar notificação WhatsApp para o cliente
      try {

        // Buscar dados completos para a mensagem
        const dadosCompletos = await this.buscarDadosCompletos(agendamento.id);
        
        if (!dadosCompletos) {
          return res.status(201).json({
            success: true,
            data: agendamentoCompleto,
            message: 'Agendamento criado com sucesso (WhatsApp: dados incompletos)'
          });
        }
        

        if (dadosCompletos && dadosCompletos.cliente && dadosCompletos.cliente.telefone) {
          
          // ✅ CORREÇÃO: Usar WhatsAppService.sendAppointmentConfirmation
          const resultadoWhatsApp = await this.whatsAppService.sendAppointmentConfirmation(dadosCompletos);


          if (resultadoWhatsApp.success) {
          } else {
          }
        } else {
          // Dados incompletos - não foi possível enviar notificação
        }
        
        
      } catch (whatsappError) {
        // Não falhar a criação do agendamento por erro no WhatsApp
      }

      return res.status(201).json({
        success: true,
        data: agendamentoCompleto,
        message: 'Agendamento criado com sucesso'
      });
    } catch (error) {
      console.error('❌ [AgendamentoController.store] Erro ao criar agendamento:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
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
        // ✅ SOLUÇÃO CRÍTICA: AGENTE só pode encontrar agendamentos em seu nome.
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
        // ✅ CORREÇÃO: O 404 agora significa que o agendamento não existe DENTRO DO ESCOPO DO USUÁRIO
        return res.status(404).json({ 
          success: false,
          error: 'Agendamento não encontrado ou acesso negado' 
        });
      }
      
      // A verificação de RBAC (userAgenteId && agendamento.agente_id !== userAgenteId) não é mais
      // estritamente necessária aqui, pois o filtro na query já garante o escopo,
      // mas se o usuário for ADMIN, ele já passou pelo filtro de unidade.
      // Manter apenas o filtro no SQL simplifica.

      // ✅ CORREÇÃO: Extrair apenas campos válidos da tabela agendamentos
      const {
        hora_inicio,
        hora_fim,
        agente_id,
        data_agendamento,
        status,
        forma_pagamento, // Frontend envia forma_pagamento
        observacoes,
        cliente_id,
        unidade_id
      } = req.body;

      // ✅ CORREÇÃO: Mapear forma_pagamento para metodo_pagamento (nome correto na tabela)
      const dadosParaAtualizar = {};

      if (hora_inicio !== undefined) dadosParaAtualizar.hora_inicio = hora_inicio;
      if (hora_fim !== undefined) dadosParaAtualizar.hora_fim = hora_fim;
      
      // ✅ REGRA DE NEGÓCIO: AGENTE só pode atualizar seu próprio agente_id. ADMIN pode trocar.
      if (userRole === 'AGENTE' && agente_id !== undefined && agente_id !== userAgenteId) {
         return res.status(403).json({ success: false, error: 'Acesso negado: AGENTE não pode alterar agente_id' });
      } else if (agente_id !== undefined) {
         dadosParaAtualizar.agente_id = agente_id; // ADMIN pode alterar
      }
      
      if (data_agendamento !== undefined) dadosParaAtualizar.data_agendamento = data_agendamento;
      if (status !== undefined) dadosParaAtualizar.status = status;
      if (forma_pagamento !== undefined) dadosParaAtualizar.metodo_pagamento = forma_pagamento; // ✅ CORREÇÃO
      if (observacoes !== undefined) dadosParaAtualizar.observacoes = observacoes;
      if (cliente_id !== undefined) dadosParaAtualizar.cliente_id = cliente_id;
      if (unidade_id !== undefined) dadosParaAtualizar.unidade_id = unidade_id;



      // Verificar conflito de horário se horário foi alterado
      if ((hora_inicio && hora_inicio !== agendamento.hora_inicio) ||
          (hora_fim && hora_fim !== agendamento.hora_fim) ||
          (agente_id && agente_id !== agendamento.agente_id) ||
          (data_agendamento && data_agendamento !== agendamento.data_agendamento)) {

        const novoAgenteId = agente_id || agendamento.agente_id;
        const novaData = data_agendamento || agendamento.data_agendamento;
        const novaHoraInicio = hora_inicio || agendamento.hora_inicio;
        const novaHoraFim = hora_fim || agendamento.hora_fim;

        const hasConflict = await this.model.checkConflict(
          novoAgenteId,
          novaData,
          novaHoraInicio,
          novaHoraFim,
          parseInt(id)
        );

        if (hasConflict) {
          return res.status(400).json({
            error: 'Conflito de horário',
            message: 'O agente já possui um agendamento neste horário'
          });
        }
      }

      const data = await this.model.update(id, dadosParaAtualizar); // ✅ CORREÇÃO: usar dados filtrados
      
      return res.json({ 
        success: true,
        data,
        message: 'Agendamento atualizado com sucesso' 
      });
    } catch (error) {
      console.error('❌ [AgendamentoController.update] Erro ao atualizar agendamento:', error);
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

      // ✅ CORREÇÃO CRÍTICA: Buscar dados separadamente para evitar problemas de JOIN
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

      // Buscar unidade separadamente
      const unidade = await this.model.db('unidades')
        .where('id', agendamento.unidade_id)
        .first();


      if (!cliente || !agente || !unidade) {
        return null;
      }

      // ✅ CORREÇÃO: Buscar serviços separadamente
      const servicos = await this.model.db('agendamento_servicos')
        .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .where('agendamento_servicos.agendamento_id', agendamentoId)
        .select('servicos.nome', 'servicos.preco');

      // ✅ CORREÇÃO: Lidar com estrutura antiga e nova da tabela clientes
      const nomeCliente = cliente.nome || `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();


      // ✅ CORREÇÃO: Formatar dados para o template usando objetos separados
      return {
        cliente: {
          nome: nomeCliente,
          telefone: cliente.telefone,
          email: cliente.email || null
        },
        agente: {
          nome: `${agente.nome} ${agente.sobrenome || ''}`.trim() // Nome completo do agente
        },
        unidade: {
          nome: unidade.nome,
          endereco: unidade.endereco
        },
        // ✅ CORREÇÃO: Usar dados dos serviços buscados separadamente
        servicos: servicos.map(s => ({
          nome: s.nome,
          preco: s.preco
        })),
        extras: [], // TODO: Buscar extras se necessário
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        hora_fim: agendamento.hora_fim,
        valor_total: agendamento.valor_total
      };

    } catch (error) {
      console.error('❌ [AgendamentoController.buscarDadosCompletos] Erro ao buscar dados completos:', error);
      return null;
    }
  }

  // PATCH /api/agendamentos/:id/finalize - Finalizar agendamento
  async finalize(req, res) {
    try {
      const { id } = req.params;
      const { paymentMethod } = req.body;
      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      // ✅ REMOÇÃO DA LÓGICA DE SOBRESCRITA DE usuarioId

      // Buscar agendamento com filtro de escopo
      let agendamentoQuery = this.model.db(this.model.tableName)
        .where('agendamentos.id', id);

      if (userRole === 'AGENTE' && userAgenteId) {
        // AGENTE: Filtro estrito pelo seu próprio ID de agente
        agendamentoQuery = agendamentoQuery.where('agendamentos.agente_id', userAgenteId);
      } else {
        // ADMIN/MASTER: Filtro pela unidade
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

      // ✅ RBAC: A permissão de AGENTE já está garantida pela query.

      // Verificar se já está finalizado
      if (agendamento.status === 'Concluído') {
        return res.status(400).json({
          success: false,
          error: 'Agendamento já está finalizado'
        });
      }

      // Atualizar status para Concluído
      const updateData = {
        status: 'Concluído',
        updated_at: new Date()
      };

      if (paymentMethod) {
        updateData.metodo_pagamento = paymentMethod; // ✅ CORREÇÃO: Usar metodo_pagamento
      }

      await this.model.db(this.model.tableName)
        .where('id', id)
        .update(updateData);

      return res.json({
        success: true,
        message: 'Agendamento finalizado com sucesso',
        data: {
          id: parseInt(id),
          status: 'Concluído',
          metodo_pagamento: updateData.metodo_pagamento || null // ✅ CORREÇÃO: Retornar o nome correto
        }
      });

    } catch (error) {
      console.error('❌ [AgendamentoController.finalize] Erro ao finalizar agendamento:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = AgendamentoController;

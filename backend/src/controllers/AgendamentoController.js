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
      
      if (!usuarioId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado' 
        });
      }

      const { page, limit, data_agendamento, agente_id, cliente_id, status } = req.query;

      let data;

      if (data_agendamento) {
        data = await this.model.findByData(data_agendamento, usuarioId);
      } else if (agente_id) {
        data = await this.model.findByAgente(parseInt(agente_id));
      } else if (cliente_id) {
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
          // ORDENAÇÃO INTELIGENTE: Agendamentos mais próximos primeiro
          .orderBy('agendamentos.data_agendamento', 'asc')
          .orderBy('agendamentos.hora_inicio', 'asc');

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
        data = await this.model.findByUsuario(usuarioId);
      }

      return res.json({ data });
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
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
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          error: 'Usuário não autenticado'
        });
      }

      const data = await this.model.findWithServicos(id);

      if (!data) {
        return res.status(404).json({
          error: 'Agendamento não encontrado'
        });
      }

      // Verificar se o agendamento pertence ao usuário (através da unidade)
      const agendamento = await this.model.db(this.model.tableName)
        .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
        .where('agendamentos.id', id)
        .where('unidades.usuario_id', usuarioId)
        .first();

      if (!agendamento) {
        return res.status(403).json({
          error: 'Acesso negado',
          message: 'Você não tem permissão para ver este agendamento'
        });
      }

      // RBAC: AGENTE só pode ver seus próprios agendamentos
      if (userRole === 'AGENTE' && userAgenteId && data.agente_id !== userAgenteId) {
        return res.status(403).json({
          error: 'Acesso negado',
          message: 'Agentes só podem ver seus próprios agendamentos'
        });
      }

      return res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('Erro no show:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/agendamentos - Criar novo agendamento
  async store(req, res) {
    try {
      console.log('');
      console.log('🔥🔥🔥 [AGENDAMENTO] MÉTODO STORE INICIADO 🔥🔥🔥');
      console.log('━'.repeat(80));
      console.log('Payload recebido:', JSON.stringify(req.body, null, 2));
      console.log('━'.repeat(80));
      console.log('');
      
      const usuarioId = req.user?.id;
      
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

      // Verificar se a unidade pertence ao usuário
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
          console.log(`✅ Cliente criado/encontrado automaticamente: ID ${clienteIdFinal}, Nome: ${cliente_nome}`);

        } catch (clienteError) {
          console.error('❌ Erro ao criar cliente automaticamente:', clienteError);
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
        servicosData = await this.model.db('servicos')
          .whereIn('id', servico_ids)
          .where('status', 'Ativo')
          .where('unidade_id', unidade_id)
          .select('id', 'nome', 'preco', 'duracao_minutos');

        if (servicosData.length !== servico_ids.length) {
          return res.status(400).json({
            error: 'Serviços inválidos',
            message: 'Um ou mais serviços não estão disponíveis'
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

      console.log('🔥 [AGENDAMENTO] Agendamento criado com sucesso, ID:', agendamento.id);
      console.log('🔥 [AGENDAMENTO] Iniciando bloco de envio WhatsApp...');
      console.log('🔥 [AGENDAMENTO] WhatsAppService existe?', !!this.whatsAppService);

      // 🚀 GATILHO 1: Novo Agendamento Criado (Cliente)
      // Enviar notificação WhatsApp para o cliente
      try {
        console.log('');
        console.log('━'.repeat(80));
        console.log('🔔 [WhatsApp] INICIANDO ENVIO DE NOTIFICAÇÃO');
        console.log('━'.repeat(80));
        console.log(`   Agendamento ID: ${agendamento.id}`);
        console.log(`   Cliente ID: ${agendamento.cliente_id}`);
        console.log('');

        // Buscar dados completos para a mensagem
        console.log('🔍 [WhatsApp] Buscando dados completos do agendamento...');
        const dadosCompletos = await this.buscarDadosCompletos(agendamento.id);
        
        if (!dadosCompletos) {
          console.error('❌ [WhatsApp] ERRO: buscarDadosCompletos retornou null');
          console.error('   Verifique se o agendamento foi criado corretamente no banco');
          console.log('━'.repeat(80));
          console.log('');
          return res.status(201).json({
            success: true,
            data: agendamentoCompleto,
            message: 'Agendamento criado com sucesso (WhatsApp: dados incompletos)'
          });
        }
        
        console.log('✅ [WhatsApp] Dados completos obtidos:');
        console.log(`   Cliente: ${dadosCompletos?.cliente?.nome}`);
        console.log(`   Telefone: ${dadosCompletos?.cliente?.telefone}`);
        console.log(`   Agente: ${dadosCompletos?.agente?.nome}`);
        console.log(`   Unidade: ${dadosCompletos?.unidade?.nome}`);
        console.log(`   Serviços: ${dadosCompletos?.servicos?.length || 0}`);
        console.log('');

        if (dadosCompletos && dadosCompletos.cliente && dadosCompletos.cliente.telefone) {
          console.log('📤 [WhatsApp] Enviando mensagem de confirmação...');
          console.log('');
          
          // ✅ CORREÇÃO: Usar WhatsAppService.sendAppointmentConfirmation
          const resultadoWhatsApp = await this.whatsAppService.sendAppointmentConfirmation(dadosCompletos);

          console.log('');
          console.log('📊 [WhatsApp] Resultado do envio:');
          console.log(JSON.stringify(resultadoWhatsApp, null, 2));
          console.log('');

          if (resultadoWhatsApp.success) {
            console.log(`✅ [WhatsApp] SUCESSO! Confirmação enviada para: ${dadosCompletos.cliente.nome}`);
            console.log(`   Telefone: ${dadosCompletos.cliente.telefone}`);
            console.log(`   Message ID: ${resultadoWhatsApp.data?.key?.id || 'N/A'}`);
          } else {
            console.error(`❌ [WhatsApp] FALHA ao enviar confirmação!`);
            console.error(`   Cliente: ${dadosCompletos.cliente.nome}`);
            console.error(`   Erro: ${JSON.stringify(resultadoWhatsApp.error)}`);
          }
        } else {
          console.error('⚠️ [WhatsApp] DADOS INCOMPLETOS - não foi possível enviar notificação');
          console.error('   Dados disponíveis:', {
            temDadosCompletos: !!dadosCompletos,
            temCliente: !!dadosCompletos?.cliente,
            temTelefone: !!dadosCompletos?.cliente?.telefone,
            telefone: dadosCompletos?.cliente?.telefone
          });
        }
        
        console.log('━'.repeat(80));
        console.log('');
        
      } catch (whatsappError) {
        // Não falhar a criação do agendamento por erro no WhatsApp
        console.error('');
        console.error('━'.repeat(80));
        console.error('❌ [WhatsApp] ERRO CRÍTICO ao enviar notificação!');
        console.error('━'.repeat(80));
        console.error(`   Tipo: ${whatsappError.name}`);
        console.error(`   Mensagem: ${whatsappError.message}`);
        console.error(`   Stack: ${whatsappError.stack}`);
        console.error('━'.repeat(80));
        console.error('');
      }

      return res.status(201).json({
        success: true,
        data: agendamentoCompleto,
        message: 'Agendamento criado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
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
      const usuarioId = req.user?.id;
      
      console.log('🔄 [AgendamentoController.update] Iniciando atualização');
      console.log('   ID do agendamento:', id);
      console.log('   Usuário ID:', usuarioId);
      console.log('   Body recebido:', JSON.stringify(req.body, null, 2));
      
      if (!usuarioId) {
        console.error('❌ [AgendamentoController.update] Usuário não autenticado');
        return res.status(401).json({ 
          success: false,
          error: 'Usuário não autenticado' 
        });
      }

      // Verificar se o agendamento pertence ao usuário
      const agendamento = await this.model.db(this.model.tableName)
        .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
        .where('agendamentos.id', id)
        .where('unidades.usuario_id', usuarioId)
        .select('agendamentos.*')
        .first();

      console.log('🔍 [AgendamentoController.update] Agendamento encontrado:', agendamento ? 'SIM' : 'NÃO');

      if (!agendamento) {
        console.error('❌ [AgendamentoController.update] Agendamento não encontrado');
        return res.status(404).json({ 
          success: false,
          error: 'Agendamento não encontrado ou acesso negado' 
        });
      }

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
      if (agente_id !== undefined) dadosParaAtualizar.agente_id = agente_id;
      if (data_agendamento !== undefined) dadosParaAtualizar.data_agendamento = data_agendamento;
      if (status !== undefined) dadosParaAtualizar.status = status;
      if (forma_pagamento !== undefined) dadosParaAtualizar.metodo_pagamento = forma_pagamento; // ✅ CORREÇÃO
      if (observacoes !== undefined) dadosParaAtualizar.observacoes = observacoes;
      if (cliente_id !== undefined) dadosParaAtualizar.cliente_id = cliente_id;
      if (unidade_id !== undefined) dadosParaAtualizar.unidade_id = unidade_id;

      console.log('📋 [AgendamentoController.update] Campos extraídos:', {
        hora_inicio,
        hora_fim,
        agente_id,
        data_agendamento,
        status,
        forma_pagamento: `${forma_pagamento} → metodo_pagamento`,
        observacoes,
        cliente_id,
        unidade_id
      });

      console.log('📋 [AgendamentoController.update] Dados para atualizar (filtrados):', dadosParaAtualizar);

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

      console.log('💾 [AgendamentoController.update] Chamando model.update...');
      const data = await this.model.update(id, dadosParaAtualizar); // ✅ CORREÇÃO: usar dados filtrados
      console.log('✅ [AgendamentoController.update] Atualização concluída:', data);
      
      return res.json({ 
        success: true,
        data,
        message: 'Agendamento atualizado com sucesso' 
      });
    } catch (error) {
      console.error('❌ [AgendamentoController.update] Erro ao atualizar agendamento:', error);
      console.error('   Stack:', error.stack);
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
      console.log('🔍 [buscarDadosCompletos] Iniciando busca para agendamento ID:', agendamentoId);

      // ✅ CORREÇÃO CRÍTICA: Buscar dados separadamente para evitar problemas de JOIN
      const agendamento = await this.model.db('agendamentos')
        .where('id', agendamentoId)
        .first();

      if (!agendamento) {
        console.log('❌ [buscarDadosCompletos] Agendamento não encontrado');
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

      console.log('🔍 [buscarDadosCompletos] Dados encontrados:', {
        agendamento: !!agendamento,
        cliente: !!cliente,
        agente: !!agente,
        unidade: !!unidade
      });

      if (!cliente || !agente || !unidade) {
        console.log('❌ [buscarDadosCompletos] Dados relacionados não encontrados');
        return null;
      }

      // ✅ CORREÇÃO: Buscar serviços separadamente
      const servicos = await this.model.db('agendamento_servicos')
        .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .where('agendamento_servicos.agendamento_id', agendamentoId)
        .select('servicos.nome', 'servicos.preco');

      // ✅ CORREÇÃO: Lidar com estrutura antiga e nova da tabela clientes
      const nomeCliente = cliente.nome || `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();

      console.log('🔍 [buscarDadosCompletos] Agendamento encontrado:', {
        id: agendamento.id,
        cliente: nomeCliente,
        telefone: cliente?.telefone,
        agente: agente?.nome,
        servicos: servicos.length
      });

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
      console.error('Erro ao buscar dados completos:', error);
      return null;
    }
  }

  // PATCH /api/agendamentos/:id/finalize - Finalizar agendamento
  async finalize(req, res) {
    try {
      const { id } = req.params;
      const { paymentMethod } = req.body;
      const usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      // Buscar agendamento
      const agendamento = await this.model.db(this.model.tableName)
        .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
        .where('agendamentos.id', id)
        .where('unidades.usuario_id', usuarioId)
        .select('agendamentos.*')
        .first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado'
        });
      }

      // RBAC: AGENTE só pode finalizar seus próprios agendamentos
      if (userRole === 'AGENTE' && userAgenteId && agendamento.agente_id !== userAgenteId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Agentes só podem finalizar seus próprios agendamentos'
        });
      }

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
        updateData.payment_method = paymentMethod;
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
          payment_method: paymentMethod || null
        }
      });

    } catch (error) {
      console.error('Erro ao finalizar agendamento:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = AgendamentoController;

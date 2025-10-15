const BaseController = require('./BaseController');
const Agendamento = require('../models/Agendamento');
const EvolutionApiService = require('../services/EvolutionApiService');
const AuthService = require('../services/AuthService');

class AgendamentoController extends BaseController {
  constructor() {
    super(new Agendamento());
    this.evolutionApi = new EvolutionApiService();
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
        
        data = await this.model.db(this.model.tableName)
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
          .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
          .join('agentes', 'agendamentos.agente_id', 'agentes.id')
          .where('unidades.usuario_id', usuarioId)
          .modify(function(queryBuilder) {
            if (status) {
              queryBuilder.where('agendamentos.status', status);
            }
          })
          .select(
            'agendamentos.*',
            'clientes.nome as cliente_nome',
            'clientes.telefone as cliente_telefone',
            'agentes.nome as agente_nome',
            'unidades.nome as unidade_nome'
          )
          .limit(parseInt(limit))
          .offset(offset)
          .orderBy('agendamentos.data_agendamento', 'desc')
          .orderBy('agendamentos.hora_inicio', 'asc');

        const total = await this.model.db(this.model.tableName)
          .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
          .where('unidades.usuario_id', usuarioId)
          .modify(function(queryBuilder) {
            if (status) {
              queryBuilder.where('agendamentos.status', status);
            }
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

      // 🚀 GATILHO 1: Novo Agendamento Criado (Cliente)
      // Enviar notificação WhatsApp para o cliente
      try {
        // Buscar dados completos para a mensagem
        const dadosCompletos = await this.buscarDadosCompletos(agendamento.id);

        if (dadosCompletos && dadosCompletos.cliente.telefone) {
          const template = this.evolutionApi.getTemplateNovoAgendamento(dadosCompletos);
          const resultadoWhatsApp = await this.evolutionApi.enviarMensagem(
            dadosCompletos.cliente.telefone,
            template
          );

          if (resultadoWhatsApp.success) {
            console.log(`✅ WhatsApp enviado para cliente: ${dadosCompletos.cliente.nome}`);
          } else {
            console.log(`⚠️ Falha ao enviar WhatsApp para cliente: ${resultadoWhatsApp.error}`);
          }
        }
      } catch (whatsappError) {
        // Não falhar a criação do agendamento por erro no WhatsApp
        console.error('❌ Erro ao enviar WhatsApp:', whatsappError.message);
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
      
      if (!usuarioId) {
        return res.status(401).json({ 
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

      if (!agendamento) {
        return res.status(404).json({ 
          error: 'Agendamento não encontrado ou acesso negado' 
        });
      }

      const { hora_inicio, hora_fim, agente_id, data_agendamento } = req.body;

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

      const data = await this.model.update(id, req.body);
      return res.json({ 
        data,
        message: 'Agendamento atualizado com sucesso' 
      });
    } catch (error) {
      console.error('Erro ao atualizar agendamento:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  // Método auxiliar para buscar dados completos do agendamento
  async buscarDadosCompletos(agendamentoId) {
    try {
      const resultado = await this.model.db('agendamentos')
        .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
        .join('agentes', 'agendamentos.agente_id', 'agentes.id')
        .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
        .leftJoin('agendamento_servicos', 'agendamentos.id', 'agendamento_servicos.agendamento_id')
        .leftJoin('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .where('agendamentos.id', agendamentoId)
        .select(
          'agendamentos.*',
          'clientes.nome as cliente_nome',
          'clientes.telefone as cliente_telefone',
          'clientes.email as cliente_email',
          'agentes.nome as agente_nome',
          'unidades.nome as unidade_nome',
          'unidades.endereco as unidade_endereco',
          'servicos.nome as servico_nome',
          'servicos.preco as servico_preco'
        )
        .first();

      if (!resultado) return null;

      // Formatar dados para o template
      return {
        cliente: {
          nome: resultado.cliente_nome,
          telefone: resultado.cliente_telefone,
          email: resultado.cliente_email
        },
        agente: {
          nome: resultado.agente_nome
        },
        unidade: {
          nome: resultado.unidade_nome,
          endereco: resultado.unidade_endereco
        },
        servico: {
          nome: resultado.servico_nome || 'Serviço não especificado',
          preco: resultado.servico_preco || resultado.valor_total || 0
        },
        data: new Date(resultado.data_agendamento).toLocaleDateString('pt-BR'),
        hora: resultado.hora_inicio
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

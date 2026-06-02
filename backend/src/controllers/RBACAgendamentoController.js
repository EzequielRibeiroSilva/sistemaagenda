const BaseController = require('./BaseController');
const Agendamento = require('../models/Agendamento');
const EvolutionApiService = require('../services/EvolutionApiService');
const AuthService = require('../services/AuthService');
const logger = require('./../utils/logger');

class RBACAgendamentoController extends BaseController {
  constructor() {
    super(new Agendamento());
    this.evolutionApi = new EvolutionApiService();
    this.authService = new AuthService();
  }

  // GET /api/agendamentos - Buscar agendamentos com filtros RBAC
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

      const { page, limit, data_agendamento, agente_id, cliente_id, status } = req.query;
      let data;

      // Aplicar filtros baseados no role do usuário
      switch (userRole) {
        case 'MASTER':
          // MASTER vê todos os agendamentos do sistema
          if (data_agendamento) {
            data = await this.model.db(this.model.tableName)
              .where('data_agendamento', data_agendamento)
              .whereNull('deleted_at')
              .select('*');
          } else if (agente_id) {
            data = await this.model.findByAgente(parseInt(agente_id));
          } else if (cliente_id) {
            data = await this.model.findByCliente(parseInt(cliente_id));
          } else if (page && limit) {
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const { db } = require('../config/knex');
            data = await this.model.db(this.model.tableName)
              .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
              .join('agentes', 'agendamentos.agente_id', 'agentes.id')
              .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
              .whereNull('agendamentos.deleted_at')
              .modify(function(queryBuilder) {
                if (status) queryBuilder.where('agendamentos.status', status);
              })
              .select([
                'agendamentos.*',
                db.raw("CONCAT(clientes.primeiro_nome, ' ', clientes.ultimo_nome) as cliente_nome"),
                'clientes.telefone as cliente_telefone',
                'agentes.nome as agente_nome',
                'unidades.nome as unidade_nome'
              ])
              .orderBy('agendamentos.data_agendamento', 'desc')
              .limit(parseInt(limit))
              .offset(offset);
          } else {
            data = await this.model.findAll();
          }
          break;

        case 'ADMIN':
          // ADMIN vê apenas agendamentos da sua unidade
          if (!req.user.unidade_id) {
            data = [];
            break;
          }
          
          if (data_agendamento) {
            data = await this.model.db(this.model.tableName)
              .where('unidade_id', req.user.unidade_id)
              .where('data_agendamento', data_agendamento)
              .whereNull('deleted_at');
          } else if (agente_id) {
            data = await this.model.db(this.model.tableName)
              .where('unidade_id', req.user.unidade_id)
              .where('agente_id', parseInt(agente_id))
              .whereNull('deleted_at');
          } else if (cliente_id) {
            data = await this.model.db(this.model.tableName)
              .where('unidade_id', req.user.unidade_id)
              .where('cliente_id', parseInt(cliente_id))
              .whereNull('deleted_at');
          } else if (page && limit) {
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const { db } = require('../config/knex');
            data = await this.model.db(this.model.tableName)
              .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
              .join('agentes', 'agendamentos.agente_id', 'agentes.id')
              .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
              .where('agendamentos.unidade_id', req.user.unidade_id)
              .whereNull('agendamentos.deleted_at')
              .modify(function(queryBuilder) {
                if (status) queryBuilder.where('agendamentos.status', status);
              })
              .select([
                'agendamentos.*',
                db.raw("CONCAT(clientes.primeiro_nome, ' ', clientes.ultimo_nome) as cliente_nome"),
                'clientes.telefone as cliente_telefone',
                'agentes.nome as agente_nome',
                'unidades.nome as unidade_nome'
              ])
              .orderBy('agendamentos.data_agendamento', 'desc')
              .limit(parseInt(limit))
              .offset(offset);
          } else {
            data = await this.model.db(this.model.tableName)
              .where('unidade_id', req.user.unidade_id)
              .whereNull('deleted_at');
          }
          break;

        case 'AGENTE':
          // AGENTE vê apenas seus próprios agendamentos
          if (data_agendamento) {
            data = await this.model.db(this.model.tableName)
              .where('agente_id', userAgenteId)
              .where('data_agendamento', data_agendamento)
              .whereNull('deleted_at');
          } else if (cliente_id) {
            data = await this.model.db(this.model.tableName)
              .where('agente_id', userAgenteId)
              .where('cliente_id', parseInt(cliente_id))
              .whereNull('deleted_at');
          } else if (page && limit) {
            const offset = (parseInt(page) - 1) * parseInt(limit);
            const { db } = require('../config/knex');
            data = await this.model.db(this.model.tableName)
              .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
              .join('agentes', 'agendamentos.agente_id', 'agentes.id')
              .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
              .where('agendamentos.agente_id', userAgenteId)
              .whereNull('agendamentos.deleted_at')
              .modify(function(queryBuilder) {
                if (status) queryBuilder.where('agendamentos.status', status);
              })
              .select([
                'agendamentos.*',
                db.raw("CONCAT(clientes.primeiro_nome, ' ', clientes.ultimo_nome) as cliente_nome"),
                'clientes.telefone as cliente_telefone',
                'agentes.nome as agente_nome',
                'unidades.nome as unidade_nome'
              ])
              .orderBy('agendamentos.data_agendamento', 'desc')
              .limit(parseInt(limit))
              .offset(offset);
          } else {
            data = await this.model.db(this.model.tableName)
              .where('agente_id', userAgenteId);
          }
          break;

        default:
          data = [];
      }

      res.json({
        data: data || [],
        message: 'Agendamentos listados com sucesso',
        user_role: req.user.role,
        filters_applied: req.user.role !== 'MASTER'
      });
    } catch (error) {
      logger.error('Erro ao listar agendamentos:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: 'Não foi possível listar os agendamentos'
      });
    }
  }

  // POST /api/agendamentos - Criar agendamento com validações RBAC
  async store(req, res) {
    try {
      const { cliente_id, agente_id, unidade_id, data_agendamento, hora_inicio, hora_fim, servicos, observacoes } = req.body;

      // ✅ NOVO: Determinar usuario_id (dono/empresa) para o agendamento
      // O campo usuario_id em agendamentos é NOT NULL e é usado para gerar numero_agendamento.
      let usuarioIdAgendamento = null;
      if (req.user.role === 'MASTER') {
        const unidadeInfo = await this.model.db('unidades')
          .where('id', parseInt(unidade_id))
          .select('usuario_id')
          .first();
        usuarioIdAgendamento = unidadeInfo?.usuario_id || null;
      } else if (req.user.role === 'ADMIN') {
        usuarioIdAgendamento = req.user.id;
      } else if (req.user.role === 'AGENTE') {
        // Para AGENTE, usar o dono da unidade como empresa
        const unidadeInfo = await this.model.db('unidades')
          .where('id', parseInt(unidade_id))
          .select('usuario_id')
          .first();
        usuarioIdAgendamento = unidadeInfo?.usuario_id || null;
      }

      if (!usuarioIdAgendamento) {
        return res.status(400).json({
          error: 'Unidade inválida',
          message: 'Não foi possível determinar o dono (usuario_id) da unidade para criar o agendamento'
        });
      }

      // Validações RBAC para criação
      switch (req.user.role) {
        case 'MASTER':
          // MASTER pode criar agendamentos em qualquer unidade
          break;
          
        case 'ADMIN':
          // ADMIN só pode criar agendamentos na sua unidade
          if (unidade_id !== req.user.unidade_id) {
            return res.status(403).json({
              error: 'Acesso negado',
              message: 'Você só pode criar agendamentos na sua unidade'
            });
          }
          break;
          
        case 'AGENTE':
          // AGENTE só pode criar agendamentos para si mesmo na sua unidade
          if (agente_id !== req.user.id || (req.user.unidade_id && unidade_id !== req.user.unidade_id)) {
            return res.status(403).json({
              error: 'Acesso negado',
              message: 'Você só pode criar agendamentos para si mesmo'
            });
          }
          break;
          
        default:
          return res.status(403).json({
            error: 'Role não reconhecido',
            message: 'Seu perfil não tem permissão para criar agendamentos'
          });
      }

      // Validações básicas
      if (!cliente_id || !agente_id || !unidade_id || !data_agendamento || !hora_inicio || !hora_fim) {
        return res.status(400).json({
          error: 'Dados obrigatórios',
          message: 'cliente_id, agente_id, unidade_id, data_agendamento, hora_inicio e hora_fim são obrigatórios'
        });
      }

      if (!servicos || !Array.isArray(servicos) || servicos.length === 0) {
        return res.status(400).json({
          error: 'Serviços obrigatórios',
          message: 'Pelo menos um serviço deve ser informado'
        });
      }

      // Calcular valor total
      let valorTotal = 0;
      for (const servico of servicos) {
        if (!servico.servico_id || !servico.preco_aplicado) {
          return res.status(400).json({
            error: 'Dados do serviço inválidos',
            message: 'servico_id e preco_aplicado são obrigatórios para cada serviço'
          });
        }
        valorTotal += parseFloat(servico.preco_aplicado);
      }

      // Criar agendamento
      const agendamentoData = {
        cliente_id: parseInt(cliente_id),
        agente_id: parseInt(agente_id),
        unidade_id: parseInt(unidade_id),
        usuario_id: usuarioIdAgendamento,
        data_agendamento,
        hora_inicio,
        hora_fim,
        valor_total: valorTotal.toFixed(2),
        status: 'Aprovado',
        status_pagamento: 'Não Pago',
        metodo_pagamento: 'Não definido',
        observacoes: observacoes || null
      };

      // ✅ CRÍTICO: Usar createWithLock para gerar numero_agendamento e evitar race condition
      const agendamento = await this.model.createWithLock(agendamentoData);

      const servicoIds = servicos
        .map((s) => Number(s?.servico_id))
        .filter((id) => Number.isFinite(id) && id > 0);

      const servicosRows = servicoIds.length > 0
        ? await this.model.db('servicos').whereIn('id', servicoIds).select('id', 'comissao_percentual')
        : [];

      const percentByServicoId = (servicosRows || []).reduce((acc, row) => {
        acc[String(row.id)] = row.comissao_percentual;
        return acc;
      }, {});

      // Associar serviços ao agendamento
      for (const servico of servicos) {
        await this.model.db('agendamento_servicos').insert({
          agendamento_id: agendamento.id,
          servico_id: parseInt(servico.servico_id),
          preco_aplicado: parseFloat(servico.preco_aplicado),
          comissao_percentual_aplicada: percentByServicoId[String(servico.servico_id)]
        });
      }

      // Buscar dados completos para resposta e WhatsApp
      const dadosCompletos = await this.buscarDadosCompletos(agendamento.id);

      // 🚀 GATILHO 1: Novo Agendamento Criado (Cliente)
      try {
        if (dadosCompletos && dadosCompletos.cliente.telefone) {
          const template = this.evolutionApi.getTemplateNovoAgendamento(dadosCompletos);
          const resultadoWhatsApp = await this.evolutionApi.enviarMensagem(
            dadosCompletos.cliente.telefone, 
            template
          );
          if (resultadoWhatsApp.success) {

          }
        }
      } catch (whatsappError) {
        logger.error('❌ Erro ao enviar WhatsApp:', whatsappError.message);
      }

      res.status(201).json({
        data: {
          ...agendamento,
          servicos: servicos.map(s => ({
            servico_id: s.servico_id,
            preco_aplicado: s.preco_aplicado
          }))
        },
        message: 'Agendamento criado com sucesso'
      });

    } catch (error) {
      logger.error('Erro ao criar agendamento:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: 'Não foi possível criar o agendamento'
      });
    }
  }

  // Método auxiliar para buscar dados completos do agendamento
  async buscarDadosCompletos(agendamentoId) {
    try {
      const { db } = require('../config/knex');
      const dados = await this.model.db('agendamentos')
        .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
        .join('agentes', 'agendamentos.agente_id', 'agentes.id')
        .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
        .where('agendamentos.id', agendamentoId)
        .whereNull('agendamentos.deleted_at')
        .select([
          'agendamentos.*',
          db.raw("CONCAT(clientes.primeiro_nome, ' ', clientes.ultimo_nome) as cliente_nome"),
          'clientes.telefone as cliente_telefone',
          'agentes.nome as agente_nome',
          'unidades.nome as unidade_nome'
        ])
        .first();

      if (!dados) return null;

      // Buscar serviços do agendamento
      const servicos = await this.model.db('agendamento_servicos')
        .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .where('agendamento_servicos.agendamento_id', agendamentoId)
        .select([
          'servicos.nome',
          'servicos.duracao_minutos',
          'agendamento_servicos.preco_aplicado'
        ]);

      return {
        agendamento: dados,
        cliente: {
          nome: dados.cliente_nome,
          telefone: dados.cliente_telefone
        },
        agente: {
          nome: dados.agente_nome
        },
        unidade: {
          nome: dados.unidade_nome
        },
        servicos
      };
    } catch (error) {
      logger.error('Erro ao buscar dados completos:', error);
      return null;
    }
  }
}

module.exports = RBACAgendamentoController;

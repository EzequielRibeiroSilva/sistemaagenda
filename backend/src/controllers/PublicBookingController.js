/**
 * Controller: PublicBookingController
 * Descrição: Endpoints públicos para sistema de agendamentos
 * Endpoints: GET /api/public/salao/:unidadeId, GET /api/public/agentes/:id/disponibilidade, POST /api/public/agendamento
 */

const Unidade = require('../models/Unidade');
const Agente = require('../models/Agente');
const Servico = require('../models/Servico');
const Cliente = require('../models/Cliente');
const Agendamento = require('../models/Agendamento');
const ConfiguracaoSistema = require('../models/ConfiguracaoSistema');
const HorarioFuncionamentoUnidade = require('../models/HorarioFuncionamentoUnidade');
const WhatsAppService = require('../services/WhatsAppService');
const { db } = require('../config/knex');

class PublicBookingController {
  constructor() {
    this.unidadeModel = new Unidade();
    this.agenteModel = new Agente();
    this.servicoModel = new Servico();
    this.clienteModel = new Cliente();
    this.agendamentoModel = new Agendamento();
    this.configuracaoModel = new ConfiguracaoSistema(db);
    this.whatsAppService = new WhatsAppService();
  }

  /**
   * GET /api/public/salao/:unidadeId
   * Carregar dados públicos do salão/unidade
   */
  async getSalaoData(req, res) {
    try {
      const { unidadeId } = req.params;
      
      console.log(`[PublicBooking] Carregando dados públicos para unidade ${unidadeId}`);

      // Buscar unidade
      const unidade = await this.unidadeModel.findById(unidadeId);
      if (!unidade || unidade.status !== 'Ativo') {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada',
          message: 'Esta unidade não está disponível para agendamentos'
        });
      }

      // Buscar configurações da unidade
      const configuracoes = await this.configuracaoModel.findByUnidade(unidadeId);

      // Buscar agentes ativos da unidade
      const agentes = await db('agentes')
        .where('unidade_id', unidadeId)
        .where('status', 'Ativo')
        .select('id', 'nome', 'nome_exibicao', 'biografia', 'avatar_url');

      // Buscar serviços ativos da unidade
      const servicos = await db('servicos')
        .where('unidade_id', unidadeId)
        .where('status', 'Ativo')
        .select('id', 'nome', 'descricao', 'preco', 'duracao_minutos', 'categoria_id');

      // Buscar horários de funcionamento da unidade
      const horariosFuncionamento = await db('horarios_funcionamento_unidade')
        .where('unidade_id', unidadeId)
        .select('dia_semana', 'horarios_json', 'is_aberto');

      const salonData = {
        unidade: {
          id: unidade.id,
          nome: unidade.nome,
          endereco: unidade.endereco,
          telefone: unidade.telefone,
          slug_url: unidade.slug_url
        },
        configuracoes: configuracoes || {
          nome_negocio: unidade.nome,
          logo_url: null,
          duracao_servico_horas: 1,
          tempo_limite_agendar_horas: 2,
          permitir_cancelamento: true,
          tempo_limite_cancelar_horas: 4,
          periodo_futuro_dias: 365
        },
        agentes,
        servicos,
        horarios_funcionamento: horariosFuncionamento
      };

      console.log(`[PublicBooking] Dados carregados: ${agentes.length} agentes, ${servicos.length} serviços`);

      res.json({
        success: true,
        data: salonData,
        message: 'Dados do salão carregados com sucesso'
      });

    } catch (error) {
      console.error('[PublicBooking] Erro ao carregar dados do salão:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao carregar dados do salão'
      });
    }
  }

  /**
   * GET /api/public/agentes/:id/disponibilidade?data=YYYY-MM-DD
   * Buscar disponibilidade de um agente em uma data específica
   */
  async getAgenteDisponibilidade(req, res) {
    try {
      const { id: agenteId } = req.params;
      const { data } = req.query;

      if (!data) {
        return res.status(400).json({
          success: false,
          error: 'Data obrigatória',
          message: 'Parâmetro data é obrigatório (formato: YYYY-MM-DD)'
        });
      }

      console.log(`[PublicBooking] Buscando disponibilidade do agente ${agenteId} para ${data}`);

      // Verificar se agente existe e está ativo
      const agente = await this.agenteModel.findById(agenteId);
      if (!agente || agente.status !== 'Ativo') {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'Este agente não está disponível'
        });
      }

      // Calcular dia da semana (0 = Domingo, 6 = Sábado)
      const dataObj = new Date(data + 'T00:00:00');
      const diaSemana = dataObj.getDay();

      // Buscar horários de funcionamento da unidade para este dia
      const horarioUnidade = await db('horarios_funcionamento_unidade')
        .where('unidade_id', agente.unidade_id)
        .where('dia_semana', diaSemana)
        .where('is_aberto', true)
        .first();

      if (!horarioUnidade) {
        return res.json({
          success: true,
          data: {
            slots_disponiveis: [],
            message: 'Unidade fechada neste dia'
          }
        });
      }

      // Buscar agendamentos existentes do agente nesta data
      const agendamentosExistentes = await db('agendamentos')
        .where('agente_id', agenteId)
        .where('data_agendamento', data)
        .whereIn('status', ['Aprovado', 'Confirmado'])
        .select('hora_inicio', 'hora_fim');

      // Gerar slots disponíveis baseado nos horários da unidade
      const slotsDisponiveis = this.generateAvailableSlots(
        horarioUnidade.horarios_json,
        agendamentosExistentes,
        60 // duração padrão em minutos
      );

      res.json({
        success: true,
        data: {
          agente_id: agenteId,
          data: data,
          dia_semana: diaSemana,
          slots_disponiveis: slotsDisponiveis
        }
      });

    } catch (error) {
      console.error('[PublicBooking] Erro ao buscar disponibilidade:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar disponibilidade'
      });
    }
  }

  /**
   * Gerar slots de horários disponíveis
   */
  generateAvailableSlots(horariosJson, agendamentosExistentes, duracaoMinutos) {
    const slots = [];
    
    for (const periodo of horariosJson) {
      const inicio = this.timeToMinutes(periodo.inicio);
      const fim = this.timeToMinutes(periodo.fim);
      
      for (let minuto = inicio; minuto <= fim - duracaoMinutos; minuto += duracaoMinutos) {
        const horarioSlot = this.minutesToTime(minuto);
        const horarioFim = this.minutesToTime(minuto + duracaoMinutos);
        
        // Verificar se não conflita com agendamentos existentes
        const conflito = agendamentosExistentes.some(agendamento => {
          const agendamentoInicio = this.timeToMinutes(agendamento.hora_inicio);
          const agendamentoFim = this.timeToMinutes(agendamento.hora_fim);
          
          return (minuto < agendamentoFim && (minuto + duracaoMinutos) > agendamentoInicio);
        });
        
        if (!conflito) {
          slots.push({
            hora_inicio: horarioSlot,
            hora_fim: horarioFim,
            disponivel: true
          });
        }
      }
    }
    
    return slots;
  }

  /**
   * Converter horário "HH:MM" para minutos
   */
  timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Converter minutos para horário "HH:MM"
   */
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * POST /api/public/agendamento
   * Criar novo agendamento
   */
  async createAgendamento(req, res) {
    const trx = await db.transaction();

    try {
      const {
        unidade_id,
        agente_id,
        servico_ids, // Array de IDs dos serviços
        data_agendamento,
        hora_inicio,
        cliente_nome,
        cliente_telefone,
        observacoes
      } = req.body;

      console.log('[PublicBooking] Criando agendamento:', req.body);

      // Validações básicas
      if (!unidade_id || !agente_id || !servico_ids || !data_agendamento || !hora_inicio || !cliente_nome || !cliente_telefone) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          error: 'Dados obrigatórios',
          message: 'Todos os campos obrigatórios devem ser preenchidos'
        });
      }

      // Verificar se unidade existe e está ativa
      const unidade = await trx('unidades').where('id', unidade_id).where('status', 'Ativo').first();
      if (!unidade) {
        await trx.rollback();
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada',
          message: 'Esta unidade não está disponível'
        });
      }

      // Verificar se agente existe e está ativo
      const agente = await trx('agentes').where('id', agente_id).where('status', 'Ativo').first();
      if (!agente) {
        await trx.rollback();
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'Este agente não está disponível'
        });
      }

      // Buscar serviços e calcular duração total e valor total
      const servicos = await trx('servicos')
        .whereIn('id', servico_ids)
        .where('status', 'Ativo')
        .select('id', 'nome', 'preco', 'duracao_minutos');

      if (servicos.length !== servico_ids.length) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          error: 'Serviços inválidos',
          message: 'Um ou mais serviços não estão disponíveis'
        });
      }

      const duracaoTotalMinutos = servicos.reduce((total, servico) => total + servico.duracao_minutos, 0);
      const valorTotal = servicos.reduce((total, servico) => total + parseFloat(servico.preco), 0);

      // Calcular hora_fim
      const horaInicioMinutos = this.timeToMinutes(hora_inicio);
      const horaFimMinutos = horaInicioMinutos + duracaoTotalMinutos;
      const hora_fim = this.minutesToTime(horaFimMinutos);

      // Verificar disponibilidade do agente
      const conflito = await trx('agendamentos')
        .where('agente_id', agente_id)
        .where('data_agendamento', data_agendamento)
        .whereIn('status', ['Aprovado', 'Confirmado'])
        .where(function() {
          this.where(function() {
            this.where('hora_inicio', '<=', hora_inicio)
                .where('hora_fim', '>', hora_inicio);
          }).orWhere(function() {
            this.where('hora_inicio', '<', hora_fim)
                .where('hora_fim', '>=', hora_fim);
          }).orWhere(function() {
            this.where('hora_inicio', '>=', hora_inicio)
                .where('hora_fim', '<=', hora_fim);
          });
        })
        .first();

      if (conflito) {
        await trx.rollback();
        return res.status(409).json({
          success: false,
          error: 'Horário indisponível',
          message: 'Este horário já está ocupado'
        });
      }

      // Criar ou buscar cliente
      let cliente = await trx('clientes')
        .where('telefone', cliente_telefone)
        .where('unidade_id', unidade_id)
        .first();

      if (!cliente) {
        const [novoCliente] = await trx('clientes').insert({
          nome: cliente_nome,
          telefone: cliente_telefone,
          unidade_id: unidade_id,
          status: 'Ativo'
        }).returning('*');
        cliente = novoCliente;
      }

      // Criar agendamento
      const [agendamento] = await trx('agendamentos').insert({
        cliente_id: cliente.id,
        agente_id: agente_id,
        unidade_id: unidade_id,
        data_agendamento: data_agendamento,
        hora_inicio: hora_inicio,
        hora_fim: hora_fim,
        status: 'Aprovado',
        valor_total: valorTotal,
        observacoes: observacoes || null
      }).returning('*');

      // Criar relacionamentos com serviços
      const agendamentoServicos = servicos.map(servico => ({
        agendamento_id: agendamento.id,
        servico_id: servico.id,
        preco_aplicado: servico.preco
      }));

      await trx('agendamento_servicos').insert(agendamentoServicos);

      await trx.commit();

      console.log(`[PublicBooking] Agendamento criado com sucesso: ID ${agendamento.id}`);

      // Preparar dados para notificação WhatsApp
      const agendamentoCompleto = {
        cliente: {
          nome: cliente.nome,
          telefone: cliente.telefone
        },
        agente: {
          nome: agente.nome
        },
        unidade: {
          nome: unidade.nome
        },
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        hora_fim: agendamento.hora_fim,
        valor_total: agendamento.valor_total,
        servicos: servicos.map(s => ({ nome: s.nome, preco: s.preco }))
      };

      // Enviar notificação WhatsApp (não bloquear a resposta)
      setImmediate(async () => {
        try {
          await this.whatsAppService.sendAppointmentConfirmation(agendamentoCompleto);
        } catch (whatsappError) {
          console.error('[PublicBooking] Erro ao enviar WhatsApp:', whatsappError);
          // Não falhar o agendamento por erro no WhatsApp
        }
      });

      // Retornar dados do agendamento criado
      res.status(201).json({
        success: true,
        data: {
          agendamento_id: agendamento.id,
          ...agendamentoCompleto
        },
        message: 'Agendamento criado com sucesso'
      });

    } catch (error) {
      await trx.rollback();
      console.error('[PublicBooking] Erro ao criar agendamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao criar agendamento'
      });
    }
  }
}

module.exports = PublicBookingController;

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

      // ✅ NOVA ARQUITETURA MANY-TO-MANY: Buscar serviços ativos da unidade
      const servicosRaw = await db('servicos')
        .join('unidade_servicos', 'servicos.id', 'unidade_servicos.servico_id')
        .where('unidade_servicos.unidade_id', unidadeId)
        .where('servicos.status', 'Ativo')
        .select('servicos.id', 'servicos.nome', 'servicos.descricao', 'servicos.preco', 'servicos.duracao_minutos', 'servicos.categoria_id');

      // Converter preços para números
      const servicos = servicosRaw.map(servico => ({
        ...servico,
        preco: parseFloat(servico.preco || 0)
      }));

      // Buscar serviços extras ativos da unidade
      const servicosExtrasRaw = await db('servicos_extras')
        .where('unidade_id', unidadeId)
        .where('status', 'Ativo')
        .select('id', 'nome', 'descricao', 'preco', 'duracao_minutos', 'categoria');

      // Converter preços para números e formatar para o frontend
      const extras = servicosExtrasRaw.map(extra => ({
        id: extra.id,
        name: extra.nome,
        description: extra.descricao,
        price: parseFloat(extra.preco),
        duration: extra.duracao_minutos,
        category: extra.categoria
      }));

      // Buscar associações serviço-extra para filtro condicional no frontend
      const associacoesServicoExtra = await db('servico_servicos_extras')
        .whereIn('servico_id', servicos.map(s => s.id))
        .select('servico_id', 'servico_extra_id');

      console.log(`[PublicBooking] Associações serviço-extra: ${associacoesServicoExtra.length} registros`);

      // Buscar associações agente-serviço para filtrar no frontend
      const associacoesAgenteServico = await db('agente_servicos')
        .whereIn('agente_id', agentes.map(a => a.id))
        .select('agente_id', 'servico_id');

      console.log(`[PublicBooking] Associações agente-serviço: ${associacoesAgenteServico.length} registros`);

      // Buscar horários de funcionamento dos agentes da unidade
      const horariosAgentes = await db('horarios_funcionamento')
        .whereIn('agente_id', agentes.map(a => a.id))
        .select('agente_id', 'dia_semana', 'ativo', 'periodos');

      console.log(`[PublicBooking] Horários dos agentes: ${horariosAgentes.length} registros`);

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
        extras,
        agente_servicos: associacoesAgenteServico,
        servico_extras: associacoesServicoExtra,
        horarios_agentes: horariosAgentes
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
   * GET /api/public/salao/:unidadeId/extras?servico_ids=1,2,3
   * Buscar extras filtrados por serviços selecionados (lógica de UNIÃO)
   */
  async getExtrasByServices(req, res) {
    try {
      const { unidadeId } = req.params;
      const { servico_ids } = req.query;

      console.log(`[PublicBooking] Buscando extras para unidade ${unidadeId} e serviços:`, servico_ids);

      if (!unidadeId) {
        return res.status(400).json({
          success: false,
          error: 'ID da unidade é obrigatório'
        });
      }

      if (!servico_ids) {
        return res.status(400).json({
          success: false,
          error: 'IDs dos serviços são obrigatórios'
        });
      }

      // Converter string para array se necessário
      const servicoIds = Array.isArray(servico_ids) ? servico_ids : servico_ids.split(',').map(id => parseInt(id));

      console.log(`[PublicBooking] Serviços processados:`, servicoIds);

      // Buscar extras associados aos serviços selecionados (UNIÃO)
      const extrasAssociados = await db('servicos_extras')
        .join('servico_servicos_extras', 'servicos_extras.id', 'servico_servicos_extras.servico_extra_id')
        .whereIn('servico_servicos_extras.servico_id', servicoIds)
        .where('servicos_extras.unidade_id', unidadeId)
        .where('servicos_extras.status', 'Ativo')
        .distinct('servicos_extras.id', 'servicos_extras.nome', 'servicos_extras.descricao',
                 'servicos_extras.preco', 'servicos_extras.duracao_minutos', 'servicos_extras.categoria')
        .orderBy('servicos_extras.categoria', 'servicos_extras.nome');

      // Formatar para o frontend
      const extras = extrasAssociados.map(extra => ({
        id: extra.id,
        name: extra.nome,
        description: extra.descricao,
        price: parseFloat(extra.preco),
        duration: extra.duracao_minutos,
        category: extra.categoria
      }));

      console.log(`[PublicBooking] Encontrados ${extras.length} extras para os serviços selecionados`);

      res.json({
        success: true,
        data: extras,
        message: `${extras.length} serviços extras encontrados`
      });

    } catch (error) {
      console.error('[PublicBooking] Erro ao buscar extras por serviços:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * GET /api/public/agentes/:id/disponibilidade?data=YYYY-MM-DD&duration=90&unidade_id=1
   * Buscar disponibilidade de um agente em uma data específica
   * Hierarquia: Horário Agente ∩ Horário Unidade ∩ Agendamentos Existentes
   * ✅ NOVO: Aceita unidade_id para filtrar horários quando agente trabalha em múltiplas unidades
   */
  async getAgenteDisponibilidade(req, res) {
    try {
      const { id: agenteId } = req.params;
      const { data, duration, unidade_id } = req.query;

      if (!data) {
        return res.status(400).json({
          success: false,
          error: 'Data obrigatória',
          message: 'Parâmetro data é obrigatório (formato: YYYY-MM-DD)'
        });
      }

      // Duração em minutos (padrão: 60 min)
      const duracaoMinutos = parseInt(duration) || 60;

      console.log(`[PublicBooking] Buscando disponibilidade do agente ${agenteId} para ${data} (duração: ${duracaoMinutos}min)`);

      // Verificar se agente existe e está ativo
      const agente = await this.agenteModel.findById(agenteId);
      if (!agente || agente.status !== 'Ativo') {
        return res.status(404).json({
          success: false,
          error: 'Agente não encontrado',
          message: 'Este agente não está disponível'
        });
      }

      // ✅ CORREÇÃO: Usar unidade_id do parâmetro se fornecido, senão usar do agente
      const unidadeIdParaUsar = unidade_id ? parseInt(unidade_id) : agente.unidade_id;
      console.log(`[PublicBooking] Usando unidade_id: ${unidadeIdParaUsar} (parâmetro: ${unidade_id}, agente: ${agente.unidade_id})`);

      // Calcular dia da semana (0 = Domingo, 6 = Sábado)
      const dataObj = new Date(data + 'T00:00:00');
      const diaSemana = dataObj.getDay();

      // 1. HIERARQUIA: Buscar horários de funcionamento da UNIDADE
      // ✅ CORREÇÃO: Usar unidadeIdParaUsar ao invés de agente.unidade_id
      const horarioUnidade = await db('horarios_funcionamento_unidade')
        .where('unidade_id', unidadeIdParaUsar)
        .where('dia_semana', diaSemana)
        .where('is_aberto', true)
        .first();

      if (!horarioUnidade || !horarioUnidade.horarios_json || horarioUnidade.horarios_json.length === 0) {
        return res.json({
          success: true,
          data: {
            agente_id: agenteId,
            data: data,
            dia_semana: diaSemana,
            slots_disponiveis: [],
            message: 'Unidade fechada neste dia'
          }
        });
      }

      // 2. HIERARQUIA: Buscar horários específicos do AGENTE (ativo ou inativo)
      // ✅ CORREÇÃO: Filtrar por unidade_id quando agente trabalha em múltiplas unidades
      const horarioAgente = await db('horarios_funcionamento')
        .where('agente_id', agenteId)
        .where('dia_semana', diaSemana)
        .where(function() {
          // Se unidade_id foi fornecido, filtrar por ele
          if (unidade_id) {
            this.where('unidade_id', unidadeIdParaUsar);
          }
        })
        .first();

      console.log(`[PublicBooking] Horário do agente para dia ${diaSemana}:`, horarioAgente);

      // REGRA DE INTERSEÇÃO: Calcular (Horários do Agente) ∩ (Horários do Local)
      let horariosParaUsar = [];

      if (horarioAgente && horarioAgente.ativo && horarioAgente.periodos && horarioAgente.periodos.length > 0) {
        // Agente tem horário personalizado e trabalha neste dia
        console.log(`[PublicBooking] Horários do agente:`, horarioAgente.periodos);
        console.log(`[PublicBooking] Horários da unidade:`, horarioUnidade.horarios_json);

        // APLICAR INTERSEÇÃO: Para cada período do agente, calcular sobreposição com períodos da unidade
        horariosParaUsar = this.calcularIntersecaoHorarios(horarioAgente.periodos, horarioUnidade.horarios_json);
        console.log(`[PublicBooking] Horários após interseção:`, horariosParaUsar);

      } else if (horarioAgente && (!horarioAgente.ativo || !horarioAgente.periodos || horarioAgente.periodos.length === 0)) {
        // Agente tem folga neste dia (ativo = false ou sem períodos)
        horariosParaUsar = [];
        console.log(`[PublicBooking] Agente tem folga neste dia`);

      } else {
        // Agente não tem horário personalizado, usar da unidade (caso raro)
        horariosParaUsar = horarioUnidade.horarios_json;
        console.log(`[PublicBooking] Usando horário padrão da unidade (agente sem horário personalizado):`, horariosParaUsar);
      }

      // Verificar se há horários para trabalhar (se vazio = folga)
      if (!horariosParaUsar || horariosParaUsar.length === 0) {
        return res.json({
          success: true,
          data: {
            agente_id: parseInt(agenteId),
            data: data,
            dia_semana: diaSemana,
            duracao_minutos: duracaoMinutos,
            slots_disponiveis: [],
            total_slots: 0,
            message: 'Agente não trabalha neste dia'
          }
        });
      }

      // 3. HIERARQUIA: Buscar agendamentos existentes do agente nesta data
      const agendamentosExistentes = await db('agendamentos')
        .where('agente_id', agenteId)
        .where('data_agendamento', data)
        .whereIn('status', ['Aprovado', 'Confirmado'])
        .select('hora_inicio', 'hora_fim');

      console.log(`[PublicBooking] Agendamentos existentes: ${agendamentosExistentes.length}`);

      // 4. CALCULAR: Gerar slots disponíveis respeitando todas as restrições
      const slotsDisponiveis = this.generateAvailableSlots(
        horariosParaUsar,
        agendamentosExistentes,
        duracaoMinutos
      );

      // Retornar slots completos com hora_inicio, hora_fim e disponivel
      const horariosDisponiveis = slotsDisponiveis;

      res.json({
        success: true,
        data: {
          agente_id: parseInt(agenteId),
          data: data,
          dia_semana: diaSemana,
          duracao_minutos: duracaoMinutos,
          slots_disponiveis: horariosDisponiveis,
          total_slots: horariosDisponiveis.length,
          message: horariosDisponiveis.length === 0 ? 'Nenhum horário disponível neste dia' : `${horariosDisponiveis.length} horários disponíveis`
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
   * Algoritmo: Para cada período de funcionamento, gerar slots de 15 em 15 minutos
   * e verificar se há espaço suficiente para a duração solicitada
   */
  generateAvailableSlots(horariosJson, agendamentosExistentes, duracaoMinutos) {
    const slots = [];
    // CORREÇÃO CRÍTICA: Usar a duração do serviço como intervalo dos slots
    const intervaloSlot = duracaoMinutos; // Slots baseados na duração real do serviço

    for (const periodo of horariosJson) {
      const inicio = this.timeToMinutes(periodo.inicio);
      const fim = this.timeToMinutes(periodo.fim);

      // Gerar slots baseados na duração do serviço (ex: 60min = slots de hora em hora)
      for (let minuto = inicio; minuto <= fim - duracaoMinutos; minuto += intervaloSlot) {
        const horarioSlot = this.minutesToTime(minuto);
        const horarioFim = this.minutesToTime(minuto + duracaoMinutos);

        // Verificar se há espaço suficiente para a duração completa
        if (minuto + duracaoMinutos > fim) {
          continue; // Não cabe no período de funcionamento
        }

        // Verificar se não conflita com agendamentos existentes
        const conflito = agendamentosExistentes.some(agendamento => {
          const agendamentoInicio = this.timeToMinutes(agendamento.hora_inicio);
          const agendamentoFim = this.timeToMinutes(agendamento.hora_fim);

          // Verificar sobreposição: novo agendamento não pode começar antes do fim do existente
          // nem terminar depois do início do existente
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

    // Ordenar slots por horário
    slots.sort((a, b) => this.timeToMinutes(a.hora_inicio) - this.timeToMinutes(b.hora_inicio));

    return slots;
  }

  /**
   * REGRA DE INTERSEÇÃO: Calcular sobreposição entre horários do agente e da unidade
   * Retorna apenas os períodos onde ambos (agente E unidade) estão funcionando
   */
  calcularIntersecaoHorarios(horariosAgente, horariosUnidade) {
    const intersecoes = [];

    for (const periodoAgente of horariosAgente) {
      for (const periodoUnidade of horariosUnidade) {
        // Converter para minutos para facilitar cálculos
        const agenteInicio = this.timeToMinutes(periodoAgente.inicio);
        const agenteFim = this.timeToMinutes(periodoAgente.fim);
        const unidadeInicio = this.timeToMinutes(periodoUnidade.inicio);
        const unidadeFim = this.timeToMinutes(periodoUnidade.fim);

        // Calcular interseção: início = max(início1, início2), fim = min(fim1, fim2)
        const intersecaoInicio = Math.max(agenteInicio, unidadeInicio);
        const intersecaoFim = Math.min(agenteFim, unidadeFim);

        // Se há sobreposição válida (início < fim)
        if (intersecaoInicio < intersecaoFim) {
          intersecoes.push({
            inicio: this.minutesToTime(intersecaoInicio),
            fim: this.minutesToTime(intersecaoFim)
          });
        }
      }
    }

    // Remover duplicatas e ordenar
    const intersecoesSemDuplicatas = intersecoes.filter((periodo, index, array) =>
      index === array.findIndex(p => p.inicio === periodo.inicio && p.fim === periodo.fim)
    );

    return intersecoesSemDuplicatas.sort((a, b) => this.timeToMinutes(a.inicio) - this.timeToMinutes(b.inicio));
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
        servico_extra_ids = [], // Array de IDs dos serviços extras (opcional)
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

      // Buscar serviços extras se fornecidos
      let servicosExtras = [];
      if (servico_extra_ids.length > 0) {
        servicosExtras = await trx('servicos_extras')
          .whereIn('id', servico_extra_ids)
          .where('status', 'Ativo')
          .where('unidade_id', unidade_id)
          .select('id', 'nome', 'preco', 'duracao_minutos');

        if (servicosExtras.length !== servico_extra_ids.length) {
          await trx.rollback();
          return res.status(400).json({
            success: false,
            error: 'Serviços extras inválidos',
            message: 'Um ou mais serviços extras não estão disponíveis'
          });
        }
      }

      // Calcular duração e valor total (serviços + extras)
      const duracaoServicos = servicos.reduce((total, servico) => total + servico.duracao_minutos, 0);
      const duracaoExtras = servicosExtras.reduce((total, extra) => total + extra.duracao_minutos, 0);
      const duracaoTotalMinutos = duracaoServicos + duracaoExtras;

      const valorServicos = servicos.reduce((total, servico) => total + parseFloat(servico.preco), 0);
      const valorExtras = servicosExtras.reduce((total, extra) => total + parseFloat(extra.preco), 0);
      const valorTotal = valorServicos + valorExtras;

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
        // Dividir nome em primeiro e último nome
        const nomePartes = cliente_nome.trim().split(' ');
        const primeiro_nome = nomePartes[0];
        const ultimo_nome = nomePartes.slice(1).join(' ') || '';

        const [novoCliente] = await trx('clientes').insert({
          primeiro_nome,
          ultimo_nome,
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

      // Criar relacionamentos com serviços extras (se houver)
      if (servicosExtras.length > 0) {
        const agendamentoServicosExtras = servicosExtras.map(extra => ({
          agendamento_id: agendamento.id,
          servico_extra_id: extra.id,
          preco_aplicado: extra.preco
        }));

        await trx('agendamento_servicos_extras').insert(agendamentoServicosExtras);
      }

      await trx.commit();

      console.log(`[PublicBooking] Agendamento criado com sucesso: ID ${agendamento.id}`);

      // Preparar dados para notificação WhatsApp
      const nomeCompleto = `${cliente.primeiro_nome} ${cliente.ultimo_nome}`.trim();
      const agendamentoCompleto = {
        cliente: {
          nome: nomeCompleto,
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
        servicos: servicos.map(s => ({ nome: s.nome, preco: s.preco })),
        extras: servicosExtras.map(e => ({ nome: e.nome, preco: e.preco }))
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

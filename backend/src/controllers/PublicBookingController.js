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
const ScheduledReminderService = require('../services/ScheduledReminderService'); // ✅ NOVO
const { getInstance: getPublicSessionService } = require('../services/PublicSessionService'); // ✅ CORREÇÃO 1.2
const { db } = require('../config/knex');
const logger = require('./../utils/logger');

class PublicBookingController {
  constructor() {
    this.unidadeModel = new Unidade();
    this.agenteModel = new Agente();
    this.servicoModel = new Servico();
    this.clienteModel = new Cliente();
    this.agendamentoModel = new Agendamento();
    this.configuracaoModel = new ConfiguracaoSistema(db);
    this.whatsAppService = new WhatsAppService();
    this.scheduledReminderService = new ScheduledReminderService(); // ✅ NOVO
    this.publicSessionService = getPublicSessionService(); // ✅ CORREÇÃO 1.2
  }

  /**
   * GET /api/public/salao/:unidadeId
   * Carregar dados públicos do salão/unidade
   */
  async getSalaoData(req, res) {
    try {
      const { unidadeId } = req.params;

      logger.log(`[PublicBooking] Carregando dados públicos para unidade ${unidadeId}`);

      // Buscar unidade
      const unidade = await this.unidadeModel.findById(unidadeId);

      // ✅ CORREÇÃO: Se unidade não está ativa, retornar usuario_id para buscar alternativas
      if (!unidade || unidade.status !== 'Ativo') {
        // Se a unidade existe mas está excluída, retornar usuario_id para o frontend buscar alternativas
        if (unidade && unidade.usuario_id) {
          logger.log(`[PublicBooking] Unidade ${unidadeId} não está ativa (status=${unidade.status}), retornando usuario_id=${unidade.usuario_id} para buscar alternativas`);
          return res.status(404).json({
            success: false,
            error: 'Unidade não disponível',
            message: 'Esta unidade não está disponível para agendamentos',
            usuario_id: unidade.usuario_id // ✅ Permite buscar unidades alternativas
          });
        }
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada',
          message: 'Esta unidade não está disponível para agendamentos'
        });
      }

      // Buscar configurações da unidade
      let configuracoes = await this.configuracaoModel.findByUnidade(unidadeId);
      
      logger.log(`[PublicBooking] Configurações da unidade ${unidadeId}:`, {
        logo_url: configuracoes?.logo_url,
        nome_negocio: configuracoes?.nome_negocio,
        usuario_id: unidade.usuario_id
      });
      
      // ✅ CORREÇÃO: Se a unidade não tem configurações OU não tem logo, buscar logo de qualquer unidade do usuário
      if ((!configuracoes || !configuracoes.logo_url) && unidade.usuario_id) {
        logger.log(`[PublicBooking] Unidade ${unidadeId} sem logo, buscando logo global do usuário ${unidade.usuario_id}`);
        
        // Se não tem configurações, criar objeto padrão
        if (!configuracoes) {
          configuracoes = {
            nome_negocio: unidade.nome,
            logo_url: null,
            duracao_servico_horas: 1,
            tempo_limite_agendar_horas: 2,
            permitir_cancelamento: true,
            tempo_limite_cancelar_horas: 4,
            periodo_futuro_dias: 365
          };
        }
        
        // Buscar TODAS as unidades do usuário
        const unidadesDoUsuario = await db('unidades')
          .where('usuario_id', unidade.usuario_id)
          .where('status', 'Ativo')
          .orderBy('id', 'asc');
        
        logger.log(`[PublicBooking] Encontradas ${unidadesDoUsuario.length} unidades do usuário ${unidade.usuario_id}`);
        
        // Buscar a primeira unidade que tenha logo configurado
        for (const unidadeAux of unidadesDoUsuario) {
          if (unidadeAux.id !== unidadeId) {
            const configAux = await this.configuracaoModel.findByUnidade(unidadeAux.id);
            if (configAux && configAux.logo_url) {
              logger.log(`[PublicBooking] ✅ Logo encontrado na unidade ${unidadeAux.id}: ${configAux.logo_url}`);
              configuracoes.logo_url = configAux.logo_url;
              configuracoes.nome_negocio = configAux.nome_negocio || configuracoes.nome_negocio;
              break;
            } else {
              logger.log(`[PublicBooking] ❌ Unidade ${unidadeAux.id} também não tem logo`);
            }
          }
        }
        
        if (!configuracoes.logo_url) {
          logger.log(`[PublicBooking] ⚠️ Nenhuma unidade do usuário ${unidade.usuario_id} tem logo configurado`);
        }
      }

      // ✅ CORREÇÃO CRÍTICA: Buscar agentes usando tabela de associação agente_unidades
      // Isso garante que apenas agentes REALMENTE associados à unidade sejam retornados
      const agentes = await db('agentes')
        .join('agente_unidades', 'agentes.id', 'agente_unidades.agente_id')
        .where('agente_unidades.unidade_id', unidadeId)
        .where('agentes.status', 'Ativo')
        .select('agentes.id', 'agentes.nome', 'agentes.nome_exibicao', 'agentes.biografia', 'agentes.avatar_url')
        .distinct();

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

      logger.log(`[PublicBooking] Associações serviço-extra: ${associacoesServicoExtra.length} registros`);

      // Buscar associações agente-serviço para filtrar no frontend
      const associacoesAgenteServico = await db('agente_servicos')
        .whereIn('agente_id', agentes.map(a => a.id))
        .select('agente_id', 'servico_id');

      logger.log(`[PublicBooking] Associações agente-serviço: ${associacoesAgenteServico.length} registros`);

      // Buscar horários de funcionamento dos agentes da unidade
      // ✅ CORREÇÃO CRÍTICA: Filtrar por unidade_id para agentes multi-unidade
      const horariosAgentes = await db('horarios_funcionamento')
        .whereIn('agente_id', agentes.map(a => a.id))
        .where('unidade_id', unidadeId) // ✅ Filtrar apenas horários desta unidade
        .select('agente_id', 'dia_semana', 'ativo', 'periodos');

      logger.log(`[PublicBooking] Horários dos agentes para unidade ${unidadeId}: ${horariosAgentes.length} registros`);

      // ✅ CORREÇÃO CRÍTICA: Buscar horários de funcionamento DA UNIDADE
      // Necessário para determinar quais dias a unidade está aberta (interseção com horários do agente)
      const horariosUnidade = await db('horarios_funcionamento_unidade')
        .where('unidade_id', unidadeId)
        .select('dia_semana', 'is_aberto', 'horarios_json')
        .orderBy('dia_semana');

      logger.log(`[PublicBooking] Horários da unidade ${unidadeId}: ${horariosUnidade.length} registros`);

      const salonData = {
        unidade: {
          id: unidade.id,
          nome: unidade.nome,
          endereco: unidade.endereco,
          telefone: unidade.telefone,
          slug_url: unidade.slug_url,
          usuario_id: unidade.usuario_id // ✅ CRÍTICO: Incluir usuario_id para buscar todos os locais
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
        horarios_agentes: horariosAgentes,
        horarios_unidade: horariosUnidade // ✅ CRÍTICO: Incluir horários da unidade para interseção no frontend
      };

      logger.log(`[PublicBooking] Dados carregados: ${agentes.length} agentes, ${servicos.length} serviços`);

      res.json({
        success: true,
        data: salonData,
        message: 'Dados do salão carregados com sucesso'
      });

    } catch (error) {
      logger.error('[PublicBooking] Erro ao carregar dados do salão:', error);
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

      logger.log(`[PublicBooking] Buscando extras para unidade ${unidadeId} e serviços:`, servico_ids);

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

      logger.log(`[PublicBooking] Serviços processados:`, servicoIds);

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

      logger.log(`[PublicBooking] Encontrados ${extras.length} extras para os serviços selecionados`);

      res.json({
        success: true,
        data: extras,
        message: `${extras.length} serviços extras encontrados`
      });

    } catch (error) {
      logger.error('[PublicBooking] Erro ao buscar extras por serviços:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * GET /api/public/agentes/:id/disponibilidade?data=YYYY-MM-DD&duration=90&unidade_id=1&exclude_agendamento_id=123
   * Buscar disponibilidade de um agente em uma data específica
   * Hierarquia: Horário Agente ∩ Horário Unidade ∩ Agendamentos Existentes
   * ✅ NOVO: Aceita unidade_id para filtrar horários quando agente trabalha em múltiplas unidades
   * ✅ NOVO: Aceita exclude_agendamento_id para excluir agendamento atual da verificação de conflitos (reagendamento)
   */
  async getAgenteDisponibilidade(req, res) {
    try {
      const { id: agenteId } = req.params;
      const { data, duration, unidade_id, exclude_agendamento_id } = req.query;

      if (!data) {
        return res.status(400).json({
          success: false,
          error: 'Data obrigatória',
          message: 'Parâmetro data é obrigatório (formato: YYYY-MM-DD)'
        });
      }

      // Duração em minutos (padrão: 60 min)
      const duracaoMinutos = parseInt(duration) || 60;

      logger.log(`[PublicBooking] Buscando disponibilidade do agente ${agenteId} para ${data} (duração: ${duracaoMinutos}min, exclude: ${exclude_agendamento_id || 'nenhum'})`);

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
      logger.log(`[PublicBooking] Usando unidade_id: ${unidadeIdParaUsar} (parâmetro: ${unidade_id}, agente: ${agente.unidade_id})`);

      // ✅ NOVO: Buscar configurações da unidade para tempo_limite_agendar_horas
      const configuracoes = await db('configuracoes_sistema')
        .where('unidade_id', unidadeIdParaUsar)
        .select('tempo_limite_agendar_horas')
        .first();

      const tempoLimiteHoras = configuracoes?.tempo_limite_agendar_horas || 0;
      logger.log(`[PublicBooking] 🔍 Tempo limite para agendar: ${tempoLimiteHoras} hora(s)`);

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
      // ✅ CORREÇÃO CRÍTICA: SEMPRE filtrar por unidade_id para agentes multi-unidade
      const horarioAgente = await db('horarios_funcionamento')
        .where('agente_id', agenteId)
        .where('dia_semana', diaSemana)
        .where('unidade_id', unidadeIdParaUsar) // ✅ SEMPRE filtrar por unidade
        .first();

      logger.log(`[PublicBooking] Horário do agente para dia ${diaSemana} na unidade ${unidadeIdParaUsar}:`, horarioAgente);

      // REGRA DE INTERSEÇÃO: Calcular (Horários do Agente) ∩ (Horários do Local)
      let horariosParaUsar = [];

      if (horarioAgente && horarioAgente.ativo && horarioAgente.periodos && horarioAgente.periodos.length > 0) {
        // Agente tem horário personalizado e trabalha neste dia
        logger.log(`[PublicBooking] Horários do agente:`, horarioAgente.periodos);
        logger.log(`[PublicBooking] Horários da unidade:`, horarioUnidade.horarios_json);

        // ✅ NORMALIZAR FORMATO: Converter start/end para inicio/fim
        const periodosAgenteNormalizados = horarioAgente.periodos.map(p => ({
          inicio: p.inicio || p.start,
          fim: p.fim || p.end
        }));

        // APLICAR INTERSEÇÃO: Para cada período do agente, calcular sobreposição com períodos da unidade
        horariosParaUsar = this.calcularIntersecaoHorarios(periodosAgenteNormalizados, horarioUnidade.horarios_json);
        logger.log(`[PublicBooking] Horários após interseção:`, horariosParaUsar);

      } else if (horarioAgente && (!horarioAgente.ativo || !horarioAgente.periodos || horarioAgente.periodos.length === 0)) {
        // Agente tem folga neste dia (ativo = false ou sem períodos)
        horariosParaUsar = [];
        logger.log(`[PublicBooking] Agente tem folga neste dia`);

      } else {
        // Agente não tem horário personalizado, usar da unidade (caso raro)
        horariosParaUsar = horarioUnidade.horarios_json;
        logger.log(`[PublicBooking] Usando horário padrão da unidade (agente sem horário personalizado):`, horariosParaUsar);
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
      // ✅ CORREÇÃO CRÍTICA: Excluir agendamento atual da verificação (reagendamento)
      let queryAgendamentos = db('agendamentos')
        .where('agente_id', agenteId)
        .where('data_agendamento', data)
        .whereIn('status', ['Aprovado', 'Confirmado']);

      // Se exclude_agendamento_id foi fornecido, excluir da verificação
      if (exclude_agendamento_id) {
        queryAgendamentos = queryAgendamentos.whereNot('id', parseInt(exclude_agendamento_id));
        logger.log(`[PublicBooking] ✅ Excluindo agendamento #${exclude_agendamento_id} da verificação de conflitos`);
      }

      const agendamentosExistentes = await queryAgendamentos.select('hora_inicio', 'hora_fim');

      logger.log(`[PublicBooking] Agendamentos existentes: ${agendamentosExistentes.length}`);

      // 4. CALCULAR: Gerar slots disponíveis respeitando todas as restrições
      // ✅ CRÍTICO: Passar data para bloquear horários passados
      // ✅ NOVO: Passar tempo_limite_agendar_horas para filtrar horários
      const slotsDisponiveis = this.generateAvailableSlots(
        horariosParaUsar,
        agendamentosExistentes,
        duracaoMinutos,
        data, // ✅ Passa a data para verificar se é dia atual e bloquear horários passados
        tempoLimiteHoras // ✅ Passa tempo limite para agendar
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
      logger.error('[PublicBooking] Erro ao buscar disponibilidade:', error);
      logger.error('[PublicBooking] Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar disponibilidade',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Gerar slots de horários disponíveis
   * Algoritmo: Para cada período de funcionamento, gerar slots de 15 em 15 minutos
   * e verificar se há espaço suficiente para a duração solicitada
   * ✅ NOVO: Bloqueia horários que já passaram (para o dia atual)
   * ✅ NOVO: Bloqueia horários fora do prazo mínimo (tempo_limite_agendar_horas)
   */
  generateAvailableSlots(horariosJson, agendamentosExistentes, duracaoMinutos, dataAgendamento, tempoLimiteHoras = 0) {
    const slots = [];
    // CORREÇÃO CRÍTICA: Usar a duração do serviço como intervalo dos slots
    const intervaloSlot = duracaoMinutos; // Slots baseados na duração real do serviço

    // ✅ CRÍTICO: Obter horário atual para bloquear slots passados e aplicar tempo limite
    const agora = new Date();
    const dataAgendamentoObj = new Date(dataAgendamento + 'T00:00:00');
    const isDiaAtual = dataAgendamentoObj.toDateString() === agora.toDateString();
    const horarioAtualEmMinutos = isDiaAtual ? (agora.getHours() * 60 + agora.getMinutes()) : 0;

    // ✅ NOVO: Calcular horário mínimo baseado em tempo_limite_agendar_horas
    const horarioMinimoPermitido = new Date(agora.getTime() + (tempoLimiteHoras * 60 * 60 * 1000));
    
    logger.log(`[PublicBooking] Gerando slots para ${dataAgendamento}:`, {
      isDiaAtual,
      horarioAtual: this.minutesToTime(horarioAtualEmMinutos),
      tempoLimiteHoras,
      horarioMinimoPermitido: horarioMinimoPermitido.toISOString()
    });

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

        // ✅ CRÍTICO: Bloquear horários que já passaram (apenas para o dia atual)
        if (isDiaAtual && minuto < horarioAtualEmMinutos) {
          logger.log(`[PublicBooking] ⏰ Horário ${horarioSlot} bloqueado (já passou)`);
          continue; // Horário já passou, não disponibilizar
        }

        // ✅ NOVO: Bloquear horários fora do prazo mínimo (tempo_limite_agendar_horas)
        if (tempoLimiteHoras > 0) {
          // Criar data/hora do slot para comparação
          const dataHoraSlot = new Date(`${dataAgendamento}T${horarioSlot}`);
          
          if (dataHoraSlot < horarioMinimoPermitido) {
            logger.log(`[PublicBooking] ⏰ Horário ${horarioSlot} bloqueado (fora do prazo mínimo de ${tempoLimiteHoras}h)`);
            continue; // Fora do prazo mínimo, não disponibilizar
          }
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

    logger.log(`[PublicBooking] ✅ ${slots.length} slots disponíveis gerados (horários passados bloqueados)`);
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
   * POST /api/public/session/create
   * Criar sessão temporária para booking público
   * ✅ CORREÇÃO 1.2: Gerar token de sessão para validar operações sensíveis
   */
  async createPublicSession(req, res) {
    try {
      const { unidade_id } = req.body;
      const ip = req.ip || req.connection.remoteAddress;

      if (!unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetro inválido',
          message: 'unidade_id é obrigatório'
        });
      }

      // Criar sessão
      const sessionToken = await this.publicSessionService.createSession(unidade_id, ip);

      return res.json({
        success: true,
        session_token: sessionToken,
        expires_in: '30 minutos'
      });
    } catch (error) {
      logger.error('[PublicBooking] Erro ao criar sessão:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao criar sessão'
      });
    }
  }

  /**
   * GET /api/public/cliente/buscar?telefone=XXX&unidade_id=Y&session_token=ZZZ
   * Buscar cliente por telefone (para pré-preencher dados)
   * ✅ CORREÇÃO 1.2: Validar sessão antes de retornar dados pessoais (LGPD)
   */
  async buscarCliente(req, res) {
    try {
      const { telefone, unidade_id, session_token } = req.query;

      if (!telefone || !unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          message: 'Telefone e unidade_id são obrigatórios'
        });
      }

      // ✅ CORREÇÃO 1.2: Validar sessão (OPCIONAL - pode ser desabilitado em desenvolvimento)
      if (process.env.NODE_ENV === 'production' && !session_token) {
        logger.warn(`🚨 [SECURITY] Tentativa de busca de cliente sem sessão - IP: ${req.ip}, Telefone: ${telefone}`);
        return res.status(401).json({
          success: false,
          error: 'Sessão inválida',
          message: 'Token de sessão é obrigatório'
        });
      }

      // Validar e incrementar contador de buscas
      if (session_token) {
        const sessionData = await this.publicSessionService.validateAndIncrementSession(session_token, 'client_search');
        if (!sessionData) {
          logger.warn(`🚨 [SECURITY] Sessão inválida ou expirada - IP: ${req.ip}, Token: ${session_token.substring(0, 8)}...`);
          return res.status(401).json({
            success: false,
            error: 'Sessão inválida',
            message: 'Sessão expirada ou inválida. Recarregue a página.'
          });
        }

        // Verificar se a sessão pertence à mesma unidade
        if (sessionData.unidade_id !== parseInt(unidade_id)) {
          logger.warn(`🚨 [SECURITY] Tentativa de busca em unidade diferente - IP: ${req.ip}, Sessão Unidade: ${sessionData.unidade_id}, Busca Unidade: ${unidade_id}`);
          return res.status(403).json({
            success: false,
            error: 'Acesso negado',
            message: 'Sessão não autorizada para esta unidade'
          });
        }

        // Limite de buscas por sessão (proteção adicional)
        if (sessionData.client_searches > 10) {
          logger.warn(`🚨 [SECURITY] Limite de buscas excedido - IP: ${req.ip}, Buscas: ${sessionData.client_searches}`);
          return res.status(429).json({
            success: false,
            error: 'Limite excedido',
            message: 'Você excedeu o limite de buscas. Recarregue a página.'
          });
        }
      }

      // Limpar telefone (remover caracteres não numéricos)
      const telefoneLimpo = telefone.replace(/\D/g, '');

      // Buscar cliente por telefone na unidade
      const cliente = await db('clientes')
        .where('unidade_id', unidade_id)
        .where(function() {
          this.where('telefone', telefone)
              .orWhere('telefone', `+55${telefoneLimpo}`)
              .orWhere('telefone', `+${telefoneLimpo}`)
              .orWhere('telefone', telefoneLimpo);
        })
        .first();

      if (cliente) {
        // ✅ CORREÇÃO 1.2: Log de acesso a dados pessoais (LGPD)
        logger.log(`🔍 [LGPD] Busca de cliente - IP: ${req.ip}, Cliente ID: ${cliente.id}, Unidade: ${unidade_id}`);
        
        return res.json({
          success: true,
          cliente: {
            id: cliente.id,
            primeiro_nome: cliente.primeiro_nome,
            ultimo_nome: cliente.ultimo_nome,
            telefone: cliente.telefone
          }
        });
      } else {
        return res.json({
          success: true,
          cliente: null
        });
      }
    } catch (error) {
      logger.error('[PublicBooking] Erro ao buscar cliente:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar cliente'
      });
    }
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

      logger.log('[PublicBooking] Criando agendamento:', req.body);

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

      // ✅ VALIDAÇÃO 1: Buscar configurações da unidade
      const configuracoes = await trx('configuracoes_sistema')
        .where('unidade_id', unidade_id)
        .select('tempo_limite_agendar_horas')
        .first();

      if (!configuracoes) {
        logger.log(`[PublicBooking] ❌ Configurações não encontradas para unidade_id=${unidade_id}`);
        await trx.rollback();
        return res.status(500).json({
          success: false,
          error: 'Configuração não encontrada',
          message: 'Não foi possível verificar as políticas de agendamento'
        });
      }

      logger.log(`[PublicBooking] 🔍 Configurações de agendamento:`, {
        tempo_limite_agendar_horas: configuracoes.tempo_limite_agendar_horas
      });

      // ✅ VALIDAÇÃO 2: Verificar se está dentro do prazo mínimo para agendar
      const agora = new Date();
      const dataHoraAgendamento = new Date(`${data_agendamento}T${hora_inicio}`);
      const diferencaMs = dataHoraAgendamento - agora;
      const diferencaHoras = diferencaMs / (1000 * 60 * 60);

      logger.log(`[PublicBooking] 🔍 Cálculo de prazo para agendamento:`, {
        agora: agora.toISOString(),
        agendamento: dataHoraAgendamento.toISOString(),
        diferencaHoras: diferencaHoras.toFixed(2),
        limiteHoras: configuracoes.tempo_limite_agendar_horas
      });

      // ✅ VALIDAÇÃO 3: Bloquear agendamentos no passado
      if (diferencaHoras < 0) {
        const horasPassadas = Math.abs(diferencaHoras).toFixed(1);
        logger.log(`[PublicBooking] ❌ Tentativa de agendar para horário que já passou há ${horasPassadas} hora(s)`);
        await trx.rollback();
        return res.status(400).json({
          success: false,
          error: 'Horário inválido',
          message: 'Não é possível agendar para um horário que já passou'
        });
      }

      // ✅ VALIDAÇÃO 4: Verificar se está dentro do prazo mínimo
      if (diferencaHoras < configuracoes.tempo_limite_agendar_horas) {
        const horasRestantes = diferencaHoras.toFixed(1);
        const horasNecessarias = configuracoes.tempo_limite_agendar_horas;
        
        logger.log(`[PublicBooking] ❌ Agendamento fora do prazo. Faltam ${horasRestantes}h, necessário ${horasNecessarias}h`);
        
        await trx.rollback();
        return res.status(403).json({
          success: false,
          error: 'Fora do prazo mínimo',
          message: `Agendamento não permitido. É necessário agendar com pelo menos ${horasNecessarias} hora(s) de antecedência. O horário selecionado está a apenas ${horasRestantes} hora(s) de acontecer.`
        });
      }

      logger.log(`✅ [PublicBooking] Agendamento dentro do prazo. Diferença: ${diferencaHoras.toFixed(2)}h, Limite: ${configuracoes.tempo_limite_agendar_horas}h`);

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

      // ✅ CORREÇÃO CRÍTICA: Adquirir advisory lock para prevenir race condition
      // Isso serializa todas as operações de criação para o mesmo agente/data
      await trx.raw(`
        SELECT pg_advisory_xact_lock(
          hashtext(?::text || ?::text)
        )
      `, [agente_id.toString(), data_agendamento]);

      // Verificar disponibilidade do agente (agora protegido pelo lock)
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

      logger.log(`[PublicBooking] Agendamento criado com sucesso: ID ${agendamento.id}`);

      // Preparar dados para notificação WhatsApp
      const nomeCompleto = `${cliente.primeiro_nome} ${cliente.ultimo_nome}`.trim();
      const nomeAgenteCompleto = `${agente.nome} ${agente.sobrenome || ''}`.trim();
      
      const agendamentoCompleto = {
        cliente: {
          nome: nomeCompleto
        },
        cliente_telefone: cliente.telefone,
        agente: {
          nome: nomeAgenteCompleto
        },
        agente_telefone: agente.telefone,
        unidade: {
          nome: unidade.nome
        },
        unidade_id: agendamento.unidade_id, // ✅ CRÍTICO: Adicionar unidade_id para registro de notificações
        unidade_telefone: unidade.telefone,
        agendamento_id: agendamento.id,
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        hora_fim: agendamento.hora_fim,
        valor_total: agendamento.valor_total,
        servicos: servicos.map(s => ({ nome: s.nome, preco: s.preco }))
      };

      // Enviar notificação WhatsApp e criar lembretes programados (não bloquear a resposta)
      setImmediate(async () => {
        try {
          logger.log(`📧 [PublicBooking] Iniciando envio de confirmação para agendamento #${agendamento.id}`);
          
          // 1. Enviar confirmação imediata
          await this.whatsAppService.sendAppointmentConfirmation(agendamentoCompleto);
          logger.log(`✅ [PublicBooking] Confirmação enviada para agendamento #${agendamento.id}`);
          
          // 2. Criar lembretes programados (24h e 1h antes)
          logger.log(`📅 [PublicBooking] Criando lembretes programados para agendamento #${agendamento.id}`);
          const result = await this.scheduledReminderService.criarLembretesProgramados({
            agendamento_id: agendamento.id,
            unidade_id: agendamento.unidade_id,
            data_agendamento: agendamento.data_agendamento,
            hora_inicio: agendamento.hora_inicio,
            cliente_telefone: cliente.telefone
          });
          logger.log(`✅ [PublicBooking] Lembretes programados criados:`, result);
        } catch (whatsappError) {
          logger.error('❌ [PublicBooking] Erro ao enviar WhatsApp ou criar lembretes:', whatsappError);
          logger.error('❌ [PublicBooking] Stack:', whatsappError.stack);
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
      logger.error('[PublicBooking] Erro ao criar agendamento:', error);

      if (error && (error.code === '23P01' || error.constraint === 'agendamentos_no_overlap')) {
        return res.status(409).json({
          success: false,
          error: 'Horário indisponível',
          message: 'Este horário já está ocupado'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao criar agendamento'
      });
    }
  }

  /**
   * GET /api/public/agendamento/:id/preview
   * Buscar dados básicos do agendamento (unidade_id) sem validação de telefone
   * Usado para carregar logo e informações da unidade antes da validação
   */
  async getAgendamentoPreview(req, res) {
    try {
      const { id } = req.params;

      logger.log(`[PublicBooking] Buscando preview do agendamento #${id}`);

      // Buscar apenas unidade_id do agendamento
      const agendamento = await this.agendamentoModel.db('agendamentos')
        .where('agendamentos.id', id)
        .select('agendamentos.unidade_id')
        .first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado',
          message: 'Este agendamento não existe'
        });
      }

      res.json({
        success: true,
        data: {
          unidade_id: agendamento.unidade_id
        }
      });

    } catch (error) {
      logger.error('[PublicBooking] Erro ao buscar preview do agendamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar preview do agendamento'
      });
    }
  }

  /**
   * GET /api/public/agendamento/:id
   * Buscar detalhes de um agendamento público (com validação de telefone)
   */
  async getAgendamento(req, res) {
    try {
      const { id } = req.params;
      const { telefone } = req.query;

      logger.log(`[PublicBooking] Buscando agendamento #${id} com telefone ${telefone}`);

      if (!telefone) {
        return res.status(400).json({
          success: false,
          error: 'Telefone é obrigatório',
          message: 'Informe o telefone do cliente para validar o acesso'
        });
      }

      // Buscar agendamento com todos os dados relacionados
      const agendamento = await this.agendamentoModel.db('agendamentos')
        .where('agendamentos.id', id)
        .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
        .join('agentes', 'agendamentos.agente_id', 'agentes.id')
        .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
        .select(
          'agendamentos.*',
          'clientes.primeiro_nome as cliente_primeiro_nome',
          'clientes.ultimo_nome as cliente_ultimo_nome',
          'clientes.telefone as cliente_telefone',
          'agentes.nome as agente_nome',
          'agentes.nome_exibicao as agente_nome_exibicao',
          'agentes.avatar_url as agente_avatar_url',
          'unidades.nome as unidade_nome',
          'unidades.endereco as unidade_endereco'
        )
        .first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado',
          message: 'Este agendamento não existe'
        });
      }

      // Validar telefone do cliente (normalizar ambos para comparação)
      let telefoneNormalizado = telefone.replace(/\D/g, '');
      let telefoneClienteNormalizado = agendamento.cliente_telefone.replace(/\D/g, '');

      // ✅ VALIDAÇÃO FLEXÍVEL PARA TELEFONES BRASILEIROS
      // Aceita 4 formatos válidos:
      // 1. Com código do país: +5585985502643 (13 dígitos: 55 + 85 + 985502643)
      // 2. Completo com DDD: 85985502643 (11 dígitos: 85 + 985502643)
      // 3. Com prefixo 9 sem DDD: 985502643 (9 dígitos)
      // 4. Sem prefixo 9 sem DDD: 85502643 (8 dígitos)
      
      // Remover código do país (55) se presente
      if (telefoneNormalizado.startsWith('55') && telefoneNormalizado.length === 13) {
        telefoneNormalizado = telefoneNormalizado.substring(2); // Remove '55'
      }
      if (telefoneClienteNormalizado.startsWith('55') && telefoneClienteNormalizado.length === 13) {
        telefoneClienteNormalizado = telefoneClienteNormalizado.substring(2); // Remove '55'
      }
      
      const ultimosNoveDigitos = telefoneClienteNormalizado.slice(-9); // 985502643
      const ultimosOitoDigitos = telefoneClienteNormalizado.slice(-8); // 85502643
      
      const telefoneValido = (
        telefoneNormalizado === telefoneClienteNormalizado || // Completo: 85985502643
        telefoneNormalizado === ultimosNoveDigitos ||         // Com 9: 985502643
        telefoneNormalizado === ultimosOitoDigitos            // Sem 9: 85502643
      );
      
      if (!telefoneValido) {
        logger.log(`[PublicBooking] ❌ Validação de telefone falhou:`, {
          telefoneDigitado: telefoneNormalizado,
          telefoneEsperado: telefoneClienteNormalizado,
          formatoAceitos: {
            completo: telefoneClienteNormalizado,
            com9: ultimosNoveDigitos,
            sem9: ultimosOitoDigitos
          }
        });
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Telefone não corresponde ao agendamento'
        });
      }
      
      logger.log(`[PublicBooking] ✅ Telefone validado com sucesso para agendamento #${id}`);

      // ✅ VALIDAÇÃO DE DATA: Bloquear acesso a agendamentos passados
      // Cliente não pode gerenciar agendamentos que já aconteceram
      const dataAgendamento = new Date(agendamento.data_agendamento);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0); // Zerar horas para comparar apenas a data
      
      if (dataAgendamento < hoje) {
        const diasPassados = Math.floor((hoje - dataAgendamento) / (1000 * 60 * 60 * 24));
        logger.log(`[PublicBooking] ❌ Agendamento #${id} já passou há ${diasPassados} dia(s)`);
        return res.status(410).json({
          success: false,
          error: 'Agendamento expirado',
          message: 'Este agendamento já aconteceu e não pode mais ser gerenciado',
          data: {
            data_agendamento: agendamento.data_agendamento,
            dias_passados: diasPassados
          }
        });
      }

      // Buscar serviços do agendamento
      const servicos = await this.agendamentoModel.db('agendamento_servicos')
        .where('agendamento_id', id)
        .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .select('servicos.id', 'servicos.nome', 'servicos.preco', 'servicos.duracao_minutos');

      // Buscar extras do agendamento (se houver)
      const extras = await this.agendamentoModel.db('agendamento_servicos_extras')
        .where('agendamento_id', id)
        .join('servicos_extras', 'agendamento_servicos_extras.servico_extra_id', 'servicos_extras.id')
        .select('servicos_extras.id', 'servicos_extras.nome', 'servicos_extras.preco', 'servicos_extras.duracao_minutos');

      // Montar resposta
      const response = {
        id: agendamento.id,
        status: agendamento.status,
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        hora_fim: agendamento.hora_fim,
        valor_total: parseFloat(agendamento.valor_total),
        observacoes: agendamento.observacoes,
        cliente: {
          nome: `${agendamento.cliente_primeiro_nome} ${agendamento.cliente_ultimo_nome}`.trim(),
          telefone: agendamento.cliente_telefone
        },
        agente: {
          id: agendamento.agente_id,
          nome: agendamento.agente_nome_exibicao || agendamento.agente_nome,
          avatar_url: agendamento.agente_avatar_url
        },
        unidade: {
          id: agendamento.unidade_id,
          nome: agendamento.unidade_nome,
          endereco: agendamento.unidade_endereco
        },
        servicos: servicos.map(s => ({
          id: s.id,
          nome: s.nome,
          preco: parseFloat(s.preco),
          duracao_minutos: s.duracao_minutos
        })),
        extras: extras.map(e => ({
          id: e.id,
          nome: e.nome,
          preco: parseFloat(e.preco),
          duracao_minutos: e.duracao_minutos
        }))
      };

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('[PublicBooking] Erro ao buscar agendamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar agendamento'
      });
    }
  }

  /**
   * PUT /api/public/agendamento/:id/reagendar
   * Reagendar um agendamento (alterar data e hora)
   */
  async reagendarAgendamento(req, res) {
    try {
      const { id } = req.params;
      const { telefone, data_agendamento, hora_inicio } = req.body;

      logger.log(`[PublicBooking] Reagendando agendamento #${id}`);

      // Validações
      if (!telefone || !data_agendamento || !hora_inicio) {
        return res.status(400).json({
          success: false,
          error: 'Dados incompletos',
          message: 'Telefone, data e hora são obrigatórios'
        });
      }

      // Buscar agendamento
      const agendamento = await this.agendamentoModel.db('agendamentos')
        .where('agendamentos.id', id)
        .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
        .select('agendamentos.*', 'clientes.telefone as cliente_telefone')
        .first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado'
        });
      }

      // Validar telefone (mesma lógica do getAgendamento)
      let telefoneNormalizado = telefone.replace(/\D/g, '');
      let telefoneClienteNormalizado = agendamento.cliente_telefone.replace(/\D/g, '');

      // Remover código do país (55) se presente
      if (telefoneNormalizado.startsWith('55') && telefoneNormalizado.length === 13) {
        telefoneNormalizado = telefoneNormalizado.substring(2);
      }
      if (telefoneClienteNormalizado.startsWith('55') && telefoneClienteNormalizado.length === 13) {
        telefoneClienteNormalizado = telefoneClienteNormalizado.substring(2);
      }
      
      const ultimosNoveDigitos = telefoneClienteNormalizado.slice(-9);
      const ultimosOitoDigitos = telefoneClienteNormalizado.slice(-8);
      
      const telefoneValido = (
        telefoneNormalizado === telefoneClienteNormalizado ||
        telefoneNormalizado === ultimosNoveDigitos ||
        telefoneNormalizado === ultimosOitoDigitos
      );

      if (!telefoneValido) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Telefone não corresponde ao agendamento'
        });
      }

      // ✅ VALIDAÇÃO DE DATA: Bloquear reagendamento de agendamentos passados
      const dataAgendamentoAtual = new Date(agendamento.data_agendamento);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      
      if (dataAgendamentoAtual < hoje) {
        const diasPassados = Math.floor((hoje - dataAgendamentoAtual) / (1000 * 60 * 60 * 24));
        logger.log(`[PublicBooking] ❌ Tentativa de reagendar agendamento #${id} que já passou há ${diasPassados} dia(s)`);
        return res.status(410).json({
          success: false,
          error: 'Agendamento expirado',
          message: 'Este agendamento já aconteceu e não pode mais ser reagendado'
        });
      }

      // Verificar se agendamento pode ser reagendado
      if (agendamento.status === 'Cancelado') {
        return res.status(400).json({
          success: false,
          error: 'Agendamento cancelado',
          message: 'Não é possível reagendar um agendamento cancelado'
        });
      }

      if (agendamento.status === 'Concluído') {
        return res.status(400).json({
          success: false,
          error: 'Agendamento concluído',
          message: 'Não é possível reagendar um agendamento já concluído'
        });
      }

      // ✅ VALIDAÇÃO CRÍTICA: Verificar se a unidade está aberta no dia da nova data
      const dataObj = new Date(data_agendamento + 'T00:00:00');
      const diaSemana = dataObj.getDay(); // 0 = Domingo, 6 = Sábado

      logger.log(`[PublicBooking] Validando dia de funcionamento: ${data_agendamento} (dia_semana: ${diaSemana})`);

      const horarioUnidade = await db('horarios_funcionamento_unidade')
        .where('unidade_id', agendamento.unidade_id)
        .where('dia_semana', diaSemana)
        .where('is_aberto', true)
        .first();

      if (!horarioUnidade || !horarioUnidade.horarios_json || horarioUnidade.horarios_json.length === 0) {
        logger.log(`[PublicBooking] ❌ Local fechado no dia ${diaSemana} (${data_agendamento})`);
        return res.status(400).json({
          success: false,
          error: 'Local fechado',
          message: 'O local não funciona neste dia da semana. Por favor, escolha outra data.'
        });
      }

      logger.log(`[PublicBooking] ✅ Local aberto no dia ${diaSemana}:`, horarioUnidade.horarios_json);

      // Buscar serviços para calcular duração total
      const servicos = await this.agendamentoModel.db('agendamento_servicos')
        .where('agendamento_id', id)
        .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .select('servicos.duracao_minutos');

      const duracaoTotal = servicos.reduce((sum, s) => sum + s.duracao_minutos, 0);

      // Calcular hora_fim
      const [horas, minutos] = hora_inicio.split(':').map(Number);
      const horaFimDate = new Date();
      horaFimDate.setHours(horas, minutos + duracaoTotal, 0, 0);
      const hora_fim = horaFimDate.toTimeString().slice(0, 5);

      // Atualizar agendamento
      await this.agendamentoModel.db('agendamentos')
        .where('id', id)
        .update({
          data_agendamento,
          hora_inicio,
          hora_fim,
          updated_at: this.agendamentoModel.db.fn.now()
        });

      logger.log(`✅ [PublicBooking] Agendamento #${id} reagendado para ${data_agendamento} às ${hora_inicio}`);

      // Enviar notificação de reagendamento (assíncrono)
      setImmediate(async () => {
        try {
          // Buscar dados completos para enviar notificações
          const dadosCompletos = await this.buscarDadosCompletos(id);
          
          if (dadosCompletos) {
            await this.whatsAppService.sendRescheduleNotification(dadosCompletos);
            logger.log(`✅ [PublicBooking] Notificações de reagendamento enviadas para agendamento #${id}`);
            
            // Atualizar lembretes programados com nova data/hora
            await this.scheduledReminderService.atualizarLembretesProgramados({
              agendamento_id: id,
              unidade_id: agendamento.unidade_id,
              data_agendamento,
              hora_inicio,
              cliente_telefone: dadosCompletos.cliente_telefone
            });
            logger.log(`✅ [PublicBooking] Lembretes programados atualizados para agendamento #${id}`);
          }
        } catch (err) {
          logger.error('❌ [PublicBooking] Erro ao enviar notificação de reagendamento:', err);
        }
      });

      res.json({
        success: true,
        message: 'Agendamento reagendado com sucesso',
        data: {
          id,
          data_agendamento,
          hora_inicio,
          hora_fim
        }
      });

    } catch (error) {
      logger.error('[PublicBooking] Erro ao reagendar agendamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao reagendar agendamento'
      });
    }
  }

  /**
   * PATCH /api/public/agendamento/:id/cancelar
   * Cancelar um agendamento
   */
  async cancelarAgendamento(req, res) {
    try {
      const { id } = req.params;
      const { telefone, motivo } = req.body;

      logger.log(`[PublicBooking] Cancelando agendamento #${id}`);

      if (!telefone) {
        return res.status(400).json({
          success: false,
          error: 'Telefone é obrigatório',
          message: 'Informe o telefone do cliente para validar o cancelamento'
        });
      }

      // Buscar agendamento
      const agendamento = await this.agendamentoModel.db('agendamentos')
        .where('agendamentos.id', id)
        .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
        .select('agendamentos.*', 'clientes.telefone as cliente_telefone')
        .first();

      if (!agendamento) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado'
        });
      }

      // Validar telefone (mesma lógica do getAgendamento)
      let telefoneNormalizado = telefone.replace(/\D/g, '');
      let telefoneClienteNormalizado = agendamento.cliente_telefone.replace(/\D/g, '');

      // Remover código do país (55) se presente
      if (telefoneNormalizado.startsWith('55') && telefoneNormalizado.length === 13) {
        telefoneNormalizado = telefoneNormalizado.substring(2);
      }
      if (telefoneClienteNormalizado.startsWith('55') && telefoneClienteNormalizado.length === 13) {
        telefoneClienteNormalizado = telefoneClienteNormalizado.substring(2);
      }
      
      const ultimosNoveDigitos = telefoneClienteNormalizado.slice(-9);
      const ultimosOitoDigitos = telefoneClienteNormalizado.slice(-8);
      
      const telefoneValido = (
        telefoneNormalizado === telefoneClienteNormalizado ||
        telefoneNormalizado === ultimosNoveDigitos ||
        telefoneNormalizado === ultimosOitoDigitos
      );

      if (!telefoneValido) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Telefone não corresponde ao agendamento'
        });
      }

      // ✅ VALIDAÇÃO 1: Buscar configurações da unidade
      const configuracoes = await this.agendamentoModel.db('configuracoes_sistema')
        .join('unidades', 'configuracoes_sistema.unidade_id', 'unidades.id')
        .where('unidades.id', agendamento.unidade_id)
        .select('configuracoes_sistema.permitir_cancelamento', 'configuracoes_sistema.tempo_limite_cancelar_horas')
        .first();

      if (!configuracoes) {
        logger.log(`[PublicBooking] ❌ Configurações não encontradas para unidade_id=${agendamento.unidade_id}`);
        return res.status(500).json({
          success: false,
          error: 'Configuração não encontrada',
          message: 'Não foi possível verificar as políticas de cancelamento'
        });
      }

      logger.log(`[PublicBooking] 🔍 Configurações de cancelamento:`, {
        permitir_cancelamento: configuracoes.permitir_cancelamento,
        tempo_limite_cancelar_horas: configuracoes.tempo_limite_cancelar_horas
      });

      // ✅ VALIDAÇÃO 2: Verificar se cancelamento está permitido
      if (!configuracoes.permitir_cancelamento) {
        logger.log(`[PublicBooking] ❌ Cancelamento não permitido pela política da empresa`);
        return res.status(403).json({
          success: false,
          error: 'Cancelamento não permitido',
          message: 'A política da empresa não permite cancelamento de agendamentos pelos clientes'
        });
      }

      // ✅ VALIDAÇÃO 3: Calcular diferença em horas entre agora e o agendamento
      const agora = new Date();
      const dataHoraAgendamento = new Date(`${agendamento.data_agendamento}T${agendamento.hora_inicio}`);
      const diferencaMs = dataHoraAgendamento - agora;
      const diferencaHoras = diferencaMs / (1000 * 60 * 60);

      logger.log(`[PublicBooking] 🔍 Cálculo de prazo:`, {
        agora: agora.toISOString(),
        agendamento: dataHoraAgendamento.toISOString(),
        diferencaHoras: diferencaHoras.toFixed(2),
        limiteHoras: configuracoes.tempo_limite_cancelar_horas
      });

      // ✅ VALIDAÇÃO 4: Bloquear cancelamento de agendamentos passados
      if (diferencaHoras < 0) {
        const horasPassadas = Math.abs(diferencaHoras).toFixed(1);
        logger.log(`[PublicBooking] ❌ Tentativa de cancelar agendamento #${id} que já passou há ${horasPassadas} hora(s)`);
        return res.status(410).json({
          success: false,
          error: 'Agendamento expirado',
          message: 'Este agendamento já aconteceu e não pode mais ser cancelado'
        });
      }

      // ✅ VALIDAÇÃO 5: Verificar se está dentro do prazo limite de cancelamento
      if (diferencaHoras < configuracoes.tempo_limite_cancelar_horas) {
        const horasRestantes = diferencaHoras.toFixed(1);
        const horasNecessarias = configuracoes.tempo_limite_cancelar_horas;
        
        logger.log(`[PublicBooking] ❌ Cancelamento fora do prazo. Faltam ${horasRestantes}h, necessário ${horasNecessarias}h`);
        
        return res.status(403).json({
          success: false,
          error: 'Fora do prazo de cancelamento',
          message: `Cancelamento não permitido. É necessário cancelar com pelo menos ${horasNecessarias} hora(s) de antecedência. Seu agendamento está a ${horasRestantes} hora(s) de acontecer.`
        });
      }

      logger.log(`✅ [PublicBooking] Cancelamento dentro do prazo. Diferença: ${diferencaHoras.toFixed(2)}h, Limite: ${configuracoes.tempo_limite_cancelar_horas}h`);

      // ✅ VALIDAÇÃO 6: Verificar se já está cancelado
      if (agendamento.status === 'Cancelado') {
        return res.status(400).json({
          success: false,
          error: 'Agendamento já cancelado',
          message: 'Este agendamento já foi cancelado anteriormente'
        });
      }

      // ✅ VALIDAÇÃO 7: Verificar se já foi concluído
      if (agendamento.status === 'Concluído') {
        return res.status(400).json({
          success: false,
          error: 'Agendamento concluído',
          message: 'Não é possível cancelar um agendamento já concluído'
        });
      }

      // Atualizar status para Cancelado
      await this.agendamentoModel.db('agendamentos')
        .where('id', id)
        .update({
          status: 'Cancelado',
          observacoes: motivo ? `Cancelado pelo cliente: ${motivo}` : 'Cancelado pelo cliente',
          updated_at: this.agendamentoModel.db.fn.now()
        });

      logger.log(`✅ [PublicBooking] Agendamento #${id} cancelado`);

      // Enviar notificação de cancelamento (assíncrono)
      setImmediate(async () => {
        try {
          // Buscar dados completos para enviar notificações
          const dadosCompletos = await this.buscarDadosCompletos(id);
          
          if (dadosCompletos) {
            await this.whatsAppService.sendCancellationNotification(dadosCompletos);
            logger.log(`✅ [PublicBooking] Notificações de cancelamento enviadas para agendamento #${id}`);
            
            // Cancelar lembretes programados
            await this.scheduledReminderService.cancelarLembretesProgramados(id);
            logger.log(`✅ [PublicBooking] Lembretes programados cancelados para agendamento #${id}`);
          }
        } catch (err) {
          logger.error('❌ [PublicBooking] Erro ao enviar notificação de cancelamento:', err);
        }
      });

      res.json({
        success: true,
        message: 'Agendamento cancelado com sucesso'
      });

    } catch (error) {
      logger.error('[PublicBooking] Erro ao cancelar agendamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao cancelar agendamento'
      });
    }
  }

  /**
   * Método auxiliar para buscar dados completos do agendamento
   * Usado para enviar notificações de WhatsApp
   */
  async buscarDadosCompletos(agendamentoId) {
    try {
      // Buscar dados do agendamento
      const agendamento = await this.agendamentoModel.db('agendamentos')
        .where('id', agendamentoId)
        .first();

      if (!agendamento) {
        return null;
      }

      // Buscar cliente
      const cliente = await this.agendamentoModel.db('clientes')
        .where('id', agendamento.cliente_id)
        .first();

      // Buscar agente
      const agente = await this.agendamentoModel.db('agentes')
        .where('id', agendamento.agente_id)
        .first();

      // Buscar unidade (incluindo slug_url para link de booking)
      const unidade = await this.agendamentoModel.db('unidades')
        .where('id', agendamento.unidade_id)
        .select('id', 'nome', 'endereco', 'telefone', 'slug_url')
        .first();

      if (!cliente || !agente || !unidade) {
        return null;
      }

      // Buscar serviços
      const servicos = await this.agendamentoModel.db('agendamento_servicos')
        .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
        .where('agendamento_servicos.agendamento_id', agendamentoId)
        .select('servicos.nome', 'servicos.preco');

      // Formatar nome do cliente
      const nomeCliente = cliente.nome || `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();

      // Retornar dados formatados para WhatsApp
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
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        hora_fim: agendamento.hora_fim,
        valor_total: agendamento.valor_total,
        
        // Serviços
        servicos: servicos.map(s => ({
          nome: s.nome,
          preco: s.preco
        }))
      };

    } catch (error) {
      logger.error('❌ [PublicBooking.buscarDadosCompletos] Erro ao buscar dados completos:', error);
      return null;
    }
  }
}

module.exports = PublicBookingController;

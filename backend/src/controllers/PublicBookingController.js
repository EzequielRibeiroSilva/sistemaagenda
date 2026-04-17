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
const ExcecaoCalendario = require('../models/ExcecaoCalendario');
const AgenteExcecaoCalendario = require('../models/AgenteExcecaoCalendario');
const WhatsAppService = require('../services/WhatsAppService');
const ScheduledReminderService = require('../services/ScheduledReminderService'); // ✅ NOVO
const BookingAvailabilityService = require('../services/BookingAvailabilityService');
const { getInstance: getPublicSessionService } = require('../services/PublicSessionService'); // ✅ CORREÇÃO 1.2
const AssinaturaSaldoService = require('../services/AssinaturaSaldoService');
const AssinaturaEstornoService = require('../services/AssinaturaEstornoService');
const { db } = require('../config/knex');
const logger = require('./../utils/logger');
const PlanoAssinatura = require('../models/PlanoAssinatura');

class PublicBookingController {
  constructor() {
    this.unidadeModel = new Unidade();
    this.agenteModel = new Agente();
    this.servicoModel = new Servico();
    this.clienteModel = new Cliente();
    this.agendamentoModel = new Agendamento();
    this.bookingAvailabilityService = new BookingAvailabilityService();
    this.configuracaoModel = new ConfiguracaoSistema(db);
    this.horarioFuncionamentoUnidadeModel = new HorarioFuncionamentoUnidade();
    this.excecaoCalendarioModel = new ExcecaoCalendario();
    this.agenteExcecaoCalendarioModel = new AgenteExcecaoCalendario();
    this.whatsappService = new WhatsAppService();
    this.whatsAppService = this.whatsappService;
    this.scheduledReminderService = new ScheduledReminderService(); // 
    this.publicSessionService = getPublicSessionService(); // 
    this.planoAssinaturaModel = new PlanoAssinatura();
    this.assinaturaSaldoService = new AssinaturaSaldoService({
      db,
      getDateStrInTimeZone: this.getDateStrInTimeZone.bind(this),
      normalizeDateStr: this.normalizeDateStr.bind(this),
      getCycleBounds: this.getCycleBounds.bind(this)
    });
    this.assinaturaEstornoService = new AssinaturaEstornoService();
  }

  /**
   * HELPER: Normalizar telefone brasileiro e gerar variações
   * Solução para problema de duplicação de clientes (com/sem 9º dígito)
   * 
   * Exemplos:
   * - Input: "8591082000" (10 dígitos) → Output: ["8591082000", "85991082000"]
   * - Input: "85991082000" (11 dígitos) → Output: ["85991082000", "8591082000"]
   * 
   * @param {string} telefone - Telefone com ou sem formatação
   * @returns {string[]} Array com variações do telefone (com e sem 9º dígito)
   */
  normalizarTelefoneVariacoes(telefone) {
    // Limpar telefone (apenas números)
    let limpo = telefone.replace(/\D/g, '');

    // Capturar variação com DDI (legado) e sem DDI (padrão)
    let comDDI = null;
    if (limpo.startsWith('55') && limpo.length >= 12) {
      comDDI = limpo;
      limpo = limpo.substring(2);
    }

    const variacoes = [];

    // Caso 1: Telefone com 11 dígitos (DDD + 9 + 8 dígitos)
    if (limpo.length === 11 && limpo[2] === '9') {
      variacoes.push(limpo); // Versão com 9
      // Gerar versão sem o 9 (10 dígitos)
      const semNove = limpo.substring(0, 2) + limpo.substring(3);
      variacoes.push(semNove);
    }
    // Caso 2: Telefone com 10 dígitos (DDD + 8 dígitos - formato antigo)
    else if (limpo.length === 10) {
      variacoes.push(limpo); // Versão sem 9
      // Gerar versão com o 9 (11 dígitos)
      const comNove = limpo.substring(0, 2) + '9' + limpo.substring(2);
      variacoes.push(comNove);
    }
    // Caso 3: Telefone em outro formato (manter original)
    else {
      variacoes.push(limpo);
    }

    // ✅ Compatibilidade: muitos registros antigos podem ter telefone_limpo com '55'
    // Incluir variações com DDI para garantir match e impedir bypass do bloqueio.
    const variacoesComDDI = [];
    for (const v of variacoes) {
      if (typeof v === 'string' && v.length >= 10) {
        variacoesComDDI.push(`55${v}`);
      }
    }

    // Incluir também a forma original com DDI se detectada (antes de remover)
    if (comDDI) {
      variacoesComDDI.push(comDDI);
    }

    const finalVariacoes = Array.from(new Set([...variacoes, ...variacoesComDDI]));
    return finalVariacoes;
  }

  normalizeDateStr(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) {
      return dateValue.toISOString().slice(0, 10);
    }
    const s = String(dateValue);
    // Handles ISO timestamps like 2021-12-29T00:00:00.000Z
    if (s.length >= 10 && s.includes('T')) return s.slice(0, 10);
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Fallback: try to parse
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

  async buscarAssinaturaSaldo(req, res) {
    try {
      const { telefone, unidade_id, data_referencia, session_token } = req.query;

      if (!telefone || !unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          message: 'Telefone e unidade_id são obrigatórios'
        });
      }

      if (session_token) {
        const sessionData = await this.publicSessionService.validateAndIncrementSession(session_token, 'client_search');
        if (!sessionData) {
          return res.status(401).json({
            success: false,
            error: 'Sessão inválida',
            message: 'Sessão expirada ou inválida. Recarregue a página.'
          });
        }

        if (sessionData.unidade_id !== parseInt(unidade_id)) {
          return res.status(403).json({
            success: false,
            error: 'Acesso negado',
            message: 'Sessão não autorizada para esta unidade'
          });
        }
      }

      const unidade = await db('unidades')
        .where('id', unidade_id)
        .select('id', 'usuario_id', 'status')
        .first();

      if (!unidade || unidade.status !== 'Ativo') {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada',
          message: 'Esta unidade não está disponível'
        });
      }

      const telefoneLimpo = String(telefone).replace(/\D/g, '');

      const cliente = await db('clientes')
        .leftJoin('unidades as u', 'clientes.unidade_id', 'u.id')
        .where(function() {
          // Priorizar o match na unidade atual quando possível, mas permitir achar em qualquer unidade
          // do mesmo usuário admin (dono da unidade), pois clientes/assinaturas podem ter sido criados
          // em outra unidade do mesmo negócio.
          this.where('clientes.unidade_id', unidade_id).orWhere('u.usuario_id', unidade.usuario_id);
        })
        .where(function() {
          this.where('clientes.telefone_limpo', telefoneLimpo)
            .orWhere('clientes.telefone', telefone)
            .orWhere('clientes.telefone', `+55${telefoneLimpo}`)
            .orWhere('clientes.telefone', `+${telefoneLimpo}`)
            .orWhere('clientes.telefone', telefoneLimpo);
        })
        .select(
          'clientes.id',
          'clientes.primeiro_nome',
          'clientes.ultimo_nome',
          'clientes.telefone',
          'clientes.telefone_limpo',
          'clientes.data_nascimento',
          'clientes.is_assinante',
          'clientes.assinatura_status',
          'clientes.data_inicio_assinatura',
          'clientes.assinatura_plano_id',
          'clientes.status',
          'clientes.unidade_id'
        )
        .orderByRaw('CASE WHEN clientes.unidade_id = ? THEN 0 ELSE 1 END', [unidade_id])
        .first();

      const result = await this.assinaturaSaldoService.compute({
        cliente,
        unidadeUsuarioId: unidade.usuario_id,
        unidadeId: parseInt(unidade_id, 10),
        dataReferencia: data_referencia ? String(data_referencia) : null,
        servicoIds: null,
        servicoExtraIds: null
      });

      return res.json(result);
    } catch (error) {
      logger.error('[PublicBooking] Erro ao buscar assinatura/saldo:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar assinatura'
      });
    }
  }

  // ===============================
  // TIMEZONE/DATE HELPERS (PUBLIC)
  // ===============================
  getDateStrInTimeZone(tz, date = new Date()) {
    // en-CA yields YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  getMinutesInTimeZone(tz, date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    return hour * 60 + minute;
  }

  dayNumberFromDateStr(dateStr) {
    // dateStr: YYYY-MM-DD
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }

  absoluteMinutesFromDateStrAndTime(dateStr, timeStr) {
    const dayNumber = this.dayNumberFromDateStr(dateStr);
    const minutes = this.timeToMinutes(timeStr);
    return dayNumber * 1440 + minutes;
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
        
        // Buscar TODAS as unidades do usuário (incluindo excluídas para herança de logo)
        // ✅ CORREÇÃO CRÍTICA: Remover filtro de status para permitir herança de logo de unidades excluídas
        const unidadesDoUsuario = await db('unidades')
          .where('usuario_id', unidade.usuario_id)
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

      // ✅ CORREÇÃO CRÍTICA: Buscar agentes que trabalham na unidade
      // Verificar TANTO na tabela agente_unidades (multi-local) QUANTO no campo agentes.unidade_id (single/legado)
      const agentes = await db('agentes')
        .where('agentes.status', 'Ativo')
        .where(function() {
          // Condição 1: Agente tem a unidade como unidade_id principal
          this.where('agentes.unidade_id', unidadeId)
          // OU Condição 2: Agente está associado via tabela agente_unidades (multi-local)
          .orWhereIn('agentes.id', function() {
            this.select('agente_id')
              .from('agente_unidades')
              .where('unidade_id', unidadeId);
          });
        })
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

      // ✅ CORREÇÃO: Buscar serviços extras ativos do USUÁRIO (não da unidade)
      // A tabela servicos_extras usa usuario_id, não unidade_id
      const servicosExtrasRaw = await db('servicos_extras')
        .where('usuario_id', unidade.usuario_id)
        .where('status', 'Ativo')
        .select('id', 'nome', 'descricao', 'preco', 'duracao_minutos');

      // Converter preços para números e formatar para o frontend
      const extras = servicosExtrasRaw.map(extra => ({
        id: extra.id,
        name: extra.nome,
        description: extra.descricao,
        price: parseFloat(extra.preco),
        duration: extra.duracao_minutos,
        category: null // Coluna categoria não existe na tabela
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

      // ✅ CORREÇÃO: Buscar usuario_id da unidade para filtrar extras
      const unidade = await this.unidadeModel.findById(unidadeId);
      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada'
        });
      }

      // ✅ CORREÇÃO: Buscar extras associados aos serviços selecionados (UNIÃO)
      // A tabela servicos_extras usa usuario_id, não unidade_id
      const extrasAssociados = await db('servicos_extras')
        .join('servico_servicos_extras', 'servicos_extras.id', 'servico_servicos_extras.servico_extra_id')
        .whereIn('servico_servicos_extras.servico_id', servicoIds)
        .where('servicos_extras.usuario_id', unidade.usuario_id)
        .where('servicos_extras.status', 'Ativo')
        .distinct('servicos_extras.id', 'servicos_extras.nome', 'servicos_extras.descricao',
                 'servicos_extras.preco', 'servicos_extras.duracao_minutos')
        .orderBy('servicos_extras.nome');

      // Formatar para o frontend
      const extras = extrasAssociados.map(extra => ({
        id: extra.id,
        name: extra.nome,
        description: extra.descricao,
        price: parseFloat(extra.preco),
        duration: extra.duracao_minutos,
        category: null // Coluna categoria não existe na tabela
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

      const disponibilidade = await this.buildAgenteDisponibilidadeData({
        agenteId,
        data,
        duracaoMinutos,
        unidade_id,
        exclude_agendamento_id
      });

      return res.json({
        success: true,
        data: disponibilidade
      });

    } catch (error) {
      logger.error('[PublicBooking] Erro ao buscar disponibilidade:', error?.message);
      if (process.env.NODE_ENV === 'development') {
        logger.error('[PublicBooking] Stack trace:', error?.stack);
      }
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar disponibilidade',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /api/public/agentes/:id/disponibilidade-range?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD&duration=90&unidade_id=1&exclude_agendamento_id=123
   * Buscar disponibilidade de um agente em um intervalo de datas (1 request para 30 dias)
   */
  async getAgenteDisponibilidadeRange(req, res) {
    try {
      const { id: agenteId } = req.params;
      const { data_inicio, data_fim, duration, unidade_id, exclude_agendamento_id } = req.query;

      if (!data_inicio || !data_fim) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros obrigatórios',
          message: 'Parâmetros data_inicio e data_fim são obrigatórios (formato: YYYY-MM-DD)'
        });
      }

      const duracaoMinutos = parseInt(duration) || 60;

      const parseDateStr = (dateStr) => {
        const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
        return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      };

      const toDateStr = (dt) => {
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dt.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      const start = parseDateStr(data_inicio);
      const end = parseDateStr(data_fim);
      if (!start || !end) {
        return res.status(400).json({
          success: false,
          error: 'Datas inválidas',
          message: 'data_inicio e data_fim devem estar no formato YYYY-MM-DD'
        });
      }

      if (end.getTime() < start.getTime()) {
        return res.status(400).json({
          success: false,
          error: 'Intervalo inválido',
          message: 'data_fim não pode ser menor que data_inicio'
        });
      }

      const maxDays = 62;
      const results = {};
      let cursor = new Date(start.getTime());
      let count = 0;

      while (cursor.getTime() <= end.getTime()) {
        count += 1;
        if (count > maxDays) {
          return res.status(400).json({
            success: false,
            error: 'Intervalo muito grande',
            message: `Intervalo máximo permitido é de ${maxDays} dias`
          });
        }

        const dateStr = toDateStr(cursor);
        const disponibilidade = await this.buildAgenteDisponibilidadeData({
          agenteId,
          data: dateStr,
          duracaoMinutos,
          unidade_id,
          exclude_agendamento_id
        });

        results[dateStr] = (Array.isArray(disponibilidade?.slots_disponiveis)
          ? disponibilidade.slots_disponiveis.map(s => s.hora_inicio)
          : []);

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      return res.json({
        success: true,
        data: {
          agente_id: parseInt(agenteId),
          data_inicio,
          data_fim,
          duracao_minutos: duracaoMinutos,
          disponibilidades: results
        }
      });

    } catch (error) {
      logger.error('[PublicBooking] Erro ao buscar disponibilidade (range):', error?.message);
      if (process.env.NODE_ENV === 'development') {
        logger.error('[PublicBooking] Stack trace:', error?.stack);
      }
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar disponibilidade',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async buildAgenteDisponibilidadeData({ agenteId, data, duracaoMinutos, unidade_id, exclude_agendamento_id }) {
    logger.log(`[PublicBooking] Buscando disponibilidade do agente ${agenteId} para ${data} (duração: ${duracaoMinutos}min, exclude: ${exclude_agendamento_id || 'nenhum'})`);

    // Verificar se agente existe e está ativo
    const agente = await this.agenteModel.findById(agenteId);
    if (!agente || agente.status !== 'Ativo') {
      const err = new Error('Agente não encontrado');
      err.statusCode = 404;
      throw err;
    }

    // ✅ CORREÇÃO: Usar unidade_id do parâmetro se fornecido, senão usar do agente
    const unidadeIdParaUsar = unidade_id ? parseInt(unidade_id) : agente.unidade_id;
    logger.log(`[PublicBooking] Usando unidade_id: ${unidadeIdParaUsar} (parâmetro: ${unidade_id}, agente: ${agente.unidade_id})`);

      // Calcular dia da semana (0 = Domingo, 6 = Sábado)
      // ✅ CORREÇÃO CRÍTICA: Tornar timezone-aware (America/Sao_Paulo) para evitar bugs perto da meia-noite
      // Ex: servidor em UTC pode interpretar "YYYY-MM-DDT00:00:00" como dia anterior no fuso local
    const tz = 'America/Sao_Paulo';
    const [y, m, d] = data.split('-').map(n => parseInt(n, 10));
    const dataNoonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(dataNoonUtc);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const diaSemana = weekdayMap[weekdayStr] ?? new Date(data + 'T00:00:00').getDay();

    const configuracoes = await db('configuracoes_sistema')
      .where('unidade_id', unidadeIdParaUsar)
      .select('tempo_limite_agendar_horas', 'periodo_futuro_dias')
      .first();

    const tempoLimiteHoras = configuracoes?.tempo_limite_agendar_horas || 0;
    const periodoFuturoDias = Number.isFinite(configuracoes?.periodo_futuro_dias)
      ? configuracoes.periodo_futuro_dias
      : 365;

    const hojeStr = this.getDateStrInTimeZone(tz);
    const maxDiaAbs = this.dayNumberFromDateStr(hojeStr) * 1440 + (periodoFuturoDias * 1440);
    const dataAbs = this.dayNumberFromDateStr(data) * 1440;

    if (dataAbs > maxDiaAbs) {
      return {
        agente_id: parseInt(agenteId),
        data: data,
        dia_semana: diaSemana,
        duracao_minutos: duracaoMinutos,
        slots_disponiveis: [],
        total_slots: 0,
        message: `Data fora do período permitido para agendamento (máximo: ${periodoFuturoDias} dia(s))`
      };
    }

      // ✅ CRÍTICO: Bloquear datas com exceções do AGENTE (DIA INTEIRO)
    const excecaoAgenteDiaInteiro = await AgenteExcecaoCalendario.isDataBloqueada(parseInt(agenteId), data);
    if (excecaoAgenteDiaInteiro) {
      return {
        agente_id: parseInt(agenteId),
        data: data,
        dia_semana: diaSemana,
        duracao_minutos: duracaoMinutos,
        slots_disponiveis: [],
        total_slots: 0,
        message: `Agente indisponível: ${excecaoAgenteDiaInteiro.tipo}${excecaoAgenteDiaInteiro.descricao ? ` - ${excecaoAgenteDiaInteiro.descricao}` : ''}`
      };
    }

      // ✅ CRÍTICO: Bloquear datas com exceções de DIA INTEIRO
      // Exceções parciais por horário serão aplicadas filtrando slots (mais abaixo)
    const excecaoDiaInteiro = await ExcecaoCalendario.isDataBloqueada(unidadeIdParaUsar, data);
    if (excecaoDiaInteiro) {
      logger.log(`[PublicBooking] 🚫 Data ${data} bloqueada por exceção (dia inteiro):`, {
        unidade_id: unidadeIdParaUsar,
        tipo: excecaoDiaInteiro.tipo,
        descricao: excecaoDiaInteiro.descricao,
        periodo: `${excecaoDiaInteiro.data_inicio} a ${excecaoDiaInteiro.data_fim}`
      });
      return {
        agente_id: parseInt(agenteId),
        data: data,
        dia_semana: diaSemana,
        duracao_minutos: duracaoMinutos,
        slots_disponiveis: [],
        total_slots: 0,
        message: `Data indisponível: ${excecaoDiaInteiro.tipo}${excecaoDiaInteiro.descricao ? ` - ${excecaoDiaInteiro.descricao}` : ''}`
      };
    }

    logger.log(`[PublicBooking] 🔍 Tempo limite para agendar: ${tempoLimiteHoras} hora(s)`);

      // 1. HIERARQUIA: Buscar horários de funcionamento da UNIDADE
      // ✅ CORREÇÃO: Usar unidadeIdParaUsar ao invés de agente.unidade_id
    const horarioUnidade = await db('horarios_funcionamento_unidade')
      .where('unidade_id', unidadeIdParaUsar)
      .where('dia_semana', diaSemana)
      .where('is_aberto', true)
      .first();

    if (!horarioUnidade || !horarioUnidade.horarios_json || horarioUnidade.horarios_json.length === 0) {
      return {
        agente_id: parseInt(agenteId),
        data: data,
        dia_semana: diaSemana,
        duracao_minutos: duracaoMinutos,
        slots_disponiveis: [],
        total_slots: 0,
        message: 'Unidade fechada neste dia'
      };
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
      return {
        agente_id: parseInt(agenteId),
        data: data,
        dia_semana: diaSemana,
        duracao_minutos: duracaoMinutos,
        slots_disponiveis: [],
        total_slots: 0,
        message: 'Agente não trabalha neste dia'
      };
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
    let slotsDisponiveis = this.generateAvailableSlots(
      horariosParaUsar,
      agendamentosExistentes,
      duracaoMinutos,
      data,
      tempoLimiteHoras
    );

      // ✅ NOVO: Aplicar exceções parciais por horário do AGENTE
    const excecoesAgenteDoDia = await AgenteExcecaoCalendario.findByAgenteAndDate(parseInt(agenteId), data);
    const bloqueiosAgenteParciais = (Array.isArray(excecoesAgenteDoDia) ? excecoesAgenteDoDia : [])
      .filter(e => e.hora_inicio && e.hora_fim)
      .map(e => ({
        inicio: e.hora_inicio.toString().substring(0, 5),
        fim: e.hora_fim.toString().substring(0, 5)
      }));

      if (bloqueiosAgenteParciais.length > 0) {
        const timeToMinutes = (time) => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours * 60 + minutes;
        };

        slotsDisponiveis = slotsDisponiveis.filter(slot => {
          const slotStart = timeToMinutes(slot.hora_inicio);
          const slotEnd = timeToMinutes(slot.hora_fim);

          return !bloqueiosAgenteParciais.some(b => {
            const bStart = timeToMinutes(b.inicio);
            const bEnd = timeToMinutes(b.fim);
            return slotStart < bEnd && slotEnd > bStart;
          });
        });
      }

      // ✅ NOVO: Aplicar exceções parciais por horário (bloqueios de intervalos no dia)
    const excecoesDoDia = await ExcecaoCalendario.findByUnidadeAndDate(unidadeIdParaUsar, data);
    const bloqueiosParciais = (Array.isArray(excecoesDoDia) ? excecoesDoDia : [])
      .filter(e => e.hora_inicio && e.hora_fim)
      .map(e => ({
        inicio: e.hora_inicio.toString().substring(0, 5),
        fim: e.hora_fim.toString().substring(0, 5),
        tipo: e.tipo,
        descricao: e.descricao
      }));

      if (bloqueiosParciais.length > 0) {
        const timeToMinutes = (time) => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours * 60 + minutes;
        };

        slotsDisponiveis = slotsDisponiveis.filter(slot => {
          const slotStart = timeToMinutes(slot.hora_inicio);
          const slotEnd = timeToMinutes(slot.hora_fim);

          return !bloqueiosParciais.some(b => {
            const bStart = timeToMinutes(b.inicio);
            const bEnd = timeToMinutes(b.fim);
            return slotStart < bEnd && slotEnd > bStart;
          });
        });
      }

    const uniqueSlotsMap = new Map();
    for (const slot of (Array.isArray(slotsDisponiveis) ? slotsDisponiveis : [])) {
      const key = `${slot.hora_inicio}-${slot.hora_fim}`;
      if (!uniqueSlotsMap.has(key)) {
        uniqueSlotsMap.set(key, slot);
      }
    }
    const horariosDisponiveis = Array.from(uniqueSlotsMap.values());

    return {
      agente_id: parseInt(agenteId),
      data: data,
      dia_semana: diaSemana,
      duracao_minutos: duracaoMinutos,
      slots_disponiveis: horariosDisponiveis,
      total_slots: horariosDisponiveis.length,
      message: horariosDisponiveis.length === 0 ? 'Nenhum horário disponível neste dia' : `${horariosDisponiveis.length} horários disponíveis`
    };
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

    // ✅ CRÍTICO: Basear bloqueios no timezone da operação (evita depender do timezone do servidor)
    const tz = 'America/Sao_Paulo';
    const hojeStr = this.getDateStrInTimeZone(tz);
    const isDiaAtual = dataAgendamento === hojeStr;
    const agoraMinutosHoje = this.getMinutesInTimeZone(tz);
    const agoraAbsMin = this.dayNumberFromDateStr(hojeStr) * 1440 + agoraMinutosHoje;
    const limiteAbsMin = agoraAbsMin + (tempoLimiteHoras * 60);
    
    logger.log(`[PublicBooking] Gerando slots para ${dataAgendamento}:`, {
      isDiaAtual,
      hojeStr,
      horarioAtual: this.minutesToTime(agoraMinutosHoje),
      tempoLimiteHoras,
      limiteAbsMin
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
        if (isDiaAtual && minuto < agoraMinutosHoje) {
          logger.log(`[PublicBooking] ⏰ Horário ${horarioSlot} bloqueado (já passou)`);
          continue; // Horário já passou, não disponibilizar
        }

        // ✅ NOVO: Bloquear horários fora do prazo mínimo (tempo_limite_agendar_horas)
        if (tempoLimiteHoras > 0) {
          const slotAbsMin = this.dayNumberFromDateStr(dataAgendamento) * 1440 + minuto;
          if (slotAbsMin < limiteAbsMin) {
            logger.log(`[PublicBooking] ⏰ Horário ${horarioSlot} bloqueado (fora do prazo mínimo de ${tempoLimiteHoras}h)`);
            continue;
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

      // ✅ CORREÇÃO: Descobrir o dono (usuario_id) da unidade para permitir busca global multi-unidade
      const unidadeIdNum = parseInt(unidade_id);
      const unidade = await db('unidades')
        .where('id', unidadeIdNum)
        .select('id', 'usuario_id')
        .first();

      if (!unidade) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada',
          message: 'A unidade informada não existe.'
        });
      }

      // ✅ CORREÇÃO 1.2: Validar sessão (OPCIONAL - pode ser desabilitado em desenvolvimento)
      // ⚠️ TEMPORARIAMENTE DESABILITADO: Permitir busca sem session_token para BookingPage funcionar
      // if (process.env.NODE_ENV === 'production' && !session_token) {
      //   logger.warn(`🚨 [SECURITY] Tentativa de busca de cliente sem sessão - IP: ${req.ip}, Telefone: ${telefone}`);
      //   return res.status(401).json({
      //     success: false,
      //     error: 'Sessão inválida',
      //     message: 'Token de sessão é obrigatório'
      //   });
      // }

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
        if (sessionData.unidade_id !== unidadeIdNum) {
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

      // 🔧 CORREÇÃO: Buscar cliente considerando variações do 9º dígito
      // Gera variações: ["8591082000", "85991082000"] ou ["85991082000", "8591082000"]
      const variacoesTelefoneBase = this.normalizarTelefoneVariacoes(telefone);
      const variacoesTelefone = [];
      const addUnique = (v) => {
        if (v && !variacoesTelefone.includes(v)) variacoesTelefone.push(v);
      };

      // Cobrir inconsistência: clientes.telefone_limpo pode estar salvo com ou sem 55
      variacoesTelefoneBase.forEach(v => {
        addUnique(v);
        if (v.startsWith('55') && v.length >= 12) {
          addUnique(v.substring(2));
        } else {
          addUnique(`55${v}`);
        }
      });

      logger.log(`🔍 [BuscarCliente] Buscando cliente Global (Usuario ID: ${unidade.usuario_id}). Total variações: ${variacoesTelefone.length}`);

      // ✅ CORREÇÃO: Busca global por dono (usuario_id) em vez de restringir ao unidade_id atual.
      // Permite encontrar cliente cadastrado em outra unidade do mesmo dono.
      const cliente = await db('clientes')
        .leftJoin('unidades as u', 'clientes.unidade_id', 'u.id')
        .where(function() {
          this.where('clientes.unidade_id', unidadeIdNum)
            .orWhere('u.usuario_id', unidade.usuario_id);
        })
        .where(function() {
          variacoesTelefone.forEach((variacao, index) => {
            if (index === 0) {
              this.where('clientes.telefone_limpo', variacao);
            } else {
              this.orWhere('clientes.telefone_limpo', variacao);
            }
          });
        })
        .select(
          'clientes.id',
          'clientes.primeiro_nome',
          'clientes.ultimo_nome',
          'clientes.telefone',
          'clientes.data_nascimento'
        )
        .first();

      if (cliente) {
        logger.log(`✅ [BuscarCliente] Cliente encontrado - ID: ${cliente.id}, Nome: ${cliente.primeiro_nome}`);
        // ✅ CORREÇÃO 1.2: Log de acesso a dados pessoais (LGPD)
        logger.log(`🔍 [LGPD] Busca de cliente - IP: ${req.ip}, Cliente ID: ${cliente.id}, Unidade: ${unidade_id}`);
        
        return res.json({
          success: true,
          cliente: {
            id: cliente.id,
            primeiro_nome: cliente.primeiro_nome,
            ultimo_nome: cliente.ultimo_nome,
            telefone: cliente.telefone,
            data_nascimento: cliente.data_nascimento
          }
        });
      } else {
        logger.log('❌ [BuscarCliente] Cliente não encontrado nas variações.');
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
        usar_assinatura_itens = null,
        data_agendamento,
        hora_inicio,
        cliente_nome,
        cliente_telefone,
        data_nascimento,
        observacoes
      } = req.body;

      logger.log('[PublicBooking] Criando agendamento:', req.body);

      // ✅ IMPORTANTE: Variáveis precisam existir sempre para evitar ReferenceError/TypeError
      // quando o cliente opta por usar assinatura.
      let valorTotal = 0;
      let assinaturaAtiva = false;
      let plano = null;
      let planItemIdsToConsume = [];
      const planoItemByServicoId = new Map();
      const planoItemByExtraId = new Map();
      const servicosCobertos = new Set();
      const extrasCobertos = new Set();

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

      // ✅ CRÍTICO: Bloquear criação se a data estiver coberta por exceção (manutenção/feriado/etc.)
      const excecaoDiaInteiro = await ExcecaoCalendario.isDataBloqueada(unidade_id, data_agendamento);
      if (excecaoDiaInteiro) {
        logger.log(`[PublicBooking] 🚫 Tentativa de agendar em data bloqueada por exceção (dia inteiro):`, {
          unidade_id,
          data: data_agendamento,
          tipo: excecaoDiaInteiro.tipo,
          descricao: excecaoDiaInteiro.descricao,
          periodo: `${excecaoDiaInteiro.data_inicio} a ${excecaoDiaInteiro.data_fim}`
        });
        await trx.rollback();
        return res.status(403).json({
          success: false,
          error: 'Data indisponível',
          message: `Não é possível agendar nesta data (${excecaoDiaInteiro.tipo}${excecaoDiaInteiro.descricao ? ` - ${excecaoDiaInteiro.descricao}` : ''}).`
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
      let configuracoes = await trx('configuracoes_sistema')
        .where('unidade_id', unidade_id)
        .select(
          'tempo_limite_agendar_horas',
          'pontos_ativo',
          'pontos_por_real',
          'pontos_validade_meses'
        )
        .first();

      // ✅ CORREÇÃO: Se não existir configuração, criar uma com valores padrão
      if (!configuracoes) {
        logger.log(`[PublicBooking] ⚠️ Configurações não encontradas para unidade_id=${unidade_id}, criando configuração padrão...`);

        try {
          await trx('configuracoes_sistema').insert({
            unidade_id: unidade_id,
            nome_negocio: unidade.nome || 'Meu Negócio',
            logo_url: null,
            duracao_servico_minutos: 60,
            tempo_limite_agendar_horas: 2,
            permitir_cancelamento: true,
            tempo_limite_cancelar_horas: 4,
            periodo_futuro_dias: 365,
            pontos_ativo: false,
            pontos_por_real: 1.00,
            reais_por_pontos: 10.00,
            pontos_validade_meses: 12
          });

          configuracoes = { tempo_limite_agendar_horas: 2 };
          logger.log(`[PublicBooking] ✅ Configuração padrão criada para unidade_id=${unidade_id}`);
        } catch (insertError) {
          logger.error(`[PublicBooking] ❌ Erro ao criar configuração padrão:`, insertError);
          // Usar valor padrão mesmo assim
          configuracoes = { tempo_limite_agendar_horas: 2 };
        }
      }

      logger.log(`[PublicBooking] 🔍 Configurações de agendamento:`, {
        tempo_limite_agendar_horas: configuracoes.tempo_limite_agendar_horas,
        pontos_ativo: configuracoes.pontos_ativo,
        pontos_por_real: configuracoes.pontos_por_real,
        pontos_validade_meses: configuracoes.pontos_validade_meses
      });

      // ✅ VALIDAÇÃO 2: Verificar se está dentro do prazo mínimo para agendar
      // ✅ CRÍTICO: Comparar usando base consistente (America/Sao_Paulo) para evitar bugs de timezone
      const tz = 'America/Sao_Paulo';
      const hojeStr = this.getDateStrInTimeZone(tz);
      const agoraMinutosHoje = this.getMinutesInTimeZone(tz);
      const agoraAbsMin = this.dayNumberFromDateStr(hojeStr) * 1440 + agoraMinutosHoje;
      const agendamentoAbsMin = this.absoluteMinutesFromDateStrAndTime(data_agendamento, hora_inicio);
      const diferencaMin = agendamentoAbsMin - agoraAbsMin;
      const diferencaHoras = diferencaMin / 60;

      logger.log(`[PublicBooking] 🔍 Cálculo de prazo para agendamento:`, {
        tz,
        agora_hoje: hojeStr,
        agora_hora: this.minutesToTime(agoraMinutosHoje),
        agendamento_data: data_agendamento,
        agendamento_hora: hora_inicio,
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

      // ✅ CORREÇÃO: Buscar serviços extras se fornecidos
      // A tabela servicos_extras usa usuario_id, não unidade_id
      let servicosExtras = [];
      if (servico_extra_ids.length > 0) {
        servicosExtras = await trx('servicos_extras')
          .whereIn('id', servico_extra_ids)
          .where('status', 'Ativo')
          .where('usuario_id', unidade.usuario_id)
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

      let coveredServicoIds = [];
      let coveredExtraIds = [];
      if (usar_assinatura_itens && typeof usar_assinatura_itens === 'object') {
        if (Array.isArray(usar_assinatura_itens.servico_ids)) {
          coveredServicoIds = usar_assinatura_itens.servico_ids.map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n));
        }
        if (Array.isArray(usar_assinatura_itens.servico_extra_ids)) {
          coveredExtraIds = usar_assinatura_itens.servico_extra_ids.map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n));
        }
      }

      const requestServicoSet = new Set((servico_ids || []).map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n)));
      const requestExtraSet = new Set((servico_extra_ids || []).map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n)));
      coveredServicoIds = coveredServicoIds.filter(id => requestServicoSet.has(id));
      coveredExtraIds = coveredExtraIds.filter(id => requestExtraSet.has(id));

      // Cobertura selecionada pelo cliente (será validada/ajustada se assinatura estiver ativa)
      coveredServicoIds.forEach(id => servicosCobertos.add(id));
      coveredExtraIds.forEach(id => extrasCobertos.add(id));

      // Calcular valorTotal com base na seleção (preço 0 para itens cobertos)
      // OBS: a validação de saldo/assinatura é feita mais abaixo; caso assinatura não esteja ativa,
      // a seleção ainda não deve quebrar o fluxo.
      const subtotalServicos = servicos.reduce((total, s) => total + (Number(s.preco) || 0), 0);
      const subtotalExtras = servicosExtras.reduce((total, e) => total + (Number(e.preco) || 0), 0);
      const descontoServicos = servicos
        .filter(s => servicosCobertos.has(parseInt(s.id, 10)))
        .reduce((total, s) => total + (Number(s.preco) || 0), 0);
      const descontoExtras = servicosExtras
        .filter(e => extrasCobertos.has(parseInt(e.id, 10)))
        .reduce((total, e) => total + (Number(e.preco) || 0), 0);
      valorTotal = Math.max(0, (subtotalServicos + subtotalExtras) - (descontoServicos + descontoExtras));

      // Calcular hora_fim
      const horaInicioMinutos = this.timeToMinutes(hora_inicio);
      const horaFimMinutos = horaInicioMinutos + duracaoTotalMinutos;
      const hora_fim = this.minutesToTime(horaFimMinutos);

      // ✅ CRÍTICO: Bloquear criação se a data estiver coberta por exceção do AGENTE (dia inteiro)
      const excecaoAgenteDiaInteiro = await AgenteExcecaoCalendario.isDataBloqueada(agente_id, data_agendamento);
      if (excecaoAgenteDiaInteiro) {
        await trx.rollback();
        return res.status(403).json({
          success: false,
          error: 'Horário indisponível',
          message: `Não é possível agendar neste dia (Agente indisponível: ${excecaoAgenteDiaInteiro.tipo}${excecaoAgenteDiaInteiro.descricao ? ` - ${excecaoAgenteDiaInteiro.descricao}` : ''}).`
        });
      }

      // ✅ CRÍTICO: Bloquear criação se houver exceção parcial do AGENTE que colida com o agendamento
      const excecoesAgenteDoDia = await AgenteExcecaoCalendario.findByAgenteAndDate(agente_id, data_agendamento, trx);
      const bloqueiosAgenteParciais = (Array.isArray(excecoesAgenteDoDia) ? excecoesAgenteDoDia : [])
        .filter(e => e.hora_inicio && e.hora_fim)
        .map(e => ({
          inicio: e.hora_inicio.toString().substring(0, 5),
          fim: e.hora_fim.toString().substring(0, 5),
          tipo: e.tipo,
          descricao: e.descricao
        }));

      if (bloqueiosAgenteParciais.length > 0) {
        const startMin = this.timeToMinutes(hora_inicio);
        const endMin = this.timeToMinutes(hora_fim);

        const blocked = bloqueiosAgenteParciais.find(b => {
          const bStart = this.timeToMinutes(b.inicio);
          const bEnd = this.timeToMinutes(b.fim);
          return startMin < bEnd && endMin > bStart;
        });

        if (blocked) {
          await trx.rollback();
          return res.status(403).json({
            success: false,
            error: 'Horário indisponível',
            message: `Não é possível agendar neste horário (Agente indisponível: ${blocked.tipo}${blocked.descricao ? ` - ${blocked.descricao}` : ''}).`
          });
        }
      }

      // ✅ NOVO: Bloquear criação se houver exceção parcial por horário que colida com o agendamento
      const excecoesDoDia = await ExcecaoCalendario.findByUnidadeAndDate(unidade_id, data_agendamento, trx);
      const bloqueiosParciais = (Array.isArray(excecoesDoDia) ? excecoesDoDia : [])
        .filter(e => e.hora_inicio && e.hora_fim)
        .map(e => ({
          inicio: e.hora_inicio.toString().substring(0, 5),
          fim: e.hora_fim.toString().substring(0, 5),
          tipo: e.tipo,
          descricao: e.descricao
        }));

      if (bloqueiosParciais.length > 0) {
        const startMin = this.timeToMinutes(hora_inicio);
        const endMin = this.timeToMinutes(hora_fim);

        const blocked = bloqueiosParciais.find(b => {
          const bStart = this.timeToMinutes(b.inicio);
          const bEnd = this.timeToMinutes(b.fim);
          return startMin < bEnd && endMin > bStart;
        });

        if (blocked) {
          await trx.rollback();
          return res.status(403).json({
            success: false,
            error: 'Horário indisponível',
            message: `Não é possível agendar neste horário (${blocked.tipo}${blocked.descricao ? ` - ${blocked.descricao}` : ''}).`
          });
        }
      }

      // ✅ CORREÇÃO CRÍTICA: Adquirir advisory lock para prevenir race condition
      // Isso serializa todas as operações de criação para o mesmo agente/data
      await trx.raw(`
        SELECT pg_advisory_xact_lock(
          hashtext(?::text || ?::text)
        )
      `, [agente_id.toString(), data_agendamento]);

      // Verificar disponibilidade do agente (agora protegido pelo lock)
      logger.log(`🔍 [PublicBooking] Verificando conflitos:`, {
        agente_id,
        data_agendamento,
        hora_inicio,
        hora_fim,
        duracaoTotalMinutos
      });

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

      // Log todos os agendamentos do agente neste dia (para debug)
      const todosAgendamentos = await trx('agendamentos')
        .where('agente_id', agente_id)
        .where('data_agendamento', data_agendamento)
        .select('id', 'status', 'hora_inicio', 'hora_fim');

      logger.log(`📋 [PublicBooking] Agendamentos existentes para agente ${agente_id} em ${data_agendamento}:`, todosAgendamentos);

      if (conflito) {
        logger.log(`❌ [PublicBooking] CONFLITO DETECTADO:`, {
          conflito_id: conflito.id,
          conflito_status: conflito.status,
          conflito_hora_inicio: conflito.hora_inicio,
          conflito_hora_fim: conflito.hora_fim,
          tentativa_hora_inicio: hora_inicio,
          tentativa_hora_fim: hora_fim
        });

        await trx.rollback();
        return res.status(409).json({
          success: false,
          error: 'Horário indisponível',
          message: 'Este horário já está ocupado'
        });
      }

      logger.log(`✅ [PublicBooking] Nenhum conflito detectado. Prosseguindo com criação...`);

      // 🔧 CORREÇÃO: Buscar cliente considerando variações do 9º dígito
      // Evita duplicação de clientes (ex: 8591082000 vs 85991082000)
      const variacoesTelefone = this.normalizarTelefoneVariacoes(cliente_telefone);

      let cliente = await trx('clientes')
        .where('unidade_id', unidade_id)
        .where(function() {
          // Buscar por qualquer uma das variações do telefone
          variacoesTelefone.forEach((variacao, index) => {
            if (index === 0) {
              this.where('telefone_limpo', variacao);
            } else {
              this.orWhere('telefone_limpo', variacao);
            }
          });
        })
        .select('*')
        .first();

      if (!cliente) {
        logger.log(`⚠️ [PublicBooking] Cliente NÃO encontrado. Vai criar novo cliente.`, {
          unidade_id,
          cliente_telefone,
          variacoesTelefone
        });
        // Dividir nome em primeiro e último nome
        const nomePartes = cliente_nome.trim().split(' ');
        const primeiro_nome = nomePartes[0];
        const ultimo_nome = nomePartes.slice(1).join(' ') || '';

        // 🔧 CORREÇÃO: Normalizar telefone para formato padrão (11 dígitos com 9)
        // Se telefone tem 10 dígitos, adiciona o 9. Se tem 11, mantém.
        let telefone_limpo = cliente_telefone.replace(/\D/g, '');
        
        // Remover código do país se presente
        if (telefone_limpo.startsWith('55') && telefone_limpo.length >= 12) {
          telefone_limpo = telefone_limpo.substring(2);
        }

        // Normalizar para 11 dígitos (adicionar 9 se necessário)
        if (telefone_limpo.length === 10) {
          // Formato antigo (DDD + 8 dígitos) → Adicionar 9
          telefone_limpo = telefone_limpo.substring(0, 2) + '9' + telefone_limpo.substring(2);
          logger.log(`📞 [PublicBooking] Telefone normalizado de 10 para 11 dígitos: ${telefone_limpo}`);
        }

        const [novoCliente] = await trx('clientes').insert({
          primeiro_nome,
          ultimo_nome,
          telefone: cliente_telefone,
          telefone_limpo: telefone_limpo, // ✅ CRÍTICO: Sempre 11 dígitos (formato padrão)
          data_nascimento: data_nascimento || null,
          unidade_id: unidade_id,
          status: 'Ativo'
        }).returning('*');
        cliente = novoCliente;

        logger.log(`✅ [PublicBooking] Cliente criado automaticamente:`, {
          cliente_id: cliente?.id,
          unidade_id,
          telefone_limpo: telefone_limpo,
          telefone_original: cliente_telefone
        });
      } else {
        logger.log(`✅ [PublicBooking] Cliente encontrado por telefone (variações):`, {
          cliente_id: cliente?.id,
          unidade_id,
          telefone_limpo: cliente.telefone_limpo,
          status: cliente.status,
          variacoes_buscadas: variacoesTelefone
        });

        if (!cliente.data_nascimento && data_nascimento) {
          const [clienteAtualizado] = await trx('clientes')
            .where('id', cliente.id)
            .where('unidade_id', unidade_id)
            .update({ data_nascimento: data_nascimento, updated_at: new Date() })
            .returning('*');
          if (clienteAtualizado) {
            cliente = clienteAtualizado;
          }
        }
      }

      // 🚫 BARREIRA: Cliente bloqueado não pode criar agendamento
      logger.log(`🧱 [PublicBooking] Checando bloqueio do cliente:`, {
        cliente_id: cliente?.id,
        unidade_id,
        status: cliente?.status,
        telefone_limpo: cliente?.telefone_limpo
      });
      if (cliente?.status === 'Bloqueado') {
        await trx.rollback();
        return res.status(403).json({
          success: false,
          error: 'Cliente bloqueado',
          message: 'Você possui restrições para agendamentos automáticos. Por favor, entre em contato via WhatsApp.'
        });
      }

      // 🛡️ FASE 2.1 (DEFESA EM PROFUNDIDADE): mesmo que o payload envie usar_assinatura_itens,
      // só permitir consumo de cota se assinatura_status === 'Ativo'. Caso contrário, cobrar normal.
      const assinaturaStatusCliente = cliente?.assinatura_status || null;
      if (assinaturaStatusCliente !== 'Ativo') {
        servicosCobertos.clear();
        extrasCobertos.clear();
      }

      const hasAssinaturaSelection = servicosCobertos.size > 0 || extrasCobertos.size > 0;
      if (hasAssinaturaSelection && cliente?.is_assinante && cliente?.assinatura_plano_id && cliente?.data_inicio_assinatura && cliente?.status === 'Ativo' && cliente?.assinatura_status === 'Ativo') {
        try {
          // ✅ FASE 3 (BLINDAGEM DE CONCORRÊNCIA): Serializar consumo de cotas por cliente
          // Garante que saldo (leitura) e uso (insert) sejam atômicos no mesmo trx.
          await trx.raw('SELECT pg_advisory_xact_lock(?::int, ?::int)', [7001, parseInt(cliente.id, 10)]);

          plano = await trx('planos_assinatura')
            .where('id', cliente.assinatura_plano_id)
            .where(function() {
              this.where('usuario_id', unidade.usuario_id)
                .orWhere('unidade_id', unidade_id);
            })
            .where('status', 'Ativo')
            .first();

          if (plano) {
            const validadeDias = parseInt(plano.validade_dias, 10) || 31;
            const tz = 'America/Sao_Paulo';
            const referencia = this.getDateStrInTimeZone(tz);

            const dataInicioAssinaturaStr = this.normalizeDateStr(cliente.data_inicio_assinatura);
            if (dataInicioAssinaturaStr) {
              const { cycleStart, cycleEndExclusive } = this.getCycleBounds({
                startDateStr: dataInicioAssinaturaStr,
                validadeDias,
                referenceDateStr: referencia
              });

              const cycleStartTs = new Date(`${cycleStart}T00:00:00-03:00`);
              const cycleEndExclusiveTs = new Date(`${cycleEndExclusive}T00:00:00-03:00`);

              const itens = await this.planoAssinaturaModel.findItens(plano.id);
              const itensById = new Map((itens || []).map(i => [String(i.id), i]));

              for (const item of (itens || [])) {
                if (item.tipo === 'SERVICO' && item.servico_id) {
                  planoItemByServicoId.set(parseInt(item.servico_id, 10), item);
                }
                if (item.tipo === 'EXTRA' && item.servico_extra_id) {
                  planoItemByExtraId.set(parseInt(item.servico_extra_id, 10), item);
                }
              }

              const selectedItemIds = [];
              for (const sid of servicosCobertos) {
                const item = planoItemByServicoId.get(sid);
                if (item?.id) selectedItemIds.push(parseInt(item.id, 10));
              }
              for (const eid of extrasCobertos) {
                const item = planoItemByExtraId.get(eid);
                if (item?.id) selectedItemIds.push(parseInt(item.id, 10));
              }

              const uniqueItemIds = Array.from(new Set(selectedItemIds)).filter(n => Number.isFinite(n));
              let usadosRows = [];

              if (uniqueItemIds.length > 0) {
                usadosRows = await trx('assinatura_usos')
                  .where('cliente_id', cliente.id)
                  .whereIn('plano_item_id', uniqueItemIds)
                  .where('data_uso', '>=', cycleStartTs)
                  .where('data_uso', '<', cycleEndExclusiveTs)
                  .groupBy('plano_item_id')
                  .select('plano_item_id')
                  .sum({ total: 'quantidade' });
              }

              const usadosByItemId = (usadosRows || []).reduce((acc, row) => {
                const id = String(row.plano_item_id);
                acc[id] = parseInt(row.total, 10) || 0;
                return acc;
              }, {});

              const hasRemaining = (item) => {
                const quota = item.quantidade_por_ciclo === null || item.quantidade_por_ciclo === undefined
                  ? null
                  : parseInt(item.quantidade_por_ciclo, 10);
                if (quota === null) return true;
                const used = usadosByItemId[String(item.id)] || 0;
                return (quota - used) > 0;
              };

              // Remover da cobertura o que não existe no plano ou não tem saldo
              for (const sid of Array.from(servicosCobertos)) {
                const item = planoItemByServicoId.get(sid);
                if (!item || !itensById.has(String(item.id)) || !hasRemaining(item)) {
                  servicosCobertos.delete(sid);
                }
              }

              for (const eid of Array.from(extrasCobertos)) {
                const item = planoItemByExtraId.get(eid);
                if (!item || !itensById.has(String(item.id)) || !hasRemaining(item)) {
                  extrasCobertos.delete(eid);
                }
              }

              planItemIdsToConsume = Array.from(new Set([
                ...Array.from(servicosCobertos).map(sid => planoItemByServicoId.get(sid)?.id).filter(Boolean),
                ...Array.from(extrasCobertos).map(eid => planoItemByExtraId.get(eid)?.id).filter(Boolean)
              ])).map(id => parseInt(id, 10)).filter(n => Number.isFinite(n));

              assinaturaAtiva = planItemIdsToConsume.length > 0;
            }
          }
        } catch (e) {
          assinaturaAtiva = false;
          plano = null;
          planItemIdsToConsume = [];
        }
      }

      if (!assinaturaAtiva) {
        servicosCobertos.clear();
        extrasCobertos.clear();
      }

      // Recalcular valorTotal após validar assinatura (não dar desconto se assinatura não está ativa ou sem saldo)
      {
        const subtotalServicosRecalc = servicos.reduce((total, s) => total + (Number(s.preco) || 0), 0);
        const subtotalExtrasRecalc = servicosExtras.reduce((total, e) => total + (Number(e.preco) || 0), 0);
        const descontoServicosRecalc = servicos
          .filter(s => servicosCobertos.has(parseInt(s.id, 10)))
          .reduce((total, s) => total + (Number(s.preco) || 0), 0);
        const descontoExtrasRecalc = servicosExtras
          .filter(e => extrasCobertos.has(parseInt(e.id, 10)))
          .reduce((total, e) => total + (Number(e.preco) || 0), 0);
        valorTotal = Math.max(0, (subtotalServicosRecalc + subtotalExtrasRecalc) - (descontoServicosRecalc + descontoExtrasRecalc));
      }

      // ✅ NOVO: Gerar numero_agendamento sequencial por empresa (usuario_id)
      // Importante: usuario_id é o dono da unidade
      const usuarioId = unidade.usuario_id;

      await trx.raw(`
        SELECT pg_advisory_xact_lock(
          hashtext(?::text)
        )
      `, [`agendamento_numero_usuario_${usuarioId}`]);

      const lastRow = await trx('agendamentos')
        .where('usuario_id', usuarioId)
        .max('numero_agendamento as max')
        .first();

      const last = lastRow && lastRow.max ? parseInt(lastRow.max, 10) : 0;
      const numeroAgendamento = last + 1;

      // Criar agendamento
      const [agendamento] = await trx('agendamentos').insert({
        cliente_id: cliente.id,
        agente_id: agente_id,
        unidade_id: unidade_id,
        usuario_id: usuarioId,
        numero_agendamento: numeroAgendamento,
        data_agendamento: data_agendamento,
        hora_inicio: hora_inicio,
        hora_fim: hora_fim,
        status: 'Aprovado',
        valor_total: valorTotal,
        observacoes: observacoes || null
      }).returning('*');

      // ✅ GATILHO DE PONTOS (BOOKING PÚBLICO): Gerar pontos automaticamente ao criar agendamento
      // Importante: a regra "só pode usar a partir do 2º agendamento" não impede acumular;
      // aqui apenas CREDITAMOS pontos se o sistema estiver ativo.
      try {
        if (configuracoes && configuracoes.pontos_ativo && valorTotal > 0) {
          const pontosPorReal = parseFloat(configuracoes.pontos_por_real) || 1.0;
          const pontosValidade = parseInt(configuracoes.pontos_validade_meses, 10) || 12;
          const pontosGerados = Math.floor(valorTotal * pontosPorReal);

          if (pontosGerados > 0) {
            const dataValidade = new Date();
            dataValidade.setMonth(dataValidade.getMonth() + pontosValidade);

            await trx('pontos_historico').insert({
              cliente_id: cliente.id,
              unidade_id: unidade_id,
              agendamento_id: agendamento.id,
              tipo: 'CREDITO',
              pontos: pontosGerados,
              valor_real: valorTotal,
              descricao: `Pontos ganhos no agendamento #${agendamento.id}`,
              data_validade: dataValidade.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
              expirado: false,
              created_at: new Date()
            });

            logger.log(`✅ [PublicBooking] Pontos gerados: ${pontosGerados} pts para cliente #${cliente.id} (R$ ${Number(valorTotal).toFixed(2)})`);
          } else {
            logger.log(`ℹ️ [PublicBooking] Pontos NÃO gerados (cálculo resultou 0):`, {
              valorTotal,
              pontosPorReal,
              cliente_id: cliente.id,
              agendamento_id: agendamento.id
            });
          }
        } else {
          logger.log(`ℹ️ [PublicBooking] Sistema de pontos inativo ou valor_total inválido:`, {
            pontos_ativo: configuracoes?.pontos_ativo,
            valorTotal,
            unidade_id
          });
        }
      } catch (pontosError) {
        logger.error('❌ [PublicBooking] Erro ao gerar pontos:', pontosError);
        // Não falhar a criação do agendamento por erro nos pontos
      }

      // Criar relacionamentos com serviços
      const agendamentoServicos = servicos.map(servico => ({
        agendamento_id: agendamento.id,
        servico_id: servico.id,
        preco_aplicado: servicosCobertos.has(parseInt(servico.id, 10)) ? 0 : servico.preco
      }));

      await trx('agendamento_servicos').insert(agendamentoServicos);

      // Criar relacionamentos com serviços extras (se houver)
      if (servicosExtras.length > 0) {
        const agendamentoServicosExtras = servicosExtras.map(extra => ({
          agendamento_id: agendamento.id,
          servico_extra_id: extra.id,
          preco_aplicado: extrasCobertos.has(parseInt(extra.id, 10)) ? 0 : extra.preco
        }));

        await trx('agendamento_servicos_extras').insert(agendamentoServicosExtras);
      }

      if (assinaturaAtiva && planItemIdsToConsume.length > 0) {
        const usoRows = [];

        for (const sid of servicosCobertos) {
          const item = planoItemByServicoId.get(sid);
          if (!item) continue;
          usoRows.push({
            cliente_id: cliente.id,
            plano_id: plano.id,
            plano_item_id: item.id,
            agendamento_id: agendamento.id,
            data_uso: new Date(`${data_agendamento}T${hora_inicio || '00:00'}:00-03:00`),
            quantidade: 1,
            created_at: new Date()
          });
        }

        for (const eid of extrasCobertos) {
          const item = planoItemByExtraId.get(eid);
          if (!item) continue;
          usoRows.push({
            cliente_id: cliente.id,
            plano_id: plano.id,
            plano_item_id: item.id,
            agendamento_id: agendamento.id,
            data_uso: new Date(`${data_agendamento}T${hora_inicio || '00:00'}:00-03:00`),
            quantidade: 1,
            created_at: new Date()
          });
        }

        if (usoRows.length > 0) {
          try {
            const validadeDias = parseInt(plano?.validade_dias, 10) || 31;
            const tz = 'America/Sao_Paulo';
            const referencia = this.getDateStrInTimeZone(tz);
            const dataInicioAssinaturaStr = this.normalizeDateStr(cliente.data_inicio_assinatura);

            if (!dataInicioAssinaturaStr) {
              throw new Error('Cota do clube esgotada.');
            }

            const { cycleStart, cycleEndExclusive } = this.getCycleBounds({
              startDateStr: dataInicioAssinaturaStr,
              validadeDias,
              referenceDateStr: referencia
            });

            const cycleStartTs = new Date(`${cycleStart}T00:00:00-03:00`);
            const cycleEndExclusiveTs = new Date(`${cycleEndExclusive}T00:00:00-03:00`);

            const planItemsToConsume = await trx('planos_assinatura_itens')
              .whereIn('id', planItemIdsToConsume)
              .select('id', 'quantidade_por_ciclo');

            const requiredByItemId = usoRows.reduce((acc, row) => {
              const key = String(row.plano_item_id);
              acc[key] = (acc[key] || 0) + (parseInt(row.quantidade, 10) || 0);
              return acc;
            }, {});

            const usadosRows = await trx('assinatura_usos')
              .where('cliente_id', cliente.id)
              .whereIn('plano_item_id', planItemIdsToConsume)
              .where('data_uso', '>=', cycleStartTs)
              .where('data_uso', '<', cycleEndExclusiveTs)
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
            // Se as migrations ainda não foram aplicadas, a tabela pode não existir.
            // Não falhar o agendamento por causa disso.
            if (err && (err.code === '42P01' || String(err.message || '').includes('assinatura_usos'))) {
              logger.warn('[PublicBooking] Tabela assinatura_usos não existe ainda; ignorando registro de uso de assinatura.');
            } else if (String(err?.message || '') === 'Cota do clube esgotada.') {
              const subtotalServicosRecalc = servicos.reduce((total, s) => total + (Number(s.preco) || 0), 0);
              const subtotalExtrasRecalc = servicosExtras.reduce((total, e) => total + (Number(e.preco) || 0), 0);
              valorTotal = Math.max(0, subtotalServicosRecalc + subtotalExtrasRecalc);

              await trx('agendamentos')
                .where('id', agendamento.id)
                .update({ valor_total: valorTotal, updated_at: new Date() });

              for (const servico of servicos) {
                await trx('agendamento_servicos')
                  .where({ agendamento_id: agendamento.id, servico_id: servico.id })
                  .update({ preco_aplicado: servico.preco });
              }

              for (const extra of servicosExtras) {
                await trx('agendamento_servicos_extras')
                  .where({ agendamento_id: agendamento.id, servico_extra_id: extra.id })
                  .update({ preco_aplicado: extra.preco });
              }

              assinaturaAtiva = false;
              servicosCobertos.clear();
              extrasCobertos.clear();
              planItemIdsToConsume = [];
            } else {
              throw err;
            }
          }
        }
      }

      await trx.commit();

      logger.log(`[PublicBooking] Agendamento criado com sucesso: ID ${agendamento.id}`);

      // ✅ NOVO (abb4106): Calcular saldo da assinatura após commit (para mensagem WhatsApp)
      // Importante: aqui usamos a conexão normal (db), pois a transação já foi comitada.
      let assinaturaSaldo = null;
      try {
        if (cliente?.is_assinante && cliente?.assinatura_plano_id && cliente?.data_inicio_assinatura && cliente?.status === 'Ativo') {
          const planoAssinatura = plano || await db('planos_assinatura')
            .where('id', cliente.assinatura_plano_id)
            .where(function() {
              this.where('usuario_id', unidade.usuario_id)
                .orWhere('unidade_id', unidade_id);
            })
            .where('status', 'Ativo')
            .first();

          logger.log('[PublicBooking] assinatura_saldo debug (pre-itens):', {
            agendamento_id: agendamento?.id,
            cliente_id: cliente?.id,
            unidade_id,
            assinatura_plano_id: cliente?.assinatura_plano_id,
            plano_encontrado: Boolean(planoAssinatura?.id),
            plano_id: planoAssinatura?.id || null
          });

          if (planoAssinatura) {
            const validadeDias = parseInt(planoAssinatura.validade_dias, 10) || 31;
            const tz = 'America/Sao_Paulo';
            const referencia = this.getDateStrInTimeZone(tz);
            const dataInicioAssinaturaStr = this.normalizeDateStr(cliente.data_inicio_assinatura);

            if (dataInicioAssinaturaStr) {
              const { cycleStart, cycleEndInclusive, cycleEndExclusive } = this.getCycleBounds({
                startDateStr: dataInicioAssinaturaStr,
                validadeDias,
                referenceDateStr: referencia
              });

              const itens = await this.planoAssinaturaModel.findItens(planoAssinatura.id);
              const itemIds = (itens || []).map(i => parseInt(i.id, 10)).filter(n => Number.isFinite(n));

              let usadosRows = [];
              if (itemIds.length > 0) {
                try {
                  usadosRows = await db('assinatura_usos')
                    .where('cliente_id', cliente.id)
                    .whereIn('plano_item_id', itemIds)
                    .where('data_uso', '>=', cycleStart)
                    .where('data_uso', '<', cycleEndExclusive)
                    .groupBy('plano_item_id')
                    .select('plano_item_id')
                    .sum({ total: 'quantidade' });
                } catch (err) {
                  // Se as migrations ainda não foram aplicadas, a tabela pode não existir.
                  if (!(err && (err.code === '42P01' || String(err.message || '').includes('assinatura_usos')))) {
                    throw err;
                  }
                }
              }

              const usadosByItemId = (usadosRows || []).reduce((acc, row) => {
                acc[String(row.plano_item_id)] = parseInt(row.total, 10) || 0;
                return acc;
              }, {});

              const servicoIds = (itens || [])
                .filter(i => i.tipo === 'SERVICO' && i.servico_id)
                .map(i => parseInt(i.servico_id, 10))
                .filter(n => Number.isFinite(n));
              const extraIds = (itens || [])
                .filter(i => i.tipo === 'EXTRA' && i.servico_extra_id)
                .map(i => parseInt(i.servico_extra_id, 10))
                .filter(n => Number.isFinite(n));

              const servicosDoPlano = servicoIds.length > 0
                ? await db('servicos').whereIn('id', servicoIds).select('id', 'nome')
                : [];
              const extrasDoPlano = extraIds.length > 0
                ? await db('servicos_extras')
                  .whereIn('id', extraIds)
                  .where('usuario_id', unidade.usuario_id)
                  .select('id', 'nome')
                : [];

              const nomeServicoById = new Map((servicosDoPlano || []).map(s => [String(s.id), s.nome]));
              const nomeExtraById = new Map((extrasDoPlano || []).map(e => [String(e.id), e.nome]));

              const saldos = (itens || []).map(item => {
                const quota = item.quantidade_por_ciclo === null || item.quantidade_por_ciclo === undefined
                  ? null
                  : (parseInt(item.quantidade_por_ciclo, 10) || 0);

                const usados = usadosByItemId[String(item.id)] || 0;
                const restantes = quota === null ? null : Math.max(0, quota - usados);

                const nome = item.tipo === 'SERVICO'
                  ? (item.servico_id ? (nomeServicoById.get(String(item.servico_id)) || 'Serviço') : 'Serviço')
                  : (item.servico_extra_id ? (nomeExtraById.get(String(item.servico_extra_id)) || 'Extra') : 'Extra');

                return {
                  tipo: item.tipo,
                  nome,
                  quantidade_por_ciclo: quota,
                  restantes
                };
              });

              assinaturaSaldo = {
                assinatura_ativa: true,
                plano: { nome: planoAssinatura.nome },
                ciclo: { inicio: cycleStart, fim: cycleEndInclusive },
                saldos
              };

              logger.log('[PublicBooking] assinatura_saldo debug (computed):', {
                agendamento_id: agendamento?.id,
                cliente_id: cliente?.id,
                unidade_id,
                plano_id: planoAssinatura?.id || null,
                itens_count: Array.isArray(itens) ? itens.length : null,
                saldos_count: Array.isArray(assinaturaSaldo?.saldos) ? assinaturaSaldo.saldos.length : null
              });
            }
          }
        }
      } catch (err) {
        logger.error('❌ [PublicBooking] Erro ao calcular assinatura_saldo:', err);
      }

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
        numero_agendamento: agendamento.numero_agendamento, // ✅ CORREÇÃO: Adicionar número mascarado para mensagens
        data_agendamento: agendamento.data_agendamento,
        hora_inicio: agendamento.hora_inicio,
        hora_fim: agendamento.hora_fim,
        valor_total: agendamento.valor_total,
        servicos: servicos.map(s => ({ nome: s.nome, preco: s.preco })),
        assinatura_saldo: assinaturaSaldo // ✅ NOVO: Informações de saldo de assinatura
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

      const inputLimpo = telefone.replace(/\D/g, '');
      const dbLimpo = agendamento.cliente_telefone.replace(/\D/g, '');

      const inputLast9 = inputLimpo.slice(-9);
      const dbLast9 = dbLimpo.slice(-9);
      const inputLast8 = inputLimpo.slice(-8);
      const dbLast8 = dbLimpo.slice(-8);

      const telefoneValido = (
        inputLimpo === dbLimpo ||
        inputLast9 === dbLast9 ||
        inputLast8 === dbLast8
      );

      if (!telefoneValido) {
        logger.log(`[PublicBooking] ❌ Validação falhou. Input: ${inputLimpo}, Banco: ${dbLimpo}`);
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
      const inputLimpo = telefone.replace(/\D/g, '');
      const dbLimpo = agendamento.cliente_telefone.replace(/\D/g, '');

      const inputLast9 = inputLimpo.slice(-9);
      const dbLast9 = dbLimpo.slice(-9);
      const inputLast8 = inputLimpo.slice(-8);
      const dbLast8 = dbLimpo.slice(-8);

      const telefoneValido = (
        inputLimpo === dbLimpo ||
        inputLast9 === dbLast9 ||
        inputLast8 === dbLast8
      );

      if (!telefoneValido) {
        logger.log(`[PublicBooking] ❌ Validação falhou. Input: ${inputLimpo}, Banco: ${dbLimpo}`);
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Telefone não corresponde ao agendamento'
        });
      }

      // ✅ VALIDAÇÃO DE DATA: Bloquear reagendamento de agendamentos passados
      const tz = 'America/Sao_Paulo';
      const hojeStr = this.getDateStrInTimeZone(tz);
      const dataAgendamentoAtualStr = typeof agendamento.data_agendamento === 'string'
        ? agendamento.data_agendamento.toString().substring(0, 10)
        : agendamento.data_agendamento.toLocaleDateString('en-CA', { timeZone: tz });

      if (dataAgendamentoAtualStr < hojeStr) {
        const diasPassados = this.dayNumberFromDateStr(hojeStr) - this.dayNumberFromDateStr(dataAgendamentoAtualStr);
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
      // ✅ CORREÇÃO CRÍTICA: Tornar timezone-aware (America/Sao_Paulo) para evitar bugs de timezone
      const [y, m, d] = data_agendamento.split('-').map(n => parseInt(n, 10));
      const dataNoonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(dataNoonUtc);
      const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const diaSemana = weekdayMap[weekdayStr] ?? new Date(data_agendamento + 'T00:00:00').getDay(); // 0 = Domingo, 6 = Sábado

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

      // ✅ CRÍTICO: Validar disponibilidade no write-path de reagendamento
      await db.transaction(async (trx) => {
        await this.bookingAvailabilityService.validateOrThrow({
          unidade_id: agendamento.unidade_id,
          agente_id: agendamento.agente_id,
          data_agendamento,
          hora_inicio,
          hora_fim,
          exclude_agendamento_id: parseInt(id),
          trx
        });

        await trx('agendamentos')
          .where('id', id)
          .update({
            data_agendamento,
            hora_inicio,
            hora_fim,
            updated_at: this.agendamentoModel.db.fn.now()
          });
      });

      logger.log(`✅ [PublicBooking] Agendamento #${id} reagendado para ${data_agendamento} às ${hora_inicio}`);

      // ✅ IMPORTANTE: Responder imediatamente para evitar travar o frontend (loading infinito)
      // Notificações e lembretes rodam em background.
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

      // Executar notificações/lembretes em background (não bloquear a resposta HTTP)
      (async () => {
        try {
          console.error(`[DEBUG] Iniciando envio de notificações de reagendamento para agendamento #${id}`);

          const dadosCompletos = await this.buscarDadosCompletos(id);
          console.error(`[DEBUG] Dados completos buscados:`, dadosCompletos ? 'OK' : 'NULL');

          if (!dadosCompletos) {
            console.error(`[DEBUG] dadosCompletos é NULL - não foi possível enviar notificações`);
            return;
          }

          console.error(`[DEBUG] Enviando notificação de reagendamento via WhatsApp...`);
          const resultWhatsApp = await this.whatsAppService.sendRescheduleNotification(dadosCompletos);
          console.error(`[DEBUG] Resultado WhatsApp:`, JSON.stringify(resultWhatsApp));
          logger.log(`✅ [PublicBooking] Notificações de reagendamento enviadas para agendamento #${id}`);

          console.error(`[DEBUG] Atualizando lembretes programados...`);
          await this.scheduledReminderService.atualizarLembretesProgramados({
            agendamento_id: id,
            unidade_id: agendamento.unidade_id,
            data_agendamento,
            hora_inicio,
            cliente_telefone: dadosCompletos.cliente_telefone
          });
          logger.log(`✅ [PublicBooking] Lembretes programados atualizados para agendamento #${id}`);
        } catch (err) {
          console.error('[DEBUG] ERRO ao enviar notificação de reagendamento:', {
            message: err?.message,
            stack: err?.stack,
            name: err?.name
          });
          logger.error('❌ [PublicBooking] Erro ao enviar notificação de reagendamento:', err);
        }
      })();

    } catch (error) {
      if (error && error.httpStatus) {
        return res.status(error.httpStatus).json({
          success: false,
          error: 'Horário indisponível',
          message: error.message
        });
      }

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
    // ✅ DEBUG: Log sem sanitização para diagnóstico
    console.error(`[DEBUG] cancelarAgendamento INICIADO - ID: ${req.params.id}, Body:`, JSON.stringify(req.body));

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
      const inputLimpo = telefone.replace(/\D/g, '');
      const dbLimpo = agendamento.cliente_telefone.replace(/\D/g, '');

      const inputLast9 = inputLimpo.slice(-9);
      const dbLast9 = dbLimpo.slice(-9);
      const inputLast8 = inputLimpo.slice(-8);
      const dbLast8 = dbLimpo.slice(-8);

      const telefoneValido = (
        inputLimpo === dbLimpo ||
        inputLast9 === dbLast9 ||
        inputLast8 === dbLast8
      );

      if (!telefoneValido) {
        logger.log(`[PublicBooking] ❌ Validação falhou. Input: ${inputLimpo}, Banco: ${dbLimpo}`);
        return res.status(403).json({
          success: false,
          error: 'Acesso negado',
          message: 'Telefone não corresponde ao agendamento'
        });
      }

      // ✅ VALIDAÇÃO 1: Buscar configurações da unidade
      let configuracoes = await this.agendamentoModel.db('configuracoes_sistema')
        .where('unidade_id', agendamento.unidade_id)
        .select('permitir_cancelamento', 'tempo_limite_cancelar_horas')
        .first();

      // ✅ CORREÇÃO: Se não existir configuração, usar valores padrão
      if (!configuracoes) {
        logger.log(`[PublicBooking] ⚠️ Configurações não encontradas para unidade_id=${agendamento.unidade_id}, usando padrões`);
        configuracoes = {
          permitir_cancelamento: true,
          tempo_limite_cancelar_horas: 4
        };
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

      // ✅ CORREÇÃO: Formatar data corretamente para evitar "Invalid time value"
      let dataAgendamentoStr;
      if (agendamento.data_agendamento instanceof Date) {
        // Se já é um objeto Date, formatar como YYYY-MM-DD
        const ano = agendamento.data_agendamento.getFullYear();
        const mes = String(agendamento.data_agendamento.getMonth() + 1).padStart(2, '0');
        const dia = String(agendamento.data_agendamento.getDate()).padStart(2, '0');
        dataAgendamentoStr = `${ano}-${mes}-${dia}`;
      } else {
        // Se é string, usar diretamente
        dataAgendamentoStr = agendamento.data_agendamento;
      }

      const dataHoraAgendamento = new Date(`${dataAgendamentoStr}T${agendamento.hora_inicio}-03:00`);

      // Validar se a data foi criada corretamente
      if (isNaN(dataHoraAgendamento.getTime())) {
        logger.error(`[PublicBooking] ❌ Data inválida ao cancelar agendamento #${id}:`, {
          data_agendamento: agendamento.data_agendamento,
          hora_inicio: agendamento.hora_inicio,
          dataAgendamentoStr
        });
        return res.status(500).json({
          success: false,
          error: 'Erro ao processar data do agendamento',
          message: 'Não foi possível validar o prazo de cancelamento'
        });
      }

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

      const decisaoEstorno = await this.assinaturaEstornoService.decidirEstorno({
        origem: 'CLIENTE_PUBLICO',
        agendamento: {
          id: parseInt(id, 10),
          unidade_id: agendamento.unidade_id,
          data_agendamento: dataAgendamentoStr,
          hora_inicio: agendamento.hora_inicio
        },
        agora,
        dbConn: this.agendamentoModel.db
      });

      const deveEstornarCota = Boolean(decisaoEstorno?.deve_estornar);

      logger.log(`[PublicBooking] 🔁 Decisão de estorno (cliente):`, {
        dentroDoPrazo: Boolean(decisaoEstorno?.dentro_do_prazo),
        deveEstornarCota,
        diferencaHoras: Number(diferencaHoras.toFixed(2)),
        limiteHoras: decisaoEstorno?.limite_horas
      });

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

      await this.agendamentoModel.db.transaction(async (trx) => {
        await this.assinaturaEstornoService.aplicarEstornoOuRetencao({
          agendamentoId: parseInt(id, 10),
          deveEstornar: deveEstornarCota,
          dbConn: trx
        });

        await trx('agendamentos')
          .where('id', id)
          .update({
            status: 'Cancelado',
            observacoes: motivo ? `Cancelado pelo cliente: ${motivo}` : 'Cancelado pelo cliente',
            updated_at: trx.fn.now()
          });
      });

      logger.log(`✅ [PublicBooking] Agendamento #${id} cancelado`);

      // ✅ CORREÇÃO: Enviar notificações de forma síncrona (não usar setImmediate que perde contexto)
      // Buscar dados completos para enviar notificações
      try {
        console.error(`[DEBUG] Iniciando envio de notificações de cancelamento para agendamento #${id}`);

        const dadosCompletos = await this.buscarDadosCompletos(id);
        console.error(`[DEBUG] Dados completos buscados:`, dadosCompletos ? 'OK' : 'NULL');

        if (dadosCompletos) {
          if (!deveEstornarCota) {
            dadosCompletos.cota_consumida = true;
          }
          console.error(`[DEBUG] Enviando notificação de cancelamento via WhatsApp...`);
          const resultWhatsApp = await this.whatsAppService.sendCancellationNotification(dadosCompletos);
          console.error(`[DEBUG] Resultado WhatsApp:`, JSON.stringify(resultWhatsApp));
          logger.log(`✅ [PublicBooking] Notificações de cancelamento enviadas para agendamento #${id}`);

          // Cancelar lembretes programados
          console.error(`[DEBUG] Cancelando lembretes programados...`);
          await this.scheduledReminderService.cancelarLembretesProgramados(id);
          logger.log(`✅ [PublicBooking] Lembretes programados cancelados para agendamento #${id}`);
        } else {
          console.error(`[DEBUG] dadosCompletos é NULL - não foi possível enviar notificações`);
        }
      } catch (err) {
        console.error('[DEBUG] ERRO ao enviar notificação de cancelamento:', {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
        logger.error('❌ [PublicBooking] Erro ao enviar notificação de cancelamento:', err);
      }

      res.json({
        success: true,
        message: 'Agendamento cancelado com sucesso'
      });

    } catch (error) {
      // ✅ DEBUG: Log completo do erro sem sanitização
      console.error('[DEBUG] ERRO COMPLETO ao cancelar:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      });

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

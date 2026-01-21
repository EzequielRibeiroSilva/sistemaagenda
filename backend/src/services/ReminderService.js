/**
 * Service: ReminderService
 * Descrição: Gerenciamento de lembretes automáticos de agendamentos
 * Funcionalidades: Buscar agendamentos elegíveis, enviar lembretes, rastrear status
 */

const { db } = require('../config/knex');
const WhatsAppService = require('./WhatsAppService');
const logger = require('../utils/logger');

class ReminderService {
  constructor() {
    this.whatsappService = new WhatsAppService();
    this.maxRetries = 3; // Máximo de tentativas de envio
    this.allowedStartHour = 6; // 06:00
    this.allowedEndHour = 23; // 23:00
    this.subscriptionEndingSoonDays = parseInt(process.env.SUBSCRIPTION_ENDING_SOON_DAYS || '3', 10);
  }

  getNowInSaoPaulo() {
    const nowSP = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    return new Date(nowSP);
  }

  getTodayStrInSaoPaulo() {
    const nowDate = this.getNowInSaoPaulo();
    return nowDate.toLocaleDateString('en-CA');
  }

  addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const pad = (num) => num.toString().padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  dayNumberFromDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }

  diffDays(a, b) {
    return this.dayNumberFromDateStr(a) - this.dayNumberFromDateStr(b);
  }

  normalizeDateStr(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue.toISOString().slice(0, 10);
    const s = String(dateValue);
    if (s.length >= 10 && s.includes('T')) return s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return null;
  }

  getCycleBounds({ startDateStr, validadeDias, referenceDateStr }) {
    const delta = this.diffDays(referenceDateStr, startDateStr);
    const idx = delta > 0 ? Math.floor(delta / validadeDias) : 0;
    const cycleStart = this.addDays(startDateStr, idx * validadeDias);
    const cycleEndExclusive = this.addDays(cycleStart, validadeDias);
    const cycleEndInclusive = this.addDays(cycleEndExclusive, -1);
    return { cycleStart, cycleEndExclusive, cycleEndInclusive, cycleIndex: idx };
  }

  getBirthdaySendAtForToday() {
    const nowDate = this.getNowInSaoPaulo();
    const sendAt = new Date(nowDate);
    sendAt.setHours(9, 0, 0, 0);
    return sendAt;
  }

  async scheduleBirthdayMessages() {
    try {
      const todayStr = this.getTodayStrInSaoPaulo();
      const [yearStr, monthStr, dayStr] = todayStr.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const day = parseInt(dayStr);
      const sendAt = this.getBirthdaySendAtForToday();

      const clientes = await db('clientes as c')
        .join('unidades as u', 'c.unidade_id', 'u.id')
        .leftJoin('configuracoes_sistema as cs', 'cs.unidade_id', 'u.id')
        .whereNotNull('c.data_nascimento')
        .where('c.status', 'Ativo')
        .whereRaw('EXTRACT(MONTH FROM c.data_nascimento) = ?', [month])
        .whereRaw('EXTRACT(DAY FROM c.data_nascimento) = ?', [day])
        .select(
          'c.id as cliente_id',
          'c.unidade_id as unidade_id',
          db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
          'c.telefone as cliente_telefone',
          'cs.nome_negocio as nome_negocio',
          'u.nome as unidade_nome'
        );

      if (!clientes || clientes.length === 0) {
        return { scheduled: 0 };
      }

      let scheduled = 0;
      for (const c of clientes) {
        const nomeNegocio = c.nome_negocio || c.unidade_nome || 'Nosso Negócio';

        const row = {
          cliente_id: c.cliente_id,
          unidade_id: c.unidade_id,
          ano: year,
          status: 'programado',
          tentativas: 0,
          telefone_destino: c.cliente_telefone,
          mensagem_enviada: this.whatsappService.generateBirthdayMessage({
            clienteNome: c.cliente_nome,
            nomeNegocio
          }),
          enviar_em: sendAt,
          created_at: new Date(),
          updated_at: new Date()
        };

        const inserted = await db('aniversarios_enviados')
          .insert(row)
          .onConflict(['cliente_id', 'unidade_id', 'ano'])
          .ignore();

        if (inserted) {
          scheduled++;
        }
      }

      return { scheduled };
    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao programar aniversários:', error);
      return { scheduled: 0, error: error.message };
    }
  }

  async updateBirthdayStatus(id, status, details = {}) {
    const updateData = {
      status,
      updated_at: new Date()
    };

    if (details.whatsappMessageId) updateData.whatsapp_message_id = details.whatsappMessageId;
    if (details.erro) updateData.erro_detalhes = typeof details.erro === 'string' ? details.erro : JSON.stringify(details.erro);
    if (details.mensagem) updateData.mensagem_enviada = details.mensagem;
    if (details.ultima_tentativa) updateData.ultima_tentativa = details.ultima_tentativa;
    if (details.enviado_em) updateData.enviado_em = details.enviado_em;

    await db('aniversarios_enviados')
      .where('id', id)
      .update(updateData);
  }

  async processBirthdayMessages() {
    try {
      const nowDate = this.getNowInSaoPaulo();

      const messages = await db('aniversarios_enviados as ae')
        .join('clientes as c', 'ae.cliente_id', 'c.id')
        .join('unidades as u', 'ae.unidade_id', 'u.id')
        .leftJoin('configuracoes_sistema as cs', 'cs.unidade_id', 'u.id')
        .where('ae.status', 'programado')
        .whereNotNull('ae.enviar_em')
        .where('ae.enviar_em', '<=', nowDate)
        .select(
          'ae.id',
          'ae.cliente_id',
          'ae.unidade_id',
          'ae.tentativas',
          'ae.telefone_destino',
          'ae.mensagem_enviada',
          'c.primeiro_nome',
          'c.ultimo_nome',
          'cs.nome_negocio as nome_negocio',
          'u.nome as unidade_nome'
        )
        .orderBy('ae.enviar_em', 'asc')
        .limit(200);

      if (!messages || messages.length === 0) {
        return { processed: 0, sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;

      for (const msg of messages) {
        const clienteNome = `${msg.primeiro_nome || ''} ${msg.ultimo_nome || ''}`.trim() || 'Cliente';
        const nomeNegocio = msg.nome_negocio || msg.unidade_nome || 'Nosso Negócio';
        const texto = msg.mensagem_enviada || this.whatsappService.generateBirthdayMessage({ clienteNome, nomeNegocio });

        try {
          const result = await this.whatsappService.sendBirthdayMessage({
            unidade_id: msg.unidade_id,
            clienteTelefone: msg.telefone_destino,
            clienteNome,
            nomeNegocio
          });

          if (result.success) {
            await this.updateBirthdayStatus(msg.id, 'enviado', {
              whatsappMessageId: result.data?.messageId || result.data?.key?.id,
              enviado_em: new Date(),
              mensagem: texto
            });
            sent++;
          } else {
            const nextTentativas = (msg.tentativas || 0) + 1;
            const isPermanent = nextTentativas >= this.maxRetries;
            await this.updateBirthdayStatus(msg.id, isPermanent ? 'falha_permanente' : 'falha', {
              erro: result.error,
              ultima_tentativa: new Date()
            });
            failed++;
          }
        } catch (error) {
          const nextTentativas = (msg.tentativas || 0) + 1;
          const isPermanent = nextTentativas >= this.maxRetries;
          await this.updateBirthdayStatus(msg.id, isPermanent ? 'falha_permanente' : 'falha', {
            erro: error.message,
            ultima_tentativa: new Date()
          });
          failed++;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return { processed: messages.length, sent, failed };
    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao processar aniversários:', error);
      return { processed: 0, sent: 0, failed: 0, error: error.message };
    }
  }

  async scheduleSubscriptionEndingSoonNotifications() {
    try {
      const todayStr = this.getTodayStrInSaoPaulo();
      const thresholdDays = Number.isFinite(this.subscriptionEndingSoonDays) ? this.subscriptionEndingSoonDays : 3;

      // Buscar assinantes ativos com plano e inicio configurados
      const rows = await db('clientes as c')
        .join('unidades as u', 'c.unidade_id', 'u.id')
        .join('usuarios as us', 'u.usuario_id', 'us.id')
        .join('planos_assinatura as p', 'c.assinatura_plano_id', 'p.id')
        .where('c.status', 'Ativo')
        .where('c.is_assinante', true)
        .whereNotNull('c.assinatura_plano_id')
        .whereNotNull('c.data_inicio_assinatura')
        .where('p.status', 'Ativo')
        .select(
          'c.id as cliente_id',
          'c.telefone as cliente_telefone',
          db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
          'c.data_inicio_assinatura',
          'p.validade_dias',
          'u.id as unidade_id',
          'u.nome as unidade_nome',
          'u.telefone as unidade_telefone',
          'us.telefone as admin_telefone'
        );

      if (!rows || rows.length === 0) return { scheduled: 0 };

      let scheduled = 0;

      for (const r of rows) {
        const validadeDias = parseInt(r.validade_dias, 10) || 31;
        const startStr = this.normalizeDateStr(r.data_inicio_assinatura);
        if (!startStr) continue;

        const { cycleEndInclusive } = this.getCycleBounds({
          startDateStr: startStr,
          validadeDias,
          referenceDateStr: todayStr
        });

        const diasRestantes = this.diffDays(cycleEndInclusive, todayStr);

        if (diasRestantes < 0 || diasRestantes > thresholdDays) continue;

        const enviarEm = this.getNowInSaoPaulo();
        enviarEm.setMinutes(enviarEm.getMinutes() + 1);

        const baseRow = {
          agendamento_id: null,
          unidade_id: r.unidade_id,
          cliente_id: r.cliente_id,
          assinatura_referencia: cycleEndInclusive,
          status: 'programado',
          tentativas: 0,
          enviar_em: enviarEm,
          created_at: new Date(),
          updated_at: new Date()
        };

        // Cliente
        try {
          await db('lembretes_enviados')
            .insert({
              ...baseRow,
              tipo_notificacao: 'assinatura_aviso_cliente',
              telefone_destino: r.cliente_telefone,
              mensagem_enviada: null
            });
          scheduled++;
        } catch (error) {
          if (!(error && error.code === '23505')) {
            throw error;
          }
        }

        // Admin
        if (r.admin_telefone) {
          try {
            await db('lembretes_enviados')
              .insert({
                ...baseRow,
                tipo_notificacao: 'assinatura_aviso_admin',
                telefone_destino: r.admin_telefone,
                mensagem_enviada: null
              });
            scheduled++;
          } catch (error) {
            if (!(error && error.code === '23505')) {
              throw error;
            }
          }
        }
      }

      return { scheduled };
    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao programar avisos de assinatura:', error);
      return { scheduled: 0, error: error.message };
    }
  }

  /**
   * Verificar se está dentro do horário permitido para envio
   * Não enviar entre 23:00 e 06:00
   */
  isWithinAllowedHours() {
    const now = new Date();
    const currentHour = now.getHours();
    
    const isAllowed = currentHour >= this.allowedStartHour && currentHour < this.allowedEndHour;
    
    if (!isAllowed) {
      logger.log(`⏰ [ReminderService] Fora do horário permitido (${currentHour}h). Permitido: ${this.allowedStartHour}h-${this.allowedEndHour}h`);
    }
    
    return isAllowed;
  }

  /**
   * Buscar agendamentos elegíveis para lembrete de 24h
   * Critérios:
   * - Data do agendamento = amanhã (D+1)
   * - Status = 'Confirmado'
   * - Ainda não enviou lembrete de 24h
   */
  async getAppointmentsFor24hReminder() {
    try {
      logger.log('🔍 [ReminderService] Buscando agendamentos para lembrete de 24h...');

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const appointments = await db('agendamentos as a')
        .leftJoin('lembretes_enviados as le', function() {
          this.on('le.agendamento_id', '=', 'a.id')
              .andOn('le.tipo_lembrete', '=', db.raw('?', ['24h']));
        })
        .join('clientes as c', 'a.cliente_id', 'c.id')
        .join('agentes as ag', 'a.agente_id', 'ag.id')
        .join('unidades as u', 'a.unidade_id', 'u.id')
        .where('a.data_agendamento', tomorrowStr)
        .where('a.status', 'Aprovado') // ✅ CORREÇÃO: Status correto é 'Aprovado', não 'Confirmado'
        .whereNull('le.id') // Ainda não enviou lembrete de 24h
        .select(
          'a.id as agendamento_id',
          'a.data_agendamento',
          'a.hora_inicio',
          'a.hora_fim',
          'a.unidade_id',
          'c.id as cliente_id',
          db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
          'c.telefone as cliente_telefone',
          'ag.id as agente_id',
          db.raw("CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')) as agente_nome"),
          'ag.telefone as agente_telefone',
          'u.id as unidade_id',
          'u.usuario_id as unidade_usuario_id',
          'u.nome as unidade_nome',
          'u.telefone as unidade_telefone',
          'u.endereco as unidade_endereco'
        );

      // Buscar serviços para cada agendamento
      for (const appointment of appointments) {
        const servicos = await db('agendamento_servicos as ags')
          .join('servicos as s', 'ags.servico_id', 's.id')
          .where('ags.agendamento_id', appointment.agendamento_id)
          .select('s.id', 's.nome');
        
        appointment.servicos = servicos;
      }

      logger.log(`✅ [ReminderService] Encontrados ${appointments.length} agendamentos para lembrete de 24h`);
      
      return appointments;
    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao buscar agendamentos para 24h:', error);
      throw error;
    }
  }

  /**
   * Buscar agendamentos elegíveis para lembrete de 1h
   * Critérios:
   * - Data do agendamento = hoje
   * - Hora do agendamento entre 30min e 1h30 a partir de agora
   * - Status = 'Aprovado'
   * - Ainda não enviou lembrete de 1h
   */
  async getAppointmentsFor2hReminder() {
    try {
      logger.log('🔍 [ReminderService] Buscando agendamentos para lembrete de 1h...');

      // Obter horário atual em São Paulo
      const nowSP = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const nowDate = new Date(nowSP);
      
      // Data de hoje em São Paulo (formato YYYY-MM-DD)
      const todayStr = nowDate.toLocaleDateString('en-CA'); // en-CA retorna YYYY-MM-DD
      
      // Calcular janela de tempo: agora até 1h30 a partir de agora (horário de São Paulo)
      // Isso garante que agendamentos criados próximos ao horário sejam capturados
      const oneHourThirtyLater = new Date(nowDate.getTime() + 90 * 60 * 1000);
      
      // Formatar horários no formato HH:MM para comparação com o banco
      const startTime = nowDate.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      const endTime = oneHourThirtyLater.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });

      logger.log(`🕐 [ReminderService] Horário atual SP: ${nowDate.toLocaleString('pt-BR')}`);
      logger.log(`🕐 [ReminderService] Buscando agendamentos entre ${startTime} e ${endTime}`);

      const appointments = await db('agendamentos as a')
        .leftJoin('lembretes_enviados as le', function() {
          this.on('le.agendamento_id', '=', 'a.id')
              .andOn('le.tipo_lembrete', '=', db.raw('?', ['2h']));
        })
        .join('clientes as c', 'a.cliente_id', 'c.id')
        .join('agentes as ag', 'a.agente_id', 'ag.id')
        .join('unidades as u', 'a.unidade_id', 'u.id')
        .where('a.data_agendamento', todayStr)
        .where('a.status', 'Aprovado') // ✅ CORREÇÃO: Status correto é 'Aprovado', não 'Confirmado'
        .whereBetween('a.hora_inicio', [startTime, endTime])
        .whereNull('le.id') // Ainda não enviou lembrete de 2h
        .select(
          'a.id as agendamento_id',
          'a.data_agendamento',
          'a.hora_inicio',
          'a.hora_fim',
          'a.unidade_id',
          'c.id as cliente_id',
          db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
          'c.telefone as cliente_telefone',
          'ag.id as agente_id',
          db.raw("CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')) as agente_nome"),
          'ag.telefone as agente_telefone',
          'u.id as unidade_id',
          'u.usuario_id as unidade_usuario_id',
          'u.nome as unidade_nome',
          'u.telefone as unidade_telefone',
          'u.endereco as unidade_endereco'
        );

      // Buscar serviços para cada agendamento
      for (const appointment of appointments) {
        const servicos = await db('agendamento_servicos as ags')
          .join('servicos as s', 'ags.servico_id', 's.id')
          .where('ags.agendamento_id', appointment.agendamento_id)
          .select('s.id', 's.nome');
        
        appointment.servicos = servicos;
      }

      logger.log(`✅ [ReminderService] Encontrados ${appointments.length} agendamentos para lembrete de 1h`);
      
      return appointments;
    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao buscar agendamentos para 1h:', error);
      throw error;
    }
  }

  /**
   * Buscar lembretes programados prontos para envio
   * Critérios:
   * - Status = 'programado'
   * - enviar_em <= agora
   */
  async getScheduledRemindersReadyToSend() {
    try {
      logger.log('🔍 [ReminderService] Buscando lembretes programados prontos para envio...');

      const now = new Date();

      // ✅ Importante: em PostgreSQL, FOR UPDATE não pode ser aplicado ao lado nullable de LEFT JOIN.
      // Como avisos de assinatura não têm agendamento_id, separamos em duas queries:
      // 1) Lembretes vinculados a agendamento (com lock)
      // 2) Avisos de assinatura (sem join com agendamentos)

      const remindersAgendamento = await db('lembretes_enviados as le')
        .join('agendamentos as a', 'le.agendamento_id', 'a.id')
        .join('clientes as c', 'a.cliente_id', 'c.id')
        .join('agentes as ag', 'a.agente_id', 'ag.id')
        .join('unidades as u', 'le.unidade_id', 'u.id')
        .where('le.status', 'programado')
        .where('le.enviar_em', '<=', now)
        .where(function() {
          this.where(function() {
            this.whereIn('le.tipo_notificacao', ['lembrete_24h', 'lembrete_1h'])
              .where('a.status', 'Aprovado');
          }).orWhere(function() {
            this.where('le.tipo_notificacao', 'convite_retorno')
              .where('a.status', 'Concluído');
          }).orWhere(function() {
            // Fallback legado: se tipo_notificacao for null, tratar por tipo_lembrete
            this.whereNull('le.tipo_notificacao')
              .whereIn('le.tipo_lembrete', ['24h', '2h'])
              .where('a.status', 'Aprovado');
          });
        })
        .forUpdate()
        .skipLocked()
        .select(
          'le.id as lembrete_id',
          'le.tipo_lembrete',
          'le.tipo_notificacao',
          'le.enviar_em',
          'le.telefone_destino',
          'le.assinatura_referencia',
          'a.id as agendamento_id',
          'a.data_agendamento',
          'a.hora_inicio',
          'a.hora_fim',
          'c.id as cliente_id',
          db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
          'c.telefone as cliente_telefone',
          'ag.id as agente_id',
          db.raw("CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')) as agente_nome"),
          'ag.telefone as agente_telefone',
          'u.id as unidade_id',
          'u.usuario_id as unidade_usuario_id',
          'u.nome as unidade_nome',
          'u.slug_url as unidade_slug',
          'u.telefone as unidade_telefone',
          'u.endereco as unidade_endereco'
        );

      const remindersAssinatura = await db('lembretes_enviados as le')
        .join('clientes as c', 'le.cliente_id', 'c.id')
        .join('unidades as u', 'le.unidade_id', 'u.id')
        .where('le.status', 'programado')
        .where('le.enviar_em', '<=', now)
        .whereIn('le.tipo_notificacao', ['assinatura_aviso_cliente', 'assinatura_aviso_admin'])
        .forUpdate()
        .skipLocked()
        .select(
          'le.id as lembrete_id',
          'le.tipo_lembrete',
          'le.tipo_notificacao',
          'le.enviar_em',
          'le.telefone_destino',
          'le.assinatura_referencia',
          db.raw('NULL::int as agendamento_id'),
          db.raw('NULL::date as data_agendamento'),
          db.raw('NULL::text as hora_inicio'),
          db.raw('NULL::text as hora_fim'),
          'c.id as cliente_id',
          db.raw("CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, '')) as cliente_nome"),
          'c.telefone as cliente_telefone',
          db.raw('NULL::int as agente_id'),
          db.raw('NULL::text as agente_nome'),
          db.raw('NULL::text as agente_telefone'),
          'u.id as unidade_id',
          'u.usuario_id as unidade_usuario_id',
          'u.nome as unidade_nome',
          'u.slug_url as unidade_slug',
          'u.telefone as unidade_telefone',
          'u.endereco as unidade_endereco'
        );

      const reminders = [...remindersAgendamento, ...remindersAssinatura];

      // Buscar serviços apenas quando existir agendamento_id
      for (const reminder of reminders) {
        if (!reminder.agendamento_id) {
          reminder.servicos = [];
          continue;
        }

        const servicos = await db('agendamento_servicos as ags')
          .join('servicos as s', 'ags.servico_id', 's.id')
          .where('ags.agendamento_id', reminder.agendamento_id)
          .select('s.id', 's.nome');

        reminder.servicos = servicos;
      }

      logger.log(`✅ [ReminderService] Encontrados ${reminders.length} lembretes programados prontos para envio`);
      
      return reminders;
    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao buscar lembretes programados:', error);
      throw error;
    }
  }

  /**
   * Registrar lembrete na tabela lembretes_enviados
   */
  async createReminderRecord(agendamentoId, unidadeId, tipoLembrete, telefone) {
    try {
      const result = await db('lembretes_enviados').insert({
        agendamento_id: agendamentoId,
        unidade_id: unidadeId,
        tipo_lembrete: tipoLembrete,
        status: 'pendente',
        tentativas: 0,
        telefone_destino: telefone,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      }).returning('id');

      // Extrair o ID numérico do resultado
      const id = result[0]?.id || result[0];
      return typeof id === 'object' ? id.id : id;
    } catch (error) {
      // Se erro de constraint única, significa que já existe registro
      if (error.code === '23505' || error.constraint === 'uk_lembretes_agendamento_tipo') {
        logger.log(`⚠️ [ReminderService] Lembrete ${tipoLembrete} já existe para agendamento ${agendamentoId}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Atualizar status do lembrete após tentativa de envio
   */
  async updateReminderStatus(lembreteId, status, details = {}) {
    try {
      const updateData = {
        status,
        ultima_tentativa: db.fn.now(),
        updated_at: db.fn.now()
      };

      // Incrementar tentativas
      await db('lembretes_enviados')
        .where('id', lembreteId)
        .increment('tentativas', 1);

      // Adicionar campos específicos baseado no status
      if (status === 'enviado') {
        updateData.enviado_em = db.fn.now();
        if (details.mensagem) {
          updateData.mensagem_enviada = details.mensagem;
        }
        if (details.whatsappMessageId) {
          updateData.whatsapp_message_id = details.whatsappMessageId;
        }
      } else if (status === 'falha' || status === 'falha_permanente') {
        if (details.erro) {
          updateData.erro_detalhes = JSON.stringify(details.erro);
        }
      }

      await db('lembretes_enviados')
        .where('id', lembreteId)
        .update(updateData);

      logger.log(`✅ [ReminderService] Status do lembrete ${lembreteId} atualizado para: ${status}`);
    } catch (error) {
      logger.error(`❌ [ReminderService] Erro ao atualizar status do lembrete ${lembreteId}:`, error);
      throw error;
    }
  }

  /**
   * Enviar lembrete individual com retry
   */
  async sendReminder(appointment, tipoLembrete) {
    const { agendamento_id, unidade_id, cliente_telefone } = appointment;

    try {
      logger.log(`📤 [ReminderService] Enviando lembrete ${tipoLembrete} para agendamento ${agendamento_id}...`);

      // Criar registro do lembrete
      const lembreteId = await this.createReminderRecord(
        agendamento_id,
        unidade_id,
        tipoLembrete,
        cliente_telefone
      );

      // Se já existe registro, pular
      if (!lembreteId) {
        return { success: false, reason: 'duplicate' };
      }

      // ✅ NOVO: Calcular informações de pontos do cliente
      let pontosInfo = null;
      try {
        const ClienteModel = require('../models/Cliente');
        const clienteModel = new ClienteModel(this.db);
        
        // Calcular saldo atual de pontos
        const saldoPontos = await clienteModel.calcularPontosDisponiveis(appointment.cliente_id, unidade_id);
        
        // Verificar se é o primeiro agendamento (para saber se pode usar pontos)
        const isPrimeiro = await clienteModel.isPrimeiroAgendamento(appointment.cliente_id, unidade_id);
        
        // Buscar pontos ganhos neste agendamento específico
        const pontosGanhos = await this.db('pontos_historico')
          .where('agendamento_id', agendamento_id)
          .where('tipo', 'CREDITO')
          .sum('pontos as total')
          .first();
        
        const ganhos = parseInt(pontosGanhos?.total || 0);
        
        pontosInfo = {
          saldo: saldoPontos,
          ganhos: ganhos,
          podeUsar: !isPrimeiro // Pode usar se NÃO for o primeiro
        };
        
        logger.log(`💎 [ReminderService] Pontos calculados para cliente #${appointment.cliente_id}:`, pontosInfo);
      } catch (pontosError) {
        logger.error('❌ [ReminderService] Erro ao calcular pontos:', pontosError);
        // Continuar sem informação de pontos
      }

      // Preparar dados para geração da mensagem
      const agendamentoData = {
        cliente: {
          nome: appointment.cliente_nome
        },
        agente: {
          nome: appointment.agente_nome
        },
        unidade_id: appointment.unidade_id,
        unidade: {
          id: appointment.unidade_id,
          usuario_id: appointment.unidade_usuario_id,
          nome: appointment.unidade_nome,
          endereco: appointment.unidade_endereco
        },
        data_agendamento: appointment.data_agendamento,
        hora_inicio: appointment.hora_inicio,
        hora_fim: appointment.hora_fim,
        servicos: appointment.servicos || [],
        agendamento_id: appointment.agendamento_id,
        cliente_telefone: appointment.cliente_telefone,
        agente_telefone: appointment.agente_telefone,
        unidade_telefone: appointment.unidade_telefone,
        unidade_endereco: appointment.unidade_endereco,
        pontos: pontosInfo // ✅ NOVO: Incluir informações de pontos
      };

      // Tentar enviar com retry
      let lastError = null;
      let tentativa = 0;

      while (tentativa < this.maxRetries) {
        tentativa++;
        
        try {
          logger.log(`🔄 [ReminderService] Tentativa ${tentativa}/${this.maxRetries} para lembrete ${lembreteId}`);

          // Enviar via WhatsApp usando métodos específicos
          let result;
          if (tipoLembrete === '24h') {
            result = await this.whatsappService.sendReminder24h(agendamentoData);
          } else if (tipoLembrete === '2h') {
            result = await this.whatsappService.sendReminder2h(agendamentoData);
          }

          if (result.success) {
            // Sucesso - atualizar status
            await this.updateReminderStatus(lembreteId, 'enviado', {
              whatsappMessageId: result.data?.messageId || result.data?.key?.id
            });

            logger.log(`✅ [ReminderService] Lembrete ${tipoLembrete} enviado com sucesso para agendamento ${agendamento_id}`);
            
            return { success: true, lembreteId, tentativas: tentativa };
          } else {
            lastError = result.error;
            logger.error(`⚠️ [ReminderService] Tentativa ${tentativa} falhou:`, result.error);
            
            // Aguardar antes de tentar novamente (backoff exponencial)
            if (tentativa < this.maxRetries) {
              const waitTime = Math.pow(2, tentativa) * 1000; // 2s, 4s, 8s
              logger.log(`⏳ [ReminderService] Aguardando ${waitTime/1000}s antes da próxima tentativa...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        } catch (error) {
          lastError = error;
          logger.error(`❌ [ReminderService] Erro na tentativa ${tentativa}:`, error);
        }
      }

      // Todas as tentativas falharam
      await this.updateReminderStatus(lembreteId, 'falha_permanente', {
        erro: lastError
      });

      logger.error(`❌ [ReminderService] Falha permanente após ${this.maxRetries} tentativas para agendamento ${agendamento_id}`);
      
      return { success: false, reason: 'max_retries_exceeded', tentativas: this.maxRetries, erro: lastError };

    } catch (error) {
      logger.error(`❌ [ReminderService] Erro ao enviar lembrete para agendamento ${agendamento_id}:`, error);
      return { success: false, reason: 'exception', erro: error.message };
    }
  }

  /**
   * Processar lembretes de 24h
   */
  async process24hReminders() {
    try {
      logger.log('\n🚀 [ReminderService] ===== INICIANDO PROCESSAMENTO DE LEMBRETES 24H =====');

      // Verificar horário permitido
      if (!this.isWithinAllowedHours()) {
        logger.log('⏰ [ReminderService] Fora do horário permitido. Pulando processamento de 24h.');
        return { processed: 0, sent: 0, failed: 0, skipped: 1 };
      }

      // Buscar agendamentos elegíveis
      const appointments = await this.getAppointmentsFor24hReminder();

      if (appointments.length === 0) {
        logger.log('✅ [ReminderService] Nenhum agendamento encontrado para lembrete de 24h.');
        return { processed: 0, sent: 0, failed: 0, skipped: 0 };
      }

      // Processar cada agendamento
      let sent = 0;
      let failed = 0;

      for (const appointment of appointments) {
        const result = await this.sendReminder(appointment, '24h');
        
        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Pequeno delay entre envios para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.log(`\n✅ [ReminderService] ===== PROCESSAMENTO 24H CONCLUÍDO =====`);
      logger.log(`📊 Total: ${appointments.length} | Enviados: ${sent} | Falhas: ${failed}`);

      return { processed: appointments.length, sent, failed, skipped: 0 };

    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao processar lembretes de 24h:', error);
      throw error;
    }
  }

  /**
   * Processar lembretes de 1h
   */
  async process2hReminders() {
    try {
      logger.log('\n🚀 [ReminderService] ===== INICIANDO PROCESSAMENTO DE LEMBRETES 1H =====');

      // Verificar horário permitido
      if (!this.isWithinAllowedHours()) {
        logger.log('⏰ [ReminderService] Fora do horário permitido. Pulando processamento de 1h.');
        return { processed: 0, sent: 0, failed: 0, skipped: 1 };
      }

      // Buscar agendamentos elegíveis
      const appointments = await this.getAppointmentsFor2hReminder();

      if (appointments.length === 0) {
        logger.log('✅ [ReminderService] Nenhum agendamento encontrado para lembrete de 1h.');
        return { processed: 0, sent: 0, failed: 0, skipped: 0 };
      }

      // Processar cada agendamento
      let sent = 0;
      let failed = 0;

      for (const appointment of appointments) {
        const result = await this.sendReminder(appointment, '2h');
        
        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Pequeno delay entre envios para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.log(`\n✅ [ReminderService] ===== PROCESSAMENTO 1H CONCLUÍDO =====`);
      logger.log(`📊 Total: ${appointments.length} | Enviados: ${sent} | Falhas: ${failed}`);

      return { processed: appointments.length, sent, failed, skipped: 0 };

    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao processar lembretes de 1h:', error);
      throw error;
    }
  }

  /**
   * Processar lembretes programados prontos para envio
   */
  async processScheduledReminders() {
    try {
      logger.log('\n🚀 [ReminderService] ===== INICIANDO PROCESSAMENTO DE LEMBRETES PROGRAMADOS =====');

      // Verificar horário permitido
      if (!this.isWithinAllowedHours()) {
        logger.log('⏰ [ReminderService] Fora do horário permitido. Pulando processamento de lembretes programados.');
        return { processed: 0, sent: 0, failed: 0, skipped: 1 };
      }

      // Buscar lembretes programados prontos para envio
      const reminders = await this.getScheduledRemindersReadyToSend();

      if (reminders.length === 0) {
        logger.log('✅ [ReminderService] Nenhum lembrete programado pronto para envio.');
        return { processed: 0, sent: 0, failed: 0, skipped: 0 };
      }

      // Processar cada lembrete
      let sent = 0;
      let failed = 0;

      for (const reminder of reminders) {
        const { lembrete_id, tipo_lembrete, tipo_notificacao } = reminder;

        try {
          const tipoFinal = tipo_notificacao || tipo_lembrete;
          logger.log(`📤 [ReminderService] Enviando notificação programada #${lembrete_id} (${tipoFinal})...`);

          // Preparar dados para geração da mensagem
          const agendamentoData = {
            cliente: {
              nome: reminder.cliente_nome
            },
            agente: {
              nome: reminder.agente_nome
            },
            unidade_id: reminder.unidade_id,
            unidade: {
              nome: reminder.unidade_nome,
              endereco: reminder.unidade_endereco,
              slug_url: reminder.unidade_slug,
              id: reminder.unidade_id,
              usuario_id: reminder.unidade_usuario_id
            },
            data_agendamento: reminder.data_agendamento,
            hora_inicio: reminder.hora_inicio,
            hora_fim: reminder.hora_fim,
            servicos: reminder.servicos || [],
            agendamento_id: reminder.agendamento_id,
            cliente_telefone: reminder.cliente_telefone,
            agente_telefone: reminder.agente_telefone,
            unidade_telefone: reminder.unidade_telefone,
            unidade_endereco: reminder.unidade_endereco
          };

          // Enviar via WhatsApp
          let result;
          if (tipo_notificacao === 'convite_retorno') {
            // ✅ ANTI-SPAM: se já existe agendamento futuro na mesma unidade, não enviar
            const todayStr = new Date().toISOString().split('T')[0];
            const hasFutureAppointment = await db('agendamentos')
              .where('cliente_id', reminder.cliente_id)
              .where('unidade_id', reminder.unidade_id)
              .whereIn('status', ['Aprovado'])
              .where('data_agendamento', '>=', todayStr)
              .first();

            if (hasFutureAppointment) {
              await this.updateReminderStatus(lembrete_id, 'enviado', {
                mensagem: 'Ignorado: cliente já possui agendamento futuro'
              });
              logger.log(`⏭️ [ReminderService] Convite de retorno ignorado (#${lembrete_id}) - cliente já possui agendamento futuro`);
              continue;
            }

            result = await this.whatsappService.sendReturnInvite(agendamentoData);
          } else if (tipo_notificacao === 'assinatura_aviso_cliente') {
            const todayStr = this.getTodayStrInSaoPaulo();
            const ref = reminder.assinatura_referencia ? String(reminder.assinatura_referencia).slice(0, 10) : null;
            const diasRestantes = ref ? this.diffDays(ref, todayStr) : null;
            result = await this.whatsappService.sendSubscriptionEndingSoonClient({
              unidade_id: reminder.unidade_id,
              unidade_nome: reminder.unidade_nome,
              unidade_telefone: reminder.unidade_telefone,
              cliente_id: reminder.cliente_id,
              cliente_nome: reminder.cliente_nome,
              cliente_telefone: reminder.telefone_destino || reminder.cliente_telefone,
              assinatura_referencia: reminder.assinatura_referencia,
              dias_restantes: diasRestantes,
              data_fim: ref,
              skipRegister: true
            });
          } else if (tipo_notificacao === 'assinatura_aviso_admin') {
            const todayStr = this.getTodayStrInSaoPaulo();
            const ref = reminder.assinatura_referencia ? String(reminder.assinatura_referencia).slice(0, 10) : null;
            const diasRestantes = ref ? this.diffDays(ref, todayStr) : null;
            result = await this.whatsappService.sendSubscriptionEndingSoonAdmin({
              unidade_id: reminder.unidade_id,
              unidade_nome: reminder.unidade_nome,
              admin_telefone: reminder.telefone_destino,
              cliente_id: reminder.cliente_id,
              cliente_nome: reminder.cliente_nome,
              cliente_telefone: reminder.cliente_telefone,
              assinatura_referencia: reminder.assinatura_referencia,
              dias_restantes: diasRestantes,
              data_fim: ref,
              skipRegister: true
            });
          } else if (tipo_lembrete === '24h' || tipo_notificacao === 'lembrete_24h') {
            result = await this.whatsappService.sendReminder24h(agendamentoData);
          } else if (tipo_lembrete === '2h' || tipo_notificacao === 'lembrete_1h') {
            result = await this.whatsappService.sendReminder2h(agendamentoData);
          }

          if (result.success) {
            // Sucesso - atualizar status
            await this.updateReminderStatus(lembrete_id, 'enviado', {
              whatsappMessageId: result.data?.messageId || result.data?.key?.id
            });

            logger.log(`✅ [ReminderService] Lembrete programado #${lembrete_id} enviado com sucesso`);
            sent++;
          } else {
            // Falha - atualizar status
            await this.updateReminderStatus(lembrete_id, 'falha', {
              erro: result.error
            });

            logger.error(`❌ [ReminderService] Falha ao enviar lembrete programado #${lembrete_id}:`, result.error);
            failed++;
          }

        } catch (error) {
          logger.error(`❌ [ReminderService] Erro ao processar lembrete programado #${lembrete_id}:`, error);
          
          // Atualizar status para falha
          await this.updateReminderStatus(lembrete_id, 'falha', {
            erro: error.message
          });
          
          failed++;
        }

        // Pequeno delay entre envios
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.log(`\n✅ [ReminderService] ===== PROCESSAMENTO DE LEMBRETES PROGRAMADOS CONCLUÍDO =====`);
      logger.log(`📊 Total: ${reminders.length} | Enviados: ${sent} | Falhas: ${failed}`);

      return { processed: reminders.length, sent, failed, skipped: 0 };

    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao processar lembretes programados:', error);
      throw error;
    }
  }

  /**
   * Processar todos os lembretes (24h, 2h e programados)
   */
  async processAllReminders() {
    try {
      logger.log('\n🎯 [ReminderService] ========== INICIANDO CRON JOB DE LEMBRETES ==========');
      logger.log(`⏰ Horário: ${new Date().toLocaleString('pt-BR')}`);

      const birthdaysScheduled = await this.scheduleBirthdayMessages();
      const birthdays = await this.processBirthdayMessages();

      const subscriptionEndingSoonScheduled = await this.scheduleSubscriptionEndingSoonNotifications();

      const results = {
        timestamp: new Date().toISOString(),
        birthdaysScheduled,
        birthdays,
        subscriptionEndingSoonScheduled,
        scheduled: await this.processScheduledReminders(), // ✅ NOVO: Processar lembretes programados
        reminders24h: await this.process24hReminders(),
        reminders2h: await this.process2hReminders()
      };

      logger.log('\n🎯 [ReminderService] ========== CRON JOB CONCLUÍDO ==========\n');

      return results;
    } catch (error) {
      logger.error('❌ [ReminderService] Erro ao processar lembretes:', error);
      throw error;
    }
  }
}

module.exports = ReminderService;

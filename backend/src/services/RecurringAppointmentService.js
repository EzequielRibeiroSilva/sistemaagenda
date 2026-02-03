const crypto = require('crypto');
const { db } = require('../config/knex');

class RecurringAppointmentService {
  constructor({ agendamentoModel }) {
    this.agendamentoModel = agendamentoModel;
  }

  normalizeDateStr(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return null;
  }

  addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    const pad = (num) => num.toString().padStart(2, '0');
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  parseFrequencyToIntervalWeeks(frequency) {
    if (frequency === 'weekly') return 1;
    if (frequency === 'biweekly') return 2;
    return null;
  }

  getWeekdayFromDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCDay();
  }

  generateDates({ startDate, frequency, range }) {
    const start = this.normalizeDateStr(startDate);
    if (!start) {
      const err = new Error('data_agendamento inválida para recorrência');
      err.code = 'INVALID_START_DATE';
      throw err;
    }

    const intervalWeeks = this.parseFrequencyToIntervalWeeks(frequency);
    if (!intervalWeeks) {
      const err = new Error('Frequência de recorrência inválida. Use weekly ou biweekly');
      err.code = 'INVALID_FREQUENCY';
      throw err;
    }

    const mode = range?.mode;
    if (mode !== 'count' && mode !== 'until') {
      const err = new Error('range.mode inválido. Use count ou until');
      err.code = 'INVALID_RANGE_MODE';
      throw err;
    }

    const dates = [];
    const stepDays = intervalWeeks * 7;

    if (mode === 'count') {
      const count = parseInt(range?.count, 10);
      if (!Number.isFinite(count) || count < 1 || count > 104) {
        const err = new Error('range.count inválido para recorrência');
        err.code = 'INVALID_RANGE_COUNT';
        throw err;
      }

      for (let i = 0; i < count; i++) {
        dates.push(this.addDays(start, i * stepDays));
      }
      return { dates, intervalWeeks };
    }

    const until = this.normalizeDateStr(range?.until);
    if (!until) {
      const err = new Error('range.until inválido para recorrência');
      err.code = 'INVALID_RANGE_UNTIL';
      throw err;
    }

    let cursor = start;
    let guard = 0;
    while (cursor <= until) {
      dates.push(cursor);
      cursor = this.addDays(cursor, stepDays);
      guard++;
      if (guard > 104) break;
    }

    if (dates.length === 0) {
      const err = new Error('Recorrência não gerou nenhuma ocorrência');
      err.code = 'EMPTY_RECURRENCE';
      throw err;
    }

    return { dates, intervalWeeks };
  }

  buildRecorrenciaConfig({ startDate, hora_inicio, hora_fim, frequency, intervalWeeks, range }) {
    return {
      version: 1,
      frequency,
      interval_weeks: intervalWeeks,
      anchor: {
        weekday: this.getWeekdayFromDateStr(startDate),
        time_start: hora_inicio,
        time_end: hora_fim,
        timezone: 'America/Sao_Paulo'
      },
      range,
      policy: {
        on_conflict: 'fail_all',
        apply_to: 'all_occurrences'
      }
    };
  }

  async validateConflictsBatch({ agente_id, hora_inicio, hora_fim, dates, exclude_id }) {
    for (const dateStr of dates) {
      const hasConflict = await this.agendamentoModel.checkConflict(
        agente_id,
        dateStr,
        hora_inicio,
        hora_fim,
        exclude_id || null
      );

      if (hasConflict) {
        const err = new Error('Conflito de horário na recorrência');
        err.code = 'RECURRENCE_CONFLICT';
        err.conflict = { data_agendamento: dateStr, hora_inicio, hora_fim };
        throw err;
      }
    }
  }

  async createRecurringAppointments({
    baseAgendamentoData,
    servicosData,
    servicosExtrasData,
    servicosLegacy,
    recurrence
  }) {
    const startDate = this.normalizeDateStr(baseAgendamentoData?.data_agendamento);
    if (!startDate) {
      const err = new Error('data_agendamento inválida');
      err.code = 'INVALID_DATE';
      throw err;
    }

    const { dates, intervalWeeks } = this.generateDates({
      startDate,
      frequency: recurrence.frequency,
      range: recurrence.range
    });

    await this.validateConflictsBatch({
      agente_id: baseAgendamentoData.agente_id,
      hora_inicio: baseAgendamentoData.hora_inicio,
      hora_fim: baseAgendamentoData.hora_fim,
      dates
    });

    const groupId = crypto.randomUUID();
    const recorrenciaConfig = this.buildRecorrenciaConfig({
      startDate,
      hora_inicio: baseAgendamentoData.hora_inicio,
      hora_fim: baseAgendamentoData.hora_fim,
      frequency: recurrence.frequency,
      intervalWeeks,
      range: recurrence.range
    });

    const created = [];

    await db.transaction(async (trx) => {
      for (const dateStr of dates) {
        const dadosAgendamento = {
          ...baseAgendamentoData,
          data_agendamento: dateStr,
          recorrencia_group_id: groupId,
          recorrencia_config: recorrenciaConfig
        };

        let agendamento;
        try {
          agendamento = await this.agendamentoModel.createWithLockUsingTrx(trx, dadosAgendamento);
        } catch (err) {
          if (err && err.code === 'CONFLICT') {
            const conflictErr = new Error('Conflito de horário na recorrência');
            conflictErr.code = 'RECURRENCE_CONFLICT';
            conflictErr.conflict = {
              data_agendamento: dateStr,
              hora_inicio: baseAgendamentoData.hora_inicio,
              hora_fim: baseAgendamentoData.hora_fim
            };
            throw conflictErr;
          }
          throw err;
        }

        if (Array.isArray(servicosData) && servicosData.length > 0) {
          const agendamentoServicos = servicosData.map(servico => ({
            agendamento_id: agendamento.id,
            servico_id: servico.id,
            preco_aplicado: servico.preco
          }));
          await trx('agendamento_servicos').insert(agendamentoServicos);
        }

        if (Array.isArray(servicosExtrasData) && servicosExtrasData.length > 0) {
          const agendamentoServicosExtras = servicosExtrasData.map(extra => ({
            agendamento_id: agendamento.id,
            servico_extra_id: extra.id,
            preco_aplicado: extra.preco
          }));
          await trx('agendamento_servicos_extras').insert(agendamentoServicosExtras);
        }

        if (Array.isArray(servicosLegacy) && servicosLegacy.length > 0) {
          const agendamentoServicosLegacy = servicosLegacy.map(servico => ({
            agendamento_id: agendamento.id,
            servico_id: servico.servico_id,
            preco_aplicado: servico.preco_aplicado
          }));
          await trx('agendamento_servicos').insert(agendamentoServicosLegacy);
        }

        created.push(agendamento);
      }
    });

    return {
      recorrencia_group_id: groupId,
      recorrencia_config: recorrenciaConfig,
      ocorrencias: created
    };
  }
}

module.exports = RecurringAppointmentService;

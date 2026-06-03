const { db } = require('../config/knex');
const BookingAvailabilityService = require('./BookingAvailabilityService');

class AIAvailabilityService {
  constructor() {
    this.bookingAvailabilityService = new BookingAvailabilityService();
    this.tz = 'America/Sao_Paulo';
  }

  timeToMinutes(time) {
    const [hours, minutes] = String(time).split(':').map(Number);
    return (hours * 60) + minutes;
  }

  minutesToTime(totalMinutes) {
    const minutes = Math.max(0, Number(totalMinutes) || 0);
    const hh = Math.floor(minutes / 60) % 24;
    const mm = minutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  dayNumberFromDateStr(dateStr) {
    const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
    if (!y || !m || !d) return null;
    const utcMid = Date.UTC(y, m - 1, d, 0, 0, 0);
    return Math.floor(utcMid / 86400000);
  }

  getDateStrInTimeZone(timeZone) {
    return new Date().toLocaleDateString('en-CA', { timeZone });
  }

  getMinutesInTimeZone(timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(new Date());

    const hh = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const mm = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    return (hh * 60) + mm;
  }

  normalizePeriods(periods) {
    const arr = Array.isArray(periods) ? periods : [];
    return arr
      .map(p => ({
        inicio: (p?.inicio || p?.start || '').toString().substring(0, 5),
        fim: (p?.fim || p?.end || '').toString().substring(0, 5)
      }))
      .filter(p => p.inicio && p.fim);
  }

  intersectPeriods(periodsA, periodsB) {
    const a = this.normalizePeriods(periodsA);
    const b = this.normalizePeriods(periodsB);

    const out = [];
    for (const pa of a) {
      const aStart = this.timeToMinutes(pa.inicio);
      const aEnd = this.timeToMinutes(pa.fim);
      for (const pb of b) {
        const bStart = this.timeToMinutes(pb.inicio);
        const bEnd = this.timeToMinutes(pb.fim);
        const start = Math.max(aStart, bStart);
        const end = Math.min(aEnd, bEnd);
        if (start < end) {
          out.push({ inicio: this.minutesToTime(start), fim: this.minutesToTime(end) });
        }
      }
    }

    return out;
  }

  weekdayFromDateStr(dateStr) {
    const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
    const dataNoonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: this.tz, weekday: 'short' }).format(dataNoonUtc);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return weekdayMap[weekdayStr] ?? new Date(`${dateStr}T00:00:00`).getDay();
  }

  async getAvailableSlots({ unidade_id, agente_id, data }) {
    const unidadeId = parseInt(unidade_id, 10);
    const agenteId = parseInt(agente_id, 10);
    const dateStr = String(data || '').trim();

    if (!unidadeId || !agenteId || !dateStr) {
      const err = new Error('Parâmetros obrigatórios: unidade_id, agente_id, data');
      err.code = 'MISSING_PARAMS';
      err.httpStatus = 400;
      throw err;
    }

    const diaSemana = this.weekdayFromDateStr(dateStr);

    const configuracoes = await db('configuracoes_sistema')
      .where('unidade_id', unidadeId)
      .select('duracao_servico_minutos', 'tempo_limite_agendar_horas')
      .first();

    const duracaoMinutos = parseInt(configuracoes?.duracao_servico_minutos, 10) || 60;
    const tempoLimiteHoras = parseInt(configuracoes?.tempo_limite_agendar_horas, 10) || 0;

    const horarioUnidade = await db('horarios_funcionamento_unidade')
      .where('unidade_id', unidadeId)
      .where('dia_semana', diaSemana)
      .where('is_aberto', true)
      .first();

    const horariosJsonUnidade = typeof horarioUnidade?.horarios_json === 'string'
      ? JSON.parse(horarioUnidade.horarios_json)
      : (horarioUnidade?.horarios_json || []);

    if (!horarioUnidade || !Array.isArray(horariosJsonUnidade) || horariosJsonUnidade.length === 0) {
      return [];
    }

    const horarioAgente = await db('horarios_funcionamento')
      .where('agente_id', agenteId)
      .where('dia_semana', diaSemana)
      .where('unidade_id', unidadeId)
      .first();

    let periodosParaUsar = [];
    let agenteTrabalhaNesteNivel1 = false; // Flag para saber se agente tem horário configurado
    
    if (horarioAgente && horarioAgente.ativo && Array.isArray(horarioAgente.periodos) && horarioAgente.periodos.length > 0) {
      periodosParaUsar = this.intersectPeriods(horarioAgente.periodos, horariosJsonUnidade);
      agenteTrabalhaNesteNivel1 = true; // Tem horário ativo configurado
    } else if (horarioAgente && (!horarioAgente.ativo || !horarioAgente.periodos || horarioAgente.periodos.length === 0)) {
      periodosParaUsar = [];
      agenteTrabalhaNesteNivel1 = false; // Horário existe mas está inativo ou vazio
    } else {
      // ✅ CORREÇÃO CRÍTICA: FAIL-SAFE
      // Sem registro de horário = agente indisponível
      // Princípio: Ausência de configuração explícita não autoriza agenda
      // (Não é porque a unidade abre que TODO agente trabalha)
      periodosParaUsar = [];
      agenteTrabalhaNesteNivel1 = false; // Não tem registro de horário
    }

    // 🎯 CONSULTORIA DE AGENDA: Se não há períodos, retornar metadata explicando o motivo
    if (!periodosParaUsar || periodosParaUsar.length === 0) {
      return {
        slots: [],
        metadata: {
          agente_trabalha_neste_dia: agenteTrabalhaNesteNivel1,
          motivo: agenteTrabalhaNesteNivel1 ? 'AGENDA_LOTADA' : 'PROFISSIONAL_NAO_TRABALHA'
        }
      };
    }

    const hojeStr = this.getDateStrInTimeZone(this.tz);
    const agoraMin = this.getMinutesInTimeZone(this.tz);
    const agoraAbsMin = this.dayNumberFromDateStr(hojeStr) * 1440 + agoraMin;
    const limiteAbsMin = agoraAbsMin + (tempoLimiteHoras * 60);

    const slots = [];
    const intervaloSlot = duracaoMinutos;

    for (const periodo of periodosParaUsar) {
      const inicio = this.timeToMinutes(periodo.inicio);
      const fim = this.timeToMinutes(periodo.fim);

      for (let minuto = inicio; minuto <= fim - duracaoMinutos; minuto += intervaloSlot) {
        const inicioStr = this.minutesToTime(minuto);
        const fimStr = this.minutesToTime(minuto + duracaoMinutos);

        if (dateStr === hojeStr && minuto < agoraMin) {
          continue;
        }

        if (tempoLimiteHoras > 0) {
          const slotAbsMin = this.dayNumberFromDateStr(dateStr) * 1440 + minuto;
          if (slotAbsMin < limiteAbsMin) {
            continue;
          }
        }

        try {
          await this.bookingAvailabilityService.validateOrThrow({
            unidade_id: unidadeId,
            agente_id: agenteId,
            data_agendamento: dateStr,
            hora_inicio: inicioStr,
            hora_fim: fimStr
          });

          slots.push({ inicio: inicioStr, fim: fimStr });
        } catch {
          // indisponível (conflito, exceções, etc.)
        }
      }
    }

    const unique = new Map();
    for (const s of slots) {
      unique.set(`${s.inicio}-${s.fim}`, s);
    }

    const slotsFinais = Array.from(unique.values()).sort((a, b) => this.timeToMinutes(a.inicio) - this.timeToMinutes(b.inicio));

    // 🎯 CONSULTORIA DE AGENDA: Retornar metadata mesmo quando há slots disponíveis
    if (slotsFinais.length === 0) {
      // Profissional trabalha (tinha períodos) mas todos os slots estão ocupados
      return {
        slots: [],
        metadata: {
          agente_trabalha_neste_dia: true,
          motivo: 'AGENDA_LOTADA'
        }
      };
    }

    // Há slots disponíveis
    return {
      slots: slotsFinais,
      metadata: {
        agente_trabalha_neste_dia: true,
        motivo: 'SLOTS_DISPONIVEIS'
      }
    };
  }
}

module.exports = new AIAvailabilityService();

const ExcecaoCalendario = require('../models/ExcecaoCalendario');
const AgenteExcecaoCalendario = require('../models/AgenteExcecaoCalendario');
const { db } = require('../config/knex');

class BookingAvailabilityService {
  getQuery(trx) {
    return trx || db;
  }

  timeToMinutes(time) {
    const [hours, minutes] = String(time).split(':').map(Number);
    return (hours * 60) + minutes;
  }

  isOverlappingRange(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
  }

  normalizeTime(value) {
    if (!value) return null;
    return value.toString().substring(0, 5);
  }

  async validateOrThrow({
    unidade_id,
    agente_id,
    data_agendamento,
    hora_inicio,
    hora_fim,
    exclude_agendamento_id = null,
    trx = null
  }) {
    if (!unidade_id || !agente_id || !data_agendamento || !hora_inicio || !hora_fim) {
      const err = new Error('Dados obrigatórios para validar disponibilidade');
      err.code = 'MISSING_PARAMS';
      err.httpStatus = 400;
      throw err;
    }

    const query = this.getQuery(trx);

    if (trx) {
      await trx.raw(`
        SELECT pg_advisory_xact_lock(
          hashtext(?::text || ?::text)
        )
      `, [agente_id.toString(), data_agendamento]);
    }

    const excecaoAgenteDiaInteiro = await AgenteExcecaoCalendario.isDataBloqueada(agente_id, data_agendamento);
    if (excecaoAgenteDiaInteiro) {
      const err = new Error(`Não é possível agendar neste dia (Agente indisponível: ${excecaoAgenteDiaInteiro.tipo}${excecaoAgenteDiaInteiro.descricao ? ` - ${excecaoAgenteDiaInteiro.descricao}` : ''}).`);
      err.code = 'AGENT_DAY_BLOCKED';
      err.httpStatus = 403;
      err.details = { excecao: excecaoAgenteDiaInteiro };
      throw err;
    }

    const excecaoUnidadeDiaInteiro = await ExcecaoCalendario.isDataBloqueada(unidade_id, data_agendamento);
    if (excecaoUnidadeDiaInteiro) {
      const err = new Error(`Não é possível agendar nesta data (${excecaoUnidadeDiaInteiro.tipo}${excecaoUnidadeDiaInteiro.descricao ? ` - ${excecaoUnidadeDiaInteiro.descricao}` : ''}).`);
      err.code = 'UNIT_DAY_BLOCKED';
      err.httpStatus = 403;
      err.details = { excecao: excecaoUnidadeDiaInteiro };
      throw err;
    }

    const startMin = this.timeToMinutes(this.normalizeTime(hora_inicio));
    const endMin = this.timeToMinutes(this.normalizeTime(hora_fim));

    const excecoesAgenteDoDia = await AgenteExcecaoCalendario.findByAgenteAndDate(agente_id, data_agendamento, trx);
    const bloqueiosAgenteParciais = (Array.isArray(excecoesAgenteDoDia) ? excecoesAgenteDoDia : [])
      .filter(e => e.hora_inicio && e.hora_fim)
      .map(e => ({
        inicio: this.normalizeTime(e.hora_inicio),
        fim: this.normalizeTime(e.hora_fim),
        tipo: e.tipo,
        descricao: e.descricao
      }));

    const blockedAgente = bloqueiosAgenteParciais.find(b => {
      const bStart = this.timeToMinutes(b.inicio);
      const bEnd = this.timeToMinutes(b.fim);
      return this.isOverlappingRange(startMin, endMin, bStart, bEnd);
    });

    if (blockedAgente) {
      const err = new Error(`Não é possível agendar neste horário (Agente indisponível: ${blockedAgente.tipo}${blockedAgente.descricao ? ` - ${blockedAgente.descricao}` : ''}).`);
      err.code = 'AGENT_TIME_BLOCKED';
      err.httpStatus = 403;
      err.details = { excecao: blockedAgente };
      throw err;
    }

    const excecoesUnidadeDoDia = await ExcecaoCalendario.findByUnidadeAndDate(unidade_id, data_agendamento, trx);
    const bloqueiosUnidadeParciais = (Array.isArray(excecoesUnidadeDoDia) ? excecoesUnidadeDoDia : [])
      .filter(e => e.hora_inicio && e.hora_fim)
      .map(e => ({
        inicio: this.normalizeTime(e.hora_inicio),
        fim: this.normalizeTime(e.hora_fim),
        tipo: e.tipo,
        descricao: e.descricao
      }));

    const blockedUnidade = bloqueiosUnidadeParciais.find(b => {
      const bStart = this.timeToMinutes(b.inicio);
      const bEnd = this.timeToMinutes(b.fim);
      return this.isOverlappingRange(startMin, endMin, bStart, bEnd);
    });

    if (blockedUnidade) {
      const err = new Error(`Não é possível agendar neste horário (${blockedUnidade.tipo}${blockedUnidade.descricao ? ` - ${blockedUnidade.descricao}` : ''}).`);
      err.code = 'UNIT_TIME_BLOCKED';
      err.httpStatus = 403;
      err.details = { excecao: blockedUnidade };
      throw err;
    }

    let conflitoQuery = query('agendamentos')
      .where('agente_id', agente_id)
      .where('data_agendamento', data_agendamento)
      .whereIn('status', ['Aprovado', 'Confirmado'])
      .whereNull('deleted_at')
      .where(function() {
        this.where(function() {
          this.where('hora_inicio', '<=', hora_inicio)
            .where('hora_fim', '>', hora_inicio);
        })
        .orWhere(function() {
          this.where('hora_inicio', '<', hora_fim)
            .where('hora_fim', '>=', hora_fim);
        })
        .orWhere(function() {
          this.where('hora_inicio', '>=', hora_inicio)
            .where('hora_fim', '<=', hora_fim);
        });
      });

    if (exclude_agendamento_id) {
      conflitoQuery = conflitoQuery.whereNot('id', parseInt(exclude_agendamento_id));
    }

    const conflito = await conflitoQuery.first();
    if (conflito) {
      const err = new Error('O agente já possui um agendamento neste horário');
      err.code = 'APPOINTMENT_CONFLICT';
      err.httpStatus = 400;
      err.details = { conflito };
      throw err;
    }

    return true;
  }
}

module.exports = BookingAvailabilityService;

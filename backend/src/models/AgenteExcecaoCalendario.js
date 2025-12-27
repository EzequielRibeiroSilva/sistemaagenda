const BaseModel = require('./BaseModel');
const { db } = require('../config/knex');
const logger = require('./../utils/logger');

class AgenteExcecaoCalendario extends BaseModel {
  constructor() {
    super('agente_excecoes_calendario');
  }

  static get tableName() {
    return 'agente_excecoes_calendario';
  }

  static async findByAgente(agenteId, options = {}) {
    try {
      let query = db('agente_excecoes_calendario')
        .where('agente_id', agenteId)
        .orderBy('data_inicio', 'asc');

      if (options.dataInicio) {
        query = query.where('data_fim', '>=', options.dataInicio);
      }
      if (options.dataFim) {
        query = query.where('data_inicio', '<=', options.dataFim);
      }

      const excecoes = await query;
      return Array.isArray(excecoes) ? excecoes : [];
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao buscar exceções do agente:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const excecao = await db('agente_excecoes_calendario')
        .where('id', id)
        .first();

      return excecao || null;
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao buscar exceção por ID:', error);
      throw error;
    }
  }

  static async isDataBloqueada(agenteId, data) {
    try {
      const dataStr = typeof data === 'string' ? data : data.toISOString().split('T')[0];

      const excecao = await db('agente_excecoes_calendario')
        .where('agente_id', agenteId)
        .where('data_inicio', '<=', dataStr)
        .where('data_fim', '>=', dataStr)
        .whereNull('hora_inicio')
        .whereNull('hora_fim')
        .first();

      return excecao || null;
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao verificar se data está bloqueada:', error);
      throw error;
    }
  }

  static async findByAgenteAndDate(agenteId, data, trx = null) {
    const query = trx ? trx('agente_excecoes_calendario') : db('agente_excecoes_calendario');

    try {
      const dataStr = typeof data === 'string' ? data : data.toISOString().split('T')[0];

      const excecoes = await query
        .where('agente_id', agenteId)
        .where('data_inicio', '<=', dataStr)
        .where('data_fim', '>=', dataStr)
        .orderBy([{ column: 'data_inicio', order: 'asc' }, { column: 'hora_inicio', order: 'asc' }]);

      return Array.isArray(excecoes) ? excecoes : [];
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao buscar exceções por data:', error);
      throw error;
    }
  }

  static async create(excecaoData, trx = null) {
    const query = trx ? trx('agente_excecoes_calendario') : db('agente_excecoes_calendario');

    try {
      this.validateExcecaoData(excecaoData);

      const sobreposicao = await this.checkSobreposicao(
        excecaoData.agente_id,
        excecaoData.data_inicio,
        excecaoData.data_fim,
        excecaoData.hora_inicio,
        excecaoData.hora_fim,
        null,
        trx
      );

      if (sobreposicao) {
        const error = new Error(
          `Já existe uma exceção cadastrada neste período: ${sobreposicao.descricao || sobreposicao.tipo} (${sobreposicao.data_inicio} a ${sobreposicao.data_fim})`
        );
        error.code = 'EXCECAO_SOBREPOSTA';
        throw error;
      }

      const conflitoAgendamento = await this.checkConflitoComAgendamentos(
        excecaoData.agente_id,
        excecaoData.data_inicio,
        excecaoData.data_fim,
        excecaoData.hora_inicio || null,
        excecaoData.hora_fim || null,
        trx
      );

      if (conflitoAgendamento) {
        const error = new Error('Não é possível criar este bloqueio porque há um agendamento dentro do período. Contate o ADMIN para ajustar o agendamento.');
        error.code = 'AGENDAMENTO_CONFLITANTE';
        error.details = conflitoAgendamento;
        throw error;
      }

      const dadosParaInserir = {
        agente_id: excecaoData.agente_id,
        data_inicio: excecaoData.data_inicio,
        data_fim: excecaoData.data_fim,
        hora_inicio: excecaoData.hora_inicio || null,
        hora_fim: excecaoData.hora_fim || null,
        tipo: excecaoData.tipo || 'Outro',
        descricao: excecaoData.descricao || null,
        created_at: new Date(),
        updated_at: new Date()
      };

      const [excecaoCriada] = await query.insert(dadosParaInserir).returning('*');
      return excecaoCriada;
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao criar exceção:', error);
      throw error;
    }
  }

  static async update(id, excecaoData, trx = null) {
    const query = trx ? trx('agente_excecoes_calendario') : db('agente_excecoes_calendario');

    try {
      const excecaoExistente = await this.findById(id);
      if (!excecaoExistente) {
        const error = new Error('Exceção não encontrada');
        error.code = 'EXCECAO_NAO_ENCONTRADA';
        throw error;
      }

      if (
        excecaoData.data_inicio !== undefined ||
        excecaoData.data_fim !== undefined ||
        excecaoData.hora_inicio !== undefined ||
        excecaoData.hora_fim !== undefined
      ) {
        const dataInicio = excecaoData.data_inicio || excecaoExistente.data_inicio;
        const dataFim = excecaoData.data_fim || excecaoExistente.data_fim;
        const horaInicio = excecaoData.hora_inicio !== undefined ? excecaoData.hora_inicio : excecaoExistente.hora_inicio;
        const horaFim = excecaoData.hora_fim !== undefined ? excecaoData.hora_fim : excecaoExistente.hora_fim;

        this.validateExcecaoData({ data_inicio: dataInicio, data_fim: dataFim, hora_inicio: horaInicio, hora_fim: horaFim });

        const sobreposicao = await this.checkSobreposicao(
          excecaoExistente.agente_id,
          dataInicio,
          dataFim,
          horaInicio,
          horaFim,
          id,
          trx
        );

        if (sobreposicao) {
          const error = new Error(
            `Já existe uma exceção cadastrada neste período: ${sobreposicao.descricao || sobreposicao.tipo} (${sobreposicao.data_inicio} a ${sobreposicao.data_fim})`
          );
          error.code = 'EXCECAO_SOBREPOSTA';
          throw error;
        }

        const conflitoAgendamento = await this.checkConflitoComAgendamentos(
          excecaoExistente.agente_id,
          dataInicio,
          dataFim,
          horaInicio || null,
          horaFim || null,
          trx
        );

        if (conflitoAgendamento) {
          const error = new Error('Não é possível atualizar este bloqueio porque há um agendamento dentro do período. Contate o ADMIN para ajustar o agendamento.');
          error.code = 'AGENDAMENTO_CONFLITANTE';
          error.details = conflitoAgendamento;
          throw error;
        }
      }

      const dadosParaAtualizar = {
        ...excecaoData,
        updated_at: new Date()
      };

      Object.keys(dadosParaAtualizar).forEach(key => {
        if (dadosParaAtualizar[key] === undefined) {
          delete dadosParaAtualizar[key];
        }
      });

      const [excecaoAtualizada] = await query
        .where('id', id)
        .update(dadosParaAtualizar)
        .returning('*');

      return excecaoAtualizada;
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao atualizar exceção:', error);
      throw error;
    }
  }

  static async delete(id, trx = null) {
    const query = trx ? trx('agente_excecoes_calendario') : db('agente_excecoes_calendario');

    try {
      const deletedCount = await query.where('id', id).del();
      return deletedCount > 0;
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao deletar exceção:', error);
      throw error;
    }
  }

  static async deleteByAgente(agenteId, trx = null) {
    const query = trx ? trx('agente_excecoes_calendario') : db('agente_excecoes_calendario');

    try {
      const deletedCount = await query.where('agente_id', agenteId).del();
      return deletedCount;
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao deletar exceções do agente:', error);
      throw error;
    }
  }

  static async checkSobreposicao(agenteId, dataInicio, dataFim, horaInicio = null, horaFim = null, excludeId = null, trx = null) {
    const query = trx ? trx('agente_excecoes_calendario') : db('agente_excecoes_calendario');

    try {
      let candidatosQuery = query
        .where('agente_id', agenteId)
        .where(function() {
          this.where(function() {
            this.where('data_inicio', '<=', dataInicio)
              .where('data_fim', '>=', dataInicio);
          })
          .orWhere(function() {
            this.where('data_inicio', '<=', dataFim)
              .where('data_fim', '>=', dataFim);
          })
          .orWhere(function() {
            this.where('data_inicio', '>=', dataInicio)
              .where('data_fim', '<=', dataFim);
          });
        });

      if (excludeId) {
        candidatosQuery = candidatosQuery.whereNot('id', excludeId);
      }

      const candidatos = await candidatosQuery.select('*');
      if (!Array.isArray(candidatos) || candidatos.length === 0) {
        return null;
      }

      const normalizeTime = (t) => {
        if (!t) return null;
        const s = typeof t === 'string' ? t : String(t);
        return s.length >= 5 ? s.slice(0, 5) : s;
      };
      const timeToMinutes = (t) => {
        const [hh, mm] = t.split(':').map(Number);
        return (hh * 60) + mm;
      };

      const newStart = normalizeTime(horaInicio);
      const newEnd = normalizeTime(horaFim);
      const newIsFullDay = !newStart && !newEnd;

      for (const existing of candidatos) {
        const existingStart = normalizeTime(existing.hora_inicio);
        const existingEnd = normalizeTime(existing.hora_fim);
        const existingIsFullDay = !existingStart && !existingEnd;

        if (newIsFullDay || existingIsFullDay) {
          return existing;
        }

        if (newStart && newEnd && existingStart && existingEnd) {
          const aStart = timeToMinutes(newStart);
          const aEnd = timeToMinutes(newEnd);
          const bStart = timeToMinutes(existingStart);
          const bEnd = timeToMinutes(existingEnd);

          if (aStart < bEnd && aEnd > bStart) {
            return existing;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao verificar sobreposição:', error);
      throw error;
    }
  }

  static async checkConflitoComAgendamentos(agenteId, dataInicio, dataFim, horaInicio = null, horaFim = null, trx = null) {
    const query = trx ? trx('agendamentos') : db('agendamentos');

    try {
      const agendamentos = await query
        .where('agente_id', agenteId)
        .whereIn('status', ['Aprovado', 'Confirmado'])
        .where('data_agendamento', '>=', dataInicio)
        .where('data_agendamento', '<=', dataFim)
        .select('id', 'data_agendamento', 'hora_inicio', 'hora_fim');

      if (!Array.isArray(agendamentos) || agendamentos.length === 0) {
        return null;
      }

      const normalizeTime = (t) => {
        if (!t) return null;
        const s = typeof t === 'string' ? t : String(t);
        return s.length >= 5 ? s.slice(0, 5) : s;
      };
      const timeToMinutes = (t) => {
        const [hh, mm] = t.split(':').map(Number);
        return (hh * 60) + mm;
      };

      const excStart = normalizeTime(horaInicio);
      const excEnd = normalizeTime(horaFim);
      const isFullDay = !excStart && !excEnd;

      for (const appt of agendamentos) {
        if (isFullDay) {
          return { agendamento_id: appt.id, data_agendamento: appt.data_agendamento };
        }

        const apptStart = normalizeTime(appt.hora_inicio);
        const apptEnd = normalizeTime(appt.hora_fim);
        if (!apptStart || !apptEnd || !excStart || !excEnd) {
          continue;
        }

        const aStart = timeToMinutes(excStart);
        const aEnd = timeToMinutes(excEnd);
        const bStart = timeToMinutes(apptStart);
        const bEnd = timeToMinutes(apptEnd);

        if (aStart < bEnd && aEnd > bStart) {
          return { agendamento_id: appt.id, data_agendamento: appt.data_agendamento };
        }
      }

      return null;
    } catch (error) {
      logger.error('❌ [AgenteExcecaoCalendario] Erro ao verificar conflito com agendamentos:', error);
      throw error;
    }
  }

  static validateExcecaoData(excecaoData) {
    if (!excecaoData.data_inicio || !excecaoData.data_fim) {
      throw new Error('data_inicio e data_fim são obrigatórios');
    }

    const dataInicio = new Date(excecaoData.data_inicio);
    const dataFim = new Date(excecaoData.data_fim);

    if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
      throw new Error('Datas inválidas');
    }

    if (dataFim < dataInicio) {
      throw new Error('data_fim deve ser maior ou igual a data_inicio');
    }

    const horaInicio = excecaoData.hora_inicio || null;
    const horaFim = excecaoData.hora_fim || null;

    if ((horaInicio && !horaFim) || (!horaInicio && horaFim)) {
      throw new Error('hora_inicio e hora_fim devem ser informados juntos');
    }

    if (horaInicio && horaFim) {
      const start = horaInicio.toString().substring(0, 5);
      const end = horaFim.toString().substring(0, 5);

      const isValidTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
      if (!isValidTime(start) || !isValidTime(end)) {
        throw new Error('Horários inválidos. Use o formato HH:MM');
      }

      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const startMin = (sh * 60) + sm;
      const endMin = (eh * 60) + em;
      if (endMin <= startMin) {
        throw new Error('hora_fim deve ser maior que hora_inicio');
      }
    }

    const tiposValidos = ['Feriado', 'Férias', 'Evento Especial', 'Manutenção', 'Outro'];
    if (excecaoData.tipo && !tiposValidos.includes(excecaoData.tipo)) {
      throw new Error(`Tipo inválido. Tipos válidos: ${tiposValidos.join(', ')}`);
    }
  }
}

module.exports = AgenteExcecaoCalendario;

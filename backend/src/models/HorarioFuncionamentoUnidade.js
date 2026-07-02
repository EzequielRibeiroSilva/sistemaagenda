const BaseModel = require('./BaseModel');
const { db } = require('../config/knex');
const logger = require('./../utils/logger');

/**
 * Modelo para gerenciar horários de funcionamento das unidades
 *
 * Estrutura dos dados:
 * - dia_semana: 0-6 (Domingo a Sábado)
 * - horarios_json: Array de objetos {inicio: "HH:MM", fim: "HH:MM"}
 * - is_aberto: Boolean indicando se a unidade funciona neste dia
 */
class HorarioFuncionamentoUnidade extends BaseModel {
  constructor() {
    super('horarios_funcionamento_unidade');
  }

  static get tableName() {
    return 'horarios_funcionamento_unidade';
  }

  /**
   * Buscar horários de uma unidade específica
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<Array>} Array com horários de todos os dias da semana
   */
  static async findByUnidade(unidadeId) {
    try {
      const horarios = await db('horarios_funcionamento_unidade')
        .where('unidade_id', unidadeId)
        .orderBy('dia_semana');

      // ✅ CORREÇÃO CRÍTICA: Fazer parse do horarios_json (STRING → ARRAY)
      return horarios.map(h => ({
        ...h,
        horarios_json: typeof h.horarios_json === 'string' 
          ? JSON.parse(h.horarios_json) 
          : h.horarios_json
      }));
    } catch (error) {
      logger.error('Erro ao buscar horários da unidade:', error);
      throw error;
    }
  }

  static async findByUnidades(unidadeIds) {
    try {
      if (!Array.isArray(unidadeIds) || unidadeIds.length === 0) {
        return [];
      }

      const horarios = await db('horarios_funcionamento_unidade')
        .whereIn('unidade_id', unidadeIds)
        .orderBy(['unidade_id', { column: 'dia_semana', order: 'asc' }]);

      return horarios.map(h => ({
        ...h,
        horarios_json: typeof h.horarios_json === 'string'
          ? JSON.parse(h.horarios_json)
          : h.horarios_json
      }));
    } catch (error) {
      logger.error('Erro ao buscar horários das unidades:', error);
      throw error;
    }
  }

  /**
   * Buscar horários de um dia específico de uma unidade
   * @param {number} unidadeId - ID da unidade
   * @param {number} diaSemana - Dia da semana (0-6)
   * @returns {Promise<Object|null>} Horário do dia específico
   */
  static async findByUnidadeEDia(unidadeId, diaSemana) {
    try {
      const horario = await db('horarios_funcionamento_unidade')
        .where('unidade_id', unidadeId)
        .where('dia_semana', diaSemana)
        .first();

      if (!horario) return null;

      // ✅ CORREÇÃO CRÍTICA: Fazer parse do horarios_json (STRING → ARRAY)
      return {
        ...horario,
        horarios_json: typeof horario.horarios_json === 'string' 
          ? JSON.parse(horario.horarios_json) 
          : horario.horarios_json
      };
    } catch (error) {
      logger.error('Erro ao buscar horário específico:', error);
      throw error;
    }
  }

  /**
   * Criar ou atualizar horários de uma unidade (transação)
   * @param {number} unidadeId - ID da unidade
   * @param {Array} horariosSemanais - Array com 7 objetos (um para cada dia)
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<Array>} Horários criados/atualizados
   */
  static async upsertHorariosSemanais(unidadeId, horariosSemanais, trx = null) {
    const query = trx ? trx('horarios_funcionamento_unidade') : db('horarios_funcionamento_unidade');
    const effectiveTrx = trx || db;

    try {
      // ========================================
      // TEMPORAL GUARD (ELITE): impedir que atualização de horário
      // deixe agendamentos futuros fora do novo intervalo.
      // ========================================
      const statusAllowList = ['confirmado', 'pendente', 'Aprovado', 'Confirmado', 'Pendente'];

      const normalizePeriods = (periodos) => {
        if (!Array.isArray(periodos)) return [];
        return periodos
          .map(p => ({
            inicio: typeof p?.inicio === 'string' ? p.inicio : null,
            fim: typeof p?.fim === 'string' ? p.fim : null
          }))
          .filter(p => p.inicio && p.fim);
      };

      const isAppointmentWithinNewSchedule = (horaInicio, horaFim, newPeriods) => {
        const startMin = this.timeToMinutes(String(horaInicio).slice(0, 5));
        const endMin = this.timeToMinutes(String(horaFim).slice(0, 5));

        return (newPeriods || []).some(periodo => {
          const pStart = this.timeToMinutes(periodo.inicio);
          const pEnd = this.timeToMinutes(periodo.fim);
          return startMin >= pStart && endMin <= pEnd;
        });
      };

      // Buscar horários atuais ANTES do delete (dentro da mesma trx quando possível)
      const existingRows = await effectiveTrx('horarios_funcionamento_unidade')
        .where('unidade_id', unidadeId)
        .select('dia_semana', 'is_aberto', 'horarios_json');

      const existingByDay = new Map();
      for (const row of existingRows) {
        let parsed = row.horarios_json;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch (e) {
            parsed = [];
          }
        }
        existingByDay.set(Number(row.dia_semana), {
          is_aberto: !!row.is_aberto,
          periodos: Array.isArray(parsed) ? parsed : []
        });
      }

      // Identificar dias que estão sendo fechados ou restritos
      const affectedDays = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const existing = existingByDay.get(dayIndex) || { is_aberto: false, periodos: [] };
        const incoming = horariosSemanais?.[dayIndex] || { is_aberto: false, periodos: [] };

        const oldOpen = !!existing.is_aberto;
        const newOpen = !!incoming.is_aberto;

        const oldPeriods = normalizePeriods(existing.periodos);
        const newPeriods = normalizePeriods(incoming.periodos);

        // Se estava aberto e vai fechar => afetado
        if (oldOpen && !newOpen) {
          affectedDays.push({ dia_semana: dayIndex, newOpen, newPeriods });
          continue;
        }

        // Se continua aberto, mas pode ter sido encurtado
        if (oldOpen && newOpen) {
          // Se novo não tem períodos válidos, é efetivamente fechado para agenda
          if (newPeriods.length === 0) {
            affectedDays.push({ dia_semana: dayIndex, newOpen: false, newPeriods: [] });
            continue;
          }

          const oldStart = oldPeriods.length > 0
            ? Math.min(...oldPeriods.map(p => this.timeToMinutes(p.inicio)))
            : null;
          const oldEnd = oldPeriods.length > 0
            ? Math.max(...oldPeriods.map(p => this.timeToMinutes(p.fim)))
            : null;

          const newStart = Math.min(...newPeriods.map(p => this.timeToMinutes(p.inicio)));
          const newEnd = Math.max(...newPeriods.map(p => this.timeToMinutes(p.fim)));

          const isRestricted =
            (oldStart !== null && newStart > oldStart) ||
            (oldEnd !== null && newEnd < oldEnd);

          if (isRestricted) {
            affectedDays.push({ dia_semana: dayIndex, newOpen, newPeriods });
          }
        }
      }

      // Para cada dia afetado, verificar se haverá agendamentos futuros fora do novo intervalo
      if (affectedDays.length > 0) {
        for (const day of affectedDays) {
          const diaSemana = Number(day.dia_semana);

          const rows = await effectiveTrx('agendamentos')
            .where('unidade_id', unidadeId)
            .where('data_agendamento', '>=', effectiveTrx.raw('CURRENT_DATE'))
            .whereIn('status', statusAllowList)
            .andWhereRaw('EXTRACT(DOW FROM data_agendamento) = ?', [diaSemana])
            .select('id', 'hora_inicio', 'hora_fim');

          if (!Array.isArray(rows) || rows.length === 0) continue;

          let outOfBounds = 0;
          if (!day.newOpen || !Array.isArray(day.newPeriods) || day.newPeriods.length === 0) {
            outOfBounds = rows.length;
          } else {
            for (const app of rows) {
              const ok = isAppointmentWithinNewSchedule(app.hora_inicio, app.hora_fim, day.newPeriods);
              if (!ok) outOfBounds++;
            }
          }

          if (outOfBounds > 0) {
            const err = new Error(
              `Alteração de horário não permitida: Existem ${outOfBounds} agendamentos confirmados em horários que não estarão mais disponíveis com essa configuração. ` +
              'Remova ou reagende os compromissos afetados antes de salvar.'
            );
            err.code = 'UNIDADE_HORARIO_TEMPORAL_GUARD';
            err.statusCode = 409;
            err.details = { unidade_id: unidadeId, dia_semana: diaSemana, count: outOfBounds };
            throw err;
          }
        }
      }

      // Primeiro, deletar horários existentes
      await query.clone().delete().where('unidade_id', unidadeId);

      // Preparar dados para inserção
      const horariosParaInserir = horariosSemanais.map((horario, index) => ({
        unidade_id: unidadeId,
        dia_semana: index, // 0 = Domingo, 1 = Segunda, etc.
        horarios_json: JSON.stringify(horario.periodos || []),
        is_aberto: horario.is_aberto || false,
        created_at: new Date(),
        updated_at: new Date()
      }));

      // Inserir novos horários
      const horariosInseridos = await query.clone().insert(horariosParaInserir).returning('*');

      return horariosInseridos;
    } catch (error) {
      logger.error('Erro ao criar/atualizar horários semanais:', error);
      throw error;
    }
  }

  /**
   * Deletar todos os horários de uma unidade
   * @param {number} unidadeId - ID da unidade
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<number>} Número de registros deletados
   */
  static async deleteByUnidade(unidadeId, trx = null) {
    const query = trx ? trx('horarios_funcionamento_unidade') : db('horarios_funcionamento_unidade');

    try {
      const deletedCount = await query.delete().where('unidade_id', unidadeId);
      return deletedCount;
    } catch (error) {
      logger.error('❌ [HorarioFuncionamentoUnidade] Erro ao deletar horários da unidade:', error);
      throw error;
    }
  }

  /**
   * Verificar se uma unidade está aberta em um dia/horário específico
   * @param {number} unidadeId - ID da unidade
   * @param {number} diaSemana - Dia da semana (0-6)
   * @param {string} horario - Horário no formato "HH:MM"
   * @returns {Promise<boolean>} True se estiver aberto
   */
  static async isAbertoNoHorario(unidadeId, diaSemana, horario) {
    try {
      const horarioFuncionamento = await this.findByUnidadeEDia(unidadeId, diaSemana);
      
      if (!horarioFuncionamento || !horarioFuncionamento.is_aberto) {
        return false;
      }
      
      const periodos = JSON.parse(horarioFuncionamento.horarios_json);
      const horarioMinutos = this.timeToMinutes(horario);
      
      // Verificar se o horário está dentro de algum período
      return periodos.some(periodo => {
        const inicioMinutos = this.timeToMinutes(periodo.inicio);
        const fimMinutos = this.timeToMinutes(periodo.fim);
        return horarioMinutos >= inicioMinutos && horarioMinutos <= fimMinutos;
      });
    } catch (error) {
      logger.error('Erro ao verificar se unidade está aberta:', error);
      return false;
    }
  }

  /**
   * Converter horário "HH:MM" para minutos
   * @param {string} time - Horário no formato "HH:MM"
   * @returns {number} Minutos desde 00:00
   */
  static timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Validar formato de horários
   * @param {Array} periodos - Array de períodos {inicio, fim}
   * @returns {boolean} True se válido
   */
  static validateHorarios(periodos) {
    if (!Array.isArray(periodos)) return false;
    
    return periodos.every(periodo => {
      if (!periodo.inicio || !periodo.fim) return false;
      
      const regexHorario = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!regexHorario.test(periodo.inicio) || !regexHorario.test(periodo.fim)) {
        return false;
      }
      
      const inicioMinutos = this.timeToMinutes(periodo.inicio);
      const fimMinutos = this.timeToMinutes(periodo.fim);
      
      return fimMinutos > inicioMinutos;
    });
  }
}

module.exports = HorarioFuncionamentoUnidade;

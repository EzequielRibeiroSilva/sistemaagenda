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

    try {
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

const BaseModel = require('./BaseModel');
const { db } = require('../config/knex');
const logger = require('./../utils/logger');

/**
 * Modelo para gerenciar exceções de calendário das unidades
 *
 * Estrutura dos dados:
 * - unidade_id: ID da unidade/local
 * - data_inicio: Data de início do bloqueio (inclusivo)
 * - data_fim: Data de fim do bloqueio (inclusivo)
 * - tipo: Categoria da exceção ('Feriado', 'Férias', 'Evento Especial', 'Manutenção', 'Outro')
 * - descricao: Descrição opcional da exceção
 * 
 * Casos de uso:
 * - Bloquear feriados nacionais/municipais
 * - Definir períodos de férias coletivas
 * - Marcar eventos especiais ou manutenções
 * - Fechamentos temporários
 */
class ExcecaoCalendario extends BaseModel {
  constructor() {
    super('unidade_excecoes_calendario');
  }

  static get tableName() {
    return 'unidade_excecoes_calendario';
  }

  /**
   * Buscar todas as exceções de uma unidade específica
   * @param {number} unidadeId - ID da unidade
   * @param {Object} options - Opções de filtro
   * @param {Date} options.dataInicio - Filtrar exceções a partir desta data
   * @param {Date} options.dataFim - Filtrar exceções até esta data
   * @returns {Promise<Array>} Array com exceções da unidade
   */
  static async findByUnidade(unidadeId, options = {}) {
    try {
      let query = db('unidade_excecoes_calendario')
        .where('unidade_id', unidadeId)
        .orderBy('data_inicio', 'asc');

      // Filtrar por período se fornecido
      if (options.dataInicio) {
        query = query.where('data_fim', '>=', options.dataInicio);
      }
      if (options.dataFim) {
        query = query.where('data_inicio', '<=', options.dataFim);
      }

      const excecoes = await query;
      return excecoes;
    } catch (error) {
      logger.error('❌ [ExcecaoCalendario] Erro ao buscar exceções da unidade:', error);
      throw error;
    }
  }

  /**
   * Buscar exceção por ID
   * @param {number} id - ID da exceção
   * @returns {Promise<Object|null>} Exceção encontrada ou null
   */
  static async findById(id) {
    try {
      const excecao = await db('unidade_excecoes_calendario')
        .where('id', id)
        .first();

      return excecao || null;
    } catch (error) {
      logger.error('❌ [ExcecaoCalendario] Erro ao buscar exceção por ID:', error);
      throw error;
    }
  }

  /**
   * Verificar se uma data específica está bloqueada por exceção
   * @param {number} unidadeId - ID da unidade
   * @param {Date|string} data - Data a verificar (formato YYYY-MM-DD)
   * @returns {Promise<Object|null>} Exceção que bloqueia a data ou null
   */
  static async isDataBloqueada(unidadeId, data) {
    try {
      const dataStr = typeof data === 'string'
        ? data
        : data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      const excecao = await db('unidade_excecoes_calendario')
        .where('unidade_id', unidadeId)
        .where('data_inicio', '<=', dataStr)
        .where('data_fim', '>=', dataStr)
        .whereNull('hora_inicio')
        .whereNull('hora_fim')
        .first();

      return excecao || null;
    } catch (error) {
      logger.error('❌ [ExcecaoCalendario] Erro ao verificar se data está bloqueada:', error);
      throw error;
    }
  }

  /**
   * Buscar todas as exceções que cobrem uma data específica (incluindo bloqueios parciais por horário)
   * @param {number} unidadeId
   * @param {Date|string} data - formato YYYY-MM-DD
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<Array>} Array de exceções
   */
  static async findByUnidadeAndDate(unidadeId, data, trx = null) {
    const query = trx ? trx('unidade_excecoes_calendario') : db('unidade_excecoes_calendario');

    try {
      const dataStr = typeof data === 'string'
        ? data
        : data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      const excecoes = await query
        .where('unidade_id', unidadeId)
        .where('data_inicio', '<=', dataStr)
        .where('data_fim', '>=', dataStr)
        .orderBy([{ column: 'data_inicio', order: 'asc' }, { column: 'hora_inicio', order: 'asc' }]);

      return Array.isArray(excecoes) ? excecoes : [];
    } catch (error) {
      logger.error('❌ [ExcecaoCalendario] Erro ao buscar exceções por data:', error);
      throw error;
    }
  }

  /**
   * Criar nova exceção de calendário
   * @param {Object} excecaoData - Dados da exceção
   * @param {number} excecaoData.unidade_id - ID da unidade
   * @param {Date|string} excecaoData.data_inicio - Data de início
   * @param {Date|string} excecaoData.data_fim - Data de fim
   * @param {string} excecaoData.tipo - Tipo da exceção
   * @param {string} excecaoData.descricao - Descrição opcional
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<Object>} Exceção criada
   */
  static async create(excecaoData, trx = null) {
    const query = trx ? trx('unidade_excecoes_calendario') : db('unidade_excecoes_calendario');

    try {
      // Validar dados
      this.validateExcecaoData(excecaoData);

      // Verificar sobreposição com exceções existentes
      const sobreposicao = await this.checkSobreposicao(
        excecaoData.unidade_id,
        excecaoData.data_inicio,
        excecaoData.data_fim,
        excecaoData.hora_inicio,
        excecaoData.hora_fim,
        null, // id null para criação
        trx
      );

      if (sobreposicao) {
        const error = new Error(
          `Já existe uma exceção cadastrada neste período: ${sobreposicao.descricao || sobreposicao.tipo} (${sobreposicao.data_inicio} a ${sobreposicao.data_fim})`
        );
        error.code = 'EXCECAO_SOBREPOSTA';
        throw error;
      }

      const dadosParaInserir = {
        unidade_id: excecaoData.unidade_id,
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
      logger.error('❌ [ExcecaoCalendario] Erro ao criar exceção:', error);
      throw error;
    }
  }

  /**
   * Atualizar exceção existente
   * @param {number} id - ID da exceção
   * @param {Object} excecaoData - Dados para atualização
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<Object>} Exceção atualizada
   */
  static async update(id, excecaoData, trx = null) {
    const query = trx ? trx('unidade_excecoes_calendario') : db('unidade_excecoes_calendario');

    try {
      // Buscar exceção existente
      const excecaoExistente = await this.findById(id);
      if (!excecaoExistente) {
        const error = new Error('Exceção não encontrada');
        error.code = 'EXCECAO_NAO_ENCONTRADA';
        throw error;
      }

      // Validar dados se fornecidos
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

        // Verificar sobreposição com outras exceções
        const sobreposicao = await this.checkSobreposicao(
          excecaoExistente.unidade_id,
          dataInicio,
          dataFim,
          horaInicio,
          horaFim,
          id, // excluir a própria exceção da verificação
          trx
        );

        if (sobreposicao) {
          const error = new Error(
            `Já existe uma exceção cadastrada neste período: ${sobreposicao.descricao || sobreposicao.tipo} (${sobreposicao.data_inicio} a ${sobreposicao.data_fim})`
          );
          error.code = 'EXCECAO_SOBREPOSTA';
          throw error;
        }
      }

      const dadosParaAtualizar = {
        ...excecaoData,
        updated_at: new Date()
      };

      // Remover campos undefined
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
      logger.error('❌ [ExcecaoCalendario] Erro ao atualizar exceção:', error);
      throw error;
    }
  }

  /**
   * Deletar exceção
   * @param {number} id - ID da exceção
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<boolean>} True se deletado com sucesso
   */
  static async delete(id, trx = null) {
    const query = trx ? trx('unidade_excecoes_calendario') : db('unidade_excecoes_calendario');

    try {
      const deletedCount = await query.where('id', id).del();
      return deletedCount > 0;
    } catch (error) {
      logger.error('❌ [ExcecaoCalendario] Erro ao deletar exceção:', error);
      throw error;
    }
  }

  /**
   * Deletar todas as exceções de uma unidade
   * @param {number} unidadeId - ID da unidade
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<number>} Número de exceções deletadas
   */
  static async deleteByUnidade(unidadeId, trx = null) {
    const query = trx ? trx('unidade_excecoes_calendario') : db('unidade_excecoes_calendario');

    try {
      const deletedCount = await query.where('unidade_id', unidadeId).del();
      return deletedCount;
    } catch (error) {
      logger.error('❌ [ExcecaoCalendario] Erro ao deletar exceções da unidade:', error);
      throw error;
    }
  }

  /**
   * Verificar sobreposição de datas com exceções existentes
   * @param {number} unidadeId - ID da unidade
   * @param {Date|string} dataInicio - Data de início
   * @param {Date|string} dataFim - Data de fim
   * @param {string|null} horaInicio - Hora de início (HH:MM) para bloqueios parciais
   * @param {string|null} horaFim - Hora de fim (HH:MM) para bloqueios parciais
   * @param {number|null} excludeId - ID da exceção a excluir da verificação (para updates)
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<Object|null>} Exceção sobreposta ou null
   */
  static async checkSobreposicao(unidadeId, dataInicio, dataFim, horaInicio = null, horaFim = null, excludeId = null, trx = null) {
    const query = trx ? trx('unidade_excecoes_calendario') : db('unidade_excecoes_calendario');

    try {
      const realQuery = query;

      let candidatosQuery = realQuery
        .where('unidade_id', unidadeId)
        .where(function() {
          // sobreposição de datas (intervalos inclusivos)
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

        // Se qualquer um for dia inteiro, conflita com qualquer outro no range de datas
        if (newIsFullDay || existingIsFullDay) {
          return existing;
        }

        // Ambos têm horários: checar sobreposição de intervalo
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
      logger.error('❌ [ExcecaoCalendario] Erro ao verificar sobreposição:', error);
      throw error;
    }
  }

  /**
   * Validar dados da exceção
   * @param {Object} excecaoData - Dados para validar
   * @throws {Error} Se dados inválidos
   */
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

    // Se um horário foi fornecido, exigir ambos e validar ordem
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

module.exports = ExcecaoCalendario;

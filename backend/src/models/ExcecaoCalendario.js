const BaseModel = require('./BaseModel');
const { db } = require('../config/knex');

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
      console.error('❌ [ExcecaoCalendario] Erro ao buscar exceções da unidade:', error);
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
      console.error('❌ [ExcecaoCalendario] Erro ao buscar exceção por ID:', error);
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
      const dataStr = typeof data === 'string' ? data : data.toISOString().split('T')[0];

      const excecao = await db('unidade_excecoes_calendario')
        .where('unidade_id', unidadeId)
        .where('data_inicio', '<=', dataStr)
        .where('data_fim', '>=', dataStr)
        .first();

      return excecao || null;
    } catch (error) {
      console.error('❌ [ExcecaoCalendario] Erro ao verificar se data está bloqueada:', error);
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
        tipo: excecaoData.tipo || 'Outro',
        descricao: excecaoData.descricao || null,
        created_at: new Date(),
        updated_at: new Date()
      };

      const [excecaoCriada] = await query.insert(dadosParaInserir).returning('*');
      return excecaoCriada;
    } catch (error) {
      console.error('❌ [ExcecaoCalendario] Erro ao criar exceção:', error);
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
      if (excecaoData.data_inicio || excecaoData.data_fim) {
        const dataInicio = excecaoData.data_inicio || excecaoExistente.data_inicio;
        const dataFim = excecaoData.data_fim || excecaoExistente.data_fim;
        
        this.validateExcecaoData({ data_inicio: dataInicio, data_fim: dataFim });

        // Verificar sobreposição com outras exceções
        const sobreposicao = await this.checkSobreposicao(
          excecaoExistente.unidade_id,
          dataInicio,
          dataFim,
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
      console.error('❌ [ExcecaoCalendario] Erro ao atualizar exceção:', error);
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
      console.error('❌ [ExcecaoCalendario] Erro ao deletar exceção:', error);
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
      console.error('❌ [ExcecaoCalendario] Erro ao deletar exceções da unidade:', error);
      throw error;
    }
  }

  /**
   * Verificar sobreposição de datas com exceções existentes
   * @param {number} unidadeId - ID da unidade
   * @param {Date|string} dataInicio - Data de início
   * @param {Date|string} dataFim - Data de fim
   * @param {number|null} excludeId - ID da exceção a excluir da verificação (para updates)
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<Object|null>} Exceção sobreposta ou null
   */
  static async checkSobreposicao(unidadeId, dataInicio, dataFim, excludeId = null, trx = null) {
    const query = trx ? trx('unidade_excecoes_calendario') : db('unidade_excecoes_calendario');

    try {
      let sobreposicaoQuery = query
        .where('unidade_id', unidadeId)
        .where(function() {
          // Verifica se há sobreposição de períodos
          // Caso 1: Nova exceção começa durante uma exceção existente
          this.where(function() {
            this.where('data_inicio', '<=', dataInicio)
              .where('data_fim', '>=', dataInicio);
          })
          // Caso 2: Nova exceção termina durante uma exceção existente
          .orWhere(function() {
            this.where('data_inicio', '<=', dataFim)
              .where('data_fim', '>=', dataFim);
          })
          // Caso 3: Nova exceção engloba uma exceção existente
          .orWhere(function() {
            this.where('data_inicio', '>=', dataInicio)
              .where('data_fim', '<=', dataFim);
          });
        });

      // Excluir a própria exceção se for update
      if (excludeId) {
        sobreposicaoQuery = sobreposicaoQuery.whereNot('id', excludeId);
      }

      const sobreposicao = await sobreposicaoQuery.first();
      return sobreposicao || null;
    } catch (error) {
      console.error('❌ [ExcecaoCalendario] Erro ao verificar sobreposição:', error);
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

    const tiposValidos = ['Feriado', 'Férias', 'Evento Especial', 'Manutenção', 'Outro'];
    if (excecaoData.tipo && !tiposValidos.includes(excecaoData.tipo)) {
      throw new Error(`Tipo inválido. Tipos válidos: ${tiposValidos.join(', ')}`);
    }
  }
}

module.exports = ExcecaoCalendario;

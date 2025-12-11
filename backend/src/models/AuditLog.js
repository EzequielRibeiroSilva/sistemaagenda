const BaseModel = require('./BaseModel');
const logger = require('./../utils/logger');

/**
 * Modelo para Logs de Auditoria
 * FASE 2.1 - Sistema de Auditoria Completo
 * 
 * Responsável por persistir e consultar logs de ações críticas
 * realizadas no sistema para fins de auditoria e compliance.
 */
class AuditLog extends BaseModel {
  constructor() {
    super('audit_logs');
  }

  /**
   * Criar um novo log de auditoria
   * @param {Object} logData - Dados do log
   * @returns {Promise<Object>} Log criado
   */
  async createLog(logData) {
    const {
      usuario_id,
      usuario_email,
      usuario_nome,
      usuario_role,
      action,
      resource_type,
      resource_id,
      method,
      endpoint,
      ip_address,
      user_agent,
      status_code,
      request_data,
      response_data,
      error_message,
      unidade_id,
      duration_ms
    } = logData;

    try {
      const [log] = await this.db(this.tableName)
        .insert({
          usuario_id,
          usuario_email,
          usuario_nome,
          usuario_role,
          action,
          resource_type,
          resource_id,
          method,
          endpoint,
          ip_address,
          user_agent,
          status_code,
          request_data: request_data ? JSON.stringify(request_data) : null,
          response_data: response_data ? JSON.stringify(response_data) : null,
          error_message,
          unidade_id,
          duration_ms,
          created_at: this.db.fn.now()
        })
        .returning('*');

      return log;
    } catch (error) {
      // Não lançar erro para não quebrar a aplicação se auditoria falhar
      logger.error('❌ [AuditLog] Erro ao criar log de auditoria:', error.message);
      return null;
    }
  }

  /**
   * Buscar logs por usuário
   * @param {number} usuarioId - ID do usuário
   * @param {Object} options - Opções de paginação e filtros
   * @returns {Promise<Array>} Lista de logs
   */
  async findByUsuario(usuarioId, options = {}) {
    const {
      limit = 100,
      offset = 0,
      action = null,
      resource_type = null,
      startDate = null,
      endDate = null
    } = options;

    let query = this.db(this.tableName)
      .where('usuario_id', usuarioId);

    if (action) {
      query = query.where('action', action);
    }

    if (resource_type) {
      query = query.where('resource_type', resource_type);
    }

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }

    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    return await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select('*');
  }

  /**
   * Buscar logs por unidade
   * @param {number} unidadeId - ID da unidade
   * @param {Object} options - Opções de paginação e filtros
   * @returns {Promise<Array>} Lista de logs
   */
  async findByUnidade(unidadeId, options = {}) {
    const {
      limit = 100,
      offset = 0,
      action = null,
      resource_type = null,
      startDate = null,
      endDate = null
    } = options;

    let query = this.db(this.tableName)
      .where('unidade_id', unidadeId);

    if (action) {
      query = query.where('action', action);
    }

    if (resource_type) {
      query = query.where('resource_type', resource_type);
    }

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }

    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    return await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select('*');
  }

  /**
   * Buscar logs por recurso
   * @param {string} resourceType - Tipo do recurso
   * @param {number} resourceId - ID do recurso
   * @param {Object} options - Opções de paginação
   * @returns {Promise<Array>} Lista de logs
   */
  async findByResource(resourceType, resourceId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    return await this.db(this.tableName)
      .where({
        resource_type: resourceType,
        resource_id: resourceId
      })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select('*');
  }

  /**
   * Buscar todos os logs (apenas MASTER)
   * @param {Object} options - Opções de paginação e filtros
   * @returns {Promise<Object>} Logs e total
   */
  async findAll(options = {}) {
    const {
      limit = 100,
      offset = 0,
      action = null,
      resource_type = null,
      usuario_id = null,
      unidade_id = null,
      status_code = null,
      startDate = null,
      endDate = null
    } = options;

    let query = this.db(this.tableName);

    if (action) {
      query = query.where('action', action);
    }

    if (resource_type) {
      query = query.where('resource_type', resource_type);
    }

    if (usuario_id) {
      query = query.where('usuario_id', usuario_id);
    }

    if (unidade_id) {
      query = query.where('unidade_id', unidade_id);
    }

    if (status_code) {
      query = query.where('status_code', status_code);
    }

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }

    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    // Buscar total de registros
    const [{ count }] = await query.clone().count('* as count');

    // Buscar logs paginados
    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select('*');

    return {
      logs,
      total: parseInt(count),
      limit,
      offset
    };
  }

  /**
   * Buscar estatísticas de logs
   * @param {Object} filters - Filtros opcionais
   * @returns {Promise<Object>} Estatísticas
   */
  async getStatistics(filters = {}) {
    const {
      usuario_id = null,
      unidade_id = null,
      startDate = null,
      endDate = null
    } = filters;

    let query = this.db(this.tableName);

    if (usuario_id) {
      query = query.where('usuario_id', usuario_id);
    }

    if (unidade_id) {
      query = query.where('unidade_id', unidade_id);
    }

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }

    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    // Total de logs
    const [{ total }] = await query.clone().count('* as total');

    // Logs por ação
    const byAction = await query.clone()
      .select('action')
      .count('* as count')
      .groupBy('action')
      .orderBy('count', 'desc')
      .limit(10);

    // Logs por tipo de recurso
    const byResourceType = await query.clone()
      .select('resource_type')
      .count('* as count')
      .whereNotNull('resource_type')
      .groupBy('resource_type')
      .orderBy('count', 'desc')
      .limit(10);

    // Logs por status code
    const byStatusCode = await query.clone()
      .select('status_code')
      .count('* as count')
      .whereNotNull('status_code')
      .groupBy('status_code')
      .orderBy('count', 'desc');

    // Logs por usuário (top 10)
    const byUser = await query.clone()
      .select('usuario_id', 'usuario_nome', 'usuario_email')
      .count('* as count')
      .whereNotNull('usuario_id')
      .groupBy('usuario_id', 'usuario_nome', 'usuario_email')
      .orderBy('count', 'desc')
      .limit(10);

    return {
      total: parseInt(total),
      byAction,
      byResourceType,
      byStatusCode,
      byUser
    };
  }

  /**
   * Deletar logs antigos (manutenção)
   * @param {number} daysToKeep - Número de dias para manter
   * @returns {Promise<number>} Número de logs deletados
   */
  async deleteOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deleted = await this.db(this.tableName)
      .where('created_at', '<', cutoffDate)
      .delete();

    return deleted;
  }
}

module.exports = AuditLog;

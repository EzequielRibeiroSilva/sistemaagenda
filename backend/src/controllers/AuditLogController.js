const AuditLog = require('../models/AuditLog');
const logger = require('./../utils/logger');

/**
 * Controller para Logs de Auditoria
 * FASE 2.1 - Sistema de Auditoria Completo
 * 
 * Acesso restrito apenas para MASTER
 */
class AuditLogController {
  constructor() {
    this.model = new AuditLog();
  }

  /**
   * Listar logs de auditoria com filtros e paginação
   * GET /api/audit-logs
   * Acesso: MASTER apenas
   */
  async index(req, res) {
    try {
      const {
        limit = 100,
        offset = 0,
        action,
        resource_type,
        usuario_id,
        unidade_id,
        status_code,
        startDate,
        endDate
      } = req.query;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        action,
        resource_type,
        usuario_id: usuario_id ? parseInt(usuario_id) : null,
        unidade_id: unidade_id ? parseInt(unidade_id) : null,
        status_code: status_code ? parseInt(status_code) : null,
        startDate,
        endDate
      };

      const result = await this.model.findAll(options);

      return res.json({
        success: true,
        data: result.logs,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          pages: Math.ceil(result.total / result.limit)
        },
        message: 'Logs de auditoria recuperados com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AuditLogController] Erro ao listar logs:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao listar logs de auditoria',
        message: error.message
      });
    }
  }

  /**
   * Buscar log específico por ID
   * GET /api/audit-logs/:id
   * Acesso: MASTER apenas
   */
  async show(req, res) {
    try {
      const { id } = req.params;

      const log = await this.model.findById(id);

      if (!log) {
        return res.status(404).json({
          success: false,
          error: 'Log não encontrado'
        });
      }

      return res.json({
        success: true,
        data: log,
        message: 'Log recuperado com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AuditLogController] Erro ao buscar log:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar log de auditoria',
        message: error.message
      });
    }
  }

  /**
   * Buscar logs por usuário
   * GET /api/audit-logs/usuario/:usuario_id
   * Acesso: MASTER apenas
   */
  async byUsuario(req, res) {
    try {
      const { usuario_id } = req.params;
      const {
        limit = 100,
        offset = 0,
        action,
        resource_type,
        startDate,
        endDate
      } = req.query;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        action,
        resource_type,
        startDate,
        endDate
      };

      const logs = await this.model.findByUsuario(parseInt(usuario_id), options);

      return res.json({
        success: true,
        data: logs,
        message: 'Logs do usuário recuperados com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AuditLogController] Erro ao buscar logs por usuário:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar logs do usuário',
        message: error.message
      });
    }
  }

  /**
   * Buscar logs por unidade
   * GET /api/audit-logs/unidade/:unidade_id
   * Acesso: MASTER apenas
   */
  async byUnidade(req, res) {
    try {
      const { unidade_id } = req.params;
      const {
        limit = 100,
        offset = 0,
        action,
        resource_type,
        startDate,
        endDate
      } = req.query;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        action,
        resource_type,
        startDate,
        endDate
      };

      const logs = await this.model.findByUnidade(parseInt(unidade_id), options);

      return res.json({
        success: true,
        data: logs,
        message: 'Logs da unidade recuperados com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AuditLogController] Erro ao buscar logs por unidade:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar logs da unidade',
        message: error.message
      });
    }
  }

  /**
   * Buscar logs por recurso
   * GET /api/audit-logs/recurso/:resource_type/:resource_id
   * Acesso: MASTER apenas
   */
  async byResource(req, res) {
    try {
      const { resource_type, resource_id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      const logs = await this.model.findByResource(resource_type, parseInt(resource_id), options);

      return res.json({
        success: true,
        data: logs,
        message: 'Logs do recurso recuperados com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AuditLogController] Erro ao buscar logs por recurso:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar logs do recurso',
        message: error.message
      });
    }
  }

  /**
   * Obter estatísticas de logs
   * GET /api/audit-logs/stats
   * Acesso: MASTER apenas
   */
  async statistics(req, res) {
    try {
      const {
        usuario_id,
        unidade_id,
        startDate,
        endDate
      } = req.query;

      const filters = {
        usuario_id: usuario_id ? parseInt(usuario_id) : null,
        unidade_id: unidade_id ? parseInt(unidade_id) : null,
        startDate,
        endDate
      };

      const stats = await this.model.getStatistics(filters);

      return res.json({
        success: true,
        data: stats,
        message: 'Estatísticas recuperadas com sucesso'
      });
    } catch (error) {
      logger.error('❌ [AuditLogController] Erro ao buscar estatísticas:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas',
        message: error.message
      });
    }
  }

  /**
   * Deletar logs antigos (manutenção)
   * DELETE /api/audit-logs/cleanup
   * Acesso: MASTER apenas
   */
  async cleanup(req, res) {
    try {
      const { daysToKeep = 90 } = req.query;

      const deleted = await this.model.deleteOldLogs(parseInt(daysToKeep));

      return res.json({
        success: true,
        data: { deleted },
        message: `${deleted} logs antigos foram deletados`
      });
    } catch (error) {
      logger.error('❌ [AuditLogController] Erro ao limpar logs:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao limpar logs antigos',
        message: error.message
      });
    }
  }
}

module.exports = AuditLogController;

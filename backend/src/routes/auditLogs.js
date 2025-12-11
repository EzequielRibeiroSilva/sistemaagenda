const express = require('express');
const router = express.Router();
const AuditLogController = require('../controllers/AuditLogController');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const auditLogController = new AuditLogController();

/**
 * ROTAS DE LOGS DE AUDITORIA
 * FASE 2.1 - Sistema de Auditoria Completo
 * 
 * Todas as rotas são restritas apenas para MASTER
 */

/**
 * GET /api/audit-logs/stats
 * Obter estatísticas de logs
 * Acesso: MASTER apenas
 */
router.get('/stats',
  rbacMiddleware.requireRole('MASTER'),
  async (req, res) => {
    await auditLogController.statistics(req, res);
  }
);

/**
 * GET /api/audit-logs/usuario/:usuario_id
 * Buscar logs por usuário
 * Acesso: MASTER apenas
 */
router.get('/usuario/:usuario_id',
  rbacMiddleware.requireRole('MASTER'),
  async (req, res) => {
    await auditLogController.byUsuario(req, res);
  }
);

/**
 * GET /api/audit-logs/unidade/:unidade_id
 * Buscar logs por unidade
 * Acesso: MASTER apenas
 */
router.get('/unidade/:unidade_id',
  rbacMiddleware.requireRole('MASTER'),
  async (req, res) => {
    await auditLogController.byUnidade(req, res);
  }
);

/**
 * GET /api/audit-logs/recurso/:resource_type/:resource_id
 * Buscar logs por recurso
 * Acesso: MASTER apenas
 */
router.get('/recurso/:resource_type/:resource_id',
  rbacMiddleware.requireRole('MASTER'),
  async (req, res) => {
    await auditLogController.byResource(req, res);
  }
);

/**
 * DELETE /api/audit-logs/cleanup
 * Deletar logs antigos (manutenção)
 * Acesso: MASTER apenas
 */
router.delete('/cleanup',
  rbacMiddleware.requireRole('MASTER'),
  async (req, res) => {
    await auditLogController.cleanup(req, res);
  }
);

/**
 * GET /api/audit-logs/:id
 * Buscar log específico por ID
 * Acesso: MASTER apenas
 */
router.get('/:id',
  rbacMiddleware.requireRole('MASTER'),
  async (req, res) => {
    await auditLogController.show(req, res);
  }
);

/**
 * GET /api/audit-logs
 * Listar logs com filtros e paginação
 * Acesso: MASTER apenas
 */
router.get('/',
  rbacMiddleware.requireRole('MASTER'),
  async (req, res) => {
    await auditLogController.index(req, res);
  }
);

module.exports = router;

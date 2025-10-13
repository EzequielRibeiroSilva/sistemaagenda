const express = require('express');
const router = express.Router();
const DiagnosticController = require('../controllers/DiagnosticController');
const { authenticate } = require('../middleware/authMiddleware');

// Instanciar controller
const diagnosticController = new DiagnosticController();

// Middleware de autenticação para todas as rotas
router.use(authenticate());

/**
 * @route GET /diagnostics/admin-agents
 * @desc Auditoria forense de usuários ADMIN e seus agentes
 * @access Private (MASTER ou desenvolvimento)
 * @returns { success: boolean, data: Object, message: string }
 */
router.get('/admin-agents', async (req, res) => {
  await diagnosticController.adminAgentsAudit(req, res);
});

/**
 * @route GET /diagnostics/user-data/:userId
 * @desc Diagnóstico específico de um usuário e seus dados
 * @access Private (MASTER, desenvolvimento ou próprio usuário)
 * @param {string} userId - ID do usuário
 * @returns { success: boolean, data: Object, message: string }
 */
router.get('/user-data/:userId', async (req, res) => {
  await diagnosticController.userDataDiagnosis(req, res);
});

module.exports = router;

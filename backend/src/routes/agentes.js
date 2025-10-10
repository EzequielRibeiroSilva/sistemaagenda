const express = require('express');
const router = express.Router();
const AgenteController = require('../controllers/AgenteController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const { handleAvatarUpload } = require('../middleware/uploadMiddleware');

// Instanciar controller
const agenteController = new AgenteController();

// Middleware de autenticação para todas as rotas
router.use(authenticate());

// Middleware para exigir role ADMIN
router.use(requireRole('ADMIN'));

/**
 * @route GET /agentes
 * @desc Listar agentes (Grid)
 * @access Private (ADMIN)
 * @returns { success: boolean, data: Array<Agent>, message: string }
 */
router.get('/', async (req, res) => {
  await agenteController.index(req, res);
});

/**
 * @route GET /agentes/:id
 * @desc Visualizar agente específico (para edição)
 * @access Private (ADMIN)
 * @param {string} id - ID do agente
 * @returns { success: boolean, data: Agent, message: string }
 */
router.get('/:id', async (req, res) => {
  await agenteController.show(req, res);
});

/**
 * @route POST /agentes
 * @desc Criar novo agente
 * @access Private (ADMIN)
 * @body {object} agenteData - Dados do agente
 * @returns { success: boolean, data: Agent, message: string }
 */
router.post('/', handleAvatarUpload, async (req, res) => {
  await agenteController.store(req, res);
});

/**
 * @route PUT /agentes/:id
 * @desc Atualizar agente (com upload de avatar)
 * @access Private (ADMIN)
 * @param {string} id - ID do agente
 * @body {object} agenteData - Dados do agente
 * @returns { success: boolean, data: Agent, message: string }
 */
router.put('/:id', handleAvatarUpload, async (req, res) => {
  await agenteController.update(req, res);
});

/**
 * @route DELETE /agentes/:id
 * @desc Excluir agente (soft delete)
 * @access Private (ADMIN)
 * @param {string} id - ID do agente
 * @returns { success: boolean, message: string }
 */
router.delete('/:id', async (req, res) => {
  await agenteController.destroy(req, res);
});

module.exports = router;

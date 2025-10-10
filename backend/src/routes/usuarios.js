const express = require('express');
const router = express.Router();
const MasterUserController = require('../controllers/MasterUserController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

const masterUserController = new MasterUserController();

// Middleware de autenticação para todas as rotas
router.use(authenticate());

// Middleware para exigir role MASTER em todas as rotas
router.use(requireRole('MASTER'));

/**
 * GET /api/usuarios
 * Lista todos os usuários ADMIN com busca opcional
 * Query params: ?search=termo_de_busca
 */
router.get('/', async (req, res) => {
  await masterUserController.getAllUsers(req, res);
});

/**
 * POST /api/usuarios
 * Cria um novo usuário ADMIN
 * Body: { nome, email, senha, contato, plano, limite_unidades? }
 */
router.post('/', async (req, res) => {
  await masterUserController.createUser(req, res);
});

/**
 * PUT /api/usuarios/:id
 * Atualiza um usuário existente
 * Body: { nome?, email?, senha?, contato?, plano?, limite_unidades? }
 */
router.put('/:id', async (req, res) => {
  await masterUserController.updateUser(req, res);
});

/**
 * PATCH /api/usuarios/:id/status
 * Altera o status de um usuário
 * Body: { status: 'Ativo' | 'Bloqueado' }
 */
router.patch('/:id/status', async (req, res) => {
  await masterUserController.updateUserStatus(req, res);
});

/**
 * GET /api/usuarios/:id/unidades
 * Lista todas as unidades de um usuário
 */
router.get('/:id/unidades', async (req, res) => {
  await masterUserController.getUserUnits(req, res);
});

/**
 * PATCH /api/unidades/:id/status
 * Altera o status de uma unidade
 * Body: { status: 'Ativo' | 'Bloqueado' }
 */
router.patch('/unidades/:id/status', async (req, res) => {
  await masterUserController.updateUnitStatus(req, res);
});

module.exports = router;

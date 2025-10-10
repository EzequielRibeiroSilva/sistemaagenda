const express = require('express');
const router = express.Router();
const UnidadeController = require('../controllers/UnidadeController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const unidadeController = new UnidadeController();

// Middleware de autenticação para todas as rotas
router.use(authenticate());

// Middleware para exigir role ADMIN ou MASTER em todas as rotas
router.use(rbacMiddleware.requireRole('ADMIN', 'MASTER'));

/**
 * GET /api/unidades
 * Lista unidades do usuário logado (ADMIN vê suas unidades, MASTER vê todas)
 * Query params: ?status=Ativo|Bloqueado
 */
router.get('/',
  rbacMiddleware.auditLog('LISTAR_UNIDADES'),
  async (req, res) => {
    await unidadeController.index(req, res);
  }
);

/**
 * GET /api/unidades/:id
 * Busca uma unidade específica
 * ADMIN só pode ver suas próprias unidades, MASTER pode ver qualquer uma
 */
router.get('/:id',
  rbacMiddleware.auditLog('VISUALIZAR_UNIDADE'),
  async (req, res) => {
    await unidadeController.show(req, res);
  }
);

/**
 * POST /api/unidades
 * Cria nova unidade
 * ADMIN: validação de limite baseada no plano
 * MASTER: sem limite
 */
router.post('/',
  rbacMiddleware.auditLog('CRIAR_UNIDADE'),
  async (req, res) => {
    await unidadeController.store(req, res);
  }
);

/**
 * PUT /api/unidades/:id
 * Atualiza dados da unidade (nome, endereço, telefone)
 * ADMIN só pode editar suas próprias unidades, MASTER pode editar qualquer uma
 */
router.put('/:id',
  rbacMiddleware.auditLog('ATUALIZAR_UNIDADE'),
  async (req, res) => {
    await unidadeController.update(req, res);
  }
);

/**
 * PATCH /api/unidades/:id/status
 * Altera status da unidade (Ativo/Bloqueado)
 * ADMIN só pode alterar status de suas próprias unidades, MASTER pode alterar qualquer uma
 */
router.patch('/:id/status',
  rbacMiddleware.auditLog('ALTERAR_STATUS_UNIDADE'),
  async (req, res) => {
    await unidadeController.updateStatus(req, res);
  }
);

/**
 * DELETE /api/unidades/:id
 * Deleta unidade (apenas MASTER)
 */
router.delete('/:id',
  rbacMiddleware.requireRole('MASTER'),
  rbacMiddleware.auditLog('DELETAR_UNIDADE'),
  async (req, res) => {
    await unidadeController.destroy(req, res);
  }
);

module.exports = router;

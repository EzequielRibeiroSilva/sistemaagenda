const express = require('express');
const router = express.Router();
const CupomController = require('../controllers/CupomController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const cupomController = new CupomController();

/**
 * Rotas públicas (sem autenticação)
 * Nota: A rota pública será registrada em /api/public/cupons/validar
 * através do router de rotas públicas (public.js)
 */

/**
 * Rotas protegidas (requerem autenticação)
 */

// Middleware de autenticação para todas as rotas
router.use(authenticate());

/**
 * GET /api/cupons
 * Listar cupons do usuário
 * Acesso: ADMIN, MASTER
 */
router.get('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('LISTAR_CUPONS'),
  (req, res) => cupomController.index(req, res)
);

/**
 * GET /api/cupons/:id
 * Buscar cupom específico
 * Acesso: ADMIN, MASTER
 */
router.get('/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('VISUALIZAR_CUPOM'),
  (req, res) => cupomController.show(req, res)
);

/**
 * GET /api/cupons/:id/historico
 * Buscar histórico de uso de um cupom
 * Acesso: ADMIN, MASTER
 */
router.get('/:id/historico',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('VISUALIZAR_HISTORICO_CUPOM'),
  (req, res) => cupomController.historico(req, res)
);

/**
 * POST /api/cupons
 * Criar novo cupom
 * Acesso: ADMIN, MASTER
 */
router.post('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('CRIAR_CUPOM'),
  (req, res) => cupomController.store(req, res)
);

/**
 * PUT /api/cupons/:id
 * Atualizar cupom
 * Acesso: ADMIN, MASTER
 */
router.put('/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('ATUALIZAR_CUPOM'),
  (req, res) => cupomController.update(req, res)
);

/**
 * DELETE /api/cupons/:id
 * Deletar cupom
 * Acesso: ADMIN, MASTER
 */
router.delete('/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('DELETAR_CUPOM'),
  (req, res) => cupomController.destroy(req, res)
);

module.exports = router;

const express = require('express');
const router = express.Router();
const ProdutoController = require('../controllers/ProdutoController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const produtoController = new ProdutoController();

// Autenticação para todas as rotas
router.use(authenticate());

// Leitura: ADMIN, MASTER, AGENTE (AGENTE pode precisar listar catálogo no futuro)
router.get('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => produtoController.index(req, res)
);

router.get('/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => produtoController.show(req, res)
);

// Escrita: ADMIN, MASTER
router.use(rbacMiddleware.requireRole('ADMIN', 'MASTER'));

// Ajuste manual de estoque (Sprint 2 - Ledger)
router.post('/:id/ajuste',
  rbacMiddleware.auditLog('AJUSTE_ESTOQUE_PRODUTO'),
  (req, res) => produtoController.ajuste(req, res)
);

router.post('/',
  rbacMiddleware.auditLog('CRIAR_PRODUTO'),
  (req, res) => produtoController.store(req, res)
);

router.put('/:id',
  rbacMiddleware.auditLog('ATUALIZAR_PRODUTO'),
  (req, res) => produtoController.update(req, res)
);

router.delete('/:id',
  rbacMiddleware.auditLog('DELETAR_PRODUTO'),
  (req, res) => produtoController.destroy(req, res)
);

module.exports = router;

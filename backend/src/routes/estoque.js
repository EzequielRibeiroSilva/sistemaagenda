const express = require('express');
const router = express.Router();
const EstoqueController = require('../controllers/EstoqueController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const estoqueController = new EstoqueController();

router.use(authenticate());

router.get('/snapshot',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => estoqueController.snapshot(req, res)
);

router.get('/movimentacoes',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => estoqueController.movimentacoes(req, res)
);

router.post('/movimentacoes',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => estoqueController.criarEntrada(req, res)
);

module.exports = router;

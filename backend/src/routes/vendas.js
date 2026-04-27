const express = require('express');
const router = express.Router();
const VendaController = require('../controllers/VendaController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const vendaController = new VendaController();

router.use(authenticate());

router.get('/avulsas',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('LISTAR_VENDAS_AVULSAS'),
  (req, res) => vendaController.avulsas(req, res)
);

router.post('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  rbacMiddleware.auditLog('CRIAR_VENDA'),
  (req, res) => vendaController.store(req, res)
);

router.post('/:id/estorno',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('ESTORNAR_VENDA'),
  (req, res) => vendaController.estorno(req, res)
);

module.exports = router;

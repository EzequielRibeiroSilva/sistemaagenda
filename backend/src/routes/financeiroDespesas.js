const express = require('express');
const router = express.Router();
const DespesaController = require('../controllers/DespesaController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const controller = new DespesaController();

router.use(authenticate());

// CRUD básico
router.get('/despesas',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('LISTAR_DESPESAS'),
  (req, res) => controller.index(req, res)
);

router.post('/despesas',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('CRIAR_DESPESA'),
  (req, res) => controller.store(req, res)
);

router.put('/despesas/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('ATUALIZAR_DESPESA'),
  (req, res) => controller.update(req, res)
);

router.delete('/despesas/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('DELETAR_DESPESA'),
  (req, res) => controller.destroy(req, res)
);

module.exports = router;

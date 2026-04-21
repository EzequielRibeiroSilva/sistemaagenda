const express = require('express');
const router = express.Router();
const CategoriaController = require('../controllers/CategoriaController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const categoriaController = new CategoriaController();

router.use(authenticate());

router.get('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => categoriaController.index(req, res)
);

router.post('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('CRIAR_CATEGORIA'),
  (req, res) => categoriaController.store(req, res)
);

module.exports = router;

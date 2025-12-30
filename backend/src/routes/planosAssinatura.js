const express = require('express');
const router = express.Router();
const PlanoAssinaturaController = require('../controllers/PlanoAssinaturaController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const planoAssinaturaController = new PlanoAssinaturaController();

// Autenticação obrigatória
router.use(authenticate());

// Leitura: ADMIN e MASTER
router.get('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('LISTAR_PLANOS_ASSINATURA'),
  (req, res) => planoAssinaturaController.list(req, res)
);

router.get('/:planoId',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('VISUALIZAR_PLANO_ASSINATURA'),
  (req, res) => planoAssinaturaController.showGlobal(req, res)
);

// Escrita: ADMIN e MASTER
router.use(rbacMiddleware.requireRole('ADMIN', 'MASTER'));

router.post('/',
  rbacMiddleware.auditLog('CRIAR_PLANO_ASSINATURA'),
  (req, res) => planoAssinaturaController.storeGlobal(req, res)
);

router.put('/:planoId',
  rbacMiddleware.auditLog('ATUALIZAR_PLANO_ASSINATURA'),
  (req, res) => planoAssinaturaController.updateGlobal(req, res)
);

router.delete('/:planoId',
  rbacMiddleware.auditLog('DELETAR_PLANO_ASSINATURA'),
  (req, res) => planoAssinaturaController.destroyGlobal(req, res)
);

module.exports = router;

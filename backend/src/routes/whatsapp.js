const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const WhatsAppController = require('../controllers/WhatsAppController');

const whatsAppController = new WhatsAppController();

router.get('/status',
  authenticate(),
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  async (req, res) => {
    await whatsAppController.status(req, res);
  }
);

router.post('/connect',
  authenticate(),
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  async (req, res) => {
    await whatsAppController.connect(req, res);
  }
);

router.post('/disconnect',
  authenticate(),
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  async (req, res) => {
    await whatsAppController.disconnect(req, res);
  }
);

module.exports = router;

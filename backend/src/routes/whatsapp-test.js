/**
 * Routes: WhatsApp Test
 * Descrição: Rotas para testes e debug do WhatsApp
 */

const express = require('express');
const router = express.Router();
const WhatsAppTestController = require('../controllers/WhatsAppTestController');

const whatsAppTestController = new WhatsAppTestController();

/**
 * POST /api/whatsapp-test/send
 * Testar envio de mensagem WhatsApp
 * Body: { telefone, nome? }
 */
router.post('/send', async (req, res) => {
  await whatsAppTestController.testMessage(req, res);
});

/**
 * GET /api/whatsapp-test/config
 * Obter configurações do WhatsApp
 */
router.get('/config', async (req, res) => {
  await whatsAppTestController.getConfig(req, res);
});

/**
 * POST /api/whatsapp-test/preview
 * Gerar preview da mensagem
 * Body: { telefone?, nome? }
 */
router.post('/preview', async (req, res) => {
  await whatsAppTestController.previewMessage(req, res);
});

/**
 * GET /api/whatsapp-test/connection
 * Testar conectividade com Evolution API
 */
router.get('/connection', async (req, res) => {
  await whatsAppTestController.testConnection(req, res);
});

module.exports = router;

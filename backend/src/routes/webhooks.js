const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');
const MercadoPagoWebhookController = require('../controllers/MercadoPagoWebhookController');
const MercadoPagoOAuthController = require('../controllers/MercadoPagoOAuthController');

const webhookController = new WebhookController();
const mercadoPagoWebhookController = new MercadoPagoWebhookController();
const mercadoPagoOAuthController = new MercadoPagoOAuthController();

router.post('/whatsapp', async (req, res) => {
  await webhookController.whatsapp(req, res);
});

router.post('/mercadopago', async (req, res) => {
  await mercadoPagoWebhookController.mercadopago(req, res);
});

// Callback OAuth (redirect_uri) - público (sem JWT)
router.get('/mercadopago/callback', async (req, res) => {
  await mercadoPagoOAuthController.handleRedirect(req, res);
});

module.exports = router;

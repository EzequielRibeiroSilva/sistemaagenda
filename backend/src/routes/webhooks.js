const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');
const MercadoPagoWebhookController = require('../controllers/MercadoPagoWebhookController');

const webhookController = new WebhookController();
const mercadoPagoWebhookController = new MercadoPagoWebhookController();

router.post('/whatsapp', async (req, res) => {
  await webhookController.whatsapp(req, res);
});

router.post('/mercadopago', async (req, res) => {
  await mercadoPagoWebhookController.mercadopago(req, res);
});

module.exports = router;

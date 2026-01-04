const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');

const webhookController = new WebhookController();

router.post('/whatsapp', async (req, res) => {
  await webhookController.whatsapp(req, res);
});

module.exports = router;

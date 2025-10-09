const express = require('express');
const router = express.Router();
const EvolutionApiController = require('../controllers/EvolutionApiController');

// Instanciar controlador
const evolutionController = new EvolutionApiController();

/**
 * @route GET /api/evolution/status
 * @desc Verificar status da Evolution API
 * @access Private
 * @returns { success: boolean, data: object, message: string }
 */
router.get('/status', async (req, res) => {
  await evolutionController.status(req, res);
});

/**
 * @route GET /api/evolution/test
 * @desc Teste de conectividade com Evolution API
 * @access Private
 * @returns { success: boolean, data: object, message: string }
 */
router.get('/test', async (req, res) => {
  await evolutionController.test(req, res);
});

/**
 * @route GET /api/evolution/config
 * @desc Mostrar configuração atual da Evolution API
 * @access Private
 * @returns { success: boolean, data: object, message: string }
 */
router.get('/config', async (req, res) => {
  await evolutionController.config(req, res);
});

/**
 * @route POST /api/evolution/send-test
 * @desc Enviar mensagem de teste
 * @access Private
 * @body { numero: string }
 * @returns { success: boolean, data: object, message: string }
 */
router.post('/send-test', async (req, res) => {
  await evolutionController.sendTest(req, res);
});

/**
 * @route POST /api/evolution/send-message
 * @desc Enviar mensagem personalizada
 * @access Private
 * @body { numero: string, mensagem: string }
 * @returns { success: boolean, data: object, message: string }
 */
router.post('/send-message', async (req, res) => {
  await evolutionController.sendMessage(req, res);
});

module.exports = router;

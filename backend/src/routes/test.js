const express = require('express');
const TestController = require('../controllers/TestController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();
const testController = new TestController();

/**
 * Rotas de teste para debugging e validação
 * Todas as rotas requerem autenticação ADMIN
 */

// Middleware de autenticação para todas as rotas de teste
router.use(authenticate());

// Middleware adicional para verificar se é ADMIN
router.use((req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado - apenas ADMINs podem executar testes'
    });
  }
  next();
});

/**
 * @route POST /api/test/whatsapp
 * @desc Teste isolado de envio de mensagem WhatsApp
 * @access Private (ADMIN only)
 * @body { telefone: string, mensagem?: string }
 */
router.post('/whatsapp', testController.testWhatsApp.bind(testController));

/**
 * @route POST /api/test/whatsapp/agendamento
 * @desc Teste do template de confirmação de agendamento
 * @access Private (ADMIN only)
 * @body { agendamento_id: number }
 */
router.post('/whatsapp/agendamento', testController.testWhatsAppAgendamento.bind(testController));

/**
 * @route GET /api/test/whatsapp/status
 * @desc Verificar status e conectividade da Evolution API
 * @access Private (ADMIN only)
 */
router.get('/whatsapp/status', testController.testWhatsAppStatus.bind(testController));

module.exports = router;

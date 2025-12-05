/**
 * Rotas: Notificações WhatsApp
 * Descrição: Endpoints para visualização de notificações enviadas (ADMIN apenas)
 * Base: /api/notificacoes
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const NotificacaoController = require('../controllers/NotificacaoController');

const notificacaoController = new NotificacaoController();

// Aplicar autenticação em todas as rotas
router.use(authenticate());

// ✅ GET /api/notificacoes/stats - Estatísticas de notificações (ADMIN apenas)
router.get('/stats',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('VISUALIZAR_ESTATISTICAS_NOTIFICACOES'),
  async (req, res) => {
    await notificacaoController.stats(req, res);
  }
);

// ✅ GET /api/notificacoes - Listar notificações com paginação (ADMIN apenas)
router.get('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('LISTAR_NOTIFICACOES'),
  async (req, res) => {
    await notificacaoController.index(req, res);
  }
);

// ✅ GET /api/notificacoes/:id - Buscar notificação por ID (ADMIN apenas)
router.get('/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('VISUALIZAR_NOTIFICACAO'),
  async (req, res) => {
    await notificacaoController.show(req, res);
  }
);

module.exports = router;

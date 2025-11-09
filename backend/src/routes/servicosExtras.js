const express = require('express');
const router = express.Router();
const ServicoExtraController = require('../controllers/ServicoExtraController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const servicoExtraController = new ServicoExtraController();

// ✅ Middleware de autenticação para todas as rotas
router.use(authenticate());

/**
 * GET /api/servicos/extras/list
 * Listagem leve de serviços extras para formulários
 * ✅ CORREÇÃO: AGENTE precisa ver serviços extras para o calendário
 */
router.get('/list',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => servicoExtraController.list(req, res)
);

/**
 * GET /api/servicos/extras
 * Listar serviços extras
 * ✅ CORREÇÃO: AGENTE precisa ver serviços extras para exibir cards e filtros
 */
router.get('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => servicoExtraController.index(req, res)
);

/**
 * GET /api/servicos/extras/:id
 * Buscar serviço extra por ID
 * ✅ CORREÇÃO: AGENTE precisa ver detalhes de serviços extras
 */
router.get('/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => servicoExtraController.show(req, res)
);

// ✅ Middleware para exigir role ADMIN ou MASTER APENAS em operações de escrita
router.use(rbacMiddleware.requireRole('ADMIN', 'MASTER'));

/**
 * POST /api/servicos/extras
 * Criar novo serviço extra
 * Acesso: ADMIN, MASTER
 */
router.post('/', (req, res) => servicoExtraController.store(req, res));

/**
 * PUT /api/servicos/extras/:id
 * Atualizar serviço extra
 * Acesso: ADMIN, MASTER
 */
router.put('/:id', (req, res) => servicoExtraController.update(req, res));

/**
 * DELETE /api/servicos/extras/:id
 * Deletar serviço extra
 * Acesso: ADMIN, MASTER
 */
router.delete('/:id', (req, res) => servicoExtraController.destroy(req, res));

module.exports = router;

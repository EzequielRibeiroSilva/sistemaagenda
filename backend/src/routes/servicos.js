const express = require('express');
const router = express.Router();
const ServicoController = require('../controllers/ServicoController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const servicoController = new ServicoController();

// ✅ Middleware de autenticação para todas as rotas
router.use(authenticate());

/**
 * GET /api/servicos/list
 * Listagem leve de serviços para formulários
 * ✅ CORREÇÃO: AGENTE precisa ver serviços para o calendário
 */
router.get('/list',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => servicoController.list(req, res)
);

/**
 * GET /api/servicos
 * Listar serviços
 * ✅ CORREÇÃO: AGENTE precisa ver serviços para exibir cards e filtros
 */
router.get('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => servicoController.index(req, res)
);

/**
 * GET /api/servicos/categoria/:categoriaId
 * Buscar serviços por categoria
 * ✅ CORREÇÃO: AGENTE precisa filtrar serviços por categoria
 */
router.get('/categoria/:categoriaId',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => servicoController.byCategoria(req, res)
);

/**
 * GET /api/servicos/agente/:agenteId
 * Buscar serviços por agente
 * ✅ CORREÇÃO: AGENTE precisa ver seus próprios serviços
 */
router.get('/agente/:agenteId',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => servicoController.byAgente(req, res)
);

/**
 * GET /api/servicos/:id
 * Buscar serviço por ID
 * ✅ CORREÇÃO: AGENTE precisa ver detalhes de serviços
 */
router.get('/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  (req, res) => servicoController.show(req, res)
);

// ✅ Middleware para exigir role ADMIN ou MASTER APENAS em operações de escrita
router.use(rbacMiddleware.requireRole('ADMIN', 'MASTER'));

/**
 * POST /api/servicos
 * Criar novo serviço
 * Acesso: ADMIN, MASTER
 */
router.post('/', 
  rbacMiddleware.auditLog('CRIAR_SERVICO'),
  (req, res) => servicoController.store(req, res)
);

/**
 * PUT /api/servicos/:id
 * Atualizar serviço
 * Acesso: ADMIN, MASTER
 */
router.put('/:id', 
  rbacMiddleware.auditLog('ATUALIZAR_SERVICO'),
  (req, res) => servicoController.update(req, res)
);

/**
 * DELETE /api/servicos/:id
 * Deletar serviço
 * Acesso: ADMIN, MASTER
 */
router.delete('/:id', 
  rbacMiddleware.auditLog('DELETAR_SERVICO'),
  (req, res) => servicoController.destroy(req, res)
);

module.exports = router;

const express = require('express');
const router = express.Router();
const ClienteController = require('../controllers/ClienteController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const multiTenantMiddleware = require('../middleware/multiTenantMiddleware');

const clienteController = new ClienteController();

// Middleware de autenticação para todas as rotas
router.use(authenticate());

/**
 * GET /api/clientes/search
 * Busca clientes por nome ou telefone para modal de agendamento
 * Query params: ?q=termo_busca
 * ✅ CORREÇÃO CRÍTICA: AGENTE precisa buscar clientes para criar agendamentos
 */
router.get('/search',
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  async (req, res) => {
    await clienteController.search(req, res);
  }
);

/**
 * GET /api/clientes/:id/pontos
 * Buscar pontos disponíveis de um cliente
 * Query params: ?unidade_id=40
 * ✅ AGENTE e ADMIN podem consultar pontos
 */
router.get('/:id/pontos',
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  async (req, res) => {
    await clienteController.getPontos(req, res);
  }
);

// ✅ Middleware para exigir role ADMIN APENAS nas rotas que não são de busca
// Movido para depois da rota /search para não bloquear AGENTEs
router.use(rbacMiddleware.requireRole('ADMIN'));

/**
 * GET /api/clientes
 * Lista clientes da unidade do usuário logado com filtros opcionais
 * Query params: ?nome=termo&telefone=numero&id=123&is_assinante=true&status=Ativo
 */
router.get('/',
  ...multiTenantMiddleware.multiTenantList('LISTAR_CLIENTES'),
  rbacMiddleware.auditLog('LISTAR_CLIENTES'),
  async (req, res) => {
    await clienteController.list(req, res);
  }
);

/**
 * POST /api/clientes
 * Criar novo cliente na unidade do usuário logado
 * Body: { primeiro_nome, ultimo_nome, telefone, email?, is_assinante?, data_inicio_assinatura? }
 */
router.post('/',
  ...multiTenantMiddleware.multiTenantCRUD('CRIAR_CLIENTE'),
  rbacMiddleware.auditLog('CRIAR_CLIENTE'),
  async (req, res) => {
    await clienteController.create(req, res);
  }
);

/**
 * GET /api/clientes/:id
 * Buscar cliente específico (apenas da unidade do usuário)
 */
router.get('/:id',
  multiTenantMiddleware.requireUnidadeId(),
  multiTenantMiddleware.auditMultiTenantAccess('VISUALIZAR_CLIENTE'),
  rbacMiddleware.auditLog('VISUALIZAR_CLIENTE'),
  async (req, res) => {
    await clienteController.show(req, res);
  }
);

/**
 * PUT /api/clientes/:id
 * Atualizar cliente (apenas da unidade do usuário)
 */
router.put('/:id',
  ...multiTenantMiddleware.multiTenantCRUD('ATUALIZAR_CLIENTE'),
  rbacMiddleware.auditLog('ATUALIZAR_CLIENTE'),
  async (req, res) => {
    await clienteController.update(req, res);
  }
);

/**
 * DELETE /api/clientes/:id
 * Excluir cliente (soft delete - apenas da unidade do usuário)
 */
router.delete('/:id',
  multiTenantMiddleware.requireUnidadeId(),
  multiTenantMiddleware.auditMultiTenantAccess('EXCLUIR_CLIENTE'),
  rbacMiddleware.auditLog('EXCLUIR_CLIENTE'),
  async (req, res) => {
    await clienteController.delete(req, res);
  }
);

/**
 * POST /api/clientes/agendamento
 * Criar cliente rápido para agendamento (se não existir)
 * Body: { telefone, nome }
 */
router.post('/agendamento',
  ...multiTenantMiddleware.multiTenantCRUD('CRIAR_CLIENTE_AGENDAMENTO'),
  rbacMiddleware.auditLog('CRIAR_CLIENTE_AGENDAMENTO'),
  async (req, res) => {
    await clienteController.createForAgendamento(req, res);
  }
);

module.exports = router;

const express = require('express');
const router = express.Router();
const UnidadeController = require('../controllers/UnidadeController');
const PlanoAssinaturaController = require('../controllers/PlanoAssinaturaController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const unidadeController = new UnidadeController();
const planoAssinaturaController = new PlanoAssinaturaController();

// Middleware de autenticação para todas as rotas
router.use(authenticate());

/**
 * GET /api/unidades
 * Lista unidades do usuário logado (ADMIN vê suas unidades, MASTER vê todas, AGENTE vê suas unidades)
 * Query params: ?status=Ativo|Bloqueado
 * ✅ CORREÇÃO: AGENTE precisa ver locais para o dropdown do calendário
 */
router.get('/',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  rbacMiddleware.auditLog('LISTAR_UNIDADES'),
  async (req, res) => {
    await unidadeController.index(req, res);
  }
);

/**
 * GET /api/unidades/:id
 * Busca uma unidade específica
 * ADMIN só pode ver suas próprias unidades, MASTER pode ver qualquer uma, AGENTE pode ver suas unidades
 * ✅ CORREÇÃO: AGENTE precisa acessar detalhes de locais
 */
router.get('/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER', 'AGENTE'),
  rbacMiddleware.auditLog('VISUALIZAR_UNIDADE'),
  async (req, res) => {
    await unidadeController.show(req, res);
  }
);

// ✅ Middleware para exigir role ADMIN ou MASTER APENAS em operações de escrita
router.use(rbacMiddleware.requireRole('ADMIN', 'MASTER'));

/**
 * POST /api/unidades
 * Cria nova unidade
 * ADMIN: validação de limite baseada no plano
 * MASTER: sem limite
 */
router.post('/',
  rbacMiddleware.auditLog('CRIAR_UNIDADE'),
  async (req, res) => {
    await unidadeController.store(req, res);
  }
);

/**
 * PUT /api/unidades/:id
 * Atualiza dados da unidade (nome, endereço, telefone)
 * ADMIN só pode editar suas próprias unidades, MASTER pode editar qualquer uma
 */
router.put('/:id',
  rbacMiddleware.auditLog('ATUALIZAR_UNIDADE'),
  async (req, res) => {
    await unidadeController.update(req, res);
  }
);

/**
 * PATCH /api/unidades/:id/status
 * Altera status da unidade (Ativo/Bloqueado)
 * ADMIN só pode alterar status de suas próprias unidades, MASTER pode alterar qualquer uma
 */
router.patch('/:id/status',
  rbacMiddleware.auditLog('ALTERAR_STATUS_UNIDADE'),
  async (req, res) => {
    await unidadeController.updateStatus(req, res);
  }
);

/**
 * DELETE /api/unidades/:id
 * Soft delete da unidade (ADMIN pode deletar suas próprias, MASTER pode deletar qualquer uma)
 */
router.delete('/:id',
  rbacMiddleware.requireRole('MASTER', 'ADMIN'),
  rbacMiddleware.auditLog('DELETAR_UNIDADE'),
  async (req, res) => {
    await unidadeController.destroy(req, res);
  }
);

// ========================================
// ROTAS PARA EXCEÇÕES DE CALENDÁRIO
// ========================================

/**
 * POST /api/unidades/:id/excecoes
 * Cria nova exceção de calendário para uma unidade
 * Body: { data_inicio, data_fim, tipo, descricao }
 * ADMIN só pode criar exceções em suas unidades, MASTER pode criar em qualquer uma
 */
router.post('/:id/excecoes',
  rbacMiddleware.auditLog('CRIAR_EXCECAO_CALENDARIO'),
  async (req, res) => {
    await unidadeController.createExcecao(req, res);
  }
);

/**
 * GET /api/unidades/:id/excecoes
 * Lista exceções de calendário de uma unidade
 * Query params: ?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD (opcionais)
 * ADMIN só pode ver exceções de suas unidades, MASTER pode ver de qualquer uma
 */
router.get('/:id/excecoes',
  rbacMiddleware.auditLog('LISTAR_EXCECOES_CALENDARIO'),
  async (req, res) => {
    await unidadeController.listExcecoes(req, res);
  }
);

/**
 * PUT /api/unidades/:id/excecoes/:excecaoId
 * Atualiza exceção de calendário
 * Body: { data_inicio?, data_fim?, tipo?, descricao? }
 * ADMIN só pode atualizar exceções de suas unidades, MASTER pode atualizar de qualquer uma
 */
router.put('/:id/excecoes/:excecaoId',
  rbacMiddleware.auditLog('ATUALIZAR_EXCECAO_CALENDARIO'),
  async (req, res) => {
    await unidadeController.updateExcecao(req, res);
  }
);

/**
 * DELETE /api/unidades/:id/excecoes/:excecaoId
 * Deleta exceção de calendário
 * ADMIN só pode deletar exceções de suas unidades, MASTER pode deletar de qualquer uma
 */
router.delete('/:id/excecoes/:excecaoId',
  rbacMiddleware.auditLog('DELETAR_EXCECAO_CALENDARIO'),
  async (req, res) => {
    await unidadeController.deleteExcecao(req, res);
  }
);

// ========================================
// ROTAS PARA CLUBE DE ASSINATURA (PLANOS)
// ========================================

/**
 * GET /api/unidades/:id/planos-assinatura
 * Lista planos de assinatura da unidade
 */
router.get('/:id/planos-assinatura',
  rbacMiddleware.requireUnitManagement(),
  rbacMiddleware.auditLog('LISTAR_PLANOS_ASSINATURA'),
  async (req, res) => {
    await planoAssinaturaController.listByUnidade(req, res);
  }
);

/**
 * GET /api/unidades/:id/planos-assinatura/:planoId
 * Buscar plano de assinatura com itens
 */
router.get('/:id/planos-assinatura/:planoId',
  rbacMiddleware.requireUnitManagement(),
  rbacMiddleware.auditLog('VISUALIZAR_PLANO_ASSINATURA'),
  async (req, res) => {
    await planoAssinaturaController.show(req, res);
  }
);

/**
 * POST /api/unidades/:id/planos-assinatura
 * Criar plano de assinatura
 */
router.post('/:id/planos-assinatura',
  rbacMiddleware.requireUnitManagement(),
  rbacMiddleware.auditLog('CRIAR_PLANO_ASSINATURA'),
  async (req, res) => {
    await planoAssinaturaController.store(req, res);
  }
);

/**
 * PUT /api/unidades/:id/planos-assinatura/:planoId
 * Atualizar plano de assinatura
 */
router.put('/:id/planos-assinatura/:planoId',
  rbacMiddleware.requireUnitManagement(),
  rbacMiddleware.auditLog('ATUALIZAR_PLANO_ASSINATURA'),
  async (req, res) => {
    await planoAssinaturaController.update(req, res);
  }
);

/**
 * DELETE /api/unidades/:id/planos-assinatura/:planoId
 * Deletar plano e remover clientes do plano
 */
router.delete('/:id/planos-assinatura/:planoId',
  rbacMiddleware.requireUnitManagement(),
  rbacMiddleware.auditLog('DELETAR_PLANO_ASSINATURA'),
  async (req, res) => {
    await planoAssinaturaController.destroy(req, res);
  }
);

module.exports = router;

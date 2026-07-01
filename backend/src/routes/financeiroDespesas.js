const express = require('express');
const router = express.Router();
const DespesaController = require('../controllers/DespesaController');
const FluxoCaixaController = require('../controllers/FluxoCaixaController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const {
  validateRequest,
  createDespesaSchema,
  updateDespesaSchema,
  listDespesasQuerySchema
} = require('../schemas/movimentacaoSchema');

const controller = new DespesaController();
const fluxoCaixaController = new FluxoCaixaController();

router.use(authenticate());

// 🔍 DEBUG: Log de todas as requisições recebidas por este router
router.use((req, res, next) => {
  console.log(`[DEBUG ROTA FINANCEIRO] ${req.method} ${req.originalUrl} | Path: ${req.path}`);
  next();
});

router.get('/extrato',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('GERAR_EXTRATO_FLUXO_CAIXA'),
  (req, res) => fluxoCaixaController.extrato(req, res)
);

// CRUD básico
router.get('/despesas',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  validateRequest(listDespesasQuerySchema, 'query'),
  rbacMiddleware.auditLog('LISTAR_DESPESAS'),
  (req, res) => controller.index(req, res)
);

// 🔔 Endpoint otimizado para contagem de despesas vencidas (Badge de alerta)
router.get('/despesas/vencidas/count',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('CONTAR_DESPESAS_VENCIDAS'),
  (req, res) => controller.countVencidas(req, res)
);

router.post('/despesas',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  validateRequest(createDespesaSchema, 'body'),
  rbacMiddleware.auditLog('CRIAR_DESPESA'),
  (req, res) => controller.store(req, res)
);

// ⚠️ ROTAS ESPECÍFICAS DEVEM VIR ANTES DAS GENÉRICAS
// 💰 Estorno de despesa paga (operação compensatória)
// Esta rota DEVE estar ANTES de PUT /despesas/:id e DELETE /despesas/:id
// para evitar que o Express interprete "estornar" como um ID numérico
router.post('/despesas/:id/estornar',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('ESTORNAR_DESPESA'),
  (req, res) => controller.estornar(req, res)
);

// Rotas genéricas com :id - DEVEM VIR POR ÚLTIMO
router.put('/despesas/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  validateRequest(updateDespesaSchema, 'body'),
  rbacMiddleware.auditLog('ATUALIZAR_DESPESA'),
  (req, res) => controller.update(req, res)
);

router.delete('/despesas/:id',
  rbacMiddleware.requireRole('ADMIN', 'MASTER'),
  rbacMiddleware.auditLog('DELETAR_DESPESA'),
  (req, res) => controller.destroy(req, res)
);

module.exports = router;

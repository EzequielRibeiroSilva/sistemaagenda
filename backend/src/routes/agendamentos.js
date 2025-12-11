const express = require('express');
const router = express.Router();
const AgendamentoController = require('../controllers/AgendamentoController');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const agendamentoController = new AgendamentoController();

// Middleware para desabilitar cache em todas as rotas de agendamentos
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

// GET /api/agendamentos - Listar agendamentos
// ✅ CORREÇÃO 1.3: Apenas ADMIN e AGENTE podem listar agendamentos
router.get('/', 
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  (req, res) => agendamentoController.index(req, res)
);

// GET /api/agendamentos/:id - Buscar agendamento por ID
// ✅ CORREÇÃO 1.3: Apenas ADMIN e AGENTE podem visualizar agendamentos
router.get('/:id', 
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  (req, res) => agendamentoController.show(req, res)
);

// POST /api/agendamentos - Criar novo agendamento
// ✅ CORREÇÃO 1.3: Apenas ADMIN e AGENTE podem criar agendamentos
router.post('/', 
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  rbacMiddleware.auditLog('CRIAR_AGENDAMENTO'),
  (req, res) => agendamentoController.store(req, res)
);

// PUT /api/agendamentos/:id - Atualizar agendamento
// ✅ CORREÇÃO 1.3: Apenas ADMIN e AGENTE podem atualizar agendamentos
// Validação de propriedade feita no controller
router.put('/:id', 
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  rbacMiddleware.auditLog('ATUALIZAR_AGENDAMENTO'),
  (req, res) => agendamentoController.update(req, res)
);

// DELETE /api/agendamentos/:id - Deletar agendamento
// ✅ CORREÇÃO 1.3: Apenas ADMIN pode deletar agendamentos (hard delete)
router.delete('/:id', 
  rbacMiddleware.requireRole('ADMIN'),
  rbacMiddleware.auditLog('DELETAR_AGENDAMENTO'),
  (req, res) => agendamentoController.destroy(req, res)
);

// PATCH /api/agendamentos/:id/cancel - Cancelar agendamento
// ✅ CORREÇÃO 1.3: ADMIN e AGENTE podem cancelar
// AGENTE: apenas seus próprios agendamentos
// ADMIN: qualquer agendamento da sua unidade
router.patch('/:id/cancel', 
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  rbacMiddleware.auditLog('CANCELAR_AGENDAMENTO'),
  (req, res) => agendamentoController.cancel(req, res)
);

// PATCH /api/agendamentos/:id/finalize - Finalizar agendamento
// ✅ CORREÇÃO 1.3: ADMIN e AGENTE podem finalizar
// AGENTE: apenas seus próprios agendamentos
// ADMIN: qualquer agendamento da sua unidade
router.patch('/:id/finalize', 
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  rbacMiddleware.auditLog('FINALIZAR_AGENDAMENTO'),
  (req, res) => agendamentoController.finalize(req, res)
);

module.exports = router;

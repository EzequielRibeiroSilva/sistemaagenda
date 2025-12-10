const express = require('express');
const router = express.Router();
const AgenteController = require('../controllers/AgenteController');
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const { handleFormDataWithUpload } = require('../middleware/formDataMiddleware');
const { validateBusboyFiles } = require('../middleware/fileValidation');

// Instanciar controller
const agenteController = new AgenteController();

// Middleware de autenticação para todas as rotas
router.use(authenticate());

/**
 * @route GET /agentes/list
 * @desc Listagem leve de agentes para formulários (com RBAC)
 * @access Private (ADMIN ou AGENTE)
 * @returns { success: boolean, data: Array<{id: number, nome: string}>, message: string }
 */
router.get('/list',
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  async (req, res) => {
    await agenteController.list(req, res);
  }
);

/**
 * @route GET /agentes
 * @desc Listar agentes (Grid)
 * @access Private (ADMIN ou AGENTE)
 * ✅ CORREÇÃO: AGENTE precisa ver lista de agentes para o calendário filtrar corretamente
 * @returns { success: boolean, data: Array<Agent>, message: string }
 */
router.get('/',
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  async (req, res) => {
    await agenteController.index(req, res);
  }
);

/**
 * @route GET /agentes/:id
 * @desc Visualizar agente específico (para edição)
 * @access Private (ADMIN ou AGENTE)
 * ✅ CORREÇÃO: AGENTE precisa acessar seus próprios dados
 * @param {string} id - ID do agente
 * @returns { success: boolean, data: Agent, message: string }
 */
router.get('/:id',
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  async (req, res) => {
    await agenteController.show(req, res);
  }
);

/**
 * @route PUT /agentes/:id
 * @desc Atualizar agente (com upload de avatar)
 * @access Private (ADMIN ou AGENTE editando seu próprio perfil)
 * ✅ CORREÇÃO: AGENTE pode editar seus próprios dados, incluindo senha
 * ✅ CORREÇÃO 1.5: Validação de magic bytes após upload
 * @param {string} id - ID do agente
 * @body {object} agenteData - Dados do agente
 * @returns { success: boolean, data: Agent, message: string }
 */
router.put('/:id', 
  rbacMiddleware.requireAnyRole(['ADMIN', 'AGENTE']),
  handleFormDataWithUpload,
  validateBusboyFiles,
  async (req, res) => {
    await agenteController.update(req, res);
  }
);

// ✅ Middleware para exigir role ADMIN APENAS em operações de criação e exclusão
router.use(rbacMiddleware.requireRole('ADMIN'));

/**
 * @route POST /agentes
 * @desc Criar novo agente
 * @access Private (ADMIN)
 * ✅ CORREÇÃO 1.5: Validação de magic bytes após upload
 * @body {object} agenteData - Dados do agente
 * @returns { success: boolean, data: Agent, message: string }
 */
router.post('/', 
  handleFormDataWithUpload,
  validateBusboyFiles,
  async (req, res) => {
    await agenteController.store(req, res);
  }
);

/**
 * @route DELETE /agentes/:id
 * @desc Excluir agente (soft delete)
 * @access Private (ADMIN)
 * @param {string} id - ID do agente
 * @returns { success: boolean, message: string }
 */
router.delete('/:id', async (req, res) => {
  await agenteController.destroy(req, res);
});

module.exports = router;

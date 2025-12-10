/**
 * Rotas: Settings
 * Descrição: Endpoints para configurações do sistema
 * Padrão: RUD (Read, Update, Delete) + Upload de logo
 */

const express = require('express');
const router = express.Router();
const SettingsController = require('../controllers/SettingsController');
const { authenticate } = require('../middleware/authMiddleware');
const { validateUploadedFile } = require('../middleware/fileValidation');
const { db } = require('../config/knex');

// Inicializa controller
const settingsController = new SettingsController(db);

/**
 * GET /api/settings
 * Busca configurações da unidade do usuário logado
 */
router.get('/', authenticate(), async (req, res) => {
  await settingsController.getSettings(req, res);
});

/**
 * PUT /api/settings
 * Atualiza configurações da unidade (suporta multipart/form-data para logo)
 * ✅ CORREÇÃO 1.5: Validação de magic bytes após upload
 */
router.put('/',
  authenticate(),
  settingsController.getUploadMiddleware(),
  validateUploadedFile,
  async (req, res) => {
    await settingsController.updateSettings(req, res);
  }
);

/**
 * POST /api/settings/logo
 * Upload de logo da unidade
 * ✅ CORREÇÃO 1.5: Validação de magic bytes após upload
 */
router.post('/logo',
  authenticate(),
  settingsController.getUploadMiddleware(),
  validateUploadedFile,
  async (req, res) => {
    await settingsController.uploadLogo(req, res);
  }
);

module.exports = router;

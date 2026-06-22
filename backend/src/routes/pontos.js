/**
 * Rotas: Sistema de Pontos
 * Descrição: Rotas dedicadas para configuração do Sistema de Pontos
 */

const express = require('express');
const router = express.Router();
const PontosController = require('../controllers/PontosController');
const { authenticate } = require('../middleware/authMiddleware');
const { db } = require('../config/knex');

// Inicializa controller
const pontosController = new PontosController(db);

/**
 * GET /api/pontos/configuracoes
 * Busca configurações do Sistema de Pontos
 */
router.get('/configuracoes', authenticate(), async (req, res) => {
  await pontosController.getConfiguracoes(req, res);
});

/**
 * PUT /api/pontos/configuracoes
 * Atualiza configurações do Sistema de Pontos
 */
router.put('/configuracoes', authenticate(), async (req, res) => {
  await pontosController.updateConfiguracoes(req, res);
});

module.exports = router;

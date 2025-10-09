const express = require('express');
const router = express.Router();
const UnidadeController = require('../controllers/UnidadeController');

const unidadeController = new UnidadeController();

// GET /api/unidades - Listar unidades
router.get('/', (req, res) => unidadeController.index(req, res));

// GET /api/unidades/:id - Buscar unidade por ID
router.get('/:id', (req, res) => unidadeController.show(req, res));

// POST /api/unidades - Criar nova unidade
router.post('/', (req, res) => unidadeController.store(req, res));

// PUT /api/unidades/:id - Atualizar unidade
router.put('/:id', (req, res) => unidadeController.update(req, res));

// DELETE /api/unidades/:id - Deletar unidade
router.delete('/:id', (req, res) => unidadeController.destroy(req, res));

module.exports = router;

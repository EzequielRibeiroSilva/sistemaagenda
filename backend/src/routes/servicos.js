const express = require('express');
const router = express.Router();
const ServicoController = require('../controllers/ServicoController');

const servicoController = new ServicoController();

// GET /api/servicos/list - Listagem leve de serviços para formulários
router.get('/list', (req, res) => servicoController.list(req, res));

// GET /api/servicos - Listar serviços
router.get('/', (req, res) => servicoController.index(req, res));

// GET /api/servicos/categoria/:categoriaId - Buscar serviços por categoria
router.get('/categoria/:categoriaId', (req, res) => servicoController.byCategoria(req, res));

// GET /api/servicos/agente/:agenteId - Buscar serviços por agente
router.get('/agente/:agenteId', (req, res) => servicoController.byAgente(req, res));

// GET /api/servicos/:id - Buscar serviço por ID
router.get('/:id', (req, res) => servicoController.show(req, res));

// POST /api/servicos - Criar novo serviço
router.post('/', (req, res) => servicoController.store(req, res));

// PUT /api/servicos/:id - Atualizar serviço
router.put('/:id', (req, res) => servicoController.update(req, res));

// DELETE /api/servicos/:id - Deletar serviço
router.delete('/:id', (req, res) => servicoController.destroy(req, res));

module.exports = router;

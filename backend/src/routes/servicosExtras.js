const express = require('express');
const router = express.Router();
const ServicoExtraController = require('../controllers/ServicoExtraController');

const servicoExtraController = new ServicoExtraController();

// GET /api/servicos/extras/list - Listagem leve de serviços extras para formulários
router.get('/list', (req, res) => servicoExtraController.list(req, res));

// GET /api/servicos/extras - Listar serviços extras
router.get('/', (req, res) => servicoExtraController.index(req, res));

// GET /api/servicos/extras/:id - Buscar serviço extra por ID
router.get('/:id', (req, res) => servicoExtraController.show(req, res));

// POST /api/servicos/extras - Criar novo serviço extra
router.post('/', (req, res) => servicoExtraController.store(req, res));

// PUT /api/servicos/extras/:id - Atualizar serviço extra
router.put('/:id', (req, res) => servicoExtraController.update(req, res));

// DELETE /api/servicos/extras/:id - Deletar serviço extra
router.delete('/:id', (req, res) => servicoExtraController.destroy(req, res));

module.exports = router;

const express = require('express');
const router = express.Router();
const AgendamentoController = require('../controllers/AgendamentoController');

const agendamentoController = new AgendamentoController();

// GET /api/agendamentos - Listar agendamentos
router.get('/', (req, res) => agendamentoController.index(req, res));

// GET /api/agendamentos/:id - Buscar agendamento por ID
router.get('/:id', (req, res) => agendamentoController.show(req, res));

// POST /api/agendamentos - Criar novo agendamento
router.post('/', (req, res) => agendamentoController.store(req, res));

// PUT /api/agendamentos/:id - Atualizar agendamento
router.put('/:id', (req, res) => agendamentoController.update(req, res));

// DELETE /api/agendamentos/:id - Deletar agendamento
router.delete('/:id', (req, res) => agendamentoController.destroy(req, res));

module.exports = router;

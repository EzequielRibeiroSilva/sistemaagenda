const express = require('express');
const router = express.Router();
const ClienteController = require('../controllers/ClienteController');

const clienteController = new ClienteController();

// GET /api/clientes - Listar clientes
router.get('/', (req, res) => clienteController.index(req, res));

// GET /api/clientes/stats - Estatísticas dos clientes
router.get('/stats', (req, res) => clienteController.stats(req, res));

// GET /api/clientes/:id - Buscar cliente por ID
router.get('/:id', (req, res) => clienteController.show(req, res));

// POST /api/clientes - Criar novo cliente
router.post('/', (req, res) => clienteController.store(req, res));

// PUT /api/clientes/:id - Atualizar cliente
router.put('/:id', (req, res) => clienteController.update(req, res));

// DELETE /api/clientes/:id - Deletar cliente
router.delete('/:id', (req, res) => clienteController.destroy(req, res));

module.exports = router;

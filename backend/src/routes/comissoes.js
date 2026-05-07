const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const ComissaoController = require('../controllers/ComissaoController');

const controller = new ComissaoController();

// Todas as rotas aqui são protegidas
router.use(authenticate());

router.get('/resumo', (req, res) => controller.resumo(req, res));
router.get('/pendentes', (req, res) => controller.pendentes(req, res));
router.get('/extrato/pendente', (req, res) => {
  req.query.status_comissao = 'pendente';
  return controller.pendentes(req, res);
});
router.get('/extrato/historico', (req, res) => {
  req.query.status_comissao = 'pago';
  return controller.pendentes(req, res);
});
router.post('/pagar', (req, res) => controller.pagar(req, res));

module.exports = router;

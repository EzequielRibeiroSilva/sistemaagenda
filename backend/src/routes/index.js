const express = require('express');
const router = express.Router();

// Importar rotas específicas
const authRoutes = require('./auth');
const evolutionRoutes = require('./evolution');
const rbacRoutes = require('./rbac');
const unidadesRoutes = require('./unidades');
const clientesRoutes = require('./clientes');
const servicosRoutes = require('./servicos');
const agendamentosRoutes = require('./agendamentos');

// Importar middleware de autenticação real
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

// Rotas públicas (sem autenticação)
router.use('/auth', authRoutes);

// Rotas RBAC (com controle de acesso baseado em roles)
router.use('/rbac', rbacRoutes);

// Rotas protegidas (com autenticação básica - mantidas para compatibilidade)
router.use('/evolution', authenticate(), evolutionRoutes);
router.use('/unidades', authenticate(), unidadesRoutes);
router.use('/clientes', authenticate(), clientesRoutes);
router.use('/servicos', authenticate(), servicosRoutes);
router.use('/agendamentos', authenticate(), agendamentosRoutes);

// Rota de teste pública para verificar se a API está funcionando
router.get('/test', (req, res) => {
  res.json({
    message: 'API funcionando corretamente!',
    timestamp: new Date().toISOString(),
    authenticated: false
  });
});

// Rota de teste protegida para verificar autenticação
router.get('/test-auth', authenticate(), (req, res) => {
  res.json({
    message: 'API autenticada funcionando corretamente!',
    timestamp: new Date().toISOString(),
    authenticated: true,
    user: {
      id: req.user.id,
      nome: req.user.nome,
      email: req.user.email,
      tipo_usuario: req.user.tipo_usuario
    }
  });
});

module.exports = router;

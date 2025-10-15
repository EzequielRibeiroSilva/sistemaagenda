const express = require('express');
const router = express.Router();

// Importar rotas específicas
const authRoutes = require('./auth');
const evolutionRoutes = require('./evolution');
const rbacRoutes = require('./rbac');
const unidadesRoutes = require('./unidades');
const clientesRoutes = require('./clientes');
const servicosRoutes = require('./servicos');
const servicosExtrasRoutes = require('./servicosExtras');
const agendamentosRoutes = require('./agendamentos');
const usuariosRoutes = require('./usuarios');
const agentesRoutes = require('./agentes');
const settingsRoutes = require('./settings');
const publicRoutes = require('./public');
const diagnosticsRoutes = require('./diagnostics');
const testRoutes = require('./test');

// Importar middleware de autenticação real
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

// Rotas públicas (sem autenticação)
router.use('/auth', authRoutes);

// Rotas RBAC (com controle de acesso baseado em roles)
router.use('/rbac', rbacRoutes);

// Rotas MASTER (AdminDashboardPage)
router.use('/usuarios', usuariosRoutes);

// Rotas ADMIN (Gerenciamento de Agentes)
router.use('/agentes', agentesRoutes);

// Rotas protegidas (com autenticação básica - mantidas para compatibilidade)
router.use('/evolution', authenticate(), evolutionRoutes);

router.use('/unidades', authenticate(), unidadesRoutes);
router.use('/clientes', authenticate(), clientesRoutes);
router.use('/servicos/extras', authenticate(), servicosExtrasRoutes);
router.use('/servicos', authenticate(), servicosRoutes);
router.use('/agendamentos', authenticate(), agendamentosRoutes);
router.use('/settings', settingsRoutes);

// Rotas públicas (sem autenticação)
router.use('/public', publicRoutes);

// Rotas de diagnóstico (MASTER ou desenvolvimento)
router.use('/diagnostics', diagnosticsRoutes);

// Rotas de teste (ADMIN apenas)
router.use('/test', testRoutes);

// Rotas de teste WhatsApp (desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  const whatsappTestRoutes = require('./whatsapp-test');
  router.use('/whatsapp-test', whatsappTestRoutes);
}

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

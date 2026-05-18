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
const cuponsRoutes = require('./cupons');
const notificacoesRoutes = require('./notificacoes');
const auditLogsRoutes = require('./auditLogs');
const planosAssinaturaRoutes = require('./planosAssinatura');
const metricasRoutes = require('./metricas');
const whatsAppRoutes = require('./whatsapp');
const dashboardRoutes = require('./dashboard');
const produtosRoutes = require('./produtos');
const estoqueRoutes = require('./estoque');
const categoriasRoutes = require('./categorias');
const vendasRoutes = require('./vendas');
const financeiroDespesasRoutes = require('./financeiroDespesas');
const comissoesRoutes = require('./comissoes');
const MercadoPagoOAuthController = require('../controllers/MercadoPagoOAuthController');

// Importar middleware de autenticação real
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

const mercadoPagoOAuthController = new MercadoPagoOAuthController();

// Rotas públicas (sem autenticação)
router.use('/auth', authRoutes);

// Integrações (autenticado)
router.get('/integracoes/mercadopago/url', authenticate(), async (req, res) => {
  await mercadoPagoOAuthController.getRedirectUrl(req, res);
});

router.get('/integracoes/mercadopago/status', authenticate(), async (req, res) => {
  await mercadoPagoOAuthController.getStatus(req, res);
});

// Rotas RBAC (com controle de acesso baseado em roles)
router.use('/rbac', rbacRoutes);

// Rotas MASTER (AdminDashboardPage)
router.use('/usuarios', usuariosRoutes);
router.use('/metricas', metricasRoutes);

// Rotas de Auditoria (MASTER apenas)
router.use('/audit-logs', authenticate(), auditLogsRoutes);

// Rotas ADMIN (Gerenciamento de Agentes)
router.use('/agentes', agentesRoutes);

// Rotas protegidas (com autenticação básica - mantidas para compatibilidade)
router.use('/evolution', authenticate(), evolutionRoutes);

router.use('/unidades', authenticate(), unidadesRoutes);
router.use('/clientes', authenticate(), clientesRoutes);
router.use('/servicos/extras', authenticate(), servicosExtrasRoutes);
router.use('/servicos', authenticate(), servicosRoutes);
router.use('/planos-assinatura', authenticate(), planosAssinaturaRoutes);
router.use('/agendamentos', authenticate(), agendamentosRoutes);
router.use('/cupons', cuponsRoutes);
router.use('/settings', settingsRoutes);
router.use('/notificacoes', notificacoesRoutes);
router.use('/whatsapp', whatsAppRoutes);
router.use('/dashboard', authenticate(), dashboardRoutes);
router.use('/produtos', produtosRoutes);
router.use('/estoque', estoqueRoutes);
router.use('/categorias', categoriasRoutes);
router.use('/vendas', vendasRoutes);
router.use('/financeiro', financeiroDespesasRoutes);
router.use('/comissoes', comissoesRoutes);

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

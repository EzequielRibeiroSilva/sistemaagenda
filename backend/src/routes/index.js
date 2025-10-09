const express = require('express');
const router = express.Router();

// Importar rotas específicas
const unidadesRoutes = require('./unidades');
const clientesRoutes = require('./clientes');
const servicosRoutes = require('./servicos');
const agendamentosRoutes = require('./agendamentos');

// Middleware temporário para simular usuário autenticado (para testes)
const mockAuthMiddleware = (req, res, next) => {
  // Em produção, isso seria substituído por um middleware de autenticação JWT real
  req.user = {
    id: 1,
    nome: 'Usuário Teste',
    email: 'teste@email.com',
    tipo_usuario: 'salon',
    plano: 'Multi',
    limite_unidades: 5
  };
  next();
};

// Aplicar middleware de autenticação mock em todas as rotas
router.use(mockAuthMiddleware);

// Definir rotas
router.use('/unidades', unidadesRoutes);
router.use('/clientes', clientesRoutes);
router.use('/servicos', servicosRoutes);
router.use('/agendamentos', agendamentosRoutes);

// Rota de teste para verificar se a API está funcionando
router.get('/test', (req, res) => {
  res.json({
    message: 'API funcionando corretamente!',
    timestamp: new Date().toISOString(),
    user: req.user
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();

// Importar controllers RBAC
const RBACAgendamentoController = require('../controllers/RBACAgendamentoController');

// Importar middlewares
const { authenticate } = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');

// Instanciar controllers
const rbacAgendamentoController = new RBACAgendamentoController();

// ========================================
// ROTAS RBAC PARA AGENDAMENTOS
// ========================================

// GET /api/rbac/agendamentos - Listar agendamentos com filtros RBAC
router.get('/agendamentos', 
  authenticate(),
  rbacMiddleware.applyDataFilters(),
  rbacMiddleware.auditLog('LISTAR_AGENDAMENTOS'),
  (req, res) => rbacAgendamentoController.index(req, res)
);

// POST /api/rbac/agendamentos - Criar agendamento com validações RBAC
router.post('/agendamentos',
  authenticate(),
  rbacMiddleware.requireRole('MASTER', 'ADMIN', 'AGENTE'),
  rbacMiddleware.auditLog('CRIAR_AGENDAMENTO'),
  (req, res) => rbacAgendamentoController.store(req, res)
);

// GET /api/rbac/agendamentos/:id - Buscar agendamento específico
router.get('/agendamentos/:id',
  authenticate(),
  rbacMiddleware.requireResourceOwnership(
    async (req) => {
      // Buscar o agendamento para verificar propriedade
      const agendamento = await rbacAgendamentoController.model.findById(req.params.id);
      return agendamento?.agente_id;
    },
    async (req) => {
      // Buscar a unidade do agendamento
      const agendamento = await rbacAgendamentoController.model.findById(req.params.id);
      return agendamento?.unidade_id;
    }
  ),
  rbacMiddleware.auditLog('VISUALIZAR_AGENDAMENTO'),
  async (req, res) => {
    try {
      const agendamento = await rbacAgendamentoController.model.findById(req.params.id);
      if (!agendamento) {
        return res.status(404).json({
          error: 'Agendamento não encontrado'
        });
      }
      res.json({
        data: agendamento,
        message: 'Agendamento encontrado'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }
  }
);

// ========================================
// ROTAS RBAC PARA UNIDADES
// ========================================

// GET /api/rbac/unidades - Listar unidades (apenas MASTER e ADMIN da própria unidade)
router.get('/unidades',
  authenticate(),
  rbacMiddleware.requireRole('MASTER', 'ADMIN'),
  rbacMiddleware.auditLog('LISTAR_UNIDADES'),
  async (req, res) => {
    try {
      const { UnidadeController } = require('../controllers/UnidadeController');
      const unidadeController = new UnidadeController();
      
      let unidades;
      
      if (req.user.role === 'MASTER') {
        // MASTER vê todas as unidades
        unidades = await unidadeController.model.findAll();
      } else if (req.user.role === 'ADMIN') {
        // ADMIN vê apenas sua própria unidade
        if (req.user.unidade_id) {
          const unidade = await unidadeController.model.findById(req.user.unidade_id);
          unidades = unidade ? [unidade] : [];
        } else {
          unidades = [];
        }
      }
      
      res.json({
        data: unidades,
        message: 'Unidades listadas com sucesso',
        user_role: req.user.role
      });
    } catch (error) {
      console.error('Erro ao listar unidades:', error);
      res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }
  }
);

// POST /api/rbac/unidades - Criar unidade (apenas MASTER)
router.post('/unidades',
  authenticate(),
  rbacMiddleware.requireRole('MASTER'),
  rbacMiddleware.requirePermission('create_admins'),
  rbacMiddleware.auditLog('CRIAR_UNIDADE'),
  async (req, res) => {
    try {
      const { UnidadeController } = require('../controllers/UnidadeController');
      const unidadeController = new UnidadeController();
      
      await unidadeController.store(req, res);
    } catch (error) {
      console.error('Erro ao criar unidade:', error);
      res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }
  }
);

// ========================================
// ROTAS RBAC PARA CLIENTES
// ========================================

// GET /api/rbac/clientes - Listar clientes com filtros RBAC
router.get('/clientes',
  authenticate(),
  rbacMiddleware.applyDataFilters(),
  rbacMiddleware.auditLog('LISTAR_CLIENTES'),
  async (req, res) => {
    try {
      const { ClienteController } = require('../controllers/ClienteController');
      const clienteController = new ClienteController();
      
      let clientes;
      
      switch (req.user.role) {
        case 'MASTER':
          // MASTER vê todos os clientes
          clientes = await clienteController.model.findAll();
          break;
          
        case 'ADMIN':
          // ADMIN vê clientes da sua unidade
          if (req.user.unidade_id) {
            clientes = await clienteController.model.db('clientes')
              .where('usuario_id', req.user.id)
              .orWhere('usuario_id', req.user.unidade_id); // Clientes da unidade
          } else {
            clientes = await clienteController.model.findByUsuario(req.user.id);
          }
          break;
          
        case 'AGENTE':
          // AGENTE vê apenas clientes que já agendaram com ele
          clientes = await clienteController.model.db('clientes')
            .join('agendamentos', 'clientes.id', 'agendamentos.cliente_id')
            .where('agendamentos.agente_id', req.user.id)
            .distinct('clientes.*');
          break;
          
        default:
          clientes = [];
      }
      
      res.json({
        data: clientes,
        message: 'Clientes listados com sucesso',
        user_role: req.user.role
      });
    } catch (error) {
      console.error('Erro ao listar clientes:', error);
      res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }
  }
);

// ========================================
// ROTAS RBAC PARA SERVIÇOS
// ========================================

// GET /api/rbac/servicos - Listar serviços com filtros RBAC
router.get('/servicos',
  authenticate(),
  rbacMiddleware.applyDataFilters(),
  rbacMiddleware.auditLog('LISTAR_SERVICOS'),
  async (req, res) => {
    try {
      const { ServicoController } = require('../controllers/ServicoController');
      const servicoController = new ServicoController();
      
      let servicos;
      
      switch (req.user.role) {
        case 'MASTER':
          // MASTER vê todos os serviços
          servicos = await servicoController.model.findAll();
          break;
          
        case 'ADMIN':
        case 'AGENTE':
          // ADMIN e AGENTE veem serviços do seu usuário/unidade
          servicos = await servicoController.model.findByUsuario(req.user.id);
          break;
          
        default:
          servicos = [];
      }
      
      res.json({
        data: servicos,
        message: 'Serviços listados com sucesso',
        user_role: req.user.role
      });
    } catch (error) {
      console.error('Erro ao listar serviços:', error);
      res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }
  }
);

// ========================================
// ROTA DE INFORMAÇÕES DO USUÁRIO RBAC
// ========================================

// GET /api/rbac/me - Informações do usuário logado com contexto RBAC
router.get('/me',
  authenticate(),
  rbacMiddleware.auditLog('CONSULTAR_PERFIL'),
  (req, res) => {
    const { senha_hash, ...userInfo } = req.user;
    
    res.json({
      data: {
        ...userInfo,
        permissions: {
          can_manage_system: req.user.role === 'MASTER',
          can_manage_units: req.user.role === 'MASTER',
          can_manage_agents: ['MASTER', 'ADMIN'].includes(req.user.role),
          can_create_appointments: ['MASTER', 'ADMIN', 'AGENTE'].includes(req.user.role),
          can_view_all_data: req.user.role === 'MASTER',
          can_view_unit_data: ['MASTER', 'ADMIN'].includes(req.user.role),
          can_view_own_data: true
        },
        navigation: {
          redirect_to: req.user.role === 'MASTER' ? '/AdminDashboardPage' : '/DashboardPage',
          show_unit_management: req.user.role === 'MASTER',
          show_agent_management: ['MASTER', 'ADMIN'].includes(req.user.role),
          show_reports: ['MASTER', 'ADMIN'].includes(req.user.role)
        }
      },
      message: 'Informações do usuário obtidas com sucesso'
    });
  }
);

module.exports = router;

const AuthService = require('../services/AuthService');

class RBACMiddleware {
  constructor() {
    this.authService = new AuthService();
  }

  // Middleware para verificar roles específicos
  requireRole(...allowedRoles) {
    return (req, res, next) => {
      try {
        // Verificar se o usuário está autenticado
        if (!req.user) {
          return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de autenticação é obrigatório'
          });
        }

        // Verificar se o usuário tem uma das roles permitidas
        if (!allowedRoles.includes(req.user.role)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: `Acesso restrito. Roles permitidas: ${allowedRoles.join(', ')}`,
            userRole: req.user.role
          });
        }

        next();
      } catch (error) {
        console.error('Erro no middleware RBAC:', error);
        return res.status(500).json({
          error: 'Erro interno',
          message: 'Erro na verificação de permissões'
        });
      }
    };
  }

  // Alias para requireRole (para compatibilidade)
  requireAnyRole(allowedRoles) {
    return this.requireRole(...allowedRoles);
  }

  // Middleware para verificar permissões específicas
  requirePermission(permission) {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de autenticação é obrigatório'
          });
        }

        if (!this.authService.hasPermission(req.user.role, permission)) {
          return res.status(403).json({
            error: 'Permissão insuficiente',
            message: `Permissão '${permission}' é obrigatória`,
            userRole: req.user.role
          });
        }

        next();
      } catch (error) {
        console.error('Erro no middleware de permissão:', error);
        return res.status(500).json({
          error: 'Erro interno',
          message: 'Erro na verificação de permissões'
        });
      }
    };
  }

  // Middleware para verificar se usuário pode gerenciar uma unidade
  requireUnitManagement() {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de autenticação é obrigatório'
          });
        }

        // Obter unidade_id do parâmetro da rota ou do body
        const unidadeId = parseInt(req.params.unidade_id || req.params.id || req.body.unidade_id);

        if (!unidadeId) {
          return res.status(400).json({
            error: 'Parâmetro inválido',
            message: 'ID da unidade é obrigatório'
          });
        }

        if (!this.authService.canManageUnit(req.user, unidadeId)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para gerenciar esta unidade',
            userRole: req.user.role,
            userUnidadeId: req.user.unidade_id
          });
        }

        next();
      } catch (error) {
        console.error('Erro no middleware de gerenciamento de unidade:', error);
        return res.status(500).json({
          error: 'Erro interno',
          message: 'Erro na verificação de permissões de unidade'
        });
      }
    };
  }

  // Middleware para aplicar filtros de dados baseados no role
  applyDataFilters() {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de autenticação é obrigatório'
          });
        }

        // Adicionar filtros ao objeto de request
        req.dataFilters = this.authService.getDataFilters(req.user);
        
        next();
      } catch (error) {
        console.error('Erro no middleware de filtros de dados:', error);
        return res.status(500).json({
          error: 'Erro interno',
          message: 'Erro na aplicação de filtros de dados'
        });
      }
    };
  }

  // Middleware para verificar propriedade de recurso
  requireResourceOwnership(getResourceUserId, getResourceUnidadeId = null) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de autenticação é obrigatório'
          });
        }

        // Obter IDs do recurso
        const resourceUserId = typeof getResourceUserId === 'function' 
          ? await getResourceUserId(req) 
          : getResourceUserId;
        
        const resourceUnidadeId = getResourceUnidadeId 
          ? (typeof getResourceUnidadeId === 'function' 
              ? await getResourceUnidadeId(req) 
              : getResourceUnidadeId)
          : null;

        if (!this.authService.canAccessResource(req.user, resourceUserId, resourceUnidadeId)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para acessar este recurso',
            userRole: req.user.role
          });
        }

        next();
      } catch (error) {
        console.error('Erro no middleware de propriedade de recurso:', error);
        return res.status(500).json({
          error: 'Erro interno',
          message: 'Erro na verificação de propriedade de recurso'
        });
      }
    };
  }

  // Middleware para logs de auditoria
  auditLog(action) {
    return (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Log da ação realizada
        console.log(`🔍 AUDIT: ${req.user?.role || 'UNKNOWN'} (ID: ${req.user?.id || 'N/A'}) realizou ${action} em ${req.method} ${req.originalUrl}`);
        
        originalSend.call(this, data);
      };
      
      next();
    };
  }
}

module.exports = new RBACMiddleware();

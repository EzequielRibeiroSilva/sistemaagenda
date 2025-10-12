/**
 * Middleware para isolamento Multi-Tenant
 * Garante que usuários só acessem dados de sua própria unidade
 * 
 * Funcionalidades:
 * - Validação de unidade_id do usuário
 * - Isolamento de dados por unidade
 * - Verificação de propriedade de recursos
 * - Auditoria de acesso
 */
class MultiTenantMiddleware {
  
  /**
   * Middleware para garantir que usuário tem unidade_id válida
   * Usado em rotas que requerem isolamento por unidade
   */
  requireUnidadeId() {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: 'Usuário não autenticado'
          });
        }

        // Verificar se usuário tem unidade_id
        if (!req.user.unidade_id) {
          return res.status(400).json({
            success: false,
            message: 'Usuário deve estar associado a uma unidade para acessar este recurso',
            code: 'MISSING_UNIDADE_ID'
          });
        }

        // Adicionar unidade_id ao contexto da requisição para facilitar acesso
        req.unidadeId = req.user.unidade_id;
        
        next();
      } catch (error) {
        console.error('[MultiTenantMiddleware] Erro ao verificar unidade_id:', error);
        return res.status(500).json({
          success: false,
          message: 'Erro interno na verificação de unidade'
        });
      }
    };
  }

  /**
   * Middleware para validar que recurso pertence à unidade do usuário
   * Usado em rotas de detalhes/edição/exclusão
   */
  validateResourceOwnership(getResourceUnidadeId) {
    return async (req, res, next) => {
      try {
        if (!req.user || !req.user.unidade_id) {
          return res.status(401).json({
            success: false,
            message: 'Usuário não autenticado ou sem unidade associada'
          });
        }

        // Obter unidade_id do recurso
        let resourceUnidadeId;
        
        if (typeof getResourceUnidadeId === 'function') {
          resourceUnidadeId = await getResourceUnidadeId(req);
        } else {
          resourceUnidadeId = getResourceUnidadeId;
        }

        // Verificar se recurso pertence à unidade do usuário
        if (resourceUnidadeId && resourceUnidadeId !== req.user.unidade_id) {
          return res.status(403).json({
            success: false,
            message: 'Acesso negado: recurso não pertence à sua unidade',
            code: 'RESOURCE_NOT_OWNED'
          });
        }

        next();
      } catch (error) {
        console.error('[MultiTenantMiddleware] Erro ao validar propriedade do recurso:', error);
        return res.status(500).json({
          success: false,
          message: 'Erro interno na validação de propriedade'
        });
      }
    };
  }

  /**
   * Middleware para adicionar filtro automático por unidade_id em queries
   * Usado em rotas de listagem
   */
  addUnidadeFilter() {
    return (req, res, next) => {
      try {
        if (!req.user || !req.user.unidade_id) {
          return res.status(401).json({
            success: false,
            message: 'Usuário não autenticado ou sem unidade associada'
          });
        }

        // Adicionar filtro de unidade aos query params
        req.query.unidade_id = req.user.unidade_id;
        req.unidadeId = req.user.unidade_id;

        next();
      } catch (error) {
        console.error('[MultiTenantMiddleware] Erro ao adicionar filtro de unidade:', error);
        return res.status(500).json({
          success: false,
          message: 'Erro interno no filtro de unidade'
        });
      }
    };
  }

  /**
   * Middleware para auditoria de acesso Multi-Tenant
   * Registra tentativas de acesso a recursos de outras unidades
   */
  auditMultiTenantAccess(action) {
    return (req, res, next) => {
      try {
        const originalSend = res.send;
        
        res.send = function(data) {
          // Log de auditoria
          const logData = {
            timestamp: new Date().toISOString(),
            action: action,
            user_id: req.user?.id,
            user_email: req.user?.email,
            user_unidade_id: req.user?.unidade_id,
            user_role: req.user?.role,
            method: req.method,
            path: req.path,
            params: req.params,
            query: req.query,
            ip: req.ip,
            user_agent: req.get('User-Agent'),
            status_code: res.statusCode,
            success: res.statusCode < 400
          };

          // Log apenas tentativas de acesso negado ou suspeitas
          if (res.statusCode === 403 || res.statusCode === 401) {
            console.warn('[AUDIT] Tentativa de acesso negado:', JSON.stringify(logData, null, 2));
          } else if (process.env.NODE_ENV === 'development') {
            console.log('[AUDIT] Acesso Multi-Tenant:', JSON.stringify(logData, null, 2));
          }

          originalSend.call(this, data);
        };

        next();
      } catch (error) {
        console.error('[MultiTenantMiddleware] Erro na auditoria:', error);
        next(); // Continuar mesmo com erro na auditoria
      }
    };
  }

  /**
   * Middleware para validar dados de entrada em operações Multi-Tenant
   * Garante que dados não contenham unidade_id diferente da do usuário
   */
  validateInputData() {
    return (req, res, next) => {
      try {
        if (!req.user || !req.user.unidade_id) {
          return res.status(401).json({
            success: false,
            message: 'Usuário não autenticado ou sem unidade associada'
          });
        }

        // Verificar se body contém unidade_id diferente
        if (req.body && req.body.unidade_id && req.body.unidade_id !== req.user.unidade_id) {
          return res.status(400).json({
            success: false,
            message: 'Não é possível especificar unidade_id diferente da sua própria unidade',
            code: 'INVALID_UNIDADE_ID'
          });
        }

        // Garantir que unidade_id seja sempre a do usuário
        if (req.body && typeof req.body === 'object') {
          req.body.unidade_id = req.user.unidade_id;
        }

        next();
      } catch (error) {
        console.error('[MultiTenantMiddleware] Erro na validação de dados:', error);
        return res.status(500).json({
          success: false,
          message: 'Erro interno na validação de dados'
        });
      }
    };
  }

  /**
   * Middleware combinado para operações CRUD Multi-Tenant
   * Combina validação de unidade + auditoria + filtros
   */
  multiTenantCRUD(action) {
    return [
      this.requireUnidadeId(),
      this.auditMultiTenantAccess(action),
      this.validateInputData()
    ];
  }

  /**
   * Middleware para operações de listagem Multi-Tenant
   */
  multiTenantList(action) {
    return [
      this.requireUnidadeId(),
      this.addUnidadeFilter(),
      this.auditMultiTenantAccess(action)
    ];
  }
}

module.exports = new MultiTenantMiddleware();

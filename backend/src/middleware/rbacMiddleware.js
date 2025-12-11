const AuthService = require('../services/AuthService');
const AuditLog = require('../models/AuditLog');
const logger = require('./../utils/logger');

class RBACMiddleware {
  constructor() {
    this.authService = new AuthService();
    this.auditLogModel = new AuditLog();
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
        logger.error('Erro no middleware RBAC:', error);
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
        logger.error('Erro no middleware de permissão:', error);
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
        logger.error('Erro no middleware de gerenciamento de unidade:', error);
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
        logger.error('Erro no middleware de filtros de dados:', error);
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
        logger.error('Erro no middleware de propriedade de recurso:', error);
        return res.status(500).json({
          error: 'Erro interno',
          message: 'Erro na verificação de propriedade de recurso'
        });
      }
    };
  }

  /**
   * Sanitizar dados sensíveis antes de logar
   * Remove senhas, tokens e outros dados confidenciais
   */
  sanitizeLogData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = [
      'senha', 'password', 'senha_hash', 'senha_atual', 'nova_senha', 'novaSenha',
      'token', 'accessToken', 'refreshToken', 'authorization',
      'cpf', 'rg', 'cartao_credito', 'cvv',
      'api_key', 'apiKey', 'secret'
    ];

    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const key in sanitized) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeLogData(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Extrair informações do recurso da requisição
   */
  extractResourceInfo(req, action) {
    let resourceType = null;
    let resourceId = null;

    // Tentar extrair do path
    const pathParts = req.path.split('/').filter(p => p);
    
    if (pathParts.length >= 2) {
      resourceType = pathParts[1]; // Ex: /api/agendamentos -> agendamentos
      
      // Se tem ID no path
      if (pathParts.length >= 3 && !isNaN(pathParts[2])) {
        resourceId = parseInt(pathParts[2]);
      }
    }

    // Tentar extrair do body
    if (!resourceId && req.body) {
      resourceId = req.body.id || req.body.agendamento_id || req.body.cliente_id || 
                   req.body.agente_id || req.body.servico_id || req.body.unidade_id;
    }

    // Tentar extrair do params
    if (!resourceId && req.params) {
      resourceId = req.params.id || req.params.agendamento_id || req.params.cliente_id;
    }

    return { resourceType, resourceId };
  }

  /**
   * Middleware para logs de auditoria
   * FASE 2.1 - Sistema de Auditoria Completo
   * 
   * Captura e persiste logs de ações críticas no sistema
   */
  auditLog(action) {
    return (req, res, next) => {
      const startTime = Date.now();
      const originalSend = res.send;
      const self = this; // Salvar referência ao RBACMiddleware
      
      // Capturar informações da requisição
      const usuario = req.user || {};
      const { resourceType, resourceId } = this.extractResourceInfo(req, action);
      
      // Sobrescrever res.send para capturar a resposta
      res.send = function(data) {
        const duration = Date.now() - startTime;
        
        // Processar log de forma assíncrona (não bloquear resposta)
        setImmediate(() => {
          try {
            // Parsear resposta se for string
            let responseData = data;
            if (typeof data === 'string') {
              try {
                responseData = JSON.parse(data);
              } catch (e) {
                responseData = { raw: data };
              }
            }

            // Preparar dados do log
            const logData = {
              // Usuário
              usuario_id: usuario.id || null,
              usuario_email: usuario.email || null,
              usuario_nome: usuario.nome || null,
              usuario_role: usuario.role || null,
              
              // Ação
              action: action,
              resource_type: resourceType,
              resource_id: resourceId,
              method: req.method,
              endpoint: req.originalUrl || req.url,
              
              // Requisição
              ip_address: req.ip || req.connection?.remoteAddress,
              user_agent: req.get ? req.get('user-agent') : null,
              status_code: res.statusCode,
              
              // Dados (sanitizados)
              request_data: req.body ? self.sanitizeLogData(req.body) : null,
              response_data: responseData ? self.sanitizeLogData(responseData) : null,
              error_message: res.statusCode >= 400 ? (responseData?.error || responseData?.message) : null,
              
              // Metadados
              unidade_id: usuario.unidade_id || req.body?.unidade_id || null,
              duration_ms: duration
            };

            // Persistir log de forma assíncrona (não bloquear resposta)
            self.auditLogModel.createLog(logData).catch(err => {
              logger.error('❌ [AuditLog] Erro ao persistir log:', err.message);
            });

          } catch (error) {
            // Não quebrar a aplicação se auditoria falhar
            logger.error('❌ [AuditLog] Erro ao processar log de auditoria:', error.message);
          }
        });
        
        // Enviar resposta original IMEDIATAMENTE (não esperar log)
        return originalSend.call(this, data);
      };
      
      next();
    };
  }
}

module.exports = new RBACMiddleware();

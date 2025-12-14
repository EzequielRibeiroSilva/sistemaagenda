const AuthService = require('../services/AuthService');
const Usuario = require('../models/Usuario');
const logger = require('./../utils/logger');

class AuthMiddleware {
  constructor() {
    this.authService = new AuthService();
  }

  // Middleware principal de autenticação
  authenticate() {
    return async (req, res, next) => {
      try {
        // Verificar se o header Authorization existe
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Token não fornecido',
            message: 'Token de autorização é obrigatório'
          });
        }

        // Extrair token
        const token = authHeader.substring(7); // Remove 'Bearer '

        // Verificar se token está na blacklist (✅ CORREÇÃO 1.1: async)
        const isBlacklisted = await this.authService.isTokenBlacklisted(token);
        if (isBlacklisted) {
          return res.status(401).json({
            error: 'Token inválido',
            message: 'Token foi invalidado'
          });
        }

        // Verificar e decodificar token
        const decoded = this.authService.verifyToken(token);

        // Buscar dados atualizados do usuário no banco
        const usuarioModel = new Usuario();
        const usuario = await usuarioModel.findById(decoded.id);

        if (!usuario) {
          return res.status(401).json({
            error: 'Usuário não encontrado',
            message: 'Token inválido'
          });
        }

        if (usuario.status !== 'Ativo') {
          return res.status(401).json({
            error: 'Usuário inativo',
            message: 'Conta bloqueada ou inativa'
          });
        }

        // Buscar avatar_url baseado no role do usuário
        let avatarUrl = null;
        if (usuario.role === 'AGENTE') {
          // Para agentes: buscar avatar_url na tabela agentes
          const Agente = require('../models/Agente');
          const agenteModel = new Agente();
          const agente = await agenteModel.db('agentes')
            .where('usuario_id', usuario.id)
            .select('avatar_url')
            .first();

          if (agente) {
            avatarUrl = agente.avatar_url;
          }
        } else if ((usuario.role === 'ADMIN' || usuario.role === 'MASTER') && usuario.unidade_id) {
          // Para admins e masters: buscar logo_url das configurações da unidade
          const ConfiguracaoSistema = require('../models/ConfiguracaoSistema');
          const { db } = require('../config/knex');
          const configuracaoModel = new ConfiguracaoSistema(db);
          const configuracao = await configuracaoModel.findByUnidade(usuario.unidade_id);

          if (configuracao && configuracao.logo_url) {
            avatarUrl = configuracao.logo_url;
          }
        }

        // Adicionar usuário ao request com informações RBAC
        req.user = {
          ...usuario,
          // Garantir que as informações RBAC estejam disponíveis
          role: usuario.role || decoded.role,
          unidade_id: usuario.unidade_id || decoded.unidade_id,
          agente_id: decoded.agente_id, // ✅ CRÍTICO: ID do agente na tabela agentes (para role='AGENTE')
          avatar_url: avatarUrl
        };
        req.token = token;

        next();

      } catch (error) {
        logger.error('❌ Erro na autenticação:', error.message);

        return res.status(401).json({
          error: 'Token inválido',
          message: 'Token inválido ou expirado'
        });
      }
    };
  }

  // Middleware para verificar permissões específicas
  requirePermission(permission) {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Não autenticado',
            message: 'Usuário não autenticado'
          });
        }

        const hasPermission = this.authService.hasPermission(req.user.tipo_usuario, permission);

        if (!hasPermission) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não tem permissão para esta ação'
          });
        }

        next();

      } catch (error) {
        logger.error('❌ Erro na verificação de permissão:', error.message);

        return res.status(500).json({
          error: 'Erro interno do servidor',
          message: 'Erro ao verificar permissões'
        });
      }
    };
  }

  // Middleware para verificar tipo de usuário específico
  requireUserType(...allowedTypes) {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Não autenticado',
            message: 'Usuário não autenticado'
          });
        }

        if (!allowedTypes.includes(req.user.tipo_usuario)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: `Acesso restrito a: ${allowedTypes.join(', ')}`
          });
        }

        next();

      } catch (error) {
        logger.error('❌ Erro na verificação de tipo de usuário:', error.message);

        return res.status(500).json({
          error: 'Erro interno do servidor',
          message: 'Erro ao verificar tipo de usuário'
        });
      }
    };
  }

  // Middleware para verificar propriedade de recurso
  requireResourceOwnership(getResourceUserId) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Não autenticado',
            message: 'Usuário não autenticado'
          });
        }

        // Admin pode acessar qualquer recurso
        if (req.user.tipo_usuario === 'admin') {
          return next();
        }

        // Obter ID do usuário proprietário do recurso
        const resourceUserId = await getResourceUserId(req);

        if (!this.authService.canAccessResource(req.user, resourceUserId)) {
          return res.status(403).json({
            error: 'Acesso negado',
            message: 'Você não pode acessar este recurso'
          });
        }

        next();

      } catch (error) {
        logger.error('❌ Erro na verificação de propriedade:', error.message);

        return res.status(500).json({
          error: 'Erro interno do servidor',
          message: 'Erro ao verificar propriedade do recurso'
        });
      }
    };
  }

  // Middleware opcional (não bloqueia se não houver token)
  optionalAuth() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return next(); // Continua sem usuário
        }

        const token = authHeader.substring(7);

        // ✅ CORREÇÃO CRÍTICA: Adicionar await para função assíncrona
        if (await this.authService.isTokenBlacklisted(token)) {
          return next(); // Continua sem usuário
        }

        const decoded = this.authService.verifyToken(token);
        const usuarioModel = new Usuario();
        const usuario = await usuarioModel.findById(decoded.id);

        if (usuario && usuario.status === 'Ativo') {
          req.user = usuario;
          req.token = token;
        }

        next();

      } catch (error) {
        // Em caso de erro, continua sem usuário
        next();
      }
    };
  }
}

// Exportar instância única
const authMiddleware = new AuthMiddleware();

module.exports = {
  authenticate: authMiddleware.authenticate.bind(authMiddleware),
  requirePermission: authMiddleware.requirePermission.bind(authMiddleware),
  requireUserType: authMiddleware.requireUserType.bind(authMiddleware),
  requireResourceOwnership: authMiddleware.requireResourceOwnership.bind(authMiddleware),
  optionalAuth: authMiddleware.optionalAuth.bind(authMiddleware)
};

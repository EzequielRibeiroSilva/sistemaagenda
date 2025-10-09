const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'painel_agendamento_secret_key_2025';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.blacklistedTokens = new Set(); // Em produção, usar Redis
  }

  // Gerar JWT token
  generateToken(user) {
    const payload = {
      user_id: user.id, // Renomeado para user_id conforme especificação
      id: user.id, // Mantido para compatibilidade
      email: user.email,
      nome: user.nome,
      role: user.role, // Nova coluna role (MASTER, ADMIN, AGENTE)
      unidade_id: user.unidade_id, // Nova coluna unidade_id
      tipo_usuario: user.tipo_usuario, // Mantido para compatibilidade
      plano: user.plano,
      limite_unidades: user.limite_unidades,
      status: user.status
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
      issuer: 'painel-agendamento-api',
      audience: 'painel-agendamento-frontend'
    });
  }

  // Verificar e decodificar JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'painel-agendamento-api',
        audience: 'painel-agendamento-frontend'
      });
    } catch (error) {
      throw new Error('Token inválido ou expirado');
    }
  }

  // Fazer login
  async login(email, senha) {
    try {
      // Buscar usuário por email
      const usuarioModel = new Usuario();
      const usuario = await usuarioModel.findByEmail(email);

      if (!usuario) {
        throw new Error('Credenciais inválidas');
      }

      // Verificar se o usuário está ativo
      if (usuario.status !== 'Ativo') {
        throw new Error('Usuário bloqueado ou inativo');
      }

      // Verificar senha
      const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
      if (!senhaValida) {
        throw new Error('Credenciais inválidas');
      }

      // Gerar token
      const token = this.generateToken(usuario);

      // Remover senha do objeto de retorno
      const { senha_hash, ...usuarioSemSenha } = usuario;

      return {
        token,
        user: usuarioSemSenha,
        expiresIn: this.jwtExpiresIn
      };
    } catch (error) {
      throw error;
    }
  }

  // Fazer logout (adicionar token à blacklist)
  logout(token) {
    try {
      // Verificar se o token é válido antes de adicionar à blacklist
      this.verifyToken(token);
      this.blacklistedTokens.add(token);
      return true;
    } catch (error) {
      // Token já inválido, não precisa fazer nada
      return true;
    }
  }

  // Verificar se token está na blacklist
  isTokenBlacklisted(token) {
    return this.blacklistedTokens.has(token);
  }

  // Refresh token (gerar novo token baseado no atual)
  async refreshToken(token) {
    try {
      const decoded = this.verifyToken(token);
      
      // Buscar dados atualizados do usuário
      const usuarioModel = new Usuario();
      const usuario = await usuarioModel.findById(decoded.id);

      if (!usuario || usuario.status !== 'Ativo') {
        throw new Error('Usuário não encontrado ou inativo');
      }

      // Gerar novo token
      const novoToken = this.generateToken(usuario);

      // Adicionar token antigo à blacklist
      this.blacklistedTokens.add(token);

      // Remover senha do objeto de retorno
      const { senha_hash, ...usuarioSemSenha } = usuario;

      return {
        token: novoToken,
        user: usuarioSemSenha,
        expiresIn: this.jwtExpiresIn
      };
    } catch (error) {
      throw error;
    }
  }

  // Validar permissões por role (RBAC)
  hasPermission(role, requiredPermission) {
    const permissions = {
      MASTER: ['read', 'write', 'delete', 'manage_users', 'manage_system', 'manage_all_units', 'create_admins'],
      ADMIN: ['read', 'write', 'delete', 'manage_agents', 'manage_unit'],
      AGENTE: ['read', 'write', 'view_own_data']
    };

    return permissions[role]?.includes(requiredPermission) || false;
  }

  // Verificar se usuário pode acessar recurso baseado no RBAC
  canAccessResource(user, resourceUserId, resourceUnidadeId = null) {
    // MASTER pode acessar qualquer recurso
    if (user.role === 'MASTER') {
      return true;
    }

    // ADMIN pode acessar recursos da sua unidade
    if (user.role === 'ADMIN') {
      // Se é o próprio usuário, pode acessar
      if (user.id === resourceUserId) {
        return true;
      }
      // Se tem unidade_id e o recurso pertence à mesma unidade
      if (user.unidade_id && resourceUnidadeId && user.unidade_id === resourceUnidadeId) {
        return true;
      }
      return false;
    }

    // AGENTE só pode acessar seus próprios recursos
    if (user.role === 'AGENTE') {
      return user.id === resourceUserId;
    }

    return false;
  }

  // Verificar se usuário pode gerenciar uma unidade específica
  canManageUnit(user, unidadeId) {
    // MASTER pode gerenciar qualquer unidade
    if (user.role === 'MASTER') {
      return true;
    }

    // ADMIN pode gerenciar apenas sua própria unidade
    if (user.role === 'ADMIN') {
      return user.unidade_id === unidadeId;
    }

    // AGENTE não pode gerenciar unidades
    return false;
  }

  // Obter filtros de dados baseados no role do usuário
  getDataFilters(user) {
    switch (user.role) {
      case 'MASTER':
        // MASTER vê todos os dados - sem filtros
        return {};

      case 'ADMIN':
        // ADMIN vê apenas dados da sua unidade
        return user.unidade_id ? { unidade_id: user.unidade_id } : {};

      case 'AGENTE':
        // AGENTE vê apenas seus próprios dados
        return {
          agente_id: user.id,
          // Também pode ver dados da sua unidade se aplicável
          ...(user.unidade_id ? { unidade_id: user.unidade_id } : {})
        };

      default:
        // Por segurança, se role não reconhecido, não retorna dados
        return { id: -1 }; // Filtro que não retorna nada
    }
  }
}

module.exports = AuthService;

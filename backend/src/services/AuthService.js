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
      id: user.id,
      email: user.email,
      nome: user.nome,
      tipo_usuario: user.tipo_usuario,
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

  // Validar permissões por tipo de usuário
  hasPermission(userType, requiredPermission) {
    const permissions = {
      admin: ['read', 'write', 'delete', 'manage_users', 'manage_system'],
      salon: ['read', 'write', 'delete', 'manage_agents'],
      agent: ['read', 'write']
    };

    return permissions[userType]?.includes(requiredPermission) || false;
  }

  // Verificar se usuário pode acessar recurso
  canAccessResource(user, resourceUserId) {
    // Admin pode acessar qualquer recurso
    if (user.tipo_usuario === 'admin') {
      return true;
    }

    // Outros usuários só podem acessar seus próprios recursos
    return user.id === resourceUserId;
  }
}

module.exports = AuthService;

const AuthService = require('../services/AuthService');

class AuthController {
  constructor() {
    this.authService = new AuthService();
  }

  // POST /auth/login
  async login(req, res) {
    try {
      const { email, senha } = req.body;

      // Validações básicas
      if (!email || !senha) {
        return res.status(400).json({
          error: 'Dados obrigatórios',
          message: 'Email e senha são obrigatórios'
        });
      }

      // Validar formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: 'Email inválido',
          message: 'Formato de email inválido'
        });
      }

      // Fazer login
      const result = await this.authService.login(email, senha);

      // Log de sucesso
      console.log(`✅ Login realizado com sucesso: ${email} (${result.user.tipo_usuario})`);

      // Determinar redirecionamento baseado no role
      let redirectTo = '/DashboardPage'; // Padrão

      switch (result.user.role) {
        case 'MASTER':
          redirectTo = '/AdminDashboardPage';
          break;
        case 'ADMIN':
          redirectTo = '/DashboardPage';
          break;
        case 'AGENTE':
          redirectTo = '/DashboardPage';
          break;
        default:
          redirectTo = '/DashboardPage';
      }

      return res.json({
        success: true,
        message: 'Login realizado com sucesso',
        data: {
          ...result,
          user: {
            ...result.user,
            permissions: {
              can_manage_system: result.user.role === 'MASTER',
              can_manage_units: result.user.role === 'MASTER',
              can_manage_agents: ['MASTER', 'ADMIN'].includes(result.user.role),
              can_create_appointments: ['MASTER', 'ADMIN', 'AGENTE'].includes(result.user.role),
              can_view_all_data: result.user.role === 'MASTER',
              can_view_unit_data: ['MASTER', 'ADMIN'].includes(result.user.role),
              can_view_own_data: true
            }
          },
          redirectTo: redirectTo
        }
      });

    } catch (error) {
      console.error('❌ Erro no login:', error.message);

      // Não expor detalhes do erro por segurança
      const isCredentialError = error.message.includes('Credenciais inválidas') || 
                               error.message.includes('Usuário bloqueado');

      if (isCredentialError) {
        return res.status(401).json({
          error: 'Credenciais inválidas',
          message: 'Email ou senha incorretos'
        });
      }

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: 'Erro ao processar login'
      });
    }
  }

  // POST /auth/logout
  async logout(req, res) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({
          error: 'Token não fornecido',
          message: 'Token de autorização é obrigatório'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer '
      
      // Fazer logout
      this.authService.logout(token);

      console.log(`✅ Logout realizado com sucesso: ${req.user?.email || 'usuário'}`);

      return res.json({
        success: true,
        message: 'Logout realizado com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro no logout:', error.message);

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: 'Erro ao processar logout'
      });
    }
  }

  // GET /auth/validate
  async validateToken(req, res) {
    try {
      // O middleware de autenticação já validou o token
      // req.user contém os dados do usuário decodificados do JWT
      res.status(200).json({
        success: true,
        data: req.user,
        message: 'Token válido'
      });
    } catch (error) {
      console.error('Erro na validação do token:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao validar token'
      });
    }
  }

  // POST /auth/refresh
  async refreshToken(req, res) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({
          error: 'Token não fornecido',
          message: 'Token de autorização é obrigatório'
        });
      }

      const token = authHeader.substring(7);
      
      // Refresh token
      const result = await this.authService.refreshToken(token);

      console.log(`✅ Token renovado com sucesso: ${result.user.email}`);

      return res.json({
        success: true,
        message: 'Token renovado com sucesso',
        data: result
      });

    } catch (error) {
      console.error('❌ Erro ao renovar token:', error.message);

      return res.status(401).json({
        error: 'Token inválido',
        message: 'Não foi possível renovar o token'
      });
    }
  }

  // GET /auth/me
  async me(req, res) {
    try {
      // O middleware de autenticação já validou o token e adicionou o usuário ao req
      const { senha_hash, ...user } = req.user;

      return res.json({
        success: true,
        data: { user }
      });

    } catch (error) {
      console.error('❌ Erro ao buscar dados do usuário:', error.message);

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: 'Erro ao buscar dados do usuário'
      });
    }
  }

  // POST /auth/change-password
  async changePassword(req, res) {
    try {
      const { senhaAtual, novaSenha } = req.body;
      const userId = req.user.id;

      // Validações básicas
      if (!senhaAtual || !novaSenha) {
        return res.status(400).json({
          error: 'Dados obrigatórios',
          message: 'Senha atual e nova senha são obrigatórias'
        });
      }

      if (novaSenha.length < 6) {
        return res.status(400).json({
          error: 'Senha inválida',
          message: 'Nova senha deve ter pelo menos 6 caracteres'
        });
      }

      // Verificar senha atual
      const Usuario = require('../models/Usuario');
      const usuarioModel = new Usuario();
      const usuario = await usuarioModel.findById(userId);

      const bcrypt = require('bcryptjs');
      const senhaAtualValida = await bcrypt.compare(senhaAtual, usuario.senha_hash);
      
      if (!senhaAtualValida) {
        return res.status(400).json({
          error: 'Senha atual incorreta',
          message: 'A senha atual informada está incorreta'
        });
      }

      // Atualizar senha
      await usuarioModel.update(userId, { senha: novaSenha });

      console.log(`✅ Senha alterada com sucesso: ${req.user.email}`);

      return res.json({
        success: true,
        message: 'Senha alterada com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro ao alterar senha:', error.message);

      return res.status(500).json({
        error: 'Erro interno do servidor',
        message: 'Erro ao alterar senha'
      });
    }
  }

  // POST /auth/logout
  async logout(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (token) {
        // Adicionar token à blacklist
        await this.authService.blacklistToken(token);
        console.log('🚪 Token adicionado à blacklist no logout');
      }

      res.status(200).json({
        success: true,
        message: 'Logout realizado com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro no logout:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: 'Erro ao realizar logout'
      });
    }
  }
}

module.exports = AuthController;

const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { authenticate } = require('../middleware/authMiddleware');
const { loginRateLimit, userSpecificRateLimit } = require('../middleware/loginRateLimit');
const { validateLogin, sanitizeInput, detectSQLInjection } = require('../middleware/validation');

// Instanciar controlador
const authController = new AuthController();

/**
 * @route POST /auth/login
 * @desc Fazer login e obter JWT token
 * @access Public
 * @body { email: string, senha: string }
 * @returns { success: boolean, message: string, data: { token: string, user: object, expiresIn: string } }
 * @security Rate limited: 5 tentativas por IP em 15min, 3 tentativas por email em 30min
 * @security Input validation, XSS protection, SQL injection detection
 * @note detectSQLInjection e sanitizeInput já aplicados globalmente no app.js
 */
router.post('/login',
  validateLogin,
  loginRateLimit,
  userSpecificRateLimit,
  async (req, res) => {
    await authController.login(req, res);
  }
);

/**
 * @route POST /auth/logout
 * @desc Fazer logout e invalidar token
 * @access Private
 * @headers Authorization: Bearer <token>
 * @returns { success: boolean, message: string }
 */
router.post('/logout', authenticate(), async (req, res) => {
  await authController.logout(req, res);
});

/**
 * @route GET /auth/validate
 * @desc Validar token JWT
 * @access Private
 * @headers Authorization: Bearer <token>
 * @returns { success: boolean, data: { user: object }, message: string }
 */
router.get('/validate', authenticate(), async (req, res) => {
  await authController.validateToken(req, res);
});

/**
 * @route POST /auth/refresh
 * @desc Renovar token JWT
 * @access Private
 * @headers Authorization: Bearer <token>
 * @returns { success: boolean, message: string, data: { token: string, user: object, expiresIn: string } }
 */
router.post('/refresh', async (req, res) => {
  await authController.refreshToken(req, res);
});

/**
 * @route GET /auth/me
 * @desc Obter dados do usuário logado
 * @access Private
 * @headers Authorization: Bearer <token>
 * @returns { success: boolean, data: { user: object } }
 */
router.get('/me', authenticate(), async (req, res) => {
  await authController.me(req, res);
});

/**
 * @route POST /auth/change-password
 * @desc Alterar senha do usuário logado
 * @access Private
 * @headers Authorization: Bearer <token>
 * @body { senhaAtual: string, novaSenha: string }
 * @returns { success: boolean, message: string }
 */
router.post('/change-password', authenticate(), async (req, res) => {
  await authController.changePassword(req, res);
});

/**
 * @route GET /auth/validate
 * @desc Validar se token é válido (para frontend)
 * @access Private
 * @headers Authorization: Bearer <token>
 * @returns { success: boolean, data: { valid: boolean, user: object } }
 */
router.get('/validate', authenticate(), async (req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        valid: true,
        user: req.user
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      data: {
        valid: false
      }
    });
  }
});

module.exports = router;

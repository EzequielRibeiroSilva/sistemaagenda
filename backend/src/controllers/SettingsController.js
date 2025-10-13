/**
 * Controller: SettingsController
 * Descrição: Endpoints REST para configurações do sistema
 * Endpoints: GET /api/settings, PUT /api/settings, POST /api/settings/logo
 */

const SettingsService = require('../services/SettingsService');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

class SettingsController {
  constructor(db) {
    this.db = db;
    this.settingsService = new SettingsService(db);
    this.setupMulter();
  }

  /**
   * Configuração do multer para upload de logo
   */
  setupMulter() {
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/logos');
        try {
          await fs.mkdir(uploadDir, { recursive: true });
          cb(null, uploadDir);
        } catch (error) {
          cb(error);
        }
      },
      filename: (req, file, cb) => {
        const unidadeId = req.user.unidade_id;
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `logo-unidade-${unidadeId}-${timestamp}${ext}`);
      }
    });

    const fileFilter = (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Tipo de arquivo não permitido. Use apenas JPEG, PNG ou GIF.'), false);
      }
    };

    this.upload = multer({
      storage,
      fileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
      }
    });
  }

  /**
   * GET /api/settings
   * Busca configurações da unidade do usuário logado
   */
  async getSettings(req, res) {
    try {
      const { unidade_id } = req.user;
      
      console.log(`[SettingsController] Buscando configurações para unidade ${unidade_id}`);
      
      const configuracoes = await this.settingsService.getConfiguracoes(unidade_id);
      
      // Log de auditoria
      console.log(`🔍 AUDIT: ${req.user.role} (ID: ${req.user.id}) realizou VISUALIZAR_CONFIGURACOES em GET /api/settings`);
      
      res.json({
        success: true,
        data: configuracoes,
        message: 'Configurações carregadas com sucesso'
      });
    } catch (error) {
      console.error('[SettingsController] Erro ao buscar configurações:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * PUT /api/settings
   * Atualiza configurações da unidade (suporta multipart/form-data para logo)
   */
  async updateSettings(req, res) {
    try {
      const { unidade_id, id: userId } = req.user;
      let dadosConfiguracao = { ...req.body };

      console.log(`[SettingsController] Atualizando configurações para unidade ${unidade_id}`);
      console.log(`[SettingsController] Dados recebidos:`, dadosConfiguracao);
      console.log(`[SettingsController] Arquivo recebido:`, !!req.file);

      // 1. Processar upload de logo (se houver)
      if (req.file) {
        const logoUrl = `/uploads/logos/${req.file.filename}`;
        dadosConfiguracao.logo_url = logoUrl;
        console.log(`[SettingsController] Logo processado: ${logoUrl}`);
      }

      // 2. Processar alteração de senha (se houver)
      if (dadosConfiguracao.senha_atual && dadosConfiguracao.nova_senha) {
        console.log(`[SettingsController] Processando alteração de senha`);
        await this.settingsService.updateSenhaAdmin(
          userId,
          dadosConfiguracao.senha_atual,
          dadosConfiguracao.nova_senha,
          dadosConfiguracao.confirmacao_senha
        );

        // Remove dados de senha dos dados de configuração
        delete dadosConfiguracao.senha_atual;
        delete dadosConfiguracao.nova_senha;
        delete dadosConfiguracao.confirmacao_senha;
      }

      // 3. Atualizar configurações (incluindo logo_url se houver)
      const configuracaoAtualizada = await this.settingsService.updateConfiguracoes(
        unidade_id,
        dadosConfiguracao
      );

      // Log de auditoria
      console.log(`🔍 AUDIT: ${req.user.role} (ID: ${req.user.id}) realizou ATUALIZAR_CONFIGURACOES em PUT /api/settings`);

      res.json({
        success: true,
        data: configuracaoAtualizada,
        message: 'Configurações atualizadas com sucesso'
      });
    } catch (error) {
      console.error('[SettingsController] Erro ao atualizar configurações:', error);

      // Remove arquivo se houve erro
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
          console.log(`[SettingsController] Arquivo removido após erro: ${req.file.path}`);
        } catch (unlinkError) {
          console.error('[SettingsController] Erro ao remover arquivo:', unlinkError);
        }
      }

      res.status(400).json({
        success: false,
        error: 'Erro na validação',
        message: error.message
      });
    }
  }

  /**
   * POST /api/settings/logo
   * Upload de logo da unidade
   */
  async uploadLogo(req, res) {
    try {
      const { unidade_id } = req.user;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Arquivo não fornecido',
          message: 'Nenhum arquivo de logo foi enviado'
        });
      }
      
      // Gera URL do logo
      const logoUrl = `/uploads/logos/${req.file.filename}`;
      
      // Atualiza configuração com nova URL do logo (sem validação de outros campos)
      await this.settingsService.updateLogoOnly(unidade_id, logoUrl);
      
      console.log(`[SettingsController] Logo atualizado para unidade ${unidade_id}: ${logoUrl}`);
      
      // Log de auditoria
      console.log(`🔍 AUDIT: ${req.user.role} (ID: ${req.user.id}) realizou UPLOAD_LOGO em POST /api/settings/logo`);
      
      res.json({
        success: true,
        data: {
          logo_url: logoUrl,
          filename: req.file.filename
        },
        message: 'Logo atualizado com sucesso'
      });
    } catch (error) {
      console.error('[SettingsController] Erro no upload do logo:', error);
      
      // Remove arquivo se houve erro
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('[SettingsController] Erro ao remover arquivo:', unlinkError);
        }
      }
      
      res.status(500).json({
        success: false,
        error: 'Erro no upload',
        message: error.message
      });
    }
  }

  /**
   * Middleware para upload de logo
   */
  getUploadMiddleware() {
    return this.upload.single('logo');
  }
}

module.exports = SettingsController;

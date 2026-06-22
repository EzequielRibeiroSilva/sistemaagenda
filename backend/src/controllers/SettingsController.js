/**
 * Controller: SettingsController
 * Descrição: Endpoints REST para configurações do sistema
 * Endpoints: GET /api/settings, PUT /api/settings, POST /api/settings/logo
 */

const SettingsService = require('../services/SettingsService');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./../utils/logger');

class SettingsController {
  constructor(db) {
    this.db = db;
    this.settingsService = new SettingsService(db);
    this.setupMulter();
  }

  async resolveUnidadeId(req) {
    const unidadeIdFromToken = req.user?.unidade_id;
    if (unidadeIdFromToken) return unidadeIdFromToken;

    const userId = req.user?.id;
    if (!userId) return null;

    const unidade = await this.db('unidades')
      .where('usuario_id', userId)
      .where('status', 'Ativo')
      .orderBy('id', 'asc')
      .select('id')
      .first();

    return unidade?.id || null;
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
      const unidade_id = await this.resolveUnidadeId(req);

      if (!unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Unidade não definida',
          message: 'Usuário não possui unidade ativa vinculada. Crie/ative uma unidade para acessar as configurações.'
        });
      }
      
      const configuracoes = await this.settingsService.getConfiguracoes(unidade_id);
      
      // ✅ AÇÃO 2.2: Remover campos de pontos da resposta
      // Sistema de Pontos possui API dedicada (/api/pontos/configuracoes)
      const responseSemPontos = { ...configuracoes };
      delete responseSemPontos.pontos_ativo;
      delete responseSemPontos.pontos_por_real;
      delete responseSemPontos.reais_por_pontos;
      delete responseSemPontos.pontos_validade_meses;
      
      res.json({
        success: true,
        data: responseSemPontos,
        message: 'Configurações carregadas com sucesso'
      });
    } catch (error) {
      logger.error('[SettingsController] Erro ao buscar configurações:', error);
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
      const { id: userId } = req.user;
      const unidade_id = await this.resolveUnidadeId(req);

      if (!unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Unidade não definida',
          message: 'Usuário não possui unidade ativa vinculada. Crie/ative uma unidade antes de atualizar as configurações.'
        });
      }
      let dadosConfiguracao = { ...req.body };

      // Converter tipos de string para os tipos corretos (FormData envia tudo como string)
      if (dadosConfiguracao.duracao_servico_horas !== undefined) {
        dadosConfiguracao.duracao_servico_horas = parseFloat(dadosConfiguracao.duracao_servico_horas);
      }
      if (dadosConfiguracao.tempo_limite_agendar_horas !== undefined) {
        dadosConfiguracao.tempo_limite_agendar_horas = parseInt(dadosConfiguracao.tempo_limite_agendar_horas, 10);
      }
      if (dadosConfiguracao.tempo_limite_cancelar_horas !== undefined) {
        dadosConfiguracao.tempo_limite_cancelar_horas = parseInt(dadosConfiguracao.tempo_limite_cancelar_horas, 10);
      }
      if (dadosConfiguracao.periodo_futuro_dias !== undefined) {
        dadosConfiguracao.periodo_futuro_dias = parseInt(dadosConfiguracao.periodo_futuro_dias, 10);
      }
      if (dadosConfiguracao.permitir_cancelamento !== undefined) {
        dadosConfiguracao.permitir_cancelamento = dadosConfiguracao.permitir_cancelamento === 'true' || dadosConfiguracao.permitir_cancelamento === true;
      }
      
      // ✅ AÇÃO 2.2: Remover campos de pontos do payload
      // Sistema de Pontos agora possui API dedicada (/api/pontos/configuracoes)
      delete dadosConfiguracao.pontos_ativo;
      delete dadosConfiguracao.pontos_por_real;
      delete dadosConfiguracao.reais_por_pontos;
      delete dadosConfiguracao.pontos_validade_meses;

      // 1. Processar upload de logo (se houver)
      if (req.file) {
        const logoUrl = `/uploads/logos/${req.file.filename}`;
        dadosConfiguracao.logo_url = logoUrl;
        logger.info('[SettingsController] Logo processada:', logoUrl);
      }

      // 2. Processar alteração de senha (se houver)
      if (dadosConfiguracao.senha_atual && dadosConfiguracao.nova_senha) {

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
      logger.info('[SettingsController] Dados para atualização:', JSON.stringify(dadosConfiguracao));

      const configuracaoAtualizada = await this.settingsService.updateConfiguracoes(
        unidade_id,
        dadosConfiguracao
      );

      // 🗑️ INVALIDAÇÃO DE CACHE FAQ (TASK 3.2)
      setImmediate(async () => {
        try {
          const { invalidateKnowledgeCache } = require('../middleware/cacheInvalidation');
          await invalidateKnowledgeCache(userId, unidade_id);
        } catch (err) {
          logger.warn('[Cache] Erro ao invalidar (não-crítico):', err?.message);
        }
      });

      // ✅ AÇÃO 2.2: Remover campos de pontos da resposta também
      // Garante isolamento completo - cliente não recebe dados de pontos via /api/settings
      const responseSemPontos = { ...configuracaoAtualizada };
      delete responseSemPontos.pontos_ativo;
      delete responseSemPontos.pontos_por_real;
      delete responseSemPontos.reais_por_pontos;
      delete responseSemPontos.pontos_validade_meses;

      logger.info('[SettingsController] Configuração atualizada retornada:', JSON.stringify(responseSemPontos));

      res.json({
        success: true,
        data: responseSemPontos,
        message: 'Configurações atualizadas com sucesso'
      });
    } catch (error) {
      logger.error('[SettingsController] Erro ao atualizar configurações:', error);

      // Remove arquivo se houve erro
      if (req.file) {
        try {
          await fs.unlink(req.file.path);

        } catch (unlinkError) {
          logger.error('[SettingsController] Erro ao remover arquivo:', unlinkError);
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
      const unidade_id = await this.resolveUnidadeId(req);

      if (!unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Unidade não definida',
          message: 'Usuário não possui unidade ativa vinculada. Crie/ative uma unidade antes de atualizar o logo.'
        });
      }
      
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

      // 🗑️ INVALIDAÇÃO DE CACHE FAQ (TASK 3.2)
      setImmediate(async () => {
        try {
          const { invalidateKnowledgeCache } = require('../middleware/cacheInvalidation');
          await invalidateKnowledgeCache(req.user?.id, unidade_id);
        } catch (err) {
          logger.warn('[Cache] Erro ao invalidar (não-crítico):', err?.message);
        }
      });
      

      
      res.json({
        success: true,
        data: {
          logo_url: logoUrl,
          filename: req.file.filename
        },
        message: 'Logo atualizado com sucesso'
      });
    } catch (error) {
      logger.error('[SettingsController] Erro no upload do logo:', error);
      
      // Remove arquivo se houve erro
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          logger.error('[SettingsController] Erro ao remover arquivo:', unlinkError);
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

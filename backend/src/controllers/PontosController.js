/**
 * Controller: PontosController
 * Descrição: Endpoints REST dedicados para o Sistema de Pontos
 * Endpoints: GET /api/pontos/configuracoes, PUT /api/pontos/configuracoes
 */

const logger = require('../utils/logger');

class PontosController {
  constructor(db) {
    this.db = db;
  }

  /**
   * Resolve o unidade_id do usuário logado
   */
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
   * GET /api/pontos/configuracoes
   * Retorna apenas as configurações do Sistema de Pontos
   */
  async getConfiguracoes(req, res) {
    try {
      const unidade_id = await this.resolveUnidadeId(req);

      if (!unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Unidade não definida',
          message: 'Usuário não possui unidade ativa vinculada.'
        });
      }

      const config = await this.db('configuracoes_sistema')
        .where('unidade_id', unidade_id)
        .select(
          'pontos_ativo',
          'pontos_por_real',
          'reais_por_pontos',
          'pontos_validade_meses'
        )
        .first();

      if (!config) {
        // Retornar valores padrão se não houver configuração
        return res.json({
          success: true,
          data: {
            pontos_ativo: false,
            pontos_por_real: 1.0,
            reais_por_pontos: 10.0,
            pontos_validade_meses: 12
          },
          message: 'Configurações padrão retornadas'
        });
      }

      res.json({
        success: true,
        data: config,
        message: 'Configurações de pontos carregadas com sucesso'
      });
    } catch (error) {
      logger.error('[PontosController] Erro ao buscar configurações de pontos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  /**
   * PUT /api/pontos/configuracoes
   * Atualiza apenas as configurações do Sistema de Pontos
   */
  async updateConfiguracoes(req, res) {
    try {
      const { id: userId } = req.user;
      const unidade_id = await this.resolveUnidadeId(req);

      if (!unidade_id) {
        return res.status(400).json({
          success: false,
          error: 'Unidade não definida',
          message: 'Usuário não possui unidade ativa vinculada.'
        });
      }

      // Extrair apenas os campos relacionados ao Sistema de Pontos
      const {
        pontos_ativo,
        pontos_por_real,
        reais_por_pontos,
        pontos_validade_meses
      } = req.body;

      // Validações
      if (pontos_ativo !== undefined && typeof pontos_ativo !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Validação falhou',
          message: 'pontos_ativo deve ser um booleano'
        });
      }

      if (pontos_por_real !== undefined) {
        const valor = parseFloat(pontos_por_real);
        if (isNaN(valor) || valor <= 0 || valor > 100) {
          return res.status(400).json({
            success: false,
            error: 'Validação falhou',
            message: 'pontos_por_real deve estar entre 0.01 e 100'
          });
        }
      }

      if (reais_por_pontos !== undefined) {
        const valor = parseFloat(reais_por_pontos);
        if (isNaN(valor) || valor < 1 || valor > 1000) {
          return res.status(400).json({
            success: false,
            error: 'Validação falhou',
            message: 'reais_por_pontos deve estar entre 1 e 1000'
          });
        }
      }

      if (pontos_validade_meses !== undefined) {
        const valor = parseInt(pontos_validade_meses, 10);
        if (isNaN(valor) || valor < 1 || valor > 60) {
          return res.status(400).json({
            success: false,
            error: 'Validação falhou',
            message: 'pontos_validade_meses deve estar entre 1 e 60'
          });
        }
      }

      // Montar objeto de atualização apenas com campos fornecidos
      const dadosAtualizacao = {};
      
      if (pontos_ativo !== undefined) {
        dadosAtualizacao.pontos_ativo = pontos_ativo;
      }
      
      if (pontos_por_real !== undefined) {
        dadosAtualizacao.pontos_por_real = parseFloat(pontos_por_real);
      }
      
      if (reais_por_pontos !== undefined) {
        dadosAtualizacao.reais_por_pontos = parseFloat(reais_por_pontos);
      }
      
      if (pontos_validade_meses !== undefined) {
        dadosAtualizacao.pontos_validade_meses = parseInt(pontos_validade_meses, 10);
      }

      // Verificar se há pelo menos um campo para atualizar
      if (Object.keys(dadosAtualizacao).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum dado fornecido',
          message: 'Forneça pelo menos um campo de configuração de pontos para atualizar'
        });
      }

      // Adicionar timestamp de atualização
      dadosAtualizacao.updated_at = this.db.fn.now();

      // Verificar se existe configuração para esta unidade
      const existingConfig = await this.db('configuracoes_sistema')
        .where('unidade_id', unidade_id)
        .first();

      let configAtualizada;

      if (existingConfig) {
        // Atualizar configuração existente
        await this.db('configuracoes_sistema')
          .where('unidade_id', unidade_id)
          .update(dadosAtualizacao);

        configAtualizada = await this.db('configuracoes_sistema')
          .where('unidade_id', unidade_id)
          .select(
            'pontos_ativo',
            'pontos_por_real',
            'reais_por_pontos',
            'pontos_validade_meses'
          )
          .first();
      } else {
        // Criar nova configuração com valores padrão + dados fornecidos
        const novaConfig = {
          unidade_id,
          pontos_ativo: dadosAtualizacao.pontos_ativo ?? false,
          pontos_por_real: dadosAtualizacao.pontos_por_real ?? 1.0,
          reais_por_pontos: dadosAtualizacao.reais_por_pontos ?? 10.0,
          pontos_validade_meses: dadosAtualizacao.pontos_validade_meses ?? 12,
          // Valores padrão para outros campos obrigatórios
          nome_negocio: 'Meu Negócio',
          duracao_servico_horas: 1.0,
          tempo_limite_agendar_horas: 2,
          permitir_cancelamento: true,
          tempo_limite_cancelar_horas: 4,
          periodo_futuro_dias: 365,
          created_at: this.db.fn.now(),
          updated_at: this.db.fn.now()
        };

        await this.db('configuracoes_sistema').insert(novaConfig);

        configAtualizada = {
          pontos_ativo: novaConfig.pontos_ativo,
          pontos_por_real: novaConfig.pontos_por_real,
          reais_por_pontos: novaConfig.reais_por_pontos,
          pontos_validade_meses: novaConfig.pontos_validade_meses
        };
      }

      logger.info(`[PontosController] Configurações de pontos atualizadas para unidade ${unidade_id}`);

      res.json({
        success: true,
        data: configAtualizada,
        message: 'Configurações de pontos atualizadas com sucesso'
      });
    } catch (error) {
      logger.error('[PontosController] Erro ao atualizar configurações de pontos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = PontosController;

const EvolutionApiService = require('../services/EvolutionApiService');
const logger = require('./../utils/logger');

class EvolutionApiController {
  constructor() {
    this.evolutionApi = new EvolutionApiService();
  }

  // GET /api/evolution/status - Verificar status da Evolution API
  async status(req, res) {
    try {
      const result = await this.evolutionApi.verificarStatus();
      
      return res.json({
        success: result.success,
        data: result,
        message: result.success ? 'Status verificado com sucesso' : 'Erro ao verificar status'
      });

    } catch (error) {
      logger.error('Erro ao verificar status Evolution API:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/evolution/test - Teste de conectividade
  async test(req, res) {
    try {
      const result = await this.evolutionApi.testeConectividade();
      
      return res.json({
        success: result.success,
        data: result,
        message: result.message
      });

    } catch (error) {
      logger.error('Erro no teste de conectividade:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/evolution/send-test - Enviar mensagem de teste
  async sendTest(req, res) {
    try {
      const { numero } = req.body;

      if (!numero) {
        return res.status(400).json({
          success: false,
          error: 'Número obrigatório',
          message: 'O número de telefone é obrigatório'
        });
      }

      const result = await this.evolutionApi.enviarMensagemTeste(numero);
      
      return res.json({
        success: result.success,
        data: result,
        message: result.success ? 'Mensagem de teste enviada com sucesso' : 'Erro ao enviar mensagem'
      });

    } catch (error) {
      logger.error('Erro ao enviar mensagem de teste:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // POST /api/evolution/send-message - Enviar mensagem personalizada
  async sendMessage(req, res) {
    try {
      const { numero, mensagem } = req.body;

      if (!numero || !mensagem) {
        return res.status(400).json({
          success: false,
          error: 'Dados obrigatórios',
          message: 'Número e mensagem são obrigatórios'
        });
      }

      const result = await this.evolutionApi.enviarMensagem(numero, mensagem);
      
      return res.json({
        success: result.success,
        data: result,
        message: result.success ? 'Mensagem enviada com sucesso' : 'Erro ao enviar mensagem'
      });

    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }

  // GET /api/evolution/config - Mostrar configuração atual (sem dados sensíveis)
  async config(req, res) {
    try {
      const config = {
        baseURL: this.evolutionApi.baseURL,
        instanceId: this.evolutionApi.instanceId,
        apiKeyConfigured: !!this.evolutionApi.apiKey && this.evolutionApi.apiKey !== 'your_evolution_api_key_here',
        timeout: this.evolutionApi.timeout
      };

      return res.json({
        success: true,
        data: config,
        message: 'Configuração da Evolution API'
      });

    } catch (error) {
      logger.error('Erro ao obter configuração:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
}

module.exports = EvolutionApiController;

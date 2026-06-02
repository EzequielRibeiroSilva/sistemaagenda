const WhatsAppService = require('../services/WhatsAppService');
const logger = require('../utils/logger');

/**
 * Controller para testes isolados de funcionalidades
 * Usado para debugging e validação de integrações
 */
class TestController {
  constructor() {
    this.whatsAppService = new WhatsAppService();
  }

  /**
   * Teste isolado do WhatsApp Service
   * POST /api/test/whatsapp
   */
  async testWhatsApp(req, res) {
    try {
      const { telefone, mensagem } = req.body;

      // Validações básicas
      if (!telefone) {
        return res.status(400).json({
          success: false,
          error: 'Telefone é obrigatório'
        });
      }

      // Usar mensagem personalizada ou padrão
      const mensagemTeste = mensagem || 'Teste de integração WhatsApp - Sistema de Agendamentos';

      logger.log('🧪 [TestController] Iniciando teste WhatsApp:', {
        telefone,
        mensagem: mensagemTeste
      });

      // Testar envio direto
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME || process.env.APP_NAME || 'test-instance';
      const resultado = await this.whatsAppService.sendMessage(instanceName, telefone, mensagemTeste);

      logger.log('🧪 [TestController] Resultado do teste:', resultado);

      return res.status(200).json({
        success: true,
        data: resultado,
        message: 'Teste WhatsApp executado'
      });

    } catch (error) {
      logger.error('❌ [TestController] Erro no teste WhatsApp:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'Erro no teste WhatsApp'
      });
    }
  }

  /**
   * Teste do template de agendamento
   * POST /api/test/whatsapp/agendamento
   */
  async testWhatsAppAgendamento(req, res) {
    try {
      const { agendamento_id } = req.body;

      if (!agendamento_id) {
        return res.status(400).json({
          success: false,
          error: 'agendamento_id é obrigatório'
        });
      }

      logger.log('🧪 [TestController] Testando template de agendamento:', agendamento_id);

      // Buscar dados do agendamento (usando o mesmo método do AgendamentoController)
      const AgendamentoController = require('./AgendamentoController');
      const agendamentoController = new AgendamentoController();
      
      const dadosCompletos = await agendamentoController.buscarDadosCompletos(agendamento_id);

      if (!dadosCompletos) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado'
        });
      }

      logger.log('🧪 [TestController] Dados do agendamento:', dadosCompletos);

      // Testar envio da confirmação
      const resultado = await this.whatsAppService.sendAppointmentConfirmation(dadosCompletos);

      logger.log('🧪 [TestController] Resultado do envio:', resultado);

      return res.status(200).json({
        success: true,
        data: {
          agendamento: dadosCompletos,
          whatsapp_result: resultado
        },
        message: 'Teste de template de agendamento executado'
      });

    } catch (error) {
      logger.error('❌ [TestController] Erro no teste de agendamento:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'Erro no teste de template de agendamento'
      });
    }
  }

  /**
   * Teste de conectividade com Evolution API
   * GET /api/test/whatsapp/status
   */
  async testWhatsAppStatus(req, res) {
    try {
      logger.log('🧪 [TestController] Testando status da Evolution API');

      // Verificar configurações
      const config = {
        enabled: process.env.WHATSAPP_ENABLED === 'true',
        test_mode: process.env.WHATSAPP_TEST_MODE === 'true',
        api_url: process.env.EVOLUTION_API_URL,
        instance: process.env.EVOLUTION_INSTANCE_NAME,
        has_key: !!process.env.EVOLUTION_API_KEY
      };

      logger.log('🧪 [TestController] Configurações WhatsApp:', config);

      // Testar conectividade básica (se habilitado)
      let status_api = null;
      if (config.enabled && config.api_url) {
        try {
          // Fazer uma requisição simples para testar conectividade
          const response = await fetch(`${config.api_url}/instance/connectionState/${config.instance}`, {
            method: 'GET',
            headers: {
              'apikey': process.env.EVOLUTION_API_KEY
            }
          });
          
          status_api = {
            status_code: response.status,
            connected: response.ok,
            response: response.ok ? await response.json() : await response.text()
          };
        } catch (fetchError) {
          status_api = {
            error: fetchError.message,
            connected: false
          };
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          config,
          status_api
        },
        message: 'Status da Evolution API verificado'
      });

    } catch (error) {
      logger.error('❌ [TestController] Erro no teste de status:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'Erro no teste de status'
      });
    }
  }
}

module.exports = TestController;

/**
 * Controller: WhatsAppTestController
 * Descrição: Controlador para testes e debug do WhatsApp
 */

const WhatsAppService = require('../services/WhatsAppService');

class WhatsAppTestController {
  constructor() {
    this.whatsAppService = new WhatsAppService();
  }

  /**
   * Testar envio de mensagem WhatsApp
   */
  async testMessage(req, res) {
    try {
      const { telefone, nome = 'Cliente Teste' } = req.body;

      if (!telefone) {
        return res.status(400).json({
          success: false,
          message: 'Telefone é obrigatório'
        });
      }

      // Dados de teste para agendamento
      const agendamentoTeste = {
        cliente: {
          nome: nome,
          telefone: telefone
        },
        agente: {
          nome: 'Ezequiel Ribeiro'
        },
        unidade: {
          nome: 'Unidade 1'
        },
        data_agendamento: new Date().toISOString().split('T')[0],
        hora_inicio: '14:00:00',
        hora_fim: '15:00:00',
        valor_total: '50.00',
        servicos: [
          { nome: 'Corte de Cabelo', preco: '25.00' },
          { nome: 'Barba', preco: '25.00' }
        ]
      };

      console.log(`[WhatsAppTest] Testando envio para ${telefone}`);

      // Enviar mensagem de teste
      const resultado = await this.whatsAppService.sendAppointmentConfirmation(agendamentoTeste);

      res.status(200).json({
        success: true,
        data: {
          telefone: telefone,
          nome: nome,
          resultado: resultado,
          configuracao: {
            enabled: this.whatsAppService.enabled,
            testMode: this.whatsAppService.testMode,
            url: this.whatsAppService.evolutionApiUrl,
            instance: this.whatsAppService.instanceName
          }
        },
        message: resultado.success ? 'Mensagem enviada com sucesso' : 'Falha no envio da mensagem'
      });

    } catch (error) {
      console.error('[WhatsAppTest] Erro ao testar mensagem:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Obter configurações do WhatsApp
   */
  async getConfig(req, res) {
    try {
      const config = {
        enabled: this.whatsAppService.enabled,
        testMode: this.whatsAppService.testMode,
        url: this.whatsAppService.evolutionApiUrl,
        instance: this.whatsAppService.instanceName,
        instanceId: this.whatsAppService.instanceId,
        isConfigured: this.whatsAppService.isEnabled()
      };

      res.status(200).json({
        success: true,
        data: config,
        message: 'Configurações do WhatsApp obtidas com sucesso'
      });

    } catch (error) {
      console.error('[WhatsAppTest] Erro ao obter configurações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Gerar preview da mensagem
   */
  async previewMessage(req, res) {
    try {
      const { telefone, nome = 'Cliente Teste' } = req.body;

      // Dados de teste para agendamento
      const agendamentoTeste = {
        cliente: {
          nome: nome,
          telefone: telefone || '+5585999999999'
        },
        agente: {
          nome: 'Ezequiel Ribeiro'
        },
        unidade: {
          nome: 'Unidade 1'
        },
        data_agendamento: new Date().toISOString().split('T')[0],
        hora_inicio: '14:00:00',
        hora_fim: '15:00:00',
        valor_total: '50.00',
        servicos: [
          { nome: 'Corte de Cabelo', preco: '25.00' },
          { nome: 'Barba', preco: '25.00' }
        ]
      };

      // Gerar mensagem sem enviar
      const mensagem = this.whatsAppService.generateAppointmentMessage(agendamentoTeste);

      res.status(200).json({
        success: true,
        data: {
          telefone: agendamentoTeste.cliente.telefone,
          nome: agendamentoTeste.cliente.nome,
          mensagem: mensagem,
          tamanho: mensagem.length
        },
        message: 'Preview da mensagem gerado com sucesso'
      });

    } catch (error) {
      console.error('[WhatsAppTest] Erro ao gerar preview:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Testar conectividade com Evolution API
   */
  async testConnection(req, res) {
    try {
      console.log('[WhatsAppTest] Testando conectividade com Evolution API...');

      const { apikey } = req.body || {};
      const testApiKey = apikey || this.whatsAppService.evolutionApiKey;

      const testUrl = `${this.whatsAppService.evolutionApiUrl}/instance/fetchInstances`;

      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': testApiKey
        }
      });

      const data = await response.json();

      res.status(200).json({
        success: response.ok,
        data: {
          url: testUrl,
          status: response.status,
          statusText: response.statusText,
          response: data,
          headers: Object.fromEntries(response.headers.entries()),
          apiKeyTested: testApiKey ? `${testApiKey.substring(0, 8)}...` : 'Não fornecida'
        },
        message: response.ok ? 'Conectividade OK' : 'Falha na conectividade'
      });

    } catch (error) {
      console.error('[WhatsAppTest] Erro ao testar conectividade:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao testar conectividade',
        error: error.message
      });
    }
  }

  /**
   * Criar nova instância na Evolution API
   */
  async createInstance(req, res) {
    try {
      const { apikey, instanceName = 'painel-agendamento' } = req.body;

      if (!apikey) {
        return res.status(400).json({
          success: false,
          message: 'API Key é obrigatória'
        });
      }

      console.log(`[WhatsAppTest] Criando instância ${instanceName}...`);

      const createUrl = `${this.whatsAppService.evolutionApiUrl}/instance/create`;

      const response = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apikey
        },
        body: JSON.stringify({
          instanceName: instanceName,
          token: 'PAINEL-DE-AGENDAMENTOS',
          qrcode: true,
          markMessagesRead: true,
          delayMessage: 1000,
          alwaysOnline: true,
          readReceipts: true,
          readStatus: true,
          syncFullHistory: true
        })
      });

      const data = await response.json();

      res.status(response.status).json({
        success: response.ok,
        data: {
          url: createUrl,
          status: response.status,
          statusText: response.statusText,
          response: data,
          instanceName: instanceName
        },
        message: response.ok ? 'Instância criada com sucesso' : 'Falha ao criar instância'
      });

    } catch (error) {
      console.error('[WhatsAppTest] Erro ao criar instância:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar instância',
        error: error.message
      });
    }
  }
}

module.exports = WhatsAppTestController;

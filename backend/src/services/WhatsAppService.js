/**
 * Service: WhatsAppService
 * Descrição: Integração com Evolution API para envio de mensagens WhatsApp
 * Funcionalidades: Envio de notificações de agendamento, confirmações, lembretes
 */

class WhatsAppService {
  constructor() {
    this.evolutionApiUrl = process.env.EVO_API_BASE_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    this.evolutionApiKey = process.env.EVO_API_KEY || process.env.EVOLUTION_API_KEY || '';
    this.instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'PAINEL-DE-AGENDAMENTOS';
    this.instanceId = process.env.EVO_API_INSTANCE_ID || '';
    this.enabled = process.env.ENABLE_WHATSAPP_NOTIFICATIONS === 'true' || process.env.WHATSAPP_ENABLED === 'true';
    this.testMode = process.env.WHATSAPP_TEST_MODE === 'true';

    console.log('[WhatsApp] Configuração:', {
      enabled: this.enabled,
      testMode: this.testMode,
      url: this.evolutionApiUrl,
      instance: this.instanceName,
      instanceId: this.instanceId
    });
  }

  /**
   * Verificar se o serviço está habilitado
   */
  isEnabled() {
    return this.enabled && this.evolutionApiUrl && this.evolutionApiKey;
  }

  /**
   * Formatar número de telefone para WhatsApp
   */
  formatPhoneNumber(phone) {
    // Remove todos os caracteres não numéricos
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Remove zero inicial se houver
    if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }
    
    // Se não tem código do país (55), adiciona
    if (!cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }
    
    // Retorna apenas o número limpo (Evolution API não precisa do @s.whatsapp.net)
    return cleanPhone;
  }

  /**
   * Enviar mensagem via Evolution API
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isEnabled()) {
      console.log('[WhatsApp] Serviço desabilitado, mensagem não enviada');
      return { success: false, message: 'Serviço WhatsApp desabilitado' };
    }

    // Modo de teste - simula envio bem-sucedido
    if (this.testMode) {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      console.log(`🧪 [WhatsApp TEST MODE] Simulando envio para ${formattedPhone}`);
      console.log(`📱 [WhatsApp TEST MODE] Mensagem: ${message.substring(0, 100)}...`);

      // Simular delay de rede
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(`✅ [WhatsApp TEST MODE] Mensagem "enviada" com sucesso para ${phoneNumber}`);
      return {
        success: true,
        data: {
          messageId: `test_${Date.now()}`,
          phone: formattedPhone,
          status: 'sent',
          testMode: true
        }
      };
    }

    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      console.log(`[WhatsApp] Enviando mensagem para ${formattedPhone}`);

      // Usar instanceName se disponível, senão usar instanceId
      const instanceIdentifier = this.instanceName || this.instanceId;

      const payload = {
        number: formattedPhone,
        text: message,
        delay: 1000
      };

      console.log(`[WhatsApp] Payload:`, JSON.stringify(payload, null, 2));
      console.log(`[WhatsApp] URL: ${this.evolutionApiUrl}message/sendText/${instanceIdentifier}`);
      console.log(`[WhatsApp] API Key: ${this.evolutionApiKey ? '***' + this.evolutionApiKey.slice(-4) : 'MISSING'}`);

      const response = await fetch(`${this.evolutionApiUrl}message/sendText/${instanceIdentifier}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.evolutionApiKey
        },
        body: JSON.stringify(payload),
        timeout: 30000 // 30 segundos de timeout
      });

      const data = await response.json();

      console.log(`[WhatsApp] Response Status: ${response.status}`);
      console.log(`[WhatsApp] Response Headers:`, Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        console.log('[WhatsApp] Mensagem enviada com sucesso');
        console.log('[WhatsApp] Response Data:', JSON.stringify(data, null, 2));
        return { success: true, data };
      } else {
        console.error('[WhatsApp] Erro ao enviar mensagem:');
        console.error(`  Status: ${response.status}`);
        console.error(`  Data:`, JSON.stringify(data, null, 2));
        return {
          success: false,
          error: {
            status: response.status,
            error: response.statusText,
            response: data
          }
        };
      }

    } catch (error) {
      console.error('[WhatsApp] Erro na requisição:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gerar mensagem de confirmação de agendamento
   */
  generateAppointmentMessage(agendamentoData) {
    const { cliente, agente, unidade, data_agendamento, hora_inicio, hora_fim, servicos, extras = [], valor_total } = agendamentoData;
    
    const dataFormatada = new Date(data_agendamento + 'T00:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const servicosTexto = servicos.map(s => `• ${s.nome} - R$ ${parseFloat(s.preco || 0).toFixed(2).replace('.', ',')}`).join('\n');

    // Adicionar extras se houver
    let extrasTexto = '';
    if (extras && extras.length > 0) {
      extrasTexto = `\n\n✨ *Serviços Extras:*\n${extras.map(e => `• ${e.nome} - R$ ${parseFloat(e.preco || 0).toFixed(2).replace('.', ',')}`).join('\n')}`;
    }

    return `🎉 *Agendamento Confirmado!*

Olá, ${cliente.nome}! Seu agendamento na ${unidade.nome} foi CONFIRMADO!

📋 *Detalhes do Agendamento:*
📍 Local: ${unidade.nome}
👤 Profissional: ${agente.nome}
📅 Data: ${dataFormatada}
🕐 Horário: ${hora_inicio} às ${hora_fim}

💼 *Serviços:*
${servicosTexto}${extrasTexto}

💰 *Valor Total: R$ ${parseFloat(valor_total || 0).toFixed(2).replace('.', ',')}*

⚠️ *Importante:*
• Chegue com 10 minutos de antecedência
• Em caso de cancelamento, avise com pelo menos 2 horas de antecedência
• Traga um documento com foto

Se precisar cancelar ou reagendar, entre em contato conosco.

Obrigado por escolher nossos serviços! 😊

_Esta é uma mensagem automática do sistema de agendamentos._`;
  }

  /**
   * Enviar notificação de agendamento criado
   */
  async sendAppointmentConfirmation(agendamentoData) {
    try {
      if (!this.isEnabled()) {
        console.log(`[WhatsApp] Serviço desabilitado - Confirmação NÃO enviada para ${agendamentoData.cliente.nome}`);
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const message = this.generateAppointmentMessage(agendamentoData);
      const result = await this.sendMessage(agendamentoData.cliente.telefone, message);

      if (result.success) {
        console.log(`✅ [WhatsApp] Confirmação enviada para ${agendamentoData.cliente.nome} (${agendamentoData.cliente.telefone})`);
      } else {
        console.error(`❌ [WhatsApp] Falha ao enviar confirmação para ${agendamentoData.cliente.nome}:`, result.error);

        // Log mais detalhado para debug
        if (result.error && result.error.response && result.error.response.message) {
          console.error(`[WhatsApp] Detalhes do erro:`, result.error.response.message);
        }
      }

      return result;
    } catch (error) {
      console.error('❌ [WhatsApp] Erro ao enviar confirmação:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gerar mensagem de lembrete de agendamento
   */
  generateReminderMessage(agendamentoData) {
    const { cliente, agente, unidade, data_agendamento, hora_inicio } = agendamentoData;
    
    const dataFormatada = new Date(data_agendamento + 'T00:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    return `⏰ *Lembrete de Agendamento*

Olá, ${cliente.nome}! Lembramos que você tem um agendamento amanhã.

📋 *Detalhes:*
📍 Local: ${unidade.nome}
👤 Profissional: ${agente.nome}
📅 Data: ${dataFormatada}
🕐 Horário: ${hora_inicio}

⚠️ *Lembre-se:*
• Chegue com 10 minutos de antecedência
• Traga um documento com foto

Nos vemos em breve! 😊

_Esta é uma mensagem automática do sistema de agendamentos._`;
  }

  /**
   * Enviar lembrete de agendamento
   */
  async sendAppointmentReminder(agendamentoData) {
    try {
      const message = this.generateReminderMessage(agendamentoData);
      const result = await this.sendMessage(agendamentoData.cliente.telefone, message);
      
      if (result.success) {
        console.log(`[WhatsApp] Lembrete enviado para ${agendamentoData.cliente.nome}`);
      } else {
        console.error(`[WhatsApp] Falha ao enviar lembrete para ${agendamentoData.cliente.nome}:`, result.error);
      }
      
      return result;
    } catch (error) {
      console.error('[WhatsApp] Erro ao enviar lembrete:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Testar conexão com Evolution API
   */
  async testConnection() {
    if (!this.isEnabled()) {
      return { success: false, message: 'Serviço WhatsApp desabilitado' };
    }

    try {
      const response = await fetch(`${this.evolutionApiUrl}/instance/fetchInstances`, {
        method: 'GET',
        headers: {
          'apikey': this.evolutionApiKey
        }
      });

      const data = await response.json();

      if (response.ok) {
        console.log('[WhatsApp] Conexão com Evolution API OK');
        return { success: true, data };
      } else {
        console.error('[WhatsApp] Erro na conexão:', data);
        return { success: false, error: data };
      }

    } catch (error) {
      console.error('[WhatsApp] Erro ao testar conexão:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = WhatsAppService;

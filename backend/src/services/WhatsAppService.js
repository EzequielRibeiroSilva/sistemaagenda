/**
 * Service: WhatsAppService
 * Descrição: Integração com Evolution API para envio de mensagens WhatsApp
 * Funcionalidades: Envio de notificações de agendamento, confirmações, lembretes
 */

class WhatsAppService {
  constructor() {
    this.evolutionApiUrl = process.env.EVO_API_BASE_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    this.evolutionApiKey = process.env.EVOLUTION_API_KEY || '';
    this.instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'painel-agendamento';
    this.instanceId = process.env.EVO_API_INSTANCE_ID || '';
    this.enabled = process.env.WHATSAPP_ENABLED === 'true';

    console.log('[WhatsApp] Configuração:', {
      enabled: this.enabled,
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
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Se não tem código do país, adiciona 55 (Brasil)
    if (cleanPhone.length === 11 && cleanPhone.startsWith('11')) {
      return `55${cleanPhone}@s.whatsapp.net`;
    } else if (cleanPhone.length === 10) {
      return `5511${cleanPhone}@s.whatsapp.net`;
    } else if (cleanPhone.length === 13 && cleanPhone.startsWith('55')) {
      return `${cleanPhone}@s.whatsapp.net`;
    }
    
    // Fallback: assumir que já está no formato correto
    return `${cleanPhone}@s.whatsapp.net`;
  }

  /**
   * Enviar mensagem via Evolution API
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isEnabled()) {
      console.log('[WhatsApp] Serviço desabilitado, mensagem não enviada');
      return { success: false, message: 'Serviço WhatsApp desabilitado' };
    }

    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      console.log(`[WhatsApp] Enviando mensagem para ${formattedPhone}`);
      
      // Usar instanceId se disponível, senão usar instanceName
      const instanceIdentifier = this.instanceId || this.instanceName;

      const response = await fetch(`${this.evolutionApiUrl}/message/sendText/${instanceIdentifier}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.evolutionApiKey
        },
        body: JSON.stringify({
          number: formattedPhone,
          text: message
        })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('[WhatsApp] Mensagem enviada com sucesso');
        return { success: true, data };
      } else {
        console.error('[WhatsApp] Erro ao enviar mensagem:', data);
        return { success: false, error: data };
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
    const { cliente, agente, unidade, data_agendamento, hora_inicio, hora_fim, servicos, valor_total } = agendamentoData;
    
    const dataFormatada = new Date(data_agendamento + 'T00:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const servicosTexto = servicos.map(s => `• ${s.nome} - R$ ${parseFloat(s.preco || 0).toFixed(2).replace('.', ',')}`).join('\n');

    return `🎉 *Agendamento Confirmado!*

Olá, ${cliente.nome}! Seu agendamento na ${unidade.nome} foi CONFIRMADO!

📋 *Detalhes do Agendamento:*
📍 Local: ${unidade.nome}
👤 Profissional: ${agente.nome}
📅 Data: ${dataFormatada}
🕐 Horário: ${hora_inicio} às ${hora_fim}

💼 *Serviços:*
${servicosTexto}

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
      const message = this.generateAppointmentMessage(agendamentoData);
      const result = await this.sendMessage(agendamentoData.cliente.telefone, message);
      
      if (result.success) {
        console.log(`[WhatsApp] Confirmação enviada para ${agendamentoData.cliente.nome}`);
      } else {
        console.error(`[WhatsApp] Falha ao enviar confirmação para ${agendamentoData.cliente.nome}:`, result.error);
      }
      
      return result;
    } catch (error) {
      console.error('[WhatsApp] Erro ao enviar confirmação:', error);
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

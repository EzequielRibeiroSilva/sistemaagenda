const axios = require('axios');

class EvolutionApiService {
  constructor() {
    this.baseURL = process.env.EVO_API_BASE_URL || 'https://evolution-api.com';
    this.instanceId = process.env.EVO_API_INSTANCE_ID || 'painel_agendamento';
    this.apiKey = process.env.EVO_API_KEY || 'your_evolution_api_key_here';
    this.timeout = 10000; // 10 segundos
    
    // Configurar cliente axios
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey
      }
    });

    // Log de configuração
    console.log('🔧 Evolution API Service configurado:');
    console.log(`   Base URL: ${this.baseURL}`);
    console.log(`   Instance ID: ${this.instanceId}`);
    console.log(`   API Key: ${this.apiKey ? '***' + this.apiKey.slice(-4) : 'NÃO CONFIGURADA'}`);
  }

  // Função base para enviar mensagem
  async enviarMensagem(numero, mensagem, options = {}) {
    try {
      // Limpar e formatar número
      const numeroLimpo = this.formatarNumero(numero);
      
      if (!numeroLimpo) {
        throw new Error('Número de telefone inválido');
      }

      // Preparar payload
      const payload = {
        number: numeroLimpo,
        text: mensagem,
        delay: options.delay || 1000,
        ...options
      };

      console.log(`📱 Enviando mensagem WhatsApp para ${numeroLimpo}:`);
      console.log(`   Mensagem: ${mensagem.substring(0, 50)}${mensagem.length > 50 ? '...' : ''}`);

      // Fazer requisição para Evolution API
      const response = await this.client.post(`/message/sendText/${this.instanceId}`, payload);

      if (response.data && response.data.key) {
        console.log(`✅ Mensagem enviada com sucesso! ID: ${response.data.key.id}`);
        return {
          success: true,
          messageId: response.data.key.id,
          numero: numeroLimpo,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error('Resposta inválida da Evolution API');
      }

    } catch (error) {
      console.error('❌ Erro ao enviar mensagem WhatsApp:', error.message);
      
      // Log detalhado do erro
      if (error.response) {
        console.error('   Status:', error.response.status);
        console.error('   Data:', error.response.data);
      }

      return {
        success: false,
        error: error.message,
        numero: numero,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Enviar mensagem com mídia (imagem, documento, etc.)
  async enviarMensagemComMidia(numero, mensagem, mediaUrl, mediaType = 'image') {
    try {
      const numeroLimpo = this.formatarNumero(numero);
      
      const payload = {
        number: numeroLimpo,
        caption: mensagem,
        media: mediaUrl,
        mediatype: mediaType
      };

      console.log(`📱 Enviando mensagem com mídia para ${numeroLimpo}`);

      const response = await this.client.post(`/message/sendMedia/${this.instanceId}`, payload);

      if (response.data && response.data.key) {
        console.log(`✅ Mensagem com mídia enviada! ID: ${response.data.key.id}`);
        return {
          success: true,
          messageId: response.data.key.id,
          numero: numeroLimpo,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error('Resposta inválida da Evolution API');
      }

    } catch (error) {
      console.error('❌ Erro ao enviar mensagem com mídia:', error.message);
      return {
        success: false,
        error: error.message,
        numero: numero,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Verificar status da instância
  async verificarStatus() {
    try {
      console.log('🔍 Verificando status da Evolution API...');
      
      const response = await this.client.get(`/instance/connectionState/${this.instanceId}`);
      
      const status = response.data?.instance?.state || 'unknown';
      console.log(`📊 Status da instância: ${status}`);
      
      return {
        success: true,
        status: status,
        connected: status === 'open',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Erro ao verificar status:', error.message);
      return {
        success: false,
        error: error.message,
        connected: false,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Formatar número de telefone para padrão internacional
  formatarNumero(numero) {
    if (!numero) return null;
    
    // Remover caracteres não numéricos
    let numeroLimpo = numero.replace(/\D/g, '');
    
    // Se começar com 0, remover
    if (numeroLimpo.startsWith('0')) {
      numeroLimpo = numeroLimpo.substring(1);
    }
    
    // Se não começar com 55 (Brasil), adicionar
    if (!numeroLimpo.startsWith('55')) {
      numeroLimpo = '55' + numeroLimpo;
    }
    
    // Verificar se tem tamanho válido (13 dígitos: 55 + DDD + 9 dígitos)
    if (numeroLimpo.length < 12 || numeroLimpo.length > 13) {
      return null;
    }
    
    return numeroLimpo;
  }

  // Teste de conectividade
  async testeConectividade() {
    try {
      console.log('🧪 Executando teste de conectividade Evolution API...');
      
      // Verificar status da instância
      const statusResult = await this.verificarStatus();
      
      if (!statusResult.success) {
        return {
          success: false,
          message: 'Falha ao verificar status da instância',
          error: statusResult.error
        };
      }

      return {
        success: true,
        message: 'Evolution API conectada e funcionando',
        status: statusResult.status,
        connected: statusResult.connected,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Erro no teste de conectividade:', error.message);
      return {
        success: false,
        message: 'Erro no teste de conectividade',
        error: error.message
      };
    }
  }

  // Enviar mensagem de teste
  async enviarMensagemTeste(numero) {
    const mensagem = `🧪 *Teste de Integração Evolution API*

✅ Painel de Agendamento conectado com sucesso!

📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}
🔧 Instância: ${this.instanceId}

Esta é uma mensagem de teste para validar a integração com a Evolution API.`;

    return await this.enviarMensagem(numero, mensagem);
  }

  // Templates de mensagens para agendamentos
  getTemplateNovoAgendamento(dadosAgendamento) {
    const { cliente, servico, data, hora, agente, unidade } = dadosAgendamento;
    
    return `🎉 *Agendamento Confirmado!*

Olá *${cliente.nome}*! Seu agendamento foi confirmado com sucesso.

📋 *Detalhes do Agendamento:*
🔸 Serviço: ${servico.nome}
🔸 Data: ${data}
🔸 Horário: ${hora}
🔸 Profissional: ${agente.nome}
🔸 Local: ${unidade.nome}

💰 Valor: R$ ${servico.preco}

📍 Endereço: ${unidade.endereco}

⏰ *Lembre-se:* Chegue com 10 minutos de antecedência.

Em caso de dúvidas, entre em contato conosco!`;
  }

  getTemplateLembreteAgendamento(dadosAgendamento) {
    const { cliente, servico, data, hora, agente, unidade } = dadosAgendamento;
    
    return `⏰ *Lembrete de Agendamento*

Olá *${cliente.nome}*! Lembramos que você tem um agendamento amanhã.

📋 *Detalhes:*
🔸 Serviço: ${servico.nome}
🔸 Data: ${data}
🔸 Horário: ${hora}
🔸 Profissional: ${agente.nome}
🔸 Local: ${unidade.nome}

📍 Endereço: ${unidade.endereco}

⏰ Chegue com 10 minutos de antecedência.

Para reagendar ou cancelar, entre em contato conosco.`;
  }
}

module.exports = EvolutionApiService;

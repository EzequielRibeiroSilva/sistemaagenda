/**
 * Service: WhatsAppService
 * Descrição: Integração com Evolution API para envio de mensagens WhatsApp
 * Funcionalidades: Envio de notificações de agendamento, confirmações, lembretes
 */

const NotificacaoModel = require('../models/NotificacaoModel');
const Usuario = require('../models/Usuario');
const { db } = require('../config/knex');
const logger = require('./../utils/logger');

class WhatsAppService {
  constructor() {
    this.evolutionApiUrl = process.env.EVO_API_BASE_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    this.evolutionApiKey = process.env.EVO_API_KEY || process.env.EVOLUTION_API_KEY || '';
    this.instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'PAINEL-DE-AGENDAMENTOS';
    this.instanceId = process.env.EVO_API_INSTANCE_ID || '';
    this.enabled = process.env.WHATSAPP_ENABLED === 'true' || process.env.ENABLE_WHATSAPP_NOTIFICATIONS === 'true';
    this.testMode = process.env.WHATSAPP_TEST_MODE === 'true';
    this.notificacaoModel = new NotificacaoModel();
    this.usuarioModel = new Usuario();
  }

  async resolveOwnerUsuarioIdFromAgendamentoData(agendamentoData) {
    const directOwnerId = agendamentoData?.unidade?.usuario_id;
    if (directOwnerId) return directOwnerId;

    const unidadeId = agendamentoData?.unidade_id || agendamentoData?.unidade?.id;
    if (!unidadeId) return null;

    const unidade = await db('unidades')
      .where('id', unidadeId)
      .select('usuario_id')
      .first();

    return unidade?.usuario_id || null;
  }

  async getWhatsAppInstanceForUsuario(usuarioId) {
    if (!usuarioId) return null;
    const user = await this.usuarioModel.findById(usuarioId);
    if (!user) return null;

    if (!user.whatsapp_instance_name || !user.whatsapp_instance_token) {
      return null;
    }

    return {
      instanceName: user.whatsapp_instance_name,
      token: user.whatsapp_instance_token,
      status: user.whatsapp_status,
      number: user.whatsapp_number
    };
  }

  async sendMessageViaInstance({ instanceName, token, phoneNumber, message }) {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    const payload = {
      number: formattedPhone,
      text: message,
      delay: 1000,
      linkPreview: false
    };

    const response = await fetch(`${this.evolutionApiUrl}message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': token
      },
      body: JSON.stringify(payload),
      timeout: 30000
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, data };
    }

    logger.error('❌ [WhatsApp] Erro ao enviar mensagem (multi-tenant):');
    logger.error('❌ [WhatsApp] Status:', response.status);
    logger.error('❌ [WhatsApp] Data:', JSON.stringify(data, null, 2));
    return {
      success: false,
      error: {
        status: response.status,
        error: response.statusText,
        response: data
      }
    };
  }

  formatAssinaturaSaldoMessage(assinaturaSaldo) {
    try {
      if (!assinaturaSaldo || !assinaturaSaldo.assinatura_ativa) return '';
      const planoNome = assinaturaSaldo?.plano?.nome || 'Plano';
      const cicloInicio = assinaturaSaldo?.ciclo?.inicio;
      const cicloFim = assinaturaSaldo?.ciclo?.fim;

      const cycleLine = (cicloInicio && cicloFim)
        ? `Ciclo atual: ${new Date(`${cicloInicio}T12:00:00`).toLocaleDateString('pt-BR')} até ${new Date(`${cicloFim}T12:00:00`).toLocaleDateString('pt-BR')}`
        : null;

      const saldos = Array.isArray(assinaturaSaldo?.saldos) ? assinaturaSaldo.saldos : [];
      if (saldos.length === 0) return '';

      const linhas = saldos
        .map(item => {
          const nome = item?.nome || (item?.tipo === 'SERVICO' ? 'Serviço' : 'Extra');
          const quota = item?.quantidade_por_ciclo;
          const restantes = item?.restantes;
          if (quota === null || quota === undefined) {
            return `• ${nome}: ilimitado`;
          }
          const quotaNum = parseInt(quota, 10) || 0;
          const restNum = restantes === null || restantes === undefined ? null : (parseInt(restantes, 10) || 0);
          return `• ${nome}: ${restNum === null ? '—' : restNum}/${quotaNum} restantes`;
        })
        .filter(Boolean);

      const header = `\n\n🎟️ *Clube de Assinatura* (${planoNome})`;
      const ciclo = cycleLine ? `\n${cycleLine}` : '';
      return `${header}${ciclo}\n\n${linhas.join('\n')}`;
    } catch {
      return '';
    }
  }

  generateSubscriptionEndingSoonClientMessage({ clienteNome, unidadeNome, wppLocal, diasRestantes, dataFimStr }) {
    const whenLine = (dataFimStr)
      ? `até ${new Date(`${dataFimStr}T12:00:00`).toLocaleDateString('pt-BR')}`
      : null;

    const diasTxt = typeof diasRestantes === 'number'
      ? (diasRestantes === 1 ? '1 dia' : `${diasRestantes} dias`)
      : null;

    const intro = `Oi, *${clienteNome}*! Tudo bem? 😊\n\nPassando rapidinho para te avisar que o seu ciclo do *Clube de Assinatura* está chegando ao fim.`;
    const detail = diasTxt || whenLine
      ? `\n\nEle vai até ${diasTxt ? `*${diasTxt}*` : '*em breve*'}${whenLine ? ` (${whenLine})` : ''}.`
      : '';

    const cta = `\n\nSe você quiser continuar aproveitando o plano sem interrupções, é só falar com a gente aqui:\n${wppLocal}\n\nA gente te ajuda com todo carinho. ✨`;

    return `${intro}${detail}${cta}\n\n_Mensagem automática do Tally_`;
  }

  generateSubscriptionEndingSoonAdminMessage({ clienteNome, unidadeNome, wppCliente, diasRestantes, dataFimStr }) {
    const whenLine = (dataFimStr)
      ? new Date(`${dataFimStr}T12:00:00`).toLocaleDateString('pt-BR')
      : null;

    const diasTxt = typeof diasRestantes === 'number'
      ? (diasRestantes === 1 ? '1 dia' : `${diasRestantes} dias`)
      : null;

    const extra = diasTxt || whenLine
      ? `\n\nPrazo: ${diasTxt ? diasTxt : '—'}${whenLine ? ` (até ${whenLine})` : ''}`
      : '';

    return `⚠️ *Assinatura perto do fim*\n\nCliente: *${clienteNome}*\nUnidade: *${unidadeNome}*${extra}\n\nContato do cliente: ${wppCliente}\n\n_Mensagem automática do Tally_`;
  }

  generateBirthdayMessage({ clienteNome, nomeNegocio }) {
    return `Feliz aniversário, ${clienteNome}! 🎂🎉

Desejamos muita saúde, paz e sucesso no seu novo ciclo. Esperamos te ver em breve para comemorar com o visual renovado!

Um abraço da equipe ${nomeNegocio}! 🤗`;
  }

  async sendBirthdayMessage({ unidade_id, clienteTelefone, clienteNome, nomeNegocio }) {
    try {
      if (!this.isEnabled()) {
        logger.log('⚠️ [WhatsApp] Serviço desabilitado');
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      if (!unidade_id) {
        return {
          success: false,
          error: {
            code: 'unidade_id_required',
            message: 'unidade_id é obrigatório para envio multi-tenant de mensagem de aniversário'
          }
        };
      }

      const message = this.generateBirthdayMessage({ clienteNome, nomeNegocio });
      const result = await this.sendMessageForAgendamento({ unidade_id }, clienteTelefone, message);

      if (!result.success) {
        logger.error(`❌ [WhatsApp] Falha ao enviar feliz aniversário para ${clienteNome}:`, result.error);
      } else {
        logger.log(`✅ [WhatsApp] Feliz aniversário enviado para ${clienteNome}`);
      }

      return result;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar feliz aniversário:', error);
      return { success: false, error: error.message };
    }
  }

  getFrontendBaseUrl() {
    const baseUrl = process.env.FRONTEND_URL;

    if (!baseUrl) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('FRONTEND_URL não configurada em produção');
      }

      return 'http://localhost:5173';
    }

    return baseUrl;
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static getRandomIntInclusive(min, max) {
    const minSafe = Math.ceil(min);
    const maxSafe = Math.floor(max);
    return Math.floor(Math.random() * (maxSafe - minSafe + 1)) + minSafe;
  }

  static getSendQueue() {
    if (!WhatsAppService._sendQueue) {
      WhatsAppService._sendQueue = Promise.resolve();
    }
    return WhatsAppService._sendQueue;
  }

  static setSendQueue(promise) {
    WhatsAppService._sendQueue = promise;
  }

  /**
   * Verificar se o serviço está habilitado
   */
  isEnabled() {
    return this.enabled && !!this.evolutionApiUrl && !!this.evolutionApiKey;
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
      return { success: false, message: 'Serviço WhatsApp desabilitado' };
    }

    const isDev = process.env.NODE_ENV === 'development';
    const minDelayMs = parseInt(process.env.WHATSAPP_DEV_MIN_DELAY_MS || '15000');
    const maxDelayMs = parseInt(process.env.WHATSAPP_DEV_MAX_DELAY_MS || '40000');

    const shouldApplyDevDelay = isDev && minDelayMs > 0 && maxDelayMs >= minDelayMs;

    const runInQueue = async () => {
      if (shouldApplyDevDelay) {
        const delayMs = WhatsAppService.getRandomIntInclusive(minDelayMs, maxDelayMs);
        logger.log(`⏳ [WhatsApp] DEV: aguardando ${delayMs}ms antes do envio (delay variável)`);
        await WhatsAppService.sleep(delayMs);
      }

      // Modo de teste - simula envio bem-sucedido
      if (this.testMode) {
        const formattedPhone = this.formatPhoneNumber(phoneNumber);

        // Simular delay de rede
        await WhatsAppService.sleep(1000);

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
        // Modo legado: envio com credenciais globais (compatibilidade)
        const formattedPhone = this.formatPhoneNumber(phoneNumber);

        const instanceIdentifier = this.instanceName || this.instanceId;

        const payload = {
          number: formattedPhone,
          text: message,
          delay: 1000,
          linkPreview: false
        };

        const response = await fetch(`${this.evolutionApiUrl}message/sendText/${instanceIdentifier}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.evolutionApiKey
          },
          body: JSON.stringify(payload),
          timeout: 30000
        });

        const data = await response.json();

        if (response.ok) {
          return { success: true, data };
        }

        logger.error('❌ [WhatsApp] Erro ao enviar mensagem:');
        logger.error('❌ [WhatsApp] Status:', response.status);
        logger.error('❌ [WhatsApp] Data:', JSON.stringify(data, null, 2));
        return {
          success: false,
          error: {
            status: response.status,
            error: response.statusText,
            response: data
          }
        };

      } catch (error) {
        logger.error('❌ [WhatsApp] Erro na requisição:', error);
        return { success: false, error: error.message };
      }
    };

    const queuedPromise = WhatsAppService.getSendQueue().then(runInQueue, runInQueue);

    // Garantir que a fila continue mesmo se houver erro
    WhatsAppService.setSendQueue(queuedPromise.catch(() => {}));

    return queuedPromise;
  }

  async sendMessageForAgendamento(agendamentoData, phoneNumber, message) {
    if (!this.isEnabled()) {
      return { success: false, message: 'Serviço WhatsApp desabilitado' };
    }

    // Modo de teste - simula envio bem-sucedido
    if (this.testMode) {
      return await this.sendMessage(phoneNumber, message);
    }

    const usuarioId = await this.resolveOwnerUsuarioIdFromAgendamentoData(agendamentoData);
    const instance = await this.getWhatsAppInstanceForUsuario(usuarioId);

    if (!instance) {
      const unidadeId = agendamentoData?.unidade_id || agendamentoData?.unidade?.id;
      const reason = !usuarioId
        ? 'owner_usuario_id_not_resolved'
        : 'whatsapp_instance_not_configured';

      logger.error('❌ [WhatsApp] Envio bloqueado (multi-tenant obrigatório).');
      logger.error('❌ [WhatsApp] Motivo:', reason);
      logger.error('❌ [WhatsApp] Contexto:', JSON.stringify({
        unidadeId,
        usuarioId,
        phoneNumber: phoneNumber ? this.formatPhoneNumber(phoneNumber) : null
      }, null, 2));

      return {
        success: false,
        error: {
          code: reason,
          message: 'WhatsApp não conectado para esta unidade/usuário. Conecte o WhatsApp nas configurações para habilitar envios.'
        }
      };
    }

    return await this.sendMessageViaInstance({
      instanceName: instance.instanceName,
      token: instance.token,
      phoneNumber,
      message
    });
  }

  /**
   * Gerar link WhatsApp formatado
   */
  generateWhatsAppLink(phoneNumber) {
    const cleanPhone = this.formatPhoneNumber(phoneNumber);
    return `https://wa.me/${cleanPhone}`;
  }

  /**
   * Gerar link de gestão de agendamento
   */
  generateManagementLink(agendamentoId) {
    const baseUrl = this.getFrontendBaseUrl();
    return `${baseUrl}/gerenciar-agendamento/${agendamentoId}`;
  }

  /**
   * Gerar link de booking da unidade
   * @param {string} unidadeSlug - Slug da unidade (ex: 'barbearia-dudu')
   * @param {number} unidadeId - ID da unidade (obrigatório)
   * @returns {string} Link completo de booking
   */
  generateBookingLink(unidadeSlug, unidadeId) {
    const baseUrl = this.getFrontendBaseUrl();
    // Formato: /{slug}/booking/{unidade_id}
    return `${baseUrl}/${unidadeSlug}/booking/${unidadeId}`;
  }

  /**
   * Convite de retorno (pós-serviço) - CLIENTE
   */
  generateReturnInviteMessage(agendamentoData) {
    const { cliente, unidade, servicos } = agendamentoData;

    const servicoNome = servicos?.[0]?.nome || 'serviço';
    const linkCliente = this.generateBookingLink(unidade.slug_url, unidade.id);

    return `Oi, ${cliente.nome}! Saudade de você aqui na ${unidade.nome}. ✨

Passando para avisar que já completou o ciclo do seu serviço de ${servicoNome}. Quer garantir seu próximo horário?

É só clicar aqui: ${linkCliente}`;
  }

  /**
   * Enviar convite de retorno (apenas cliente)
   */
  async sendReturnInvite(agendamentoData) {
    try {
      if (!this.isEnabled()) {
        logger.log('⚠️ [WhatsApp] Serviço desabilitado');
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const message = this.generateReturnInviteMessage(agendamentoData);
      const result = await this.sendMessageForAgendamento(agendamentoData, agendamentoData.cliente_telefone, message);

      if (!result.success) {
        logger.error(`❌ [WhatsApp] Falha ao enviar convite de retorno para ${agendamentoData.cliente.nome}:`, result.error);
      } else {
        logger.log(`✅ [WhatsApp] Convite de retorno enviado para ${agendamentoData.cliente.nome}`);
      }

      return result;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar convite de retorno:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Formatar data e hora para exibição
   */
  formatDateTime(data_agendamento, hora_inicio) {
    try {
      let dataObj;
      
      // Se já é um objeto Date
      if (data_agendamento instanceof Date) {
        dataObj = data_agendamento;
      } 
      // Se é uma string no formato YYYY-MM-DD
      else if (typeof data_agendamento === 'string') {
        // Adicionar horário para evitar problemas de timezone
        dataObj = new Date(data_agendamento + 'T12:00:00');
      } 
      // Tentar converter de qualquer outra forma
      else {
        dataObj = new Date(data_agendamento);
      }
      
      // Verificar se a data é válida
      if (isNaN(dataObj.getTime())) {
        logger.error('[WhatsApp] Data inválida recebida:', data_agendamento);
        return `Data não disponível às ${hora_inicio}`;
      }
      
      const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      
      return `${dataFormatada} às ${hora_inicio}`;
    } catch (error) {
      logger.error('[WhatsApp] Erro ao formatar data:', error);
      return `Data não disponível às ${hora_inicio}`;
    }
  }

  /**
   * Gerar lista de serviços formatada
   */
  formatServicos(servicos) {
    if (!servicos || servicos.length === 0) return 'Serviço';
    if (servicos.length === 1) return servicos[0].nome;
    return servicos.map(s => s.nome).join(', ');
  }

  /**
   * Registrar notificação no banco de dados
   * @param {Object} data - Dados da notificação
   * @returns {Promise<number|null>} - ID da notificação criada ou null
   */
  async registrarNotificacao(data) {
    try {
      const notificacaoId = await this.notificacaoModel.create({
        agendamento_id: data.agendamento_id,
        unidade_id: data.unidade_id,
        cliente_id: data.cliente_id || null,
        assinatura_referencia: data.assinatura_referencia || null,
        tipo_notificacao: data.tipo_notificacao,
        status: data.status || 'pendente',
        tentativas: data.tentativas || 0,
        telefone_destino: data.telefone_destino,
        mensagem_enviada: data.mensagem_enviada || null,
        whatsapp_message_id: data.whatsapp_message_id || null,
        erro_detalhes: data.erro_detalhes || null,
        enviado_em: data.status === 'enviado' ? new Date() : null
      });

      logger.log(`✅ [WhatsAppService] Notificação ${data.tipo_notificacao} registrada: ID ${notificacaoId}`);
      return notificacaoId;
    } catch (error) {
      logger.error(`❌ [WhatsAppService] Erro ao registrar notificação:`, error);
      return null;
    }
  }

  async sendSubscriptionEndingSoonClient({
    unidade_id,
    unidade_nome,
    unidade_telefone,
    cliente_id,
    cliente_nome,
    cliente_telefone,
    assinatura_referencia,
    dias_restantes,
    data_fim,
    skipRegister = false
  }) {
    try {
      if (!this.isEnabled()) {
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const wppLocal = this.generateWhatsAppLink(unidade_telefone);
      const message = this.generateSubscriptionEndingSoonClientMessage({
        clienteNome: cliente_nome,
        unidadeNome: unidade_nome,
        wppLocal,
        diasRestantes: dias_restantes,
        dataFimStr: data_fim
      });

      const result = await this.sendMessageForAgendamento({ unidade_id }, cliente_telefone, message);

      if (!skipRegister) {
        await this.registrarNotificacao({
          agendamento_id: null,
          unidade_id,
          cliente_id,
          assinatura_referencia,
          tipo_notificacao: 'assinatura_aviso_cliente',
          status: result.success ? 'enviado' : 'falha',
          tentativas: 1,
          telefone_destino: cliente_telefone,
          mensagem_enviada: result.success ? message : null,
          whatsapp_message_id: result.data?.messageId || result.data?.key?.id || null,
          erro_detalhes: result.success ? null : JSON.stringify(result.error)
        });
      }

      return result;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar aviso de assinatura (cliente):', error);
      return { success: false, error: error.message };
    }
  }

  async sendSubscriptionEndingSoonAdmin({
    unidade_id,
    unidade_nome,
    admin_telefone,
    cliente_id,
    cliente_nome,
    cliente_telefone,
    assinatura_referencia,
    dias_restantes,
    data_fim,
    skipRegister = false
  }) {
    try {
      if (!this.isEnabled()) {
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const wppCliente = this.generateWhatsAppLink(cliente_telefone);
      const message = this.generateSubscriptionEndingSoonAdminMessage({
        clienteNome: cliente_nome,
        unidadeNome: unidade_nome,
        wppCliente,
        diasRestantes: dias_restantes,
        dataFimStr: data_fim
      });

      const result = await this.sendMessageForAgendamento({ unidade_id }, admin_telefone, message);

      if (!skipRegister) {
        await this.registrarNotificacao({
          agendamento_id: null,
          unidade_id,
          cliente_id,
          assinatura_referencia,
          tipo_notificacao: 'assinatura_aviso_admin',
          status: result.success ? 'enviado' : 'falha',
          tentativas: 1,
          telefone_destino: admin_telefone,
          mensagem_enviada: result.success ? message : null,
          whatsapp_message_id: result.data?.messageId || result.data?.key?.id || null,
          erro_detalhes: result.success ? null : JSON.stringify(result.error)
        });
      }

      return result;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar aviso de assinatura (admin):', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gerar mensagem de pontos do cliente
   * @param {Object} pontosInfo - Informações sobre pontos do cliente
   * @param {number} pontosInfo.saldo - Saldo atual de pontos
   * @param {number} pontosInfo.ganhos - Pontos ganhos neste agendamento
   * @param {boolean} pontosInfo.podeUsar - Se o cliente pode usar pontos
   * @returns {string} Mensagem formatada sobre pontos
   */
  formatPontosMessage(pontosInfo) {
    if (!pontosInfo || pontosInfo.saldo === undefined) {
      return ''; // Sem informação de pontos
    }

    const { saldo, ganhos, podeUsar } = pontosInfo;
    
    // Se ganhou pontos neste agendamento
    if (ganhos && ganhos > 0) {
      const mensagemBase = `\n💎 *Você acumulou ${ganhos} ponto${ganhos !== 1 ? 's' : ''}!*\nSaldo total: *${saldo} ponto${saldo !== 1 ? 's' : ''}*`;
      
      // Se não pode usar (primeiro agendamento)
      if (!podeUsar) {
        return `${mensagemBase}\n_Pontos disponíveis para uso a partir do 2º agendamento_`;
      }
      
      return mensagemBase;
    }
    
    // Se não ganhou pontos mas tem saldo
    if (saldo > 0) {
      return `\n💎 Seu saldo de pontos: *${saldo} ponto${saldo !== 1 ? 's' : ''}*`;
    }
    
    return '';
  }

  /**
   * 1. CONFIRMAÇÃO DE AGENDAMENTO - CLIENTE
   */
  generateAppointmentConfirmationClient(agendamentoData) {
    const { cliente, agente, unidade, data_agendamento, hora_inicio, servicos, agendamento_id, numero_agendamento, agente_telefone, unidade_telefone, pontos, assinatura_saldo } = agendamentoData;
    
    const dataHora = this.formatDateTime(data_agendamento, hora_inicio);
    const servicoTexto = this.formatServicos(servicos);
    const linkGestao = this.generateManagementLink(agendamento_id);
    const wppLocal = this.generateWhatsAppLink(unidade_telefone);
    const wppAgente = this.generateWhatsAppLink(agente_telefone);
    const pontosMensagem = this.formatPontosMessage(pontos);
    const assinaturaMensagem = this.formatAssinaturaSaldoMessage(assinatura_saldo);
    const idExibicao = numero_agendamento || agendamento_id;

    return `👋 Olá, *${cliente.nome}*! Ficamos muito felizes com seu agendamento na *${unidade.nome}*.

Seu horário está confirmadíssimo:
✂️ ${servicoTexto} com *${agente.nome}*
🗓 ${dataHora}

🎫 ID do Agendamento: *#${idExibicao}*${pontosMensagem}${assinaturaMensagem}

Precisa alterar algo? Gerencie seu horário através deste link:

${linkGestao}

Canais de atendimento:
🏠 ${unidade.nome}: ${wppLocal}
👤 Agente ${agente.nome}: ${wppAgente}

_Mensagem automática do Tally_`;
  }

  /**
   * 1. CONFIRMAÇÃO DE AGENDAMENTO - AGENTE
   */
  generateAppointmentConfirmationAgent(agendamentoData) {
    const { cliente, data_agendamento, hora_inicio, servicos, agendamento_id, numero_agendamento, cliente_telefone, unidade_telefone } = agendamentoData;
    
    const dataHora = this.formatDateTime(data_agendamento, hora_inicio);
    const servicoTexto = this.formatServicos(servicos);
    const wppCliente = this.generateWhatsAppLink(cliente_telefone);
    const wppLocal = this.generateWhatsAppLink(unidade_telefone);
    const idExibicao = numero_agendamento || agendamento_id;

    return `🆕 *Novo Agendamento:* ${cliente.nome} agendou ${servicoTexto}.

🗓 ${dataHora}
🎫 ID: *#${idExibicao}*

Contatos:
👤 Cliente ${cliente.nome}: ${wppCliente}
🏠 Suporte Local: ${wppLocal}

_Mensagem automática do Tally_`;
  }

  /**
   * Enviar confirmação de agendamento (cliente + agente)
   */
  async sendAppointmentConfirmation(agendamentoData) {
    try {
      if (!this.isEnabled()) {
        logger.log('⚠️ [WhatsApp] Serviço desabilitado');
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const results = { cliente: null, agente: null };

      const clienteTelefone = agendamentoData?.cliente_telefone;
      const agenteTelefone = agendamentoData?.agente_telefone;

      if (!clienteTelefone && !agenteTelefone) {
        logger.log('⚠️ [WhatsApp] Nenhum telefone disponível para envio de confirmação (cliente/agente)');
        return { success: false, error: 'Nenhum telefone disponível' };
      }

      // Enviar para o cliente
      if (clienteTelefone) {
        const messageCliente = this.generateAppointmentConfirmationClient(agendamentoData);
        results.cliente = await this.sendMessageForAgendamento(agendamentoData, clienteTelefone, messageCliente);

        // ✅ Registrar notificação para o cliente
        await this.registrarNotificacao({
          agendamento_id: agendamentoData.agendamento_id || agendamentoData.id,
          unidade_id: agendamentoData.unidade_id || agendamentoData.unidade?.id,
          tipo_notificacao: 'confirmacao',
          status: results.cliente.success ? 'enviado' : 'falha',
          tentativas: 1,
          telefone_destino: clienteTelefone,
          mensagem_enviada: results.cliente.success ? messageCliente : null,
          whatsapp_message_id: results.cliente.data?.messageId || results.cliente.data?.key?.id || null,
          erro_detalhes: results.cliente.success ? null : JSON.stringify(results.cliente.error)
        });

        if (!results.cliente.success) {
          logger.error(`❌ [WhatsApp] Falha ao enviar confirmação para cliente ${agendamentoData.cliente?.nome || ''}:`, results.cliente.error);
        } else {
          logger.log(`✅ [WhatsApp] Confirmação enviada para cliente ${agendamentoData.cliente?.nome || ''}`);
        }
      } else {
        logger.log('⚠️ [WhatsApp] Cliente sem telefone - pulando envio de confirmação para cliente');
      }

      // Enviar para o agente
      if (agenteTelefone) {
        const messageAgente = this.generateAppointmentConfirmationAgent(agendamentoData);
        results.agente = await this.sendMessageForAgendamento(agendamentoData, agenteTelefone, messageAgente);

        // ✅ Registrar notificação para o agente
        await this.registrarNotificacao({
          agendamento_id: agendamentoData.agendamento_id || agendamentoData.id,
          unidade_id: agendamentoData.unidade_id || agendamentoData.unidade?.id,
          tipo_notificacao: 'confirmacao',
          status: results.agente.success ? 'enviado' : 'falha',
          tentativas: 1,
          telefone_destino: agenteTelefone,
          mensagem_enviada: results.agente.success ? messageAgente : null,
          whatsapp_message_id: results.agente.data?.messageId || results.agente.data?.key?.id || null,
          erro_detalhes: results.agente.success ? null : JSON.stringify(results.agente.error)
        });

        if (!results.agente.success) {
          logger.error(`❌ [WhatsApp] Falha ao enviar confirmação para agente ${agendamentoData.agente.nome}:`, results.agente.error);
        } else {
          logger.log(`✅ [WhatsApp] Confirmação enviada para agente ${agendamentoData.agente.nome}`);
        }
      } else {
        logger.log('⚠️ [WhatsApp] Agente sem telefone - pulando envio de confirmação para agente');
      }

      return results;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar confirmação:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 4. LEMBRETE 24 HORAS ANTES - CLIENTE
   */
  generateReminder24hMessage(agendamentoData) {
    const { cliente, agente, unidade, data_agendamento, hora_inicio, servicos, agendamento_id, pontos } = agendamentoData;
    
    const dataHora = this.formatDateTime(data_agendamento, hora_inicio);
    const servicoTexto = this.formatServicos(servicos);
    const linkGestao = this.generateManagementLink(agendamento_id);
    const pontosMensagem = this.formatPontosMessage(pontos);

    return `⏰ Oi, *${cliente.nome}*! A equipe da *${unidade.nome}* está ansiosa para te receber.

Passando para lembrar do seu horário amanhã:
🗓 ${dataHora}
✂️ ${servicoTexto}${pontosMensagem}

Teve algum imprevisto? Por favor, use o link abaixo para nos avisar ou reagendar:
🔗 ${linkGestao}

_Mensagem automática do Tally_`;
  }

  /**
   * 4. LEMBRETE 1 HORA ANTES - CLIENTE
   */
  generateReminder2hMessage(agendamentoData) {
    const { cliente, agente, unidade, data_agendamento, hora_inicio, agente_telefone, unidade_telefone, unidade_endereco, agendamento_id, pontos } = agendamentoData;
    
    const dataHora = this.formatDateTime(data_agendamento, hora_inicio);
    const wppLocal = this.generateWhatsAppLink(unidade_telefone);
    const wppAgente = this.generateWhatsAppLink(agente_telefone);
    const linkGestao = this.generateManagementLink(agendamento_id);
    const pontosMensagem = this.formatPontosMessage(pontos);

    return `⏳ É quase hora, *${cliente.nome}*! Tudo pronto aqui na *${unidade.nome}* para te atender.

Te esperamos às ${hora_inicio} com o(a) *${agente.nome}*.${pontosMensagem}

Como chegar / Contato:
🏠 ${unidade.nome}: ${unidade_endereco || 'Endereço não informado'}
📞 Telefone: ${wppLocal}
👤 Agente ${agente.nome}: ${wppAgente}

Gerenciar: ${linkGestao}

_Mensagem automática do Tally_`;
  }

  /**
   * 2. CONFIRMAÇÃO DE CANCELAMENTO - CLIENTE
   */
  generateCancellationClient(agendamentoData) {
    const { cliente, agente, unidade, data_agendamento, hora_inicio, servicos, agente_telefone, unidade_telefone, unidade_slug, agendamento_id } = agendamentoData;
    
    const dataHora = this.formatDateTime(data_agendamento, hora_inicio);
    const servicoTexto = this.formatServicos(servicos);
    const linkBooking = this.generateBookingLink(unidade_slug || unidade.slug_url, unidade.id);
    const wppLocal = this.generateWhatsAppLink(unidade_telefone);
    const wppAgente = this.generateWhatsAppLink(agente_telefone);

    return `❌ *Cancelado:* Olá, *${cliente.nome}*. O agendamento de ${servicoTexto} na *${unidade.nome}* para ${dataHora} foi cancelado conforme solicitado.

Deseja realizar um novo agendamento? Acesse:

${linkBooking}

Dúvidas?
🏠 ${unidade.nome}: ${wppLocal}
👤 Agente ${agente.nome}: ${wppAgente}

_Mensagem automática do Tally_`;
  }

  /**
   * 2. CONFIRMAÇÃO DE CANCELAMENTO - AGENTE
   */
  generateCancellationAgent(agendamentoData) {
    const { cliente, data_agendamento, hora_inicio, servicos, agendamento_id } = agendamentoData;
    
    const dataHora = this.formatDateTime(data_agendamento, hora_inicio);
    const servicoTexto = this.formatServicos(servicos);

    return `🚫 *Cancelamento:* ${cliente.nome} cancelou o serviço ${servicoTexto} de ${dataHora}.

🎫 ID: *#${agendamento_id}*
✅ Sua agenda para este horário foi liberada.

_Mensagem automática do Tally_`;
  }

  /**
   * 3. CONFIRMAÇÃO DE REAGENDAMENTO - CLIENTE
   */
  generateRescheduleClient(agendamentoData) {
    const { cliente, agente, unidade, data_agendamento, hora_inicio, servicos, agendamento_id, unidade_telefone } = agendamentoData;
    
    const dataHora = this.formatDateTime(data_agendamento, hora_inicio);
    const servicoTexto = this.formatServicos(servicos);
    const linkGestao = this.generateManagementLink(agendamento_id);
    const wppLocal = this.generateWhatsAppLink(unidade_telefone);

    return `🔄 Olá, *${cliente.nome}*! Atualizamos seu horário na *${unidade.nome}*.

Seguem os novos detalhes:
🗓 Nova Data: ${dataHora}
✂️ ${servicoTexto} com *${agente.nome}*

🎫 ID: *#${agendamento_id}*

Gerenciar agendamento:

${linkGestao}

Dúvidas? 🏠 ${unidade.nome}: ${wppLocal}

_Mensagem automática do Tally_`;
  }

  /**
   * 3. CONFIRMAÇÃO DE REAGENDAMENTO - AGENTE
   */
  generateRescheduleAgent(agendamentoData) {
    const { cliente, data_agendamento, hora_inicio, servicos, agendamento_id } = agendamentoData;
    
    const dataHora = this.formatDateTime(data_agendamento, hora_inicio);
    const servicoTexto = this.formatServicos(servicos);

    return `🔄 *Agenda Atualizada:* O agendamento de ${cliente.nome} (*#${agendamento_id}*) foi alterado.

Novo Horário: 🗓 ${dataHora} | ${servicoTexto}

_Mensagem automática do Tally_`;
  }

  /**
   * Enviar cancelamento (cliente + agente)
   */
  async sendCancellationNotification(agendamentoData) {
    try {
      if (!this.isEnabled()) {
        logger.log('⚠️ [WhatsApp] Serviço desabilitado');
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const results = { cliente: null, agente: null };

      // Enviar para o cliente
      const messageCliente = this.generateCancellationClient(agendamentoData);
      results.cliente = await this.sendMessageForAgendamento(agendamentoData, agendamentoData.cliente_telefone, messageCliente);

      // ✅ Registrar notificação para o cliente
      await this.registrarNotificacao({
        agendamento_id: agendamentoData.agendamento_id || agendamentoData.id,
        unidade_id: agendamentoData.unidade_id || agendamentoData.unidade?.id,
        tipo_notificacao: 'cancelamento',
        status: results.cliente.success ? 'enviado' : 'falha',
        tentativas: 1,
        telefone_destino: agendamentoData.cliente_telefone,
        mensagem_enviada: results.cliente.success ? messageCliente : null,
        whatsapp_message_id: results.cliente.data?.messageId || results.cliente.data?.key?.id || null,
        erro_detalhes: results.cliente.success ? null : JSON.stringify(results.cliente.error)
      });

      if (!results.cliente.success) {
        logger.error(`❌ [WhatsApp] Falha ao enviar cancelamento para cliente ${agendamentoData.cliente.nome}:`, results.cliente.error);
      } else {
        logger.log(`✅ [WhatsApp] Cancelamento enviado para cliente ${agendamentoData.cliente.nome}`);
      }

      // Enviar para o agente
      if (agendamentoData.agente_telefone) {
        const messageAgente = this.generateCancellationAgent(agendamentoData);
        results.agente = await this.sendMessageForAgendamento(agendamentoData, agendamentoData.agente_telefone, messageAgente);

        // ✅ Registrar notificação para o agente
        await this.registrarNotificacao({
          agendamento_id: agendamentoData.agendamento_id || agendamentoData.id,
          unidade_id: agendamentoData.unidade_id || agendamentoData.unidade?.id,
          tipo_notificacao: 'cancelamento',
          status: results.agente.success ? 'enviado' : 'falha',
          tentativas: 1,
          telefone_destino: agendamentoData.agente_telefone,
          mensagem_enviada: results.agente.success ? messageAgente : null,
          whatsapp_message_id: results.agente.data?.messageId || results.agente.data?.key?.id || null,
          erro_detalhes: results.agente.success ? null : JSON.stringify(results.agente.error)
        });

        if (!results.agente.success) {
          logger.error(`❌ [WhatsApp] Falha ao enviar cancelamento para agente ${agendamentoData.agente.nome}:`, results.agente.error);
        } else {
          logger.log(`✅ [WhatsApp] Cancelamento enviado para agente ${agendamentoData.agente.nome}`);
        }
      }

      return results;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar cancelamento:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar reagendamento (cliente + agente)
   */
  async sendRescheduleNotification(agendamentoData) {
    try {
      if (!this.isEnabled()) {
        logger.log('⚠️ [WhatsApp] Serviço desabilitado');
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const results = { cliente: null, agente: null };

      // Enviar para o cliente
      const messageCliente = this.generateRescheduleClient(agendamentoData);
      results.cliente = await this.sendMessageForAgendamento(agendamentoData, agendamentoData.cliente_telefone, messageCliente);

      // ✅ Registrar notificação para o cliente
      await this.registrarNotificacao({
        agendamento_id: agendamentoData.agendamento_id || agendamentoData.id,
        unidade_id: agendamentoData.unidade_id || agendamentoData.unidade?.id,
        tipo_notificacao: 'reagendamento',
        status: results.cliente.success ? 'enviado' : 'falha',
        tentativas: 1,
        telefone_destino: agendamentoData.cliente_telefone,
        mensagem_enviada: results.cliente.success ? messageCliente : null,
        whatsapp_message_id: results.cliente.data?.messageId || results.cliente.data?.key?.id || null,
        erro_detalhes: results.cliente.success ? null : JSON.stringify(results.cliente.error)
      });

      if (!results.cliente.success) {
        logger.error(`❌ [WhatsApp] Falha ao enviar reagendamento para cliente ${agendamentoData.cliente.nome}:`, results.cliente.error);
      } else {
        logger.log(`✅ [WhatsApp] Reagendamento enviado para cliente ${agendamentoData.cliente.nome}`);
      }

      // Enviar para o agente
      if (agendamentoData.agente_telefone) {
        const messageAgente = this.generateRescheduleAgent(agendamentoData);
        results.agente = await this.sendMessageForAgendamento(agendamentoData, agendamentoData.agente_telefone, messageAgente);

        // ✅ Registrar notificação para o agente
        await this.registrarNotificacao({
          agendamento_id: agendamentoData.agendamento_id || agendamentoData.id,
          unidade_id: agendamentoData.unidade_id || agendamentoData.unidade?.id,
          tipo_notificacao: 'reagendamento',
          status: results.agente.success ? 'enviado' : 'falha',
          tentativas: 1,
          telefone_destino: agendamentoData.agente_telefone,
          mensagem_enviada: results.agente.success ? messageAgente : null,
          whatsapp_message_id: results.agente.data?.messageId || results.agente.data?.key?.id || null,
          erro_detalhes: results.agente.success ? null : JSON.stringify(results.agente.error)
        });

        if (!results.agente.success) {
          logger.error(`❌ [WhatsApp] Falha ao enviar reagendamento para agente ${agendamentoData.agente.nome}:`, results.agente.error);
        } else {
          logger.log(`✅ [WhatsApp] Reagendamento enviado para agente ${agendamentoData.agente.nome}`);
        }
      }

      return results;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar reagendamento:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar lembrete 24h (apenas cliente)
   */
  async sendReminder24h(agendamentoData) {
    try {
      if (!this.isEnabled()) {
        logger.log('⚠️ [WhatsApp] Serviço desabilitado');
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const message = this.generateReminder24hMessage(agendamentoData);
      const result = await this.sendMessageForAgendamento(agendamentoData, agendamentoData.cliente_telefone, message);
      
      if (!result.success) {
        logger.error(`❌ [WhatsApp] Falha ao enviar lembrete 24h para ${agendamentoData.cliente.nome}:`, result.error);
      } else {
        logger.log(`✅ [WhatsApp] Lembrete 24h enviado para ${agendamentoData.cliente.nome}`);
      }
      
      return result;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar lembrete 24h:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar lembrete 1h (apenas cliente)
   */
  async sendReminder2h(agendamentoData) {
    try {
      if (!this.isEnabled()) {
        logger.log('⚠️ [WhatsApp] Serviço desabilitado');
        return { success: false, error: 'Serviço WhatsApp desabilitado' };
      }

      const message = this.generateReminder2hMessage(agendamentoData);
      const result = await this.sendMessageForAgendamento(agendamentoData, agendamentoData.cliente_telefone, message);
      
      if (!result.success) {
        logger.error(`❌ [WhatsApp] Falha ao enviar lembrete 1h para ${agendamentoData.cliente.nome}:`, result.error);
      } else {
        logger.log(`✅ [WhatsApp] Lembrete 1h enviado para ${agendamentoData.cliente.nome}`);
      }
      
      return result;
    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao enviar lembrete 1h:', error);
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
        return { success: true, data };
      } else {
        logger.error('❌ [WhatsApp] Erro na conexão:', data);
        return { success: false, error: data };
      }

    } catch (error) {
      logger.error('❌ [WhatsApp] Erro ao testar conexão:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = WhatsAppService;

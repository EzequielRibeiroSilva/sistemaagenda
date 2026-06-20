/**
 * GerenteNotificationService.js
 * 
 * Serviço centralizado para envio de notificações aos gerentes da unidade.
 * 
 * Responsabilidades:
 * - Identificar gerentes com notifica_crise = true
 * - Enviar notificações via WhatsApp
 * - Gerenciar cooldown para evitar spam
 * - Fallback para admin da unidade se não houver gerentes
 * 
 * Uso:
 * - Alertas de Token Budget (80% do limite)
 * - Notificações de crise (notificar_humano)
 * - Circuit Breaker (OpenAI instável)
 * - Outros alertas críticos
 */

const { db } = require('../config/knex');
const WhatsAppService = require('./WhatsAppService');
const logger = require('../utils/logger');

class GerenteNotificationService {
  
  /**
   * Envia notificação para gerentes da unidade com cooldown.
   * 
   * @param {object} params
   * @param {object} params.redis - Cliente Redis (para cooldown)
   * @param {number} params.unidadeId - ID da unidade
   * @param {string} params.instanceName - Nome da instância WhatsApp
   * @param {string} params.tipoAlerta - Tipo do alerta (ex: 'token_budget', 'crise', 'circuit_breaker')
   * @param {string} params.mensagem - Mensagem formatada para envio
   * @param {number} [params.cooldownSeconds=3600] - Cooldown em segundos (padrão: 1 hora)
   * @returns {Promise<object>} Resultado do envio
   */
  static async notificarGerentes({ redis, unidadeId, instanceName, tipoAlerta, mensagem, cooldownSeconds = 3600 }) {
    try {
      // Validação de parâmetros
      if (!unidadeId || !tipoAlerta || !mensagem) {
        logger.warn('[GerenteNotificationService] Parâmetros inválidos', { unidadeId, tipoAlerta });
        return { ok: false, error: 'Parâmetros inválidos' };
      }

      // ========================================================================
      // STEP 1: VERIFICAR COOLDOWN (evitar spam)
      // ========================================================================
      const cooldownKey = `gerente_notification:${unidadeId}:${tipoAlerta}`;
      
      if (redis) {
        try {
          const cooldownAtivo = await redis.get(cooldownKey);
          if (cooldownAtivo) {
            const ttl = await redis.ttl(cooldownKey);
            logger.info('[GerenteNotificationService] Cooldown ativo - notificação suprimida', {
              unidade_id: unidadeId,
              tipo_alerta: tipoAlerta,
              ttl_restante: ttl
            });
            return { 
              ok: true, 
              skipped: 'cooldown_active', 
              ttl_seconds: ttl 
            };
          }
        } catch (redisErr) {
          logger.error('[GerenteNotificationService] Erro ao verificar cooldown (continua sem cooldown)', {
            error: redisErr.message
          });
          // Continua sem cooldown (fail-safe)
        }
      }

      // ========================================================================
      // STEP 2: BUSCAR GERENTES DA UNIDADE
      // ========================================================================
      const gerentes = await db('agentes')
        .where('unidade_id', unidadeId)
        .where('status', 'Ativo')
        .where('notifica_crise', true)
        .whereNull('deleted_at')
        .select('id', 'nome', 'telefone');

      const telefonesGerentes = (gerentes || [])
        .filter(g => g.telefone)
        .map(g => ({
          id: g.id,
          nome: g.nome,
          telefone: String(g.telefone).replace(/\D/g, '')
        }))
        .filter(g => g.telefone.length >= 10);

      logger.info('[GerenteNotificationService] Gerentes encontrados', {
        unidade_id: unidadeId,
        total_gerentes: telefonesGerentes.length
      });

      // ========================================================================
      // STEP 3: ENVIAR NOTIFICAÇÕES
      // ========================================================================
      const whatsAppService = new WhatsAppService();
      let resultado = null;

      if (telefonesGerentes.length > 0) {
        // Enviar para TODOS os gerentes (Promise.all)
        const envios = telefonesGerentes.map(gerente =>
          whatsAppService.sendMessage(instanceName, gerente.telefone, mensagem)
            .then(() => {
              logger.info('[GerenteNotificationService] Notificação enviada', {
                gerente: gerente.nome,
                telefone: gerente.telefone,
                tipo_alerta: tipoAlerta
              });
              return { ok: true, gerente: gerente.nome };
            })
            .catch(err => {
              logger.error('[GerenteNotificationService] Erro ao enviar', {
                gerente: gerente.nome,
                error: err.message
              });
              return { ok: false, gerente: gerente.nome, error: err.message };
            })
        );

        const resultados = await Promise.all(envios);
        const enviadosComSucesso = resultados.filter(r => r.ok).length;

        resultado = {
          ok: true,
          gerentes_notificados: enviadosComSucesso,
          total_gerentes: telefonesGerentes.length,
          tipo_alerta: tipoAlerta
        };

        logger.info('[GerenteNotificationService] Notificações concluídas', {
          sucesso: enviadosComSucesso,
          total: telefonesGerentes.length,
          tipo_alerta: tipoAlerta
        });

      } else {
        // ========================================================================
        // FALLBACK: Notificar admin da unidade (se não houver gerentes)
        // ========================================================================
        logger.warn('[GerenteNotificationService] Nenhum gerente encontrado - usando fallback (admin)');

        let telefoneAdmin = null;
        const unidade = await db('unidades')
          .where('id', unidadeId)
          .select('telefone', 'usuario_id')
          .first();

        if (unidade?.telefone) {
          telefoneAdmin = String(unidade.telefone).replace(/\D/g, '');
        } else if (unidade?.usuario_id) {
          const usuario = await db('usuarios')
            .where('id', unidade.usuario_id)
            .select('telefone')
            .first();
          
          if (usuario?.telefone) {
            telefoneAdmin = String(usuario.telefone).replace(/\D/g, '');
          }
        }

        if (telefoneAdmin && telefoneAdmin.length >= 10) {
          await whatsAppService.sendMessage(instanceName, telefoneAdmin, mensagem);
          
          resultado = {
            ok: true,
            gerentes_notificados: 0,
            admin_notificado: true,
            telefone_admin: telefoneAdmin,
            tipo_alerta: tipoAlerta,
            fallback: true
          };

          logger.info('[GerenteNotificationService] Admin notificado (fallback)', {
            telefone_admin: telefoneAdmin,
            tipo_alerta: tipoAlerta
          });
        } else {
          logger.error('[GerenteNotificationService] Nenhum telefone válido encontrado (gerentes ou admin)');
          resultado = {
            ok: false,
            error: 'Nenhum telefone válido encontrado para notificação',
            tipo_alerta: tipoAlerta
          };
        }
      }

      // ========================================================================
      // STEP 4: ATIVAR COOLDOWN
      // ========================================================================
      if (redis && resultado.ok) {
        try {
          await redis.setex(cooldownKey, cooldownSeconds, '1');
          logger.info('[GerenteNotificationService] Cooldown ativado', {
            unidade_id: unidadeId,
            tipo_alerta: tipoAlerta,
            cooldown_seconds: cooldownSeconds
          });
        } catch (redisErr) {
          logger.error('[GerenteNotificationService] Erro ao ativar cooldown (não-crítico)', {
            error: redisErr.message
          });
        }
      }

      return resultado;

    } catch (error) {
      logger.error('[GerenteNotificationService] Erro ao notificar gerentes', {
        error: error.message,
        stack: error.stack,
        unidadeId,
        tipoAlerta
      });

      return {
        ok: false,
        error: error.message,
        tipo_alerta: tipoAlerta
      };
    }
  }

  /**
   * Monta mensagem formatada para alerta de Token Budget.
   * 
   * @param {object} params
   * @param {string} params.nomeUnidade - Nome da unidade
   * @param {number} params.consumido - Tokens consumidos
   * @param {number} params.limite - Limite diário
   * @param {number} params.percentual - Percentual consumido
   * @returns {string} Mensagem formatada
   */
  static formatarMensagemTokenBudget({ nomeUnidade, consumido, limite, percentual }) {
    return `⚠️ *ALERTA TALLY - TOKEN BUDGET*

*Unidade:* ${nomeUnidade}
*Status:* 80% do limite diário atingido

📊 *Consumo de Tokens (IA):*
• Consumido: ${consumido.toLocaleString()} tokens
• Limite diário: ${limite.toLocaleString()} tokens
• Percentual: ${percentual.toFixed(1)}%
• Disponível: ${(limite - consumido).toLocaleString()} tokens

💡 *O que isso significa?*
O assistente virtual da sua unidade consumiu 80% do limite diário de processamento. Se atingir 100%, o atendimento automático será pausado até amanhã.

🔧 *Ações recomendadas:*
1. Monitore o consumo no painel admin
2. Ajuste o limite se necessário
3. Verifique se há conversas muito longas

📌 Este é um alerta preventivo. O atendimento continua funcionando normalmente.`;
  }

  /**
   * Monta mensagem formatada para alerta de limite atingido (100%).
   * 
   * @param {object} params
   * @param {string} params.nomeUnidade - Nome da unidade
   * @param {number} params.consumido - Tokens consumidos
   * @param {number} params.limite - Limite diário
   * @returns {string} Mensagem formatada
   */
  static formatarMensagemLimiteAtingido({ nomeUnidade, consumido, limite }) {
    return `🚫 *ALERTA CRÍTICO TALLY - LIMITE ATINGIDO*

*Unidade:* ${nomeUnidade}
*Status:* Atendimento automático PAUSADO

📊 *Consumo de Tokens (IA):*
• Consumido: ${consumido.toLocaleString()} tokens
• Limite diário: ${limite.toLocaleString()} tokens
• Percentual: ${((consumido/limite) * 100).toFixed(1)}%

⚠️ *AÇÃO NECESSÁRIA:*
O limite diário foi atingido. Novos clientes recebem mensagem:
"⏰ Limite diário atingido. Um atendente retornará em breve."

🔧 *Como resolver:*
1. Acesse o painel admin
2. Ajuste o limite diário (se necessário)
3. O limite reseta automaticamente à meia-noite
4. Atenda manualmente os clientes que chegarem agora

📌 O sistema voltará ao normal automaticamente amanhã.`;
  }
}

module.exports = GerenteNotificationService;

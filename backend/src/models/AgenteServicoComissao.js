const BaseModel = require('./BaseModel');
const logger = require('./../utils/logger');

/**
 * Modelo: AgenteServicoComissao
 * FASE 2 - Sistema de Exceções de Comissão
 * 
 * Gerencia comissões customizadas por agente/serviço.
 * 
 * Regra de Prioridade:
 * 1. Se existe registro nesta tabela → usar comissao_percentual customizada
 * 2. Senão → usar comissao_percentual padrão do serviço
 */
class AgenteServicoComissao extends BaseModel {
  constructor() {
    super('agente_servico_comissao');
  }

  /**
   * Buscar comissão específica de um agente para um serviço
   * @param {number} agenteId - ID do agente
   * @param {number} servicoId - ID do serviço
   * @returns {Promise<object|null>} Registro de comissão ou null
   */
  async findByAgenteServico(agenteId, servicoId) {
    return await this.db(this.tableName)
      .where({ agente_id: agenteId, servico_id: servicoId })
      .first();
  }

  /**
   * Buscar todas as exceções de comissão de um agente
   * @param {number} agenteId - ID do agente
   * @returns {Promise<Array>} Lista de exceções com dados do serviço
   */
  async findByAgente(agenteId) {
    return await this.db(this.tableName)
      .join('servicos', 'agente_servico_comissao.servico_id', 'servicos.id')
      .where('agente_servico_comissao.agente_id', agenteId)
      .select(
        'agente_servico_comissao.*',
        'servicos.nome as servico_nome',
        'servicos.comissao_percentual as comissao_padrao_servico'
      )
      .orderBy('servicos.nome');
  }

  /**
   * Buscar todas as exceções de comissão de um serviço
   * @param {number} servicoId - ID do serviço
   * @returns {Promise<Array>} Lista de exceções com dados do agente
   */
  async findByServico(servicoId) {
    return await this.db(this.tableName)
      .join('agentes', 'agente_servico_comissao.agente_id', 'agentes.id')
      .where('agente_servico_comissao.servico_id', servicoId)
      .whereNull('agentes.deleted_at')
      .select(
        'agente_servico_comissao.*',
        'agentes.nome as agente_nome',
        'agentes.sobrenome as agente_sobrenome'
      )
      .orderBy('agentes.nome');
  }

  /**
   * Criar ou atualizar comissão customizada (UPSERT)
   * @param {number} agenteId - ID do agente
   * @param {number} servicoId - ID do serviço
   * @param {number} comissaoPercentual - Comissão customizada (0-100)
   * @returns {Promise<object>} Registro criado ou atualizado
   */
  async upsert(agenteId, servicoId, comissaoPercentual) {
    const existing = await this.findByAgenteServico(agenteId, servicoId);

    if (existing) {
      // UPDATE
      await this.db(this.tableName)
        .where({ agente_id: agenteId, servico_id: servicoId })
        .update({
          comissao_percentual: comissaoPercentual,
          updated_at: new Date()
        });

      return await this.findByAgenteServico(agenteId, servicoId);
    } else {
      // INSERT
      const [id] = await this.db(this.tableName).insert({
        agente_id: agenteId,
        servico_id: servicoId,
        comissao_percentual: comissaoPercentual,
        created_at: new Date(),
        updated_at: new Date()
      });

      return await this.db(this.tableName).where({ id }).first();
    }
  }

  /**
   * Remover comissão customizada (volta a usar comissão padrão do serviço)
   * @param {number} agenteId - ID do agente
   * @param {number} servicoId - ID do serviço
   * @returns {Promise<boolean>} True se removeu, false se não existia
   */
  async remove(agenteId, servicoId) {
    const deleted = await this.db(this.tableName)
      .where({ agente_id: agenteId, servico_id: servicoId })
      .delete();

    return deleted > 0;
  }

  /**
   * Remover todas as comissões customizadas de um agente
   * @param {number} agenteId - ID do agente
   * @returns {Promise<number>} Número de registros removidos
   */
  async removeAllByAgente(agenteId) {
    return await this.db(this.tableName)
      .where({ agente_id: agenteId })
      .delete();
  }

  /**
   * Remover todas as comissões customizadas de um serviço
   * @param {number} servicoId - ID do serviço
   * @returns {Promise<number>} Número de registros removidos
   */
  async removeAllByServico(servicoId) {
    return await this.db(this.tableName)
      .where({ servico_id: servicoId })
      .delete();
  }

  /**
   * [ELITE-PHASE-2] Resolver comissão aplicável (hierarquia completa)
   * Esta é a função CRÍTICA que implementa a regra de prioridade.
   * 
   * HIERARQUIA DE PRIORIDADES (IMUTÁVEL):
   * 1. Exceção Específica: agente_servico_comissao.comissao_percentual
   * 2. Configuração Global do Agente: agentes.comissao_percentual
   * 3. Padrão do Serviço: servicos.comissao_percentual
   * 4. Fallback Final: 0%
   * 
   * @param {number} agenteId - ID do agente
   * @param {number} servicoId - ID do serviço
   * @param {object} trx - (Opcional) transação knex para consistência dentro de um fluxo transacional
   * @returns {Promise<number>} Comissão percentual aplicável (0-100)
   */
  async resolveComissao(agenteId, servicoId, trx) {
    const db = trx || this.db;

    // PRIORIDADE 1: Verificar se existe exceção específica agente+serviço
    const excecao = await db(this.tableName)
      .where({ agente_id: agenteId, servico_id: servicoId })
      .first();

    if (excecao) {
      logger.debug(`[AgenteServicoComissao] PRIORIDADE 1 (Exceção): ${excecao.comissao_percentual}% (agente ${agenteId}, serviço ${servicoId})`);
      const valor = Number(excecao.comissao_percentual);
      if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        logger.warn(`[AgenteServicoComissao] Exceção inválida (fora do range 0-100): ${excecao.comissao_percentual}% (agente ${agenteId}, serviço ${servicoId})`);
        return 0;
      }
      return valor;
    }

    // PRIORIDADE 2: Usar comissão global do agente (se configurada)
    const agente = await db('agentes')
      .where({ id: agenteId })
      .whereNull('deleted_at')
      .select('comissao_percentual')
      .first();

    if (agente) {
      const comissaoAgente = Number(agente.comissao_percentual);

      // Regra ELITE: não cair no padrão do serviço se o agente tiver uma comissão configurada.
      // Como a coluna pode ter default 0, tratamos "configurada" como "valor > 0".
      if (Number.isFinite(comissaoAgente) && comissaoAgente > 0) {
        if (comissaoAgente > 100) {
          logger.warn(`[AgenteServicoComissao] Comissão global do agente acima de 100%: ${comissaoAgente}% (agente ${agenteId}). Normalizando para 100%.`);
          return 100;
        }

        logger.debug(`[AgenteServicoComissao] PRIORIDADE 2 (Agente Global): ${comissaoAgente}% (agente ${agenteId})`);
        return comissaoAgente;
      }

      if (Number.isFinite(comissaoAgente) && comissaoAgente < 0) {
        logger.warn(`[AgenteServicoComissao] Comissão global do agente inválida (negativa): ${agente.comissao_percentual}% (agente ${agenteId}). Usando 0%.`);
        return 0;
      }
    }

    // PRIORIDADE 3: Usar comissão padrão do serviço
    const servico = await db('servicos')
      .where({ id: servicoId })
      .select('comissao_percentual')
      .first();

    if (!servico) {
      logger.warn(`[AgenteServicoComissao] FALLBACK (Serviço ${servicoId} não encontrado): 0%`);
      return 0;
    }

    const comissaoPadrao = Number(servico.comissao_percentual) || 0;
    if (!Number.isFinite(comissaoPadrao) || comissaoPadrao < 0) {
      logger.warn(`[AgenteServicoComissao] Comissão padrão do serviço inválida: ${servico.comissao_percentual}% (serviço ${servicoId}). Usando 0%.`);
      return 0;
    }
    if (comissaoPadrao > 100) {
      logger.warn(`[AgenteServicoComissao] Comissão padrão do serviço acima de 100%: ${comissaoPadrao}% (serviço ${servicoId}). Normalizando para 100%.`);
      return 100;
    }

    logger.debug(`[AgenteServicoComissao] PRIORIDADE 3 (Padrão do Serviço): ${comissaoPadrao}% (serviço ${servicoId})`);
    return comissaoPadrao;
  }
}

module.exports = AgenteServicoComissao;

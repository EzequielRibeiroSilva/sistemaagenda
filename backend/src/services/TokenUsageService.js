const { db } = require('../config/knex');
const logger = require('../utils/logger');

/**
 * TASK 3.3 - FASE 1: SERVICE DE CAPTURA DE TOKENS
 * 
 * Responsabilidade única: Registrar o consumo diário de tokens por usuário
 * na tabela uso_tokens_diario via estratégia de UPSERT.
 * 
 * Comportamento:
 * - INSERT: Se é a primeira chamada do dia para o usuário
 * - UPDATE: Soma os novos tokens ao total existente do dia
 * - Falhas são logadas mas NUNCA interrompem o fluxo principal do bot
 */
class TokenUsageService {
  
  /**
   * Registra o consumo de tokens de um usuário para a data atual.
   * 
   * @param {number} unidadeId - ID da unidade (para descobrir o usuario_id)
   * @param {number} totalTokens - Quantidade de tokens consumidos nesta chamada
   * @param {string} model - Modelo usado (para auditoria nos logs)
   * @returns {Promise<void>} - Operação assíncrona silenciosa
   */
  async registrarConsumo(unidadeId, totalTokens, model = 'desconhecido') {
    // ⚠️ PROTEÇÃO: Operação NUNCA deve quebrar o fluxo principal
    try {
      // Validação básica de entrada
      if (!unidadeId || !totalTokens || totalTokens <= 0) {
        logger.debug('[TokenUsageService] Parâmetros inválidos - ignorando registro', {
          unidadeId,
          totalTokens,
          model
        });
        return;
      }

      // 1️⃣ DESCOBRIR O usuario_id (dono da barbearia) via unidade
      const usuarioId = await this._obterUsuarioIdDaUnidade(unidadeId);
      if (!usuarioId) {
        logger.warn('[TokenUsageService] Não foi possível identificar usuario_id', {
          unidadeId,
          totalTokens
        });
        return;
      }

      // 2️⃣ PREPARAR DATA DE HOJE (formato YYYY-MM-DD local)
      const dataHoje = this._obterDataLocal();

      // 3️⃣ EXECUTAR UPSERT (Insert or Update)
      await this._executarUpsert(usuarioId, dataHoje, totalTokens);

      // ✅ LOG DE SUCESSO (apenas em development para não poluir logs)
      if (process.env.NODE_ENV === 'development') {
        logger.debug('[TokenUsageService] ✅ Consumo registrado', {
          usuario_id: usuarioId,
          unidade_id: unidadeId,
          data: dataHoje,
          tokens_consumidos: totalTokens,
          model
        });
      }

    } catch (error) {
      // 🛡️ FALHA SILENCIOSA: Log do erro mas não propaga exceção
      logger.error('[TokenUsageService] ❌ Falha ao registrar consumo de tokens', {
        error: error?.message,
        stack: error?.stack,
        unidadeId,
        totalTokens,
        model
      });
      
      // Não re-throw: operação de log não deve quebrar resposta ao cliente
    }
  }

  /**
   * Busca o usuario_id (dono) de uma unidade específica.
   * 
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<number|null>} - usuario_id ou null se não encontrado
   * @private
   */
  async _obterUsuarioIdDaUnidade(unidadeId) {
    try {
      const unidade = await db('unidades')
        .where('id', unidadeId)
        .select('usuario_id')
        .first();

      return unidade?.usuario_id || null;
    } catch (error) {
      logger.error('[TokenUsageService] Erro ao buscar usuario_id da unidade', {
        error: error?.message,
        unidadeId
      });
      return null;
    }
  }

  /**
   * Gera a data atual no formato YYYY-MM-DD (timezone local).
   * 
   * @returns {string} - Data no formato ISO (apenas dia)
   * @private
   */
  _obterDataLocal() {
    // Usar toLocaleDateString para garantir timezone correto
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    
    return `${ano}-${mes}-${dia}`; // "YYYY-MM-DD"
  }

  /**
   * Executa o UPSERT na tabela uso_tokens_diario.
   * 
   * Estratégia PostgreSQL:
   * - INSERT ... ON CONFLICT ... DO UPDATE
   * - Constraint única (usuario_id, data) detecta conflito
   * - UPDATE soma os novos tokens ao total existente
   * 
   * @param {number} usuarioId - ID do usuário dono da barbearia
   * @param {string} dataHoje - Data no formato YYYY-MM-DD
   * @param {number} totalTokens - Tokens consumidos nesta chamada
   * @returns {Promise<void>}
   * @private
   */
  async _executarUpsert(usuarioId, dataHoje, totalTokens) {
    try {
      // 🔄 UPSERT PostgreSQL: INSERT com ON CONFLICT
      await db.raw(`
        INSERT INTO uso_tokens_diario (usuario_id, data, total_tokens, created_at, updated_at)
        VALUES (?, ?, ?, NOW(), NOW())
        ON CONFLICT (usuario_id, data) 
        DO UPDATE SET
          total_tokens = uso_tokens_diario.total_tokens + EXCLUDED.total_tokens,
          updated_at = NOW()
      `, [usuarioId, dataHoje, totalTokens]);

    } catch (error) {
      // Re-throw para ser capturado no nível superior
      throw new Error(`Falha no UPSERT: ${error.message}`);
    }
  }

  /**
   * Método auxiliar para buscar o consumo diário de um usuário (para testes).
   * 
   * @param {number} usuarioId - ID do usuário
   * @param {string} data - Data no formato YYYY-MM-DD (opcional, padrão = hoje)
   * @returns {Promise<Object|null>} - Registro do dia ou null
   */
  async obterConsumoDiario(usuarioId, data = null) {
    try {
      const dataConsulta = data || this._obterDataLocal();
      
      const registro = await db('uso_tokens_diario')
        .where('usuario_id', usuarioId)
        .where('data', dataConsulta)
        .first();

      return registro || null;
    } catch (error) {
      logger.error('[TokenUsageService] Erro ao consultar consumo diário', {
        error: error?.message,
        usuarioId,
        data
      });
      return null;
    }
  }
}

module.exports = new TokenUsageService();
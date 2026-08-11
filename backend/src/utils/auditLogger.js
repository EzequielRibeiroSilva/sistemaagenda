/**
 * Utility: Audit Logger (ELITE)
 * Descrição: Sistema de auditoria forense para operações críticas
 * 
 * FASE 1 - BLINDAGEM DE AUDITORIA:
 * - Registra alterações de comissão com valor anterior e novo
 * - Captura contexto completo: usuário, IP, timestamp
 * - Integra com tabela audit_logs
 */

const { db } = require('../config/knex');
const logger = require('./logger');

/**
 * Registra alteração de comissão na tabela audit_logs
 * 
 * @param {Object} params - Parâmetros do log
 * @param {number} params.usuario_id - ID do usuário que fez a alteração
 * @param {string} params.usuario_email - Email do usuário
 * @param {string} params.usuario_nome - Nome do usuário
 * @param {string} params.usuario_role - Role do usuário (ADMIN, MASTER)
 * @param {string} params.resource_type - Tipo do recurso (servico, agente, produto)
 * @param {number} params.resource_id - ID do recurso alterado
 * @param {number|null} params.comissao_anterior - Valor anterior da comissão
 * @param {number} params.comissao_nova - Novo valor da comissão
 * @param {string} params.ip_address - IP da requisição
 * @param {string} params.method - Método HTTP (POST, PUT, PATCH)
 * @param {string} params.endpoint - URL do endpoint
 * @param {Object} params.trx - Transação Knex (opcional)
 * @returns {Promise<number>} - ID do log criado
 */
async function logComissaoChange({
  usuario_id,
  usuario_email,
  usuario_nome,
  usuario_role,
  resource_type,
  resource_id,
  comissao_anterior,
  comissao_nova,
  ip_address,
  method,
  endpoint,
  trx
}) {
  try {
    const logData = {
      usuario_id,
      usuario_email,
      usuario_nome,
      usuario_role,
      action: 'ALTERAR_COMISSAO',
      resource_type,
      resource_id,
      method: method || 'PUT',
      endpoint: endpoint || null,
      ip_address: ip_address || null,
      status_code: 200,
      request_data: JSON.stringify({
        comissao_anterior: comissao_anterior !== null && comissao_anterior !== undefined 
          ? Number(comissao_anterior) 
          : null,
        comissao_nova: Number(comissao_nova),
        alterado_em: new Date().toISOString()
      }),
      response_data: JSON.stringify({
        success: true,
        message: 'Comissão alterada com sucesso'
      }),
      created_at: new Date()
    };

    // Se há transação, usar ela; senão, criar própria
    const query = trx || db;
    
    const [logId] = await query('audit_logs')
      .insert(logData)
      .returning('id');

    const finalLogId = logId?.id || logId;

    logger.info(`📝 [AUDIT] Comissão alterada - Resource: ${resource_type}#${resource_id}, ` +
                `Anterior: ${comissao_anterior}%, Nova: ${comissao_nova}%, ` +
                `Usuário: ${usuario_email}, Log ID: ${finalLogId}`);

    return finalLogId;
  } catch (error) {
    logger.error('❌ [AUDIT] Erro ao registrar alteração de comissão:', error);
    throw error; // Propagar erro para garantir rollback da transação
  }
}

/**
 * Registra exclusão de agente na tabela audit_logs
 * 
 * @param {Object} params - Parâmetros do log
 * @param {number} params.usuario_id - ID do usuário que fez a exclusão
 * @param {string} params.usuario_email - Email do usuário
 * @param {string} params.usuario_role - Role do usuário
 * @param {number} params.agente_id - ID do agente excluído
 * @param {string} params.agente_nome - Nome do agente excluído
 * @param {string} params.agente_email - Email do agente excluído
 * @param {string} params.ip_address - IP da requisição
 * @param {string} params.endpoint - URL do endpoint
 * @param {Object} params.trx - Transação Knex (opcional)
 * @returns {Promise<number>} - ID do log criado
 */
async function logAgenteDelete({
  usuario_id,
  usuario_email,
  usuario_role,
  agente_id,
  agente_nome,
  agente_email,
  ip_address,
  endpoint,
  trx
}) {
  try {
    const logData = {
      usuario_id,
      usuario_email,
      usuario_nome: null, // Pode ser adicionado se disponível
      usuario_role,
      action: 'DELETAR_AGENTE',
      resource_type: 'agente',
      resource_id: agente_id,
      method: 'DELETE',
      endpoint: endpoint || null,
      ip_address: ip_address || null,
      status_code: 200,
      request_data: JSON.stringify({
        agente_nome,
        agente_email,
        deletado_em: new Date().toISOString()
      }),
      response_data: JSON.stringify({
        success: true,
        message: 'Agente excluído com sucesso'
      }),
      created_at: new Date()
    };

    const query = trx || db;
    
    const [logId] = await query('audit_logs')
      .insert(logData)
      .returning('id');

    const finalLogId = logId?.id || logId;

    logger.info(`📝 [AUDIT] Agente excluído - ID: ${agente_id}, ` +
                `Nome: ${agente_nome}, Usuário: ${usuario_email}, Log ID: ${finalLogId}`);

    return finalLogId;
  } catch (error) {
    logger.error('❌ [AUDIT] Erro ao registrar exclusão de agente:', error);
    throw error;
  }
}

module.exports = {
  logComissaoChange,
  logAgenteDelete
};

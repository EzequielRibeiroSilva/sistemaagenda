/**
 * Cache Invalidation Middleware
 * 
 * Helper para invalidar cache FAQ após operações de CRUD
 * que afetam o conhecimento base do sistema.
 */

const { getInstance: getKnowledgeBaseService } = require('../services/KnowledgeBaseService');
const logger = require('../utils/logger');

/**
 * Invalida cache de todas as unidades de um usuário
 * @param {number} usuarioId - ID do usuário
 * @param {number|number[]} unidadeIds - ID(s) da(s) unidade(s)
 */
async function invalidateKnowledgeCache(usuarioId, unidadeIds) {
  if (!usuarioId) {
    logger.warn('[Cache Invalidation] usuarioId não fornecido - ignorando');
    return;
  }

  try {
    const kbService = getKnowledgeBaseService();
    const ids = Array.isArray(unidadeIds) ? unidadeIds : [unidadeIds];
    
    for (const unidadeId of ids) {
      if (unidadeId) {
        await kbService.invalidateCache(usuarioId, unidadeId);
        logger.log(`🗑️ [Cache] FAQ cache invalidado - usuario_id: ${usuarioId}, unidade_id: ${unidadeId}`);
      }
    }
  } catch (error) {
    // Não-crítico: erro no cache não deve impedir operações
    logger.warn('[Cache Invalidation] Erro ao invalidar cache (não-crítico):', error?.message);
  }
}

/**
 * Middleware Express para invalidação automática após sucesso
 * Deve ser usado APÓS a operação de CRUD ter sido concluída
 */
function invalidateCacheMiddleware(req, res, next) {
  // Interceptar o método json() original
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    // Só invalidar se a operação foi bem-sucedida (status 200 ou 201)
    if (res.statusCode === 200 || res.statusCode === 201) {
      const usuarioId = req.user?.id;
      const unidadeId = req.params?.id || req.body?.unidade_id || data?.data?.unidade_id;
      
      if (usuarioId && unidadeId) {
        // Invalidar de forma assíncrona (não-bloqueante)
        setImmediate(() => {
          invalidateKnowledgeCache(usuarioId, unidadeId);
        });
      }
    }
    
    // Chamar o json() original
    return originalJson(data);
  };
  
  next();
}

module.exports = {
  invalidateKnowledgeCache,
  invalidateCacheMiddleware
};

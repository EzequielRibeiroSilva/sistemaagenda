const BaseModel = require('./BaseModel');

/**
 * Modelo Cupom
 * 
 * Gerencia cupons de desconto do sistema
 * Implementa métodos para validação, consulta e rastreamento de uso
 */
class Cupom extends BaseModel {
  constructor() {
    super('cupons');
  }

  /**
   * Buscar cupom por código
   * @param {string} codigo - Código do cupom
   * @returns {Promise<Object|null>} Cupom encontrado ou null
   */
  async findByCodigo(codigo) {
    return await this.db(this.tableName)
      .where('codigo', codigo.toUpperCase())
      .first();
  }

  /**
   * Buscar cupons por usuário com paginação
   * @param {number} usuarioId - ID do usuário
   * @param {number} page - Página atual
   * @param {number} limit - Itens por página
   * @param {Object} filters - Filtros adicionais
   * @returns {Promise<Object>} Dados paginados
   */
  async findByUsuarioWithPagination(usuarioId, page = 1, limit = 10, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = this.db(this.tableName)
      .where('usuario_id', usuarioId);
    
    // Aplicar filtros
    if (filters.status) {
      query = query.where('status', filters.status);
    }
    
    if (filters.tipo_desconto) {
      query = query.where('tipo_desconto', filters.tipo_desconto);
    }
    
    if (filters.search) {
      query = query.where(function() {
        this.where('codigo', 'ilike', `%${filters.search}%`)
            .orWhere('descricao', 'ilike', `%${filters.search}%`);
      });
    }
    
    // Buscar dados
    const data = await query
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    
    // Contar total
    const countQuery = this.db(this.tableName)
      .where('usuario_id', usuarioId);
    
    if (filters.status) {
      countQuery.where('status', filters.status);
    }
    
    if (filters.tipo_desconto) {
      countQuery.where('tipo_desconto', filters.tipo_desconto);
    }
    
    if (filters.search) {
      countQuery.where(function() {
        this.where('codigo', 'ilike', `%${filters.search}%`)
            .orWhere('descricao', 'ilike', `%${filters.search}%`);
      });
    }
    
    const [{ count }] = await countQuery.count('id as count');
    const total = parseInt(count);
    
    return {
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Verificar se código já existe para o usuário
   * @param {string} codigo - Código do cupom
   * @param {number} usuarioId - ID do usuário
   * @param {number} excludeId - ID do cupom a excluir da verificação (para edição)
   * @returns {Promise<boolean>} True se código já existe
   */
  async codigoExists(codigo, usuarioId, excludeId = null) {
    let query = this.db(this.tableName)
      .where('codigo', codigo.toUpperCase())
      .where('usuario_id', usuarioId);
    
    if (excludeId) {
      query = query.whereNot('id', excludeId);
    }
    
    const result = await query.first();
    return !!result;
  }

  /**
   * Contar usos de um cupom por cliente
   * @param {number} cupomId - ID do cupom
   * @param {number} clienteId - ID do cliente
   * @returns {Promise<number>} Número de usos
   */
  async contarUsosPorCliente(cupomId, clienteId) {
    const result = await this.db('cupons_uso')
      .where('cupom_id', cupomId)
      .where('cliente_id', clienteId)
      .count('id as count')
      .first();
    
    return parseInt(result.count);
  }

  /**
   * Registrar uso de cupom
   * @param {Object} usoData - Dados do uso
   * @returns {Promise<Object>} Registro de uso criado
   */
  async registrarUso(usoData) {
    const trx = await this.db.transaction();
    
    try {
      // Inserir registro de uso
      const [uso] = await trx('cupons_uso')
        .insert({
          cupom_id: usoData.cupom_id,
          cliente_id: usoData.cliente_id,
          agendamento_id: usoData.agendamento_id,
          valor_original: usoData.valor_original,
          valor_desconto: usoData.valor_desconto,
          valor_final: usoData.valor_final,
          usado_em: new Date()
        })
        .returning('*');
      
      // Incrementar contador de uso do cupom
      await trx('cupons')
        .where('id', usoData.cupom_id)
        .increment('uso_atual', 1);
      
      await trx.commit();
      return uso;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Buscar histórico de uso de um cupom
   * @param {number} cupomId - ID do cupom
   * @param {number} page - Página atual
   * @param {number} limit - Itens por página
   * @returns {Promise<Object>} Histórico paginado
   */
  async buscarHistoricoUso(cupomId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const data = await this.db('cupons_uso')
      .where('cupom_id', cupomId)
      .leftJoin('clientes', 'cupons_uso.cliente_id', 'clientes.id')
      .leftJoin('agendamentos', 'cupons_uso.agendamento_id', 'agendamentos.id')
      .select(
        'cupons_uso.*',
        'clientes.primeiro_nome as cliente_nome',
        'clientes.sobrenome as cliente_sobrenome',
        'clientes.telefone as cliente_telefone',
        'agendamentos.data_agendamento',
        'agendamentos.hora_inicio'
      )
      .orderBy('cupons_uso.usado_em', 'desc')
      .limit(limit)
      .offset(offset);
    
    const [{ count }] = await this.db('cupons_uso')
      .where('cupom_id', cupomId)
      .count('id as count');
    
    const total = parseInt(count);
    
    return {
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Atualizar status de cupons expirados
   * Método utilitário para ser executado periodicamente
   * @returns {Promise<number>} Número de cupons atualizados
   */
  async atualizarCuponsExpirados() {
    const result = await this.db(this.tableName)
      .where('status', 'Ativo')
      .whereNotNull('data_fim')
      .where('data_fim', '<', new Date())
      .update({ status: 'Expirado' });
    
    return result;
  }

  /**
   * Buscar cupons ativos e válidos para uso público
   * @param {string} codigo - Código do cupom
   * @returns {Promise<Object|null>} Cupom válido ou null
   */
  async buscarCupomValidoParaUso(codigo) {
    const now = new Date();
    
    return await this.db(this.tableName)
      .where('codigo', codigo.toUpperCase())
      .where('status', 'Ativo')
      .where(function() {
        this.whereNull('data_inicio')
            .orWhere('data_inicio', '<=', now);
      })
      .where(function() {
        this.whereNull('data_fim')
            .orWhere('data_fim', '>=', now);
      })
      .first();
  }
}

module.exports = Cupom;

const { db } = require('../config/knex');

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = db;
  }

  // Buscar todos os registros
  async findAll(filters = {}) {
    let query = this.db(this.tableName);
    
    // Aplicar filtros se fornecidos
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null) {
        query = query.where(key, filters[key]);
      }
    });
    
    return await query.select('*');
  }

  // Buscar por ID
  async findById(id) {
    const result = await this.db(this.tableName).where('id', id).first();
    return result;
  }

  // Criar novo registro
  async create(data) {
    const [result] = await this.db(this.tableName).insert(data).returning('*');
    return result;
  }

  // Atualizar registro
  async update(id, data) {
    const [result] = await this.db(this.tableName)
      .where('id', id)
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');
    return result;
  }

  // Deletar registro
  async delete(id) {
    const result = await this.db(this.tableName).where('id', id).del();
    return result > 0;
  }

  // Contar registros
  async count(filters = {}) {
    let query = this.db(this.tableName);
    
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null) {
        query = query.where(key, filters[key]);
      }
    });
    
    const result = await query.count('id as count').first();
    return parseInt(result.count);
  }

  // Buscar com paginação
  async findWithPagination(page = 1, limit = 10, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = this.db(this.tableName);
    
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null) {
        query = query.where(key, filters[key]);
      }
    });
    
    const data = await query.select('*').limit(limit).offset(offset);
    const total = await this.count(filters);
    
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
}

module.exports = BaseModel;

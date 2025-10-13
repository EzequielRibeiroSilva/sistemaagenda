const BaseModel = require('./BaseModel');

class Unidade extends BaseModel {
  constructor() {
    super('unidades');
  }

  // Buscar unidades por usuário
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .select('*');
  }

  // Buscar unidades ativas por usuário
  async findActiveByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .where('status', 'Ativo')
      .select('*');
  }

  // Contar unidades ativas por usuário (exclui unidades com status 'Excluido')
  async countByUsuario(usuarioId) {
    const result = await this.db(this.tableName)
      .where('usuario_id', usuarioId)
      .where('status', '!=', 'Excluido')
      .count('id as count')
      .first();
    return parseInt(result.count);
  }

  // Buscar unidade por slug_url (para API pública)
  async findBySlug(slugUrl) {
    return await this.db(this.tableName)
      .where('slug_url', slugUrl)
      .where('status', 'Ativo')
      .first();
  }

  // Gerar slug único baseado no nome
  generateSlug(nome) {
    return nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-') // Substitui espaços por hífens
      .replace(/-+/g, '-') // Remove hífens duplicados
      .trim('-'); // Remove hífens do início e fim
  }

  // Verificar se slug já existe
  async slugExists(slug, excludeId = null) {
    const query = this.db(this.tableName).where('slug_url', slug);
    if (excludeId) {
      query.where('id', '!=', excludeId);
    }
    const result = await query.first();
    return !!result;
  }

  // Gerar slug único (adiciona número se necessário)
  async generateUniqueSlug(nome, excludeId = null) {
    let baseSlug = this.generateSlug(nome);
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, excludeId)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  // Override do método create para gerar slug automaticamente
  async create(data) {
    if (data.nome && !data.slug_url) {
      data.slug_url = await this.generateUniqueSlug(data.nome);
    }
    return await super.create(data);
  }

  // Override do método update para atualizar slug se nome mudou
  async update(id, data) {
    if (data.nome) {
      const current = await this.findById(id);
      if (current && current.nome !== data.nome) {
        data.slug_url = await this.generateUniqueSlug(data.nome, id);
      }
    }
    return await super.update(id, data);
  }
}

module.exports = Unidade;

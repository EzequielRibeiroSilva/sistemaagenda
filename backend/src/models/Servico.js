const BaseModel = require('./BaseModel');

class Servico extends BaseModel {
  constructor() {
    super('servicos');
  }

  // Buscar serviços por usuário
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .leftJoin('categorias_servicos', 'servicos.categoria_id', 'categorias_servicos.id')
      .where('servicos.usuario_id', usuarioId)
      .select(
        'servicos.*',
        'categorias_servicos.nome as categoria_nome'
      );
  }

  // Buscar serviços ativos por usuário
  async findActiveByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .leftJoin('categorias_servicos', 'servicos.categoria_id', 'categorias_servicos.id')
      .where('servicos.usuario_id', usuarioId)
      .where('servicos.status', 'Ativo')
      .select(
        'servicos.*',
        'categorias_servicos.nome as categoria_nome'
      );
  }

  // Buscar serviços por categoria
  async findByCategoria(categoriaId, usuarioId) {
    return await this.db(this.tableName)
      .where('categoria_id', categoriaId)
      .where('usuario_id', usuarioId)
      .select('*');
  }

  // Buscar serviços por agente
  async findByAgente(agenteId) {
    return await this.db(this.tableName)
      .join('agente_servicos', 'servicos.id', 'agente_servicos.servico_id')
      .where('agente_servicos.agente_id', agenteId)
      .where('servicos.status', 'Ativo')
      .select('servicos.*');
  }

  // Buscar serviços com estatísticas
  async findWithStats(usuarioId) {
    return await this.db(this.tableName)
      .leftJoin('agendamento_servicos', 'servicos.id', 'agendamento_servicos.servico_id')
      .leftJoin('categorias_servicos', 'servicos.categoria_id', 'categorias_servicos.id')
      .where('servicos.usuario_id', usuarioId)
      .select(
        'servicos.*',
        'categorias_servicos.nome as categoria_nome'
      )
      .count('agendamento_servicos.id as total_agendamentos')
      .sum('agendamento_servicos.preco_aplicado as receita_total')
      .groupBy('servicos.id', 'categorias_servicos.id');
  }
}

module.exports = Servico;

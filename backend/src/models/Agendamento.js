const BaseModel = require('./BaseModel');

class Agendamento extends BaseModel {
  constructor() {
    super('agendamentos');
  }

  // Buscar agendamentos por usuário (através das unidades)
  async findByUsuario(usuarioId) {
    return await this.db(this.tableName)
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
      .join('agentes', 'agendamentos.agente_id', 'agentes.id')
      .where('unidades.usuario_id', usuarioId)
      .select(
        'agendamentos.*',
        this.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
        'clientes.telefone as cliente_telefone',
        this.db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome"),
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agendamentos por data
  async findByData(data, usuarioId) {
    return await this.db(this.tableName)
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
      .join('agentes', 'agendamentos.agente_id', 'agentes.id')
      .where('unidades.usuario_id', usuarioId)
      .where('agendamentos.data_agendamento', data)
      .select(
        'agendamentos.*',
        this.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
        'clientes.telefone as cliente_telefone',
        this.db.raw("CONCAT(COALESCE(agentes.nome, ''), ' ', COALESCE(agentes.sobrenome, '')) as agente_nome"),
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agendamentos por agente
  async findByAgente(agenteId) {
    return await this.db(this.tableName)
      .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .where('agendamentos.agente_id', agenteId)
      .select(
        'agendamentos.*',
        this.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
        'clientes.telefone as cliente_telefone',
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agendamentos por cliente
  async findByCliente(clienteId) {
    return await this.db(this.tableName)
      .join('agentes', 'agendamentos.agente_id', 'agentes.id')
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .where('agendamentos.cliente_id', clienteId)
      .select(
        'agendamentos.*',
        'agentes.nome as agente_nome',
        'unidades.nome as unidade_nome'
      );
  }

  // Buscar agendamentos com serviços
  async findWithServicos(id) {
    const agendamento = await this.findById(id);
    if (!agendamento) return null;

    const servicos = await this.db('agendamento_servicos')
      .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
      .where('agendamento_servicos.agendamento_id', id)
      .select(
        'servicos.nome',
        'servicos.duracao_minutos',
        'agendamento_servicos.preco_aplicado'
      );

    return {
      ...agendamento,
      servicos
    };
  }

  // Verificar conflito de horário
  async checkConflict(agenteId, data, horaInicio, horaFim, excludeId = null) {
    let query = this.db(this.tableName)
      .where('agente_id', agenteId)
      .where('data_agendamento', data)
      .where('status', '!=', 'Cancelado')
      .where(function() {
        this.where(function() {
          this.where('hora_inicio', '<=', horaInicio)
            .where('hora_fim', '>', horaInicio);
        })
        .orWhere(function() {
          this.where('hora_inicio', '<', horaFim)
            .where('hora_fim', '>=', horaFim);
        })
        .orWhere(function() {
          this.where('hora_inicio', '>=', horaInicio)
            .where('hora_fim', '<=', horaFim);
        });
      });

    if (excludeId) {
      query = query.where('id', '!=', excludeId);
    }

    const conflicts = await query.select('*');
    return conflicts.length > 0;
  }
}

module.exports = Agendamento;

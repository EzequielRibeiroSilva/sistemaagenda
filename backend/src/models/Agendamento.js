const BaseModel = require('./BaseModel');

class Agendamento extends BaseModel {
  constructor() {
    super('agendamentos');
  }

  async attachAssinaturaCobertura(agendamentos) {
    if (!Array.isArray(agendamentos) || agendamentos.length === 0) {
      return agendamentos;
    }

    const agendamentoIds = agendamentos
      .map(a => a?.id)
      .filter(id => Number.isFinite(id));

    if (agendamentoIds.length === 0) {
      return agendamentos;
    }

    let rows = [];
    try {
      rows = await this.db('assinatura_usos')
        .whereIn('agendamento_id', agendamentoIds)
        .distinct('agendamento_id');
    } catch (err) {
      // Se as migrations ainda não foram aplicadas, a tabela pode não existir.
      // Neste caso, assumir que não há cobertura por clube.
      if (err && (err.code === '42P01' || String(err.message || '').includes('assinatura_usos'))) {
        rows = [];
      } else {
        throw err;
      }
    }

    const coveredSet = new Set((rows || []).map(r => Number(r.agendamento_id)).filter(n => Number.isFinite(n)));

    for (const agendamento of agendamentos) {
      agendamento.coberto_clube = coveredSet.has(Number(agendamento.id));
    }

    return agendamentos;
  }

  async attachServicosAndExtras(agendamentos, options = {}) {
    const { includeExtras = false, includeComissao = false } = options;

    if (!Array.isArray(agendamentos) || agendamentos.length === 0) {
      return agendamentos;
    }

    const agendamentoIds = agendamentos
      .map(a => a?.id)
      .filter(id => Number.isFinite(id));

    if (agendamentoIds.length === 0) {
      return agendamentos;
    }

    const servicosRows = await this.db('agendamento_servicos')
      .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
      .whereIn('agendamento_servicos.agendamento_id', agendamentoIds)
      .select(
        'agendamento_servicos.agendamento_id as agendamento_id',
        'servicos.id as id',
        'servicos.nome as nome',
        'agendamento_servicos.preco_aplicado as preco',
        ...(includeComissao ? ['servicos.comissao_percentual as comissao_percentual'] : [])
      );

    const servicosByAgendamentoId = new Map();
    for (const row of servicosRows) {
      const id = row.agendamento_id;
      if (!servicosByAgendamentoId.has(id)) {
        servicosByAgendamentoId.set(id, []);
      }
      const { agendamento_id, ...servico } = row;
      servicosByAgendamentoId.get(id).push(servico);
    }

    let extrasByAgendamentoId = null;
    if (includeExtras) {
      const extrasRows = await this.db('agendamento_servicos_extras')
        .join('servicos_extras', 'agendamento_servicos_extras.servico_extra_id', 'servicos_extras.id')
        .whereIn('agendamento_servicos_extras.agendamento_id', agendamentoIds)
        .select(
          'agendamento_servicos_extras.agendamento_id as agendamento_id',
          'servicos_extras.id as id',
          'servicos_extras.nome as nome',
          'agendamento_servicos_extras.preco_aplicado as preco',
          'servicos_extras.duracao_minutos as duracao_minutos'
        );

      extrasByAgendamentoId = new Map();
      for (const row of extrasRows) {
        const id = row.agendamento_id;
        if (!extrasByAgendamentoId.has(id)) {
          extrasByAgendamentoId.set(id, []);
        }
        const { agendamento_id, ...extra } = row;
        extrasByAgendamentoId.get(id).push(extra);
      }
    }

    for (const agendamento of agendamentos) {
      agendamento.servicos = servicosByAgendamentoId.get(agendamento.id) || [];
      if (includeExtras) {
        agendamento.extras = (extrasByAgendamentoId && extrasByAgendamentoId.get(agendamento.id)) || [];
      }
    }

    return agendamentos;
  }

  // Buscar agendamentos por usuário (através das unidades)
  async findByUsuario(usuarioId) {
    const agendamentos = await this.db(this.tableName)
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

    await this.attachServicosAndExtras(agendamentos);

    return agendamentos;
  }

  // Buscar agendamentos por data
  async findByData(data, usuarioId) {
    const agendamentos = await this.db(this.tableName)
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

    await this.attachServicosAndExtras(agendamentos);

    return agendamentos;
  }

  // Buscar agendamentos por agente
  async findByAgente(agenteId, usuarioId = null) {
    let query = this.db(this.tableName)
      .join('clientes', 'agendamentos.cliente_id', 'clientes.id')
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .where('agendamentos.agente_id', agenteId);

    // ✅ Multi-tenant safety: se usuarioId fornecido, garantir que o agendamento pertence à empresa
    if (usuarioId) {
      query = query.where('unidades.usuario_id', usuarioId);
    }

    const agendamentos = await query.select(
      'agendamentos.*',
      this.db.raw("CONCAT(COALESCE(clientes.primeiro_nome, ''), ' ', COALESCE(clientes.ultimo_nome, '')) as cliente_nome"),
      'clientes.telefone as cliente_telefone',
      'unidades.nome as unidade_nome'
    );

    await this.attachServicosAndExtras(agendamentos);

    return agendamentos;
  }

  // Buscar agendamentos por cliente
  async findByCliente(clienteId, usuarioId = null) {
    let query = this.db(this.tableName)
      .join('agentes', 'agendamentos.agente_id', 'agentes.id')
      .join('unidades', 'agendamentos.unidade_id', 'unidades.id')
      .where('agendamentos.cliente_id', clienteId);

    // ✅ Multi-tenant safety: se usuarioId fornecido, garantir que o agendamento pertence à empresa
    if (usuarioId) {
      query = query.where('unidades.usuario_id', usuarioId);
    }

    return await query.select(
      'agendamentos.*',
      'agentes.nome as agente_nome',
      'unidades.nome as unidade_nome'
    );
  }

  // Buscar agendamentos com serviços
  async findWithServicos(id) {
    const agendamento = await this.findById(id);
    if (!agendamento) return null;

    // Buscar serviços do agendamento
    const servicos = await this.db('agendamento_servicos')
      .join('servicos', 'agendamento_servicos.servico_id', 'servicos.id')
      .where('agendamento_servicos.agendamento_id', id)
      .select(
        'servicos.id',
        'servicos.nome',
        'servicos.preco',
        'servicos.duracao_minutos',
        'agendamento_servicos.preco_aplicado'
      );

    // Buscar extras do agendamento
    const extras = await this.db('agendamento_servicos_extras')
      .join('servicos_extras', 'agendamento_servicos_extras.servico_extra_id', 'servicos_extras.id')
      .where('agendamento_servicos_extras.agendamento_id', id)
      .select(
        'servicos_extras.id',
        'servicos_extras.nome',
        'servicos_extras.preco',
        'servicos_extras.duracao_minutos',
        'agendamento_servicos_extras.preco_aplicado'
      );

    // Buscar dados do cliente
    let cliente = null;
    if (agendamento.cliente_id) {
      cliente = await this.db('clientes')
        .where('id', agendamento.cliente_id)
        .select('id', 'primeiro_nome', 'ultimo_nome', 'telefone')
        .first();

      // Combinar primeiro_nome e ultimo_nome em nome_completo
      if (cliente) {
        cliente.nome_completo = `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();
      }
    }

    // Buscar dados do agente
    let agente = null;
    if (agendamento.agente_id) {
      agente = await this.db('agentes')
        .where('id', agendamento.agente_id)
        .select('id', 'nome', 'sobrenome', 'email', 'telefone', 'avatar_url')
        .first();
    }

    // Extrair IDs dos serviços e extras
    const servico_ids = servicos.map(s => s.id);
    const servico_extra_ids = extras.map(e => e.id);


    return {
      ...agendamento,
      servicos,
      extras,
      cliente: cliente || {
        nome_completo: agendamento.cliente_nome || '',
        telefone: agendamento.cliente_telefone || ''
      },
      agente: agente || {
        nome: 'Agente não encontrado'
      },
      servico_ids,
      servico_extra_ids
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

  /**
   * Criar agendamento de forma atômica com proteção contra race conditions
   * (variante que usa uma transação externa - evita transações aninhadas)
   */
  async createWithLockUsingTrx(trx, dadosAgendamento) {
    const { agente_id, data_agendamento, hora_inicio, hora_fim, usuario_id } = dadosAgendamento;

    if (!trx) {
      const error = new Error('Transação (trx) é obrigatória');
      error.code = 'MISSING_TRX';
      throw error;
    }

    if (!usuario_id) {
      const error = new Error('usuario_id é obrigatório para criar agendamento');
      error.code = 'MISSING_USUARIO_ID';
      throw error;
    }

    await trx.raw(`
      SELECT pg_advisory_xact_lock(
        hashtext(?::text)
      )
    `, [`agendamento_numero_usuario_${usuario_id}`]);

    let numeroAgendamento = dadosAgendamento.numero_agendamento;
    if (!numeroAgendamento) {
      const lastRow = await trx(this.tableName)
        .where('usuario_id', usuario_id)
        .max('numero_agendamento as max')
        .first();

      const last = lastRow && lastRow.max ? parseInt(lastRow.max, 10) : 0;
      numeroAgendamento = last + 1;
    }

    // 1. Adquirir lock exclusivo no agente para a data específica
    await trx.raw(`
      SELECT pg_advisory_xact_lock(
        hashtext(?::text || ?::text)
      )
    `, [agente_id.toString(), data_agendamento]);

    // 2. Verificar conflitos dentro da transação
    const conflicts = await trx(this.tableName)
      .where('agente_id', agente_id)
      .where('data_agendamento', data_agendamento)
      .where('status', '!=', 'Cancelado')
      .where(function() {
        this.where(function() {
          this.where('hora_inicio', '<=', hora_inicio)
            .where('hora_fim', '>', hora_inicio);
        })
        .orWhere(function() {
          this.where('hora_inicio', '<', hora_fim)
            .where('hora_fim', '>=', hora_fim);
        })
        .orWhere(function() {
          this.where('hora_inicio', '>=', hora_inicio)
            .where('hora_fim', '<=', hora_fim);
        });
      })
      .select('id');

    if (conflicts.length > 0) {
      const error = new Error('Conflito de horário');
      error.code = 'CONFLICT';
      throw error;
    }

    // 3. Criar o agendamento
    const [agendamento] = await trx(this.tableName)
      .insert({
        ...dadosAgendamento,
        usuario_id,
        numero_agendamento: numeroAgendamento,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    return agendamento;
  }

  /**
   * Criar agendamento de forma atômica com proteção contra race conditions
   * Usa transação com SERIALIZABLE isolation level para garantir consistência
   */
  async createWithLock(dadosAgendamento) {
    const { agente_id, data_agendamento, hora_inicio, hora_fim, usuario_id } = dadosAgendamento;

    return this.db.transaction(async (trx) => {
      if (!usuario_id) {
        const error = new Error('usuario_id é obrigatório para criar agendamento');
        error.code = 'MISSING_USUARIO_ID';
        throw error;
      }

      await trx.raw(`
        SELECT pg_advisory_xact_lock(
          hashtext(?::text)
        )
      `, [`agendamento_numero_usuario_${usuario_id}`]);

      let numeroAgendamento = dadosAgendamento.numero_agendamento;
      if (!numeroAgendamento) {
        const lastRow = await trx(this.tableName)
          .where('usuario_id', usuario_id)
          .max('numero_agendamento as max')
          .first();

        const last = lastRow && lastRow.max ? parseInt(lastRow.max, 10) : 0;
        numeroAgendamento = last + 1;
      }

      // 1. Adquirir lock exclusivo no agente para a data específica
      // Isso serializa todas as operações de criação para o mesmo agente/data
      await trx.raw(`
        SELECT pg_advisory_xact_lock(
          hashtext(?::text || ?::text)
        )
      `, [agente_id.toString(), data_agendamento]);

      // 2. Verificar conflitos dentro da transação
      const conflicts = await trx(this.tableName)
        .where('agente_id', agente_id)
        .where('data_agendamento', data_agendamento)
        .where('status', '!=', 'Cancelado')
        .where(function() {
          this.where(function() {
            this.where('hora_inicio', '<=', hora_inicio)
              .where('hora_fim', '>', hora_inicio);
          })
          .orWhere(function() {
            this.where('hora_inicio', '<', hora_fim)
              .where('hora_fim', '>=', hora_fim);
          })
          .orWhere(function() {
            this.where('hora_inicio', '>=', hora_inicio)
              .where('hora_fim', '<=', hora_fim);
          });
        })
        .select('id');

      if (conflicts.length > 0) {
        const error = new Error('Conflito de horário');
        error.code = 'CONFLICT';
        throw error;
      }

      // 3. Criar o agendamento
      const [agendamento] = await trx(this.tableName)
        .insert({
          ...dadosAgendamento,
          usuario_id,
          numero_agendamento: numeroAgendamento,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      return agendamento;
    });
  }
}

module.exports = Agendamento;

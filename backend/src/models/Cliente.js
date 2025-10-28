const BaseModel = require('./BaseModel');

/**
 * Modelo Cliente - Gerenciamento de clientes com suporte a Multi-Tenant e Assinantes
 *
 * Funcionalidades:
 * - CRUD completo com isolamento por unidade_id
 * - Validação de telefone único por unidade
 * - Lógica de assinantes com períodos
 * - Filtros avançados para listagem
 * - Limpeza automática de telefone
 */
class Cliente extends BaseModel {
  constructor() {
    super('clientes');
  }

  /**
   * Sobrescrever findById para usar apenas campos existentes na tabela clientes
   * @param {number} id - ID do cliente
   * @returns {Promise<Object|null>} Cliente encontrado ou null
   */
  async findById(id) {
    return await this.db(this.tableName)
      .where('id', id)
      .select(
        'id',
        'primeiro_nome',
        'ultimo_nome',
        'telefone',
        'telefone_limpo',
        'is_assinante',
        'data_inicio_assinatura',
        'status',
        'whatsapp_id',
        'unidade_id',
        'created_at',
        'updated_at'
      )
      .first();
  }

  /**
   * Buscar todos os clientes de uma unidade com filtros opcionais
   * @param {number} unidadeId - ID da unidade (Multi-Tenant)
   * @param {Object} filtros - Filtros opcionais
   * @param {string} filtros.nome - Filtro por nome (LIKE)
   * @param {string} filtros.telefone - Filtro por telefone (LIKE)
   * @param {number} filtros.id - Filtro por ID específico
   * @param {boolean} filtros.is_assinante - Filtro por status de assinante
   * @param {string} filtros.status - Filtro por status (Ativo/Bloqueado)
   * @returns {Promise<Array>} Lista de clientes
   */
  async findByUnidade(unidadeId, filtros = {}) {
    let query = this.db(this.tableName)
      .where('unidade_id', unidadeId)
      .select(
        'id',
        'primeiro_nome',
        'ultimo_nome',
        'telefone',
        'telefone_limpo',
        'is_assinante',
        'data_inicio_assinatura',
        'status',
        'whatsapp_id',
        'created_at',
        'updated_at'
      )
      .orderBy('primeiro_nome', 'asc');

    // Aplicar filtros
    if (filtros.id) {
      query = query.where('id', filtros.id);
    }

    if (filtros.nome) {
      const nomeFilter = `%${filtros.nome.toLowerCase()}%`;
      query = query.where(function() {
        this.whereRaw('LOWER(primeiro_nome) LIKE ?', [nomeFilter])
            .orWhereRaw('LOWER(ultimo_nome) LIKE ?', [nomeFilter])
            .orWhereRaw('LOWER(CONCAT(primeiro_nome, \' \', ultimo_nome)) LIKE ?', [nomeFilter]);
      });
    }

    if (filtros.telefone) {
      const telefoneFilter = filtros.telefone.replace(/\D/g, ''); // Limpar telefone
      query = query.where('telefone_limpo', 'LIKE', `%${telefoneFilter}%`);
    }

    if (typeof filtros.is_assinante === 'boolean') {
      query = query.where('is_assinante', filtros.is_assinante);
    }

    if (filtros.status) {
      query = query.where('status', filtros.status);
    }

    return await query;
  }

  /**
   * Buscar cliente específico por ID com validação de unidade
   * @param {number} id - ID do cliente
   * @param {number} unidadeId - ID da unidade (Multi-Tenant)
   * @returns {Promise<Object|null>} Cliente encontrado ou null
   */
  async findByIdAndUnidade(id, unidadeId) {
    return await this.db(this.tableName)
      .where('id', id)
      .where('unidade_id', unidadeId)
      .select(
        'id',
        'primeiro_nome',
        'ultimo_nome',
        'telefone',
        'telefone_limpo',
        'is_assinante',
        'data_inicio_assinatura',
        'status',
        'whatsapp_id',
        'created_at',
        'updated_at'
      )
      .first();
  }

  /**
   * Buscar cliente por telefone limpo dentro de uma unidade
   * @param {string} telefoneLimpo - Telefone apenas com números
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<Object|null>} Cliente encontrado ou null
   */
  async findByTelefoneAndUnidade(telefoneLimpo, unidadeId) {
    return await this.db(this.tableName)
      .where('telefone_limpo', telefoneLimpo)
      .where('unidade_id', unidadeId)
      .select(
        'id',
        'primeiro_nome',
        'ultimo_nome',
        'telefone',
        'telefone_limpo',
        'is_assinante',
        'data_inicio_assinatura',
        'status',
        'whatsapp_id',
        'created_at',
        'updated_at'
      )
      .first();
  }

  /**
   * Criar novo cliente com validações
   * @param {Object} dadosCliente - Dados do cliente
   * @param {number} unidadeId - ID da unidade (Multi-Tenant)
   * @returns {Promise<Object>} Cliente criado
   */
  async create(dadosCliente, unidadeId) {
    // Limpar telefone
    const telefoneLimpo = this.limparTelefone(dadosCliente.telefone);

    // Validar telefone único na unidade
    const clienteExistente = await this.findByTelefoneAndUnidade(telefoneLimpo, unidadeId);
    if (clienteExistente) {
      throw new Error('Já existe um cliente com este telefone nesta unidade');
    }

    // Validar dados de assinante
    if (dadosCliente.is_assinante && !dadosCliente.data_inicio_assinatura) {
      dadosCliente.data_inicio_assinatura = new Date().toISOString().split('T')[0];
    }

    const dadosParaInserir = {
      unidade_id: unidadeId,
      primeiro_nome: dadosCliente.primeiro_nome?.trim() || '',
      ultimo_nome: dadosCliente.ultimo_nome?.trim() || '',
      telefone: dadosCliente.telefone?.trim() || '',
      telefone_limpo: telefoneLimpo,
      is_assinante: dadosCliente.is_assinante || false,
      data_inicio_assinatura: dadosCliente.data_inicio_assinatura || null,
      status: dadosCliente.status || 'Ativo',
      whatsapp_id: dadosCliente.whatsapp_id || null
    };

    const [clienteId] = await this.db(this.tableName).insert(dadosParaInserir).returning('id');
    return await this.findByIdAndUnidade(clienteId.id || clienteId, unidadeId);
  }

  /**
   * Atualizar cliente existente
   * @param {number} id - ID do cliente
   * @param {Object} dadosCliente - Dados para atualizar
   * @param {number} unidadeId - ID da unidade (Multi-Tenant)
   * @returns {Promise<Object>} Cliente atualizado
   */
  async update(id, dadosCliente, unidadeId) {
    // Verificar se cliente existe na unidade
    const clienteExistente = await this.findByIdAndUnidade(id, unidadeId);
    if (!clienteExistente) {
      throw new Error('Cliente não encontrado nesta unidade');
    }

    // Se telefone foi alterado, validar unicidade
    if (dadosCliente.telefone) {
      const telefoneLimpo = this.limparTelefone(dadosCliente.telefone);
      const outroClienteComTelefone = await this.db(this.tableName)
        .where('telefone_limpo', telefoneLimpo)
        .where('unidade_id', unidadeId)
        .where('id', '!=', id)
        .select('id')
        .first();

      if (outroClienteComTelefone) {
        throw new Error('Já existe outro cliente com este telefone nesta unidade');
      }

      dadosCliente.telefone_limpo = telefoneLimpo;
    }

    // Validar dados de assinante
    if (dadosCliente.is_assinante && !dadosCliente.data_inicio_assinatura && !clienteExistente.data_inicio_assinatura) {
      dadosCliente.data_inicio_assinatura = new Date().toISOString().split('T')[0];
    }

    const dadosParaAtualizar = {
      ...dadosCliente,
      updated_at: new Date()
    };

    // Remover campos que não devem ser atualizados
    delete dadosParaAtualizar.id;
    delete dadosParaAtualizar.unidade_id;
    delete dadosParaAtualizar.created_at;

    await this.db(this.tableName)
      .where('id', id)
      .where('unidade_id', unidadeId)
      .update(dadosParaAtualizar);

    return await this.findByIdAndUnidade(id, unidadeId);
  }

  /**
   * Excluir cliente (soft delete alterando status)
   * @param {number} id - ID do cliente
   * @param {number} unidadeId - ID da unidade (Multi-Tenant)
   * @returns {Promise<boolean>} Sucesso da operação
   */
  async delete(id, unidadeId) {
    const resultado = await this.db(this.tableName)
      .where('id', id)
      .where('unidade_id', unidadeId)
      .update({ status: 'Bloqueado', updated_at: new Date() });

    return resultado > 0;
  }

  /**
   * Contar clientes por unidade com filtros
   * @param {number} unidadeId - ID da unidade
   * @param {Object} filtros - Filtros opcionais
   * @returns {Promise<Object>} Contadores
   */
  async countByUnidade(unidadeId, filtros = {}) {
    let query = this.db(this.tableName).where('unidade_id', unidadeId);

    // Aplicar mesmos filtros da listagem
    if (filtros.nome) {
      const nomeFilter = `%${filtros.nome.toLowerCase()}%`;
      query = query.where(function() {
        this.whereRaw('LOWER(primeiro_nome) LIKE ?', [nomeFilter])
            .orWhereRaw('LOWER(ultimo_nome) LIKE ?', [nomeFilter])
            .orWhereRaw('LOWER(CONCAT(primeiro_nome, \' \', ultimo_nome)) LIKE ?', [nomeFilter]);
      });
    }

    if (filtros.telefone) {
      const telefoneFilter = filtros.telefone.replace(/\D/g, '');
      query = query.where('telefone_limpo', 'LIKE', `%${telefoneFilter}%`);
    }

    if (filtros.status) {
      query = query.where('status', filtros.status);
    }

    const [total, assinantes] = await Promise.all([
      query.clone().count('id as count').first(),
      query.clone().where('is_assinante', true).count('id as count').first()
    ]);

    return {
      total: parseInt(total.count),
      assinantes: parseInt(assinantes.count),
      naoAssinantes: parseInt(total.count) - parseInt(assinantes.count)
    };
  }

  /**
   * Limpar telefone removendo formatação
   * @param {string} telefone - Telefone com formatação
   * @returns {string} Telefone apenas com números
   */
  limparTelefone(telefone) {
    if (!telefone) return '';
    return telefone.replace(/\D/g, '');
  }

  /**
   * Criar cliente rápido para agendamento (se não existir)
   * @param {string} telefone - Telefone do cliente
   * @param {string} nome - Nome do cliente
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<Object>} Cliente existente ou criado
   */
  async findOrCreateForAgendamento(telefone, nome, unidadeId) {
    const telefoneLimpo = this.limparTelefone(telefone);

    // Buscar cliente existente
    let cliente = await this.findByTelefoneAndUnidade(telefoneLimpo, unidadeId);

    if (!cliente) {
      // Criar cliente automaticamente
      const nomePartes = nome.trim().split(' ');
      cliente = await this.create({
        primeiro_nome: nomePartes[0] || '',
        ultimo_nome: nomePartes.slice(1).join(' ') || '',
        telefone: telefone,
        is_assinante: false
      }, unidadeId);
    }

    return cliente;
  }

  /**
   * Buscar clientes por nome ou telefone (para modal de agendamento)
   * @param {number} unidadeId - ID da unidade (Multi-Tenant)
   * @param {string} searchQuery - Termo de busca (nome ou telefone)
   * @returns {Promise<Array>} Lista de clientes encontrados
   */
  async searchByNameOrPhone(unidadeId, searchQuery) {
    const query = searchQuery.toLowerCase().trim();

    return await this.db(this.tableName)
      .where('unidade_id', unidadeId)
      .where('status', 'Ativo')
      .where(function() {
        this.whereRaw('LOWER(primeiro_nome) LIKE ?', [`%${query}%`])
          .orWhereRaw('LOWER(ultimo_nome) LIKE ?', [`%${query}%`])
          .orWhereRaw('LOWER(CONCAT(primeiro_nome, \' \', ultimo_nome)) LIKE ?', [`%${query}%`])
          .orWhere('telefone', 'LIKE', `%${query}%`)
          .orWhere('telefone_limpo', 'LIKE', `%${query}%`);
      })
      .select(
        'id',
        'primeiro_nome',
        'ultimo_nome',
        'telefone',
        'is_assinante',
        this.db.raw('CONCAT(primeiro_nome, \' \', ultimo_nome) as nome_completo')
      )
      .orderBy('primeiro_nome', 'asc')
      .limit(10); // Limitar resultados para performance
  }
}

module.exports = Cliente;

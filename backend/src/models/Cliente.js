const BaseModel = require('./BaseModel');
const logger = require('./../utils/logger');

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

  static _hasAssinaturaStatusColumn = null;

  async hasAssinaturaStatusColumn() {
    if (Cliente._hasAssinaturaStatusColumn !== null) return Cliente._hasAssinaturaStatusColumn;

    try {
      const exists = await this.db.schema.hasColumn(this.tableName, 'assinatura_status');
      Cliente._hasAssinaturaStatusColumn = Boolean(exists);
      return Cliente._hasAssinaturaStatusColumn;
    } catch (error) {
      Cliente._hasAssinaturaStatusColumn = false;
      return false;
    }
  }

  /**
   * Sobrescrever findById para usar apenas campos existentes na tabela clientes
   * @param {number} id - ID do cliente
   * @returns {Promise<Object|null>} Cliente encontrado ou null
   */
  async findById(id) {
    const hasAssinaturaStatus = await this.hasAssinaturaStatusColumn();

    const columns = [
      `${this.tableName}.id`,
      `${this.tableName}.primeiro_nome`,
      `${this.tableName}.ultimo_nome`,
      `${this.tableName}.telefone`,
      `${this.tableName}.telefone_limpo`,
      `${this.tableName}.data_nascimento`,
      `${this.tableName}.is_assinante`,
      `${this.tableName}.exige_sinal_excecao`,
      ...(hasAssinaturaStatus
        ? [`${this.tableName}.assinatura_status`]
        : [this.db.raw('NULL as assinatura_status')]),
      `${this.tableName}.data_inicio_assinatura`,
      `${this.tableName}.assinatura_plano_id`,
      `${this.tableName}.status`,
      `${this.tableName}.whatsapp_id`,
      `${this.tableName}.unidade_id`,
      `${this.tableName}.created_at`,
      `${this.tableName}.updated_at`
    ];

    return await this.db(this.tableName)
      .where(`${this.tableName}.id`, id)
      .select(columns)
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
    const tableName = this.tableName;

    const hasAssinaturaStatus = await this.hasAssinaturaStatusColumn();

    const columns = [
      `${this.tableName}.id`,
      `${this.tableName}.primeiro_nome`,
      `${this.tableName}.ultimo_nome`,
      `${this.tableName}.telefone`,
      `${this.tableName}.telefone_limpo`,
      `${this.tableName}.data_nascimento`,
      `${this.tableName}.is_assinante`,
      `${this.tableName}.exige_sinal_excecao`,
      ...(hasAssinaturaStatus
        ? [`${this.tableName}.assinatura_status`]
        : [this.db.raw('NULL as assinatura_status')]),
      `${this.tableName}.data_inicio_assinatura`,
      `${this.tableName}.assinatura_plano_id`,
      `${this.tableName}.status`,
      `${this.tableName}.whatsapp_id`,
      `${this.tableName}.created_at`,
      `${this.tableName}.updated_at`
    ];

    let query = this.db(this.tableName)
      .where(`${this.tableName}.unidade_id`, unidadeId)
      .whereNull(`${this.tableName}.deleted_at`)
      .select(columns)
      .orderBy(`${this.tableName}.primeiro_nome`, 'asc');

    // Aplicar filtros
    if (filtros.id) {
      query = query.where(`${this.tableName}.id`, filtros.id);
    }

    if (filtros.nome) {
      const nomeFilter = `%${filtros.nome.toLowerCase()}%`;
      query = query.where(function() {
        this.whereRaw(`LOWER(${tableName}.primeiro_nome) LIKE ?`, [nomeFilter])
            .orWhereRaw(`LOWER(${tableName}.ultimo_nome) LIKE ?`, [nomeFilter])
            .orWhereRaw(`LOWER(CONCAT(${tableName}.primeiro_nome, ' ', ${tableName}.ultimo_nome)) LIKE ?`, [nomeFilter]);
      });
    }

    if (filtros.telefone) {
      const telefoneFilter = filtros.telefone.replace(/\D/g, ''); // Limpar telefone
      query = query.where(`${this.tableName}.telefone_limpo`, 'LIKE', `%${telefoneFilter}%`);
    }

    if (typeof filtros.is_assinante === 'boolean') {
      query = query.where(`${this.tableName}.is_assinante`, filtros.is_assinante);
    }

    if (filtros.status) {
      query = query.where(`${this.tableName}.status`, filtros.status);
    }

    // ✅ NOVO: Aplicar paginação (LIMIT e OFFSET)
    if (filtros.limit) {
      query = query.limit(filtros.limit);
    }

    if (filtros.offset) {
      query = query.offset(filtros.offset);
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
    const hasAssinaturaStatus = await this.hasAssinaturaStatusColumn();

    const columns = [
      `${this.tableName}.id`,
      `${this.tableName}.primeiro_nome`,
      `${this.tableName}.ultimo_nome`,
      `${this.tableName}.telefone`,
      `${this.tableName}.telefone_limpo`,
      `${this.tableName}.mp_customer_email`,
      `${this.tableName}.data_nascimento`,
      `${this.tableName}.is_assinante`,
      `${this.tableName}.exige_sinal_excecao`,
      ...(hasAssinaturaStatus
        ? [`${this.tableName}.assinatura_status`]
        : [this.db.raw('NULL as assinatura_status')]),
      `${this.tableName}.data_inicio_assinatura`,
      `${this.tableName}.assinatura_plano_id`,
      `${this.tableName}.status`,
      `${this.tableName}.whatsapp_id`,
      `${this.tableName}.created_at`,
      `${this.tableName}.updated_at`
    ];

    return await this.db(this.tableName)
      .where(`${this.tableName}.id`, id)
      .where(`${this.tableName}.unidade_id`, unidadeId)
      .whereNull(`${this.tableName}.deleted_at`)
      .select(columns)
      .first();
  }

  /**
   * Buscar cliente por telefone limpo dentro de uma unidade
   * @param {string} telefoneLimpo - Telefone apenas com números
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<Object|null>} Cliente encontrado ou null
   */
  async findByTelefoneAndUnidade(telefoneLimpo, unidadeId) {
    const hasAssinaturaStatus = await this.hasAssinaturaStatusColumn();

    const columns = [
      `${this.tableName}.id`,
      `${this.tableName}.primeiro_nome`,
      `${this.tableName}.ultimo_nome`,
      `${this.tableName}.telefone`,
      `${this.tableName}.telefone_limpo`,
      `${this.tableName}.mp_customer_email`,
      `${this.tableName}.data_nascimento`,
      `${this.tableName}.is_assinante`,
      `${this.tableName}.exige_sinal_excecao`,
      ...(hasAssinaturaStatus
        ? [`${this.tableName}.assinatura_status`]
        : [this.db.raw('NULL as assinatura_status')]),
      `${this.tableName}.data_inicio_assinatura`,
      `${this.tableName}.assinatura_plano_id`,
      `${this.tableName}.status`,
      `${this.tableName}.whatsapp_id`,
      `${this.tableName}.created_at`,
      `${this.tableName}.updated_at`
    ];

    return await this.db(this.tableName)
      .where(`${this.tableName}.telefone_limpo`, telefoneLimpo)
      .where(`${this.tableName}.unidade_id`, unidadeId)
      .whereNull(`${this.tableName}.deleted_at`)
      .select(columns)
      .first();
  }

  /**
   * Criar novo cliente com validações
   * @param {Object} dadosCliente - Dados do cliente
   * @param {number} unidadeId - ID da unidade (Multi-Tenant)
   * @returns {Promise<Object>} Cliente criado
   */
  async create(dadosCliente, unidadeId) {
    const hasAssinaturaStatus = await this.hasAssinaturaStatusColumn();
    if (!hasAssinaturaStatus) {
      delete dadosCliente.assinatura_status;
    }

    const mpCustomerEmail = dadosCliente.mp_customer_email
      ? String(dadosCliente.mp_customer_email).trim().toLowerCase()
      : null;

    // Limpar telefone
    const telefoneLimpo = this.limparTelefone(dadosCliente.telefone);

    // Validar telefone único na unidade
    const clienteExistente = await this.findByTelefoneAndUnidade(telefoneLimpo, unidadeId);
    if (clienteExistente) {
      throw new Error('Já existe um cliente com este telefone nesta unidade');
    }

    // Validar dados de assinante
    if (dadosCliente.is_assinante && !dadosCliente.data_inicio_assinatura) {
      dadosCliente.data_inicio_assinatura = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    }

    if (dadosCliente.is_assinante) {
      const planoId = dadosCliente.assinatura_plano_id !== undefined && dadosCliente.assinatura_plano_id !== null
        ? parseInt(dadosCliente.assinatura_plano_id)
        : NaN;

      if (!planoId || Number.isNaN(planoId)) {
        throw new Error('Plano de assinatura é obrigatório para assinantes');
      }
    }

    const dadosParaInserir = {
      unidade_id: unidadeId,
      primeiro_nome: dadosCliente.primeiro_nome?.trim() || '',
      ultimo_nome: dadosCliente.ultimo_nome?.trim() || '',
      telefone: dadosCliente.telefone?.trim() || '',
      telefone_limpo: telefoneLimpo,
      mp_customer_email: mpCustomerEmail,
      data_nascimento: dadosCliente.data_nascimento || null,
      is_assinante: dadosCliente.is_assinante || false,
      exige_sinal_excecao: Boolean(dadosCliente.exige_sinal_excecao),
      ...(hasAssinaturaStatus ? { assinatura_status: dadosCliente.assinatura_status ?? null } : {}),
      data_inicio_assinatura: dadosCliente.data_inicio_assinatura || null,
      assinatura_plano_id: dadosCliente.is_assinante ? parseInt(dadosCliente.assinatura_plano_id) : null,
      status: dadosCliente.status || 'Ativo',
      whatsapp_id: dadosCliente.whatsapp_id || null
    };

    console.log(`[Cliente.create] 🔧 Inserindo cliente no banco: primeiro_nome="${dadosParaInserir.primeiro_nome}", ultimo_nome="${dadosParaInserir.ultimo_nome}"`);

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
    const hasAssinaturaStatus = await this.hasAssinaturaStatusColumn();
    if (!hasAssinaturaStatus) {
      delete dadosCliente.assinatura_status;
    }

    if (Object.prototype.hasOwnProperty.call(dadosCliente, 'mp_customer_email')) {
      dadosCliente.mp_customer_email = dadosCliente.mp_customer_email
        ? String(dadosCliente.mp_customer_email).trim().toLowerCase()
        : null;
    }

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
      dadosCliente.data_inicio_assinatura = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    }

    const isAssinanteFinal = typeof dadosCliente.is_assinante === 'boolean'
      ? dadosCliente.is_assinante
      : Boolean(clienteExistente.is_assinante);

    if (isAssinanteFinal) {
      const planoIdRaw = dadosCliente.assinatura_plano_id !== undefined
        ? dadosCliente.assinatura_plano_id
        : clienteExistente.assinatura_plano_id;

      const planoId = planoIdRaw !== undefined && planoIdRaw !== null ? parseInt(planoIdRaw) : NaN;
      if (!planoId || Number.isNaN(planoId)) {
        throw new Error('Plano de assinatura é obrigatório para assinantes');
      }

      dadosCliente.assinatura_plano_id = planoId;
    } else {
      // Se deixou de ser assinante, limpar plano
      if (dadosCliente.is_assinante === false) {
        dadosCliente.assinatura_plano_id = null;
      }
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
      .whereNull('deleted_at')
      .update({ deleted_at: new Date(), updated_at: new Date() });

    return resultado > 0;
  }

  /**
   * Contar clientes por unidade com filtros
   * @param {number} unidadeId - ID da unidade
   * @param {Object} filtros - Filtros opcionais
   * @returns {Promise<Object>} Contadores
   */
  async countByUnidade(unidadeId, filtros = {}) {
    const tableName = this.tableName;

    let query = this.db(this.tableName)
      .where(`${this.tableName}.unidade_id`, unidadeId)
      .whereNull(`${this.tableName}.deleted_at`);

    // Aplicar mesmos filtros da listagem
    if (filtros.nome) {
      const nomeFilter = `%${filtros.nome.toLowerCase()}%`;
      query = query.where(function() {
        this.whereRaw(`LOWER(${tableName}.primeiro_nome) LIKE ?`, [nomeFilter])
            .orWhereRaw(`LOWER(${tableName}.ultimo_nome) LIKE ?`, [nomeFilter])
            .orWhereRaw(`LOWER(CONCAT(${tableName}.primeiro_nome, ' ', ${tableName}.ultimo_nome)) LIKE ?`, [nomeFilter]);
      });
    }

    if (filtros.telefone) {
      const telefoneFilter = filtros.telefone.replace(/\D/g, '');
      query = query.where(`${this.tableName}.telefone_limpo`, 'LIKE', `%${telefoneFilter}%`);
    }

    if (filtros.status) {
      query = query.where(`${this.tableName}.status`, filtros.status);
    }

    const [total, assinantes] = await Promise.all([
      query.clone().count(`${this.tableName}.id as count`).first(),
      query.clone().where(`${this.tableName}.is_assinante`, true).count('id as count').first()
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
    // ✅ NORMALIZAÇÃO BRUTAL: Remover TUDO que não é dígito
    const telefoneLimpo = this.limparTelefone(telefone);

    console.log(`[Cliente.findOrCreateForAgendamento] 🔍 [Auditoria Telefone] Original: ${telefone} | Limpo para Busca: ${telefoneLimpo}`);
    console.log(`[Cliente.findOrCreateForAgendamento] 🔍 Buscando cliente: telefone_limpo=${telefoneLimpo}, unidade_id=${unidadeId}`);

    // Buscar cliente existente usando telefone normalizado
    let cliente = await this.findByTelefoneAndUnidade(telefoneLimpo, unidadeId);

    if (!cliente) {
      // Criar cliente automaticamente
      const nomePartes = nome.trim().split(' ');
      const primeiroNome = nomePartes[0] || '';
      const ultimoNome = nomePartes.slice(1).join(' ') || '';
      
      console.log(`[Cliente.findOrCreateForAgendamento] 🔧 Cliente não encontrado. Criando novo com nome="${nome}" → primeiro_nome="${primeiroNome}", ultimo_nome="${ultimoNome}"`);
      
      cliente = await this.create({
        primeiro_nome: primeiroNome,
        ultimo_nome: ultimoNome,
        telefone: telefone,
        is_assinante: false
      }, unidadeId);
      
      console.log(`[Cliente.findOrCreateForAgendamento] ✅ Cliente criado com sucesso: ID=${cliente.id}, primeiro_nome="${cliente.primeiro_nome}", ultimo_nome="${cliente.ultimo_nome}"`);
    } else {
      console.log(`[Cliente.findOrCreateForAgendamento] ✅ Cliente existente encontrado: ID=${cliente.id}, primeiro_nome="${cliente.primeiro_nome}", ultimo_nome="${cliente.ultimo_nome}"`);
      
      // ✅ PRIORIDADE DE IDENTIDADE: Se cliente tem nome genérico "Cliente" e IA forneceu nome real, atualizar
      if (cliente.primeiro_nome === 'Cliente' && nome && nome !== 'Cliente') {
        const nomePartes = nome.trim().split(' ');
        const primeiroNome = nomePartes[0] || '';
        const ultimoNome = nomePartes.slice(1).join(' ') || '';
        
        console.log(`[Cliente.findOrCreateForAgendamento] 🔄 Atualizando cliente genérico com nome real: "${nome}" → primeiro_nome="${primeiroNome}", ultimo_nome="${ultimoNome}"`);
        
        await this.db(this.tableName)
          .where('id', cliente.id)
          .where('unidade_id', unidadeId)
          .update({
            primeiro_nome: primeiroNome,
            ultimo_nome: ultimoNome,
            updated_at: this.db.fn.now()
          });
        
        // Recarregar cliente atualizado
        cliente = await this.findByIdAndUnidade(cliente.id, unidadeId);
        console.log(`[Cliente.findOrCreateForAgendamento] ✅ Cliente atualizado com sucesso: ID=${cliente.id}, primeiro_nome="${cliente.primeiro_nome}", ultimo_nome="${cliente.ultimo_nome}"`);
      }
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

    const hasAssinaturaStatus = await this.hasAssinaturaStatusColumn();

    return await this.db(this.tableName)
      .where('unidade_id', unidadeId)
      .whereNull('deleted_at')
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
        ...(hasAssinaturaStatus
          ? ['assinatura_status']
          : [this.db.raw('NULL as assinatura_status')]),
        this.db.raw('CONCAT(primeiro_nome, \' \', ultimo_nome) as nome_completo')
      )
      .orderBy('primeiro_nome', 'asc')
      .limit(10); // Limitar resultados para performance
  }

  /**
   * Calcular pontos disponíveis de um cliente
   * Soma todos os créditos não expirados e subtrai os débitos
   * @param {number} clienteId - ID do cliente
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<number>} Total de pontos disponíveis
   */
  async calcularPontosDisponiveis(clienteId, unidadeId) {
    try {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      // Buscar todos os créditos não expirados
      const creditos = await this.db('pontos_historico')
        .where('cliente_id', clienteId)
        .where('unidade_id', unidadeId)
        .where('tipo', 'CREDITO')
        .where('expirado', false)
        .where(function() {
          this.whereNull('data_validade')
              .orWhere('data_validade', '>=', hoje);
        })
        .sum('pontos as total')
        .first();

      // Buscar todos os débitos
      const debitos = await this.db('pontos_historico')
        .where('cliente_id', clienteId)
        .where('unidade_id', unidadeId)
        .where('tipo', 'DEBITO')
        .sum('pontos as total')
        .first();

      const totalCreditos = parseFloat(creditos?.total || 0);
      const totalDebitos = parseFloat(debitos?.total || 0);

      return totalCreditos - totalDebitos;
    } catch (error) {
      logger.error('[Cliente] Erro ao calcular pontos disponíveis:', error);
      return 0;
    }
  }

  /**
   * Verificar se é o primeiro agendamento do cliente
   * @param {number} clienteId - ID do cliente
   * @param {number} unidadeId - ID da unidade
   * @returns {Promise<boolean>} True se for o primeiro agendamento
   */
  async isPrimeiroAgendamento(clienteId, unidadeId) {
    try {
      const count = await this.db('agendamentos')
        .where('cliente_id', clienteId)
        .where('unidade_id', unidadeId)
        .whereNull('deleted_at')
        .count('id as total')
        .first();

      return parseInt(count?.total || 0) === 0;
    } catch (error) {
      logger.error('[Cliente] Erro ao verificar primeiro agendamento:', error);
      return true; // Em caso de erro, considerar como primeiro para segurança
    }
  }
}

module.exports = Cliente;

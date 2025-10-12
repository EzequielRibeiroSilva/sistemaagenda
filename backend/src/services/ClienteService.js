const Cliente = require('../models/Cliente');

/**
 * Service para lógica de negócio de clientes
 * Implementa validações avançadas, regras de negócio e operações complexas
 * 
 * Responsabilidades:
 * - Validação de telefone único por unidade_id
 * - Limpeza e formatação de dados
 * - Validação de assinatura obrigatória
 * - Regras de negócio específicas
 * - Integração com outros serviços
 */
class ClienteService {
  constructor() {
    this.clienteModel = new Cliente();
  }

  /**
   * Validar dados de cliente antes da criação/atualização
   * @param {Object} dadosCliente - Dados do cliente
   * @param {number} unidadeId - ID da unidade
   * @param {number} clienteIdExistente - ID do cliente (para atualização)
   * @returns {Object} Dados validados e limpos
   */
  async validarDadosCliente(dadosCliente, unidadeId, clienteIdExistente = null) {
    const erros = [];

    // 1. Validar campos obrigatórios
    if (!dadosCliente.primeiro_nome?.trim()) {
      erros.push('Primeiro nome é obrigatório');
    }

    if (!dadosCliente.telefone?.trim()) {
      erros.push('Telefone é obrigatório');
    }

    // 2. Validar formato do telefone
    if (dadosCliente.telefone) {
      const telefoneValidacao = this.validarFormatoTelefone(dadosCliente.telefone);
      if (!telefoneValidacao.valido) {
        erros.push(telefoneValidacao.erro);
      }
    }

    // 3. Validar email se fornecido
    if (dadosCliente.email && !this.validarFormatoEmail(dadosCliente.email)) {
      erros.push('Formato de email inválido');
    }

    // 4. Validar dados de assinante
    if (dadosCliente.is_assinante) {
      const assinaturaValidacao = this.validarDadosAssinatura(dadosCliente);
      if (!assinaturaValidacao.valido) {
        erros.push(assinaturaValidacao.erro);
      }
    }

    // 5. Validar unicidade do telefone na unidade
    if (dadosCliente.telefone) {
      const telefoneLimpo = this.limparTelefone(dadosCliente.telefone);
      const clienteExistente = await this.clienteModel.findByTelefoneAndUnidade(telefoneLimpo, unidadeId);
      
      if (clienteExistente && (!clienteIdExistente || clienteExistente.id !== clienteIdExistente)) {
        erros.push('Já existe um cliente com este telefone nesta unidade');
      }
    }

    if (erros.length > 0) {
      throw new Error(`Dados inválidos: ${erros.join(', ')}`);
    }

    // Retornar dados limpos e validados
    return this.limparDadosCliente(dadosCliente);
  }

  /**
   * Validar formato do telefone
   * @param {string} telefone - Telefone a ser validado
   * @returns {Object} Resultado da validação
   */
  validarFormatoTelefone(telefone) {
    const telefoneLimpo = this.limparTelefone(telefone);
    
    // Validar se tem pelo menos 10 dígitos (DDD + número)
    if (telefoneLimpo.length < 10) {
      return {
        valido: false,
        erro: 'Telefone deve ter pelo menos 10 dígitos'
      };
    }

    // Validar se tem no máximo 13 dígitos (código país + DDD + número)
    if (telefoneLimpo.length > 13) {
      return {
        valido: false,
        erro: 'Telefone deve ter no máximo 13 dígitos'
      };
    }

    // Validar formato brasileiro (opcional)
    const formatoBrasileiro = /^(\+?55)?(\d{2})(\d{4,5})(\d{4})$/;
    if (!formatoBrasileiro.test(telefoneLimpo)) {
      return {
        valido: false,
        erro: 'Formato de telefone inválido'
      };
    }

    return { valido: true };
  }

  /**
   * Validar formato do email
   * @param {string} email - Email a ser validado
   * @returns {boolean} Se o email é válido
   */
  validarFormatoEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Validar dados de assinatura
   * @param {Object} dadosCliente - Dados do cliente
   * @returns {Object} Resultado da validação
   */
  validarDadosAssinatura(dadosCliente) {
    if (dadosCliente.is_assinante) {
      // Se é assinante, deve ter data de início
      if (!dadosCliente.data_inicio_assinatura) {
        // Permitir que seja definida automaticamente
        return { valido: true };
      }

      // Validar formato da data
      const dataInicio = new Date(dadosCliente.data_inicio_assinatura);
      if (isNaN(dataInicio.getTime())) {
        return {
          valido: false,
          erro: 'Data de início da assinatura inválida'
        };
      }

      // Validar se a data não é muito no futuro
      const hoje = new Date();
      const umAnoNoFuturo = new Date();
      umAnoNoFuturo.setFullYear(hoje.getFullYear() + 1);

      if (dataInicio > umAnoNoFuturo) {
        return {
          valido: false,
          erro: 'Data de início da assinatura não pode ser mais de 1 ano no futuro'
        };
      }
    }

    return { valido: true };
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
   * Formatar telefone para exibição
   * @param {string} telefone - Telefone limpo
   * @returns {string} Telefone formatado
   */
  formatarTelefone(telefone) {
    const limpo = this.limparTelefone(telefone);
    
    if (limpo.length === 11) {
      // Formato: (XX) 9XXXX-XXXX
      return `(${limpo.substr(0, 2)}) ${limpo.substr(2, 5)}-${limpo.substr(7, 4)}`;
    } else if (limpo.length === 10) {
      // Formato: (XX) XXXX-XXXX
      return `(${limpo.substr(0, 2)}) ${limpo.substr(2, 4)}-${limpo.substr(6, 4)}`;
    }
    
    return telefone; // Retornar original se não conseguir formatar
  }

  /**
   * Limpar e padronizar dados do cliente
   * @param {Object} dadosCliente - Dados brutos do cliente
   * @returns {Object} Dados limpos
   */
  limparDadosCliente(dadosCliente) {
    return {
      primeiro_nome: dadosCliente.primeiro_nome?.trim() || '',
      ultimo_nome: dadosCliente.ultimo_nome?.trim() || '',
      telefone: dadosCliente.telefone?.trim() || '',
      telefone_limpo: this.limparTelefone(dadosCliente.telefone),
      email: dadosCliente.email?.trim().toLowerCase() || null,
      is_assinante: Boolean(dadosCliente.is_assinante),
      data_inicio_assinatura: dadosCliente.data_inicio_assinatura || 
        (dadosCliente.is_assinante ? new Date().toISOString().split('T')[0] : null),
      status: dadosCliente.status || 'Ativo',
      whatsapp_id: dadosCliente.whatsapp_id || null
    };
  }

  /**
   * Calcular estatísticas de assinantes
   * @param {number} unidadeId - ID da unidade
   * @returns {Object} Estatísticas detalhadas
   */
  async calcularEstatisticasAssinantes(unidadeId) {
    const contadores = await this.clienteModel.countByUnidade(unidadeId);
    
    // Buscar assinantes com datas
    const assinantes = await this.clienteModel.findByUnidade(unidadeId, { is_assinante: true });
    
    const hoje = new Date();
    let assinantesAtivos = 0;
    let assinantesVencidos = 0;
    let assinantesProximoVencimento = 0;

    assinantes.forEach(assinante => {
      if (assinante.data_inicio_assinatura) {
        const dataInicio = new Date(assinante.data_inicio_assinatura);
        const dataVencimento = new Date(dataInicio);
        dataVencimento.setMonth(dataVencimento.getMonth() + 1); // Assumindo assinatura mensal

        if (dataVencimento < hoje) {
          assinantesVencidos++;
        } else {
          assinantesAtivos++;
          
          // Próximo ao vencimento (7 dias)
          const seteDiasAntes = new Date(dataVencimento);
          seteDiasAntes.setDate(seteDiasAntes.getDate() - 7);
          
          if (hoje >= seteDiasAntes) {
            assinantesProximoVencimento++;
          }
        }
      } else {
        assinantesAtivos++; // Sem data = considerado ativo
      }
    });

    return {
      ...contadores,
      assinantesAtivos,
      assinantesVencidos,
      assinantesProximoVencimento,
      percentualAssinantes: contadores.total > 0 ? 
        Math.round((contadores.assinantes / contadores.total) * 100) : 0
    };
  }

  /**
   * Buscar clientes com filtros avançados
   * @param {number} unidadeId - ID da unidade
   * @param {Object} filtros - Filtros de busca
   * @returns {Array} Lista de clientes
   */
  async buscarComFiltros(unidadeId, filtros) {
    // Limpar e validar filtros
    const filtrosLimpos = {};

    if (filtros.nome) {
      filtrosLimpos.nome = filtros.nome.trim();
    }

    if (filtros.telefone) {
      filtrosLimpos.telefone = this.limparTelefone(filtros.telefone);
    }

    if (filtros.id && !isNaN(parseInt(filtros.id))) {
      filtrosLimpos.id = parseInt(filtros.id);
    }

    if (typeof filtros.is_assinante === 'boolean') {
      filtrosLimpos.is_assinante = filtros.is_assinante;
    }

    if (filtros.status && ['Ativo', 'Bloqueado'].includes(filtros.status)) {
      filtrosLimpos.status = filtros.status;
    }

    return await this.clienteModel.findByUnidade(unidadeId, filtrosLimpos);
  }

  /**
   * Criar cliente com validações completas
   * @param {Object} dadosCliente - Dados do cliente
   * @param {number} unidadeId - ID da unidade
   * @returns {Object} Cliente criado
   */
  async criarCliente(dadosCliente, unidadeId) {
    const dadosValidados = await this.validarDadosCliente(dadosCliente, unidadeId);
    return await this.clienteModel.create(dadosValidados, unidadeId);
  }

  /**
   * Atualizar cliente com validações completas
   * @param {number} clienteId - ID do cliente
   * @param {Object} dadosCliente - Dados para atualizar
   * @param {number} unidadeId - ID da unidade
   * @returns {Object} Cliente atualizado
   */
  async atualizarCliente(clienteId, dadosCliente, unidadeId) {
    const dadosValidados = await this.validarDadosCliente(dadosCliente, unidadeId, clienteId);
    return await this.clienteModel.update(clienteId, dadosValidados, unidadeId);
  }
}

module.exports = ClienteService;

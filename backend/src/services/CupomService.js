const Cupom = require('../models/Cupom');
const logger = require('./../utils/logger');

/**
 * Service para lógica de negócio de cupons de desconto
 * 
 * Responsabilidades:
 * - Validação de dados de cupons
 * - Validação de uso de cupons
 * - Cálculo de descontos
 * - Regras de negócio complexas
 * - Verificação de limites e restrições
 */
class CupomService {
  constructor() {
    this.cupomModel = new Cupom();
  }

  /**
   * Validar dados de cupom antes da criação/atualização
   * @param {Object} dadosCupom - Dados do cupom
   * @param {number} usuarioId - ID do usuário
   * @param {number} cupomIdExistente - ID do cupom (para atualização)
   * @returns {Promise<Object>} Dados validados e limpos
   */
  async validarDadosCupom(dadosCupom, usuarioId, cupomIdExistente = null) {
    const erros = [];

    // 1. Validar código (obrigatório, único, formato)
    if (!dadosCupom.codigo?.trim()) {
      erros.push('Código do cupom é obrigatório');
    } else {
      const codigo = dadosCupom.codigo.trim().toUpperCase();
      
      // Validar formato: apenas letras, números e hífen
      if (!/^[A-Z0-9-]+$/.test(codigo)) {
        erros.push('Código deve conter apenas letras, números e hífen');
      }
      
      // Validar tamanho
      if (codigo.length < 3 || codigo.length > 50) {
        erros.push('Código deve ter entre 3 e 50 caracteres');
      }
      
      // Verificar unicidade
      const codigoExiste = await this.cupomModel.codigoExists(codigo, usuarioId, cupomIdExistente);
      if (codigoExiste) {
        erros.push('Já existe um cupom com este código');
      }
    }

    // 2. Validar tipo de desconto
    if (!['percentual', 'valor_fixo'].includes(dadosCupom.tipo_desconto)) {
      erros.push('Tipo de desconto inválido. Use "percentual" ou "valor_fixo"');
    }

    // 3. Validar valor do desconto
    if (!dadosCupom.valor_desconto || dadosCupom.valor_desconto <= 0) {
      erros.push('Valor do desconto deve ser maior que zero');
    } else {
      if (dadosCupom.tipo_desconto === 'percentual') {
        if (dadosCupom.valor_desconto > 100) {
          erros.push('Desconto percentual não pode ser maior que 100%');
        }
      }
    }

    // 4. Validar valor mínimo do pedido (opcional)
    if (dadosCupom.valor_minimo_pedido !== null && dadosCupom.valor_minimo_pedido !== undefined) {
      if (dadosCupom.valor_minimo_pedido < 0) {
        erros.push('Valor mínimo do pedido não pode ser negativo');
      }
    }

    // 5. Validar desconto máximo (opcional, apenas para percentual)
    if (dadosCupom.desconto_maximo !== null && dadosCupom.desconto_maximo !== undefined) {
      if (dadosCupom.tipo_desconto !== 'percentual') {
        erros.push('Desconto máximo só pode ser definido para cupons percentuais');
      }
      if (dadosCupom.desconto_maximo <= 0) {
        erros.push('Desconto máximo deve ser maior que zero');
      }
    }

    // 6. Validar datas
    if (dadosCupom.data_inicio && dadosCupom.data_fim) {
      const dataInicio = new Date(dadosCupom.data_inicio);
      const dataFim = new Date(dadosCupom.data_fim);
      
      if (dataFim <= dataInicio) {
        erros.push('Data de término deve ser posterior à data de início');
      }
    }

    // 7. Validar limites de uso
    if (dadosCupom.limite_uso_total !== null && dadosCupom.limite_uso_total !== undefined) {
      if (dadosCupom.limite_uso_total <= 0) {
        erros.push('Limite de uso total deve ser maior que zero');
      }
    }

    if (dadosCupom.limite_uso_por_cliente !== null && dadosCupom.limite_uso_por_cliente !== undefined) {
      if (dadosCupom.limite_uso_por_cliente <= 0) {
        erros.push('Limite de uso por cliente deve ser maior que zero');
      }
    }

    // 8. Validar status
    if (dadosCupom.status && !['Ativo', 'Inativo', 'Expirado'].includes(dadosCupom.status)) {
      erros.push('Status inválido. Use "Ativo", "Inativo" ou "Expirado"');
    }

    if (erros.length > 0) {
      throw new Error(`Dados inválidos: ${erros.join(', ')}`);
    }

    // Retornar dados limpos e validados
    return this.limparDadosCupom(dadosCupom);
  }

  /**
   * Limpar e formatar dados do cupom
   * @param {Object} dadosCupom - Dados brutos
   * @returns {Object} Dados limpos
   */
  limparDadosCupom(dadosCupom) {
    // ✅ CORREÇÃO: Serializar dias_semana_permitidos para JSON string
    // O PostgreSQL precisa receber uma string JSON para campos do tipo JSON
    let diasSemanaPermitidos = null;
    if (dadosCupom.dias_semana_permitidos && Array.isArray(dadosCupom.dias_semana_permitidos) && dadosCupom.dias_semana_permitidos.length > 0) {
      diasSemanaPermitidos = JSON.stringify(dadosCupom.dias_semana_permitidos);
    }

    const dadosLimpos = {
      codigo: dadosCupom.codigo.trim().toUpperCase(),
      descricao: dadosCupom.descricao?.trim() || null,
      tipo_desconto: dadosCupom.tipo_desconto,
      valor_desconto: parseFloat(dadosCupom.valor_desconto),
      valor_minimo_pedido: dadosCupom.valor_minimo_pedido ? parseFloat(dadosCupom.valor_minimo_pedido) : null,
      desconto_maximo: dadosCupom.desconto_maximo ? parseFloat(dadosCupom.desconto_maximo) : null,
      data_inicio: dadosCupom.data_inicio || null,
      data_fim: dadosCupom.data_fim || null,
      limite_uso_total: dadosCupom.limite_uso_total ? parseInt(dadosCupom.limite_uso_total) : null,
      limite_uso_por_cliente: dadosCupom.limite_uso_por_cliente ? parseInt(dadosCupom.limite_uso_por_cliente) : null,
      status: dadosCupom.status || 'Ativo',
      // ✅ CORREÇÃO: Dias da semana já serializado como JSON string
      dias_semana_permitidos: diasSemanaPermitidos
    };

    return dadosLimpos;
  }

  /**
   * Validar se cupom pode ser usado
   * @param {string} codigo - Código do cupom
   * @param {number|null} clienteId - ID do cliente (pode ser null para novos clientes)
   * @param {number} valorPedido - Valor total do pedido
   * @param {number} unidadeId - ID da unidade onde o agendamento está sendo feito
   * @param {Array<number>} servicoIds - IDs dos serviços selecionados
   * @param {string} dataAgendamento - Data do agendamento (formato ISO ou Date string)
   * @returns {Promise<Object>} Resultado da validação
   */
  async validarUsoCupom(codigo, clienteId, valorPedido, unidadeId, servicoIds = [], dataAgendamento = null) {
    // 1. Buscar cupom ativo e válido
    const cupom = await this.cupomModel.buscarCupomValidoParaUso(codigo);
    
    if (!cupom) {
      return {
        valido: false,
        erro: 'Cupom inválido, expirado ou inativo',
        codigo_erro: 'CUPOM_INVALIDO'
      };
    }

    // 2. ✅ CRÍTICO: Verificar se o cupom pertence ao mesmo usuário/empresa da unidade
    // Buscar usuario_id da unidade
    const unidade = await this.cupomModel.db('unidades')
      .where('id', unidadeId)
      .select('usuario_id')
      .first();
    
    if (!unidade) {
      return {
        valido: false,
        erro: 'Unidade não encontrada',
        codigo_erro: 'UNIDADE_INVALIDA'
      };
    }

    if (cupom.usuario_id !== unidade.usuario_id) {
      return {
        valido: false,
        erro: 'Este cupom não é válido para esta unidade',
        codigo_erro: 'CUPOM_NAO_PERTENCE_UNIDADE'
      };
    }

    // 3. ✅ Verificar se o cupom é válido para a unidade específica (se houver restrição)
    const cupomUnidades = await this.cupomModel.buscarUnidades(cupom.id);
    
    if (cupomUnidades.length > 0 && !cupomUnidades.includes(unidadeId)) {
      return {
        valido: false,
        erro: 'Este cupom não é válido para esta unidade',
        codigo_erro: 'CUPOM_NAO_APLICAVEL_UNIDADE'
      };
    }

    // 4. ✅ Verificar se o cupom é válido para os serviços selecionados (se houver restrição)
    const cupomServicos = await this.cupomModel.buscarServicos(cupom.id);
    
    if (cupomServicos.length > 0) {
      // Se o cupom tem restrição de serviços, pelo menos um serviço selecionado deve estar na lista
      const temServicoValido = servicoIds.some(servicoId => cupomServicos.includes(servicoId));
      
      if (!temServicoValido) {
        return {
          valido: false,
          erro: 'Este cupom não é válido para os serviços selecionados',
          codigo_erro: 'CUPOM_NAO_APLICAVEL_SERVICOS'
        };
      }
    }

    // 5. ✅ NOVO: Verificar se o cupom é válido para o dia da semana do agendamento
    if (cupom.dias_semana_permitidos && Array.isArray(cupom.dias_semana_permitidos) && cupom.dias_semana_permitidos.length > 0) {
      // Se dataAgendamento não foi fornecida, usar a data atual
      const dataParaValidar = dataAgendamento ? new Date(dataAgendamento) : new Date();
      const diaSemana = dataParaValidar.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
      
      if (!cupom.dias_semana_permitidos.includes(diaSemana)) {
        // Mapear número do dia para nome em português
        const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const diasPermitidos = cupom.dias_semana_permitidos.map(d => diasSemana[d]).join(', ');
        
        return {
          valido: false,
          erro: `Este cupom só pode ser usado nos seguintes dias: ${diasPermitidos}`,
          codigo_erro: 'CUPOM_DIA_SEMANA_INVALIDO',
          dias_permitidos: cupom.dias_semana_permitidos
        };
      }
    }

    // 6. Verificar valor mínimo do pedido
    if (cupom.valor_minimo_pedido && valorPedido < cupom.valor_minimo_pedido) {
      return {
        valido: false,
        erro: `Valor mínimo do pedido para este cupom é R$ ${cupom.valor_minimo_pedido.toFixed(2)}`,
        codigo_erro: 'VALOR_MINIMO_NAO_ATINGIDO',
        valor_minimo: cupom.valor_minimo_pedido
      };
    }

    // 7. Verificar limite de uso total
    if (cupom.limite_uso_total && cupom.uso_atual >= cupom.limite_uso_total) {
      return {
        valido: false,
        erro: 'Este cupom atingiu o limite máximo de usos',
        codigo_erro: 'LIMITE_TOTAL_ATINGIDO'
      };
    }

    // 8. Verificar limite de uso por cliente (somente se clienteId for fornecido)
    if (cupom.limite_uso_por_cliente && clienteId) {
      const usosCliente = await this.cupomModel.contarUsosPorCliente(cupom.id, clienteId);
      
      if (usosCliente >= cupom.limite_uso_por_cliente) {
        return {
          valido: false,
          erro: 'Você já atingiu o limite de usos deste cupom',
          codigo_erro: 'LIMITE_CLIENTE_ATINGIDO'
        };
      }
    }

    // 9. Calcular desconto
    const desconto = this.calcularDesconto(cupom, valorPedido);

    return {
      valido: true,
      cupom: {
        id: cupom.id,
        codigo: cupom.codigo,
        descricao: cupom.descricao,
        tipo_desconto: cupom.tipo_desconto,
        valor_desconto: cupom.valor_desconto
      },
      desconto: {
        valor_original: valorPedido,
        valor_desconto: desconto,
        valor_final: valorPedido - desconto,
        percentual_desconto: ((desconto / valorPedido) * 100).toFixed(2)
      }
    };
  }

  /**
   * Calcular valor do desconto
   * @param {Object} cupom - Dados do cupom
   * @param {number} valorPedido - Valor do pedido
   * @returns {number} Valor do desconto
   */
  calcularDesconto(cupom, valorPedido) {
    let desconto = 0;

    if (cupom.tipo_desconto === 'percentual') {
      desconto = (valorPedido * cupom.valor_desconto) / 100;
      
      // Aplicar desconto máximo se definido
      if (cupom.desconto_maximo && desconto > cupom.desconto_maximo) {
        desconto = cupom.desconto_maximo;
      }
    } else if (cupom.tipo_desconto === 'valor_fixo') {
      desconto = cupom.valor_desconto;
      
      // Desconto não pode ser maior que o valor do pedido
      if (desconto > valorPedido) {
        desconto = valorPedido;
      }
    }

    return parseFloat(desconto.toFixed(2));
  }

  /**
   * Aplicar cupom e registrar uso
   * @param {string} codigo - Código do cupom
   * @param {number} clienteId - ID do cliente
   * @param {number} agendamentoId - ID do agendamento
   * @param {number} valorPedido - Valor do pedido
   * @returns {Promise<Object>} Resultado da aplicação
   */
  async aplicarCupom(codigo, clienteId, agendamentoId, valorPedido) {
    // Validar uso do cupom
    const validacao = await this.validarUsoCupom(codigo, clienteId, valorPedido);
    
    if (!validacao.valido) {
      throw new Error(validacao.erro);
    }

    // Registrar uso
    const uso = await this.cupomModel.registrarUso({
      cupom_id: validacao.cupom.id,
      cliente_id: clienteId,
      agendamento_id: agendamentoId,
      valor_original: validacao.desconto.valor_original,
      valor_desconto: validacao.desconto.valor_desconto,
      valor_final: validacao.desconto.valor_final
    });

    return {
      sucesso: true,
      uso_id: uso.id,
      desconto: validacao.desconto,
      mensagem: `Cupom ${codigo} aplicado com sucesso!`
    };
  }

  /**
   * Criar cupom
   * @param {Object} dadosCupom - Dados do cupom
   * @param {number} usuarioId - ID do usuário
   * @returns {Promise<Object>} Cupom criado
   */
  async criarCupom(dadosCupom, usuarioId) {
    // Extrair servico_ids e unidade_ids antes da validação
    const servicoIds = dadosCupom.servico_ids || [];
    const unidadeIds = dadosCupom.unidade_ids || [];
    
    // Validar dados
    const dadosValidados = await this.validarDadosCupom(dadosCupom, usuarioId);
    
    // Adicionar campos de controle
    dadosValidados.usuario_id = usuarioId;
    dadosValidados.uso_atual = 0;
    dadosValidados.created_at = new Date();
    dadosValidados.updated_at = new Date();
    
    // Criar cupom
    const cupom = await this.cupomModel.create(dadosValidados);
    
    // Salvar relacionamentos com serviços
    if (servicoIds.length > 0) {
      await this.cupomModel.salvarServicos(cupom.id, servicoIds);
    }
    
    // Salvar relacionamentos com unidades
    if (unidadeIds.length > 0) {
      await this.cupomModel.salvarUnidades(cupom.id, unidadeIds);
    }
    
    return cupom;
  }

  /**
   * Atualizar cupom
   * @param {number} cupomId - ID do cupom
   * @param {Object} dadosCupom - Dados do cupom
   * @param {number} usuarioId - ID do usuário
   * @returns {Promise<Object>} Cupom atualizado
   */
  async atualizarCupom(cupomId, dadosCupom, usuarioId) {
    // Verificar se cupom existe e pertence ao usuário
    const cupomExistente = await this.cupomModel.findById(cupomId);
    
    if (!cupomExistente) {
      throw new Error('Cupom não encontrado');
    }
    
    if (cupomExistente.usuario_id !== usuarioId) {
      throw new Error('Você não tem permissão para editar este cupom');
    }
    
    // Extrair servico_ids e unidade_ids antes da validação
    const servicoIds = dadosCupom.servico_ids || [];
    const unidadeIds = dadosCupom.unidade_ids || [];
    
    // Validar dados
    const dadosValidados = await this.validarDadosCupom(dadosCupom, usuarioId, cupomId);
    
    // Atualizar cupom
    const cupomAtualizado = await this.cupomModel.update(cupomId, dadosValidados);
    
    // Atualizar relacionamentos com serviços (com verificação de existência da tabela)
    try {
      const tabelaExiste = await this.cupomModel.db.schema.hasTable('cupom_servicos');
      if (tabelaExiste) {
        await this.cupomModel.removerServicos(cupomId);
        if (servicoIds.length > 0) {
          await this.cupomModel.salvarServicos(cupomId, servicoIds);
        }
      }
    } catch (err) {
      logger.error('[CupomService.atualizarCupom] Erro ao atualizar serviços:', err.message);
      // Continuar sem atualizar relacionamentos em caso de erro
    }
    
    // Atualizar relacionamentos com unidades (com verificação de existência da tabela)
    try {
      const tabelaExiste = await this.cupomModel.db.schema.hasTable('cupom_unidades');
      if (tabelaExiste) {
        await this.cupomModel.removerUnidades(cupomId);
        if (unidadeIds.length > 0) {
          await this.cupomModel.salvarUnidades(cupomId, unidadeIds);
        }
      }
    } catch (err) {
      logger.error('[CupomService.atualizarCupom] Erro ao atualizar unidades:', err.message);
      // Continuar sem atualizar relacionamentos em caso de erro
    }
    
    return cupomAtualizado;
  }
}

module.exports = CupomService;

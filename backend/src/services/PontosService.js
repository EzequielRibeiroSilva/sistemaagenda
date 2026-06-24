/**
 * PontosService - Serviço seguro para operações de pontos
 * 
 * MISSÃO CRÍTICA: Proteger contra race conditions no resgate de pontos
 * usando lock pessimista (SELECT FOR UPDATE)
 * 
 * ARQUITETURA DE SEGURANÇA:
 * 1. Lock Pessimista - Bloqueia a linha do cliente durante a transação
 * 2. Validação Atômica - Verifica saldo dentro do lock
 * 3. Atualização Dupla - Materialização (clientes) + Histórico (pontos_historico)
 * 4. Snapshot de Taxa - Registra taxa de conversão no momento do resgate
 * 
 * @author Equipe de Engenharia
 * @version 1.0.0 - Ação 3.2 (Proteção contra Race Conditions)
 */

const { db } = require('../config/knex');
const logger = require('../utils/logger');

class PontosService {
  static TIPOS_PONTOS = {
    CREDITO_VENDAS: 'CREDITO_VENDAS',
    DEBITO_RESGATE: 'DEBITO_RESGATE',
    ESTORNO_VENDAS: 'ESTORNO_VENDAS',
    AJUSTE_MANUAL: 'AJUSTE_MANUAL',
    EXPIRACAO: 'EXPIRACAO'
  };

  static TIPOS_PERMITIDOS = new Set(Object.values(PontosService.TIPOS_PONTOS));

  assertUsuarioAutor({ usuario_id }) {
    if (usuario_id === null || usuario_id === undefined) {
      const err = new Error('A autoria da operação é obrigatória (usuario_id ausente)');
      err.code = 'MISSING_AUTHOR';
      throw err;
    }

    const autorId = Number(usuario_id);
    if (!Number.isFinite(autorId)) {
      const err = new Error('A autoria da operação é obrigatória (usuario_id inválido)');
      err.code = 'INVALID_AUTHOR';
      throw err;
    }

    // Exceção de sistema: permitir identificadores técnicos (ex.: 0 ou -1), mas nunca null/undefined
    if (autorId === 0 || autorId === -1) {
      return autorId;
    }

    if (autorId <= 0) {
      const err = new Error('A autoria da operação é obrigatória (usuario_id inválido)');
      err.code = 'INVALID_AUTHOR';
      throw err;
    }

    return autorId;
  }

  assertTipoPontos({ tipo }) {
    if (!tipo) {
      const err = new Error('tipo de pontos é obrigatório');
      err.code = 'INVALID_POINT_TYPE';
      throw err;
    }

    if (!PontosService.TIPOS_PERMITIDOS.has(tipo)) {
      const err = new Error(`tipo de pontos inválido: ${tipo}`);
      err.code = 'INVALID_POINT_TYPE';
      throw err;
    }

    return tipo;
  }

  /**
   * Resgata pontos do cliente com proteção contra race conditions
   * 
   * GARANTIAS:
   * - Lock pessimista: SELECT FOR UPDATE impede leituras/escritas simultâneas
   * - Validação atômica: Saldo é verificado dentro do lock
   * - Consistência transacional: Débito + Histórico na mesma transação
   * 
   * REGRAS DE NEGÓCIO:
   * - Saldo insuficiente: Lança erro (transação abortada)
   * - Pontos negativos: Não permitido (validação prévia)
   * - Taxa de conversão: Snapshot salvo para auditoria
   * 
   * @param {Object} params - Parâmetros do resgate
   * @param {number} params.cliente_id - ID do cliente
   * @param {number} params.unidade_id - ID da unidade
   * @param {number} params.pontos_a_resgatar - Quantidade de pontos a descontar
   * @param {number} params.agendamento_id - ID do agendamento (opcional)
   * @param {number} params.valor_desconto_real - Valor em reais do desconto gerado
   * @param {number} params.taxa_conversao_snapshot - Taxa reais_por_pontos no momento do resgate
   * @param {string} params.descricao - Descrição da operação (opcional)
   * @param {Object} trx - Transação Knex (obrigatório - injetado pelo caller)
   * 
   * @returns {Promise<Object>} Resultado do resgate
   * @throws {Error} Se saldo insuficiente ou parâmetros inválidos
   * 
   * @example
   * const trx = await db.transaction();
   * try {
   *   const resultado = await pontosService.resgatarPontos({
   *     cliente_id: 123,
   *     unidade_id: 1,
   *     pontos_a_resgatar: 50,
   *     agendamento_id: 456,
   *     valor_desconto_real: 5.00,
   *     taxa_conversao_snapshot: 10.00,
   *     descricao: 'Desconto no agendamento #456'
   *   }, trx);
   *   await trx.commit();
   * } catch (err) {
   *   await trx.rollback();
   *   throw err;
   * }
   */
  async resgatarPontos({
    cliente_id,
    unidade_id,
    usuario_id,
    tipo = PontosService.TIPOS_PONTOS.DEBITO_RESGATE,
    pontos_a_resgatar,
    agendamento_id = null,
    valor_desconto_real,
    taxa_conversao_snapshot,
    descricao = null
  }, trx) {
    // ✅ VALIDAÇÕES PRÉ-LOCK (evitar lock desnecessário)
    if (!cliente_id || !unidade_id) {
      const err = new Error('cliente_id e unidade_id são obrigatórios');
      err.code = 'INVALID_PARAMS';
      throw err;
    }

    const pontosNumber = Number(pontos_a_resgatar);
    if (!Number.isFinite(pontosNumber) || pontosNumber <= 0) {
      const err = new Error('pontos_a_resgatar deve ser um número positivo');
      err.code = 'INVALID_POINTS_AMOUNT';
      throw err;
    }

    const valorReal = parseFloat(valor_desconto_real);
    if (!Number.isFinite(valorReal) || valorReal <= 0) {
      const err = new Error('valor_desconto_real deve ser um número positivo');
      err.code = 'INVALID_DISCOUNT_AMOUNT';
      throw err;
    }

    const taxaSnapshot = parseFloat(taxa_conversao_snapshot);
    if (!Number.isFinite(taxaSnapshot) || taxaSnapshot <= 0) {
      const err = new Error('taxa_conversao_snapshot deve ser um número positivo');
      err.code = 'INVALID_TAX_SNAPSHOT';
      throw err;
    }

    if (!trx) {
      const err = new Error('Transação (trx) é obrigatória para garantir atomicidade');
      err.code = 'MISSING_TRANSACTION';
      throw err;
    }

    const autorId = this.assertUsuarioAutor({ usuario_id });
    const tipoFinal = this.assertTipoPontos({ tipo });

    logger.log(`🔒 [PontosService] Iniciando resgate com LOCK PESSIMISTA:`, {
      cliente_id,
      unidade_id,
      pontos_a_resgatar: pontosNumber,
      valor_desconto_real: valorReal,
      agendamento_id
    });

    try {
      // 🔐 ETAPA 1: ADQUIRIR LOCK PESSIMISTA (O Cofre)
      // SELECT FOR UPDATE bloqueia a linha do cliente até o commit/rollback da transação.
      // Nenhuma outra requisição pode ler ou modificar o saldo enquanto o lock estiver ativo.
      logger.info('🔒 [PontosService] Tentando adquirir lock do cliente', {
        cliente_id,
        unidade_id
      });

      const cliente = await trx('clientes')
        .select('id', 'saldo_pontos', 'primeiro_nome', 'ultimo_nome')
        .where('id', cliente_id)
        .where('unidade_id', unidade_id)
        .forUpdate()
        .first();

      if (!cliente) {
        const err = new Error('Cliente não encontrado na unidade especificada');
        err.code = 'CLIENT_NOT_FOUND';
        logger.error('❌ [PontosService] Cliente não encontrado', {
          cliente_id,
          unidade_id
        });
        throw err;
      }

      logger.log(`🔍 [PontosService] LOCK ADQUIRIDO. Saldo atual: ${cliente.saldo_pontos} pts`, {
        cliente_id: cliente.id,
        cliente_nome: `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim(),
        saldo_atual: cliente.saldo_pontos,
        tentativa_resgate: pontosNumber
      });

      // ✅ ETAPA 2: VALIDAÇÃO ATÔMICA (Dentro do Lock)
      // Esta verificação é 100% segura porque o lock impede alterações concorrentes
      const saldoAtual = Number(cliente.saldo_pontos) || 0;
      if (saldoAtual < pontosNumber) {
        logger.warn(`⚠️  [PontosService] SALDO INSUFICIENTE detectado dentro do lock:`, {
          cliente_id,
          saldo_disponivel: saldoAtual,
          pontos_necessarios: pontosNumber,
          deficit: pontosNumber - saldoAtual
        });

        const err = new Error(`Saldo insuficiente. Disponível: ${saldoAtual} pts, Necessário: ${pontosNumber} pts`);
        err.code = 'INSUFFICIENT_BALANCE';
        err.details = {
          saldo_disponivel: saldoAtual,
          pontos_necessarios: pontosNumber,
          deficit: pontosNumber - saldoAtual
        };
        throw err;
      }

      // ✅ ETAPA 3: ATUALIZAÇÃO ATÔMICA (Débito Materializado)
      // Decrementar o saldo_pontos na tabela clientes
      logger.info('💾 [PontosService] Executando débito de pontos', {
        cliente_id,
        unidade_id,
        saldo_atual: saldoAtual,
        pontos_a_debitar: pontosNumber
      });

      const rowsUpdated = await trx('clientes')
        .where('id', cliente_id)
        .where('unidade_id', unidade_id)
        .decrement('saldo_pontos', pontosNumber);

      logger.info('✅ [PontosService] Query de débito executada', {
        rows_updated: rowsUpdated,
        esperado: 1
      });

      if (rowsUpdated !== 1) {
        const err = new Error('Falha ao atualizar saldo do cliente (concorrência não esperada)');
        err.code = 'UPDATE_FAILED';
        throw err;
      }

      const novoSaldo = saldoAtual - pontosNumber;

      logger.log(`✅ [PontosService] Saldo atualizado:`, {
        cliente_id,
        saldo_anterior: saldoAtual,
        pontos_debitados: pontosNumber,
        novo_saldo: novoSaldo
      });

      // ✅ ETAPA 4: REGISTRO NO HISTÓRICO (Auditoria)
      // Inserir movimentação DEBITO na tabela pontos_historico
      const descricaoFinal = descricao || (agendamento_id 
        ? `Pontos resgatados no agendamento #${agendamento_id}` 
        : 'Resgate de pontos');

      const [historicoRow] = await trx('pontos_historico')
        .insert({
          cliente_id: cliente_id,
          unidade_id: unidade_id,
          usuario_id: autorId,
          agendamento_id: agendamento_id || null,
          tipo: tipoFinal,
          pontos: pontosNumber,
          valor_real: valorReal,
          descricao: descricaoFinal,
          taxa_conversao_snapshot: taxaSnapshot,
          data_validade: null, // Débitos não têm validade
          expirado: false,
          created_at: new Date()
        })
        .returning('id');

      logger.log(`📝 [PontosService] Histórico registrado:`, {
        historico_id: historicoRow?.id || historicoRow,
        tipo: tipoFinal,
        pontos: pontosNumber,
        valor_real: valorReal,
        taxa_conversao_snapshot: taxaSnapshot
      });

      // ✅ SUCESSO: Retornar resultado completo
      return {
        success: true,
        cliente_id: cliente_id,
        saldo_anterior: saldoAtual,
        pontos_resgatados: pontosNumber,
        novo_saldo: novoSaldo,
        valor_desconto_real: valorReal,
        historico_id: historicoRow?.id || historicoRow,
        message: `${pontosNumber} pontos resgatados com sucesso. Novo saldo: ${novoSaldo} pts`
      };

    } catch (error) {
      // 🔥 ERRO: Propagar para o caller fazer rollback
      logger.error(`❌ [PontosService] Erro no resgate de pontos:`, {
        error: error.message,
        code: error.code,
        cliente_id,
        pontos_a_resgatar: pontosNumber,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });

      // Re-lançar erro para o caller decidir (rollback já será feito externamente)
      throw error;
    }
  }

  /**
   * Credita pontos ao cliente (Cashback)
   * 
   * GARANTIAS:
   * - Idempotência: Verificação externa (caller deve verificar antes de chamar)
   * - Atomicidade: Opera dentro da transação fornecida
   * - Auditoria: Registra histórico de crédito
   * 
   * REGRAS DE NEGÓCIO:
   * - Pontos negativos: Não permitido (validação prévia)
   * - Taxa de conversão: Snapshot salvo para auditoria
   * - Data de validade: Obrigatória para controle de expiração
   * 
   * @param {Object} params - Parâmetros do crédito
   * @param {number} params.cliente_id - ID do cliente
   * @param {number} params.unidade_id - ID da unidade
   * @param {number} params.agendamento_id - ID do agendamento (opcional)
   * @param {number} params.pontos - Quantidade de pontos a creditar
   * @param {number} params.valor_real - Valor em reais que gerou os pontos
   * @param {string} params.descricao - Descrição da operação
   * @param {string} params.data_validade - Data de validade (YYYY-MM-DD)
   * @param {number} params.taxa_conversao_snapshot - Taxa reais_por_pontos no momento
   * @param {Object} trx - Transação Knex (obrigatório)
   * 
   * @returns {Promise<Object>} Resultado do crédito
   * @throws {Error} Se parâmetros inválidos
   * 
   * @example
   * await pontosService.creditarPontos({
   *   cliente_id: 123,
   *   unidade_id: 1,
   *   agendamento_id: 456,
   *   pontos: 50,
   *   valor_real: 50.00,
   *   descricao: 'Pontos ganhos no agendamento #456',
   *   data_validade: '2025-12-31',
   *   taxa_conversao_snapshot: 10.00
   * }, trx);
   */
  async creditarPontos({
    cliente_id,
    unidade_id,
    usuario_id,
    tipo = PontosService.TIPOS_PONTOS.CREDITO_VENDAS,
    agendamento_id = null,
    pontos,
    valor_real,
    descricao,
    data_validade,
    taxa_conversao_snapshot
  }, trx) {
    // ✅ VALIDAÇÕES PRÉ-CRÉDITO
    if (!cliente_id || !unidade_id) {
      const err = new Error('cliente_id e unidade_id são obrigatórios');
      err.code = 'INVALID_PARAMS';
      throw err;
    }

    const pontosInt = Number(pontos);
    if (!Number.isFinite(pontosInt) || pontosInt <= 0) {
      const err = new Error('pontos deve ser um número positivo');
      err.code = 'INVALID_POINTS_AMOUNT';
      throw err;
    }

    const valorReal = parseFloat(valor_real);
    if (!Number.isFinite(valorReal) || valorReal < 0) {
      const err = new Error('valor_real deve ser um número não-negativo');
      err.code = 'INVALID_VALUE_AMOUNT';
      throw err;
    }

    const taxaSnapshot = parseFloat(taxa_conversao_snapshot);
    if (!Number.isFinite(taxaSnapshot) || taxaSnapshot <= 0) {
      const err = new Error('taxa_conversao_snapshot deve ser um número positivo');
      err.code = 'INVALID_TAX_SNAPSHOT';
      throw err;
    }

    if (!trx) {
      const err = new Error('Transação (trx) é obrigatória para garantir atomicidade');
      err.code = 'MISSING_TRANSACTION';
      throw err;
    }

    const autorId = this.assertUsuarioAutor({ usuario_id });
    const tipoFinal = this.assertTipoPontos({ tipo });

    logger.log(`💰 [PontosService] Iniciando crédito de pontos:`, {
      cliente_id,
      unidade_id,
      pontos: pontosInt,
      valor_real: valorReal,
      agendamento_id
    });

    try {
      // ✅ ETAPA 1: REGISTRO NO HISTÓRICO (Auditoria)
      const [historicoRow] = await trx('pontos_historico')
        .insert({
          cliente_id: cliente_id,
          unidade_id: unidade_id,
          usuario_id: autorId,
          agendamento_id: agendamento_id || null,
          tipo: tipoFinal,
          pontos: pontosInt,
          valor_real: valorReal,
          descricao: descricao || 'Crédito de pontos',
          taxa_conversao_snapshot: taxaSnapshot,
          data_validade: data_validade,
          expirado: false,
          created_at: new Date()
        })
        .returning('id');

      logger.log(`📝 [PontosService] Histórico de crédito registrado:`, {
        historico_id: historicoRow?.id || historicoRow,
        tipo: tipoFinal,
        pontos: pontosInt,
        valor_real: valorReal
      });

      // ✅ ETAPA 2: ATUALIZAÇÃO DO SALDO MATERIALIZADO
      const rowsUpdated = await trx('clientes')
        .where('id', cliente_id)
        .where('unidade_id', unidade_id)
        .increment('saldo_pontos', pontosInt);

      if (rowsUpdated !== 1) {
        const err = new Error('Falha ao atualizar saldo do cliente');
        err.code = 'UPDATE_FAILED';
        throw err;
      }

      logger.log(`✅ [PontosService] Saldo atualizado:`, {
        cliente_id,
        pontos_creditados: pontosInt
      });

      // ✅ SUCESSO
      return {
        success: true,
        cliente_id: cliente_id,
        pontos_creditados: pontosInt,
        historico_id: historicoRow?.id || historicoRow,
        message: `${pontosInt} pontos creditados com sucesso`
      };

    } catch (error) {
      logger.error(`❌ [PontosService] Erro no crédito de pontos:`, {
        error: error.message,
        code: error.code,
        cliente_id,
        pontos: pontosInt,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });

      throw error;
    }
  }

  /**
   * Calcula quanto desconto em reais o cliente pode obter com seus pontos
   * 
   * @param {number} saldo_pontos - Saldo atual de pontos do cliente
   * @param {number} reais_por_pontos - Taxa de conversão (ex: 10.00 = 10 pts = R$ 1,00)
   * @returns {number} Valor em reais do desconto disponível
   * 
   * @example
   * const desconto = pontosService.calcularDescontoDisponivel(50, 10.00);
   * // resultado: 5.00 (50 pontos ÷ 10 = R$ 5,00)
   */
  calcularDescontoDisponivel(saldo_pontos, reais_por_pontos) {
    const saldo = Number(saldo_pontos) || 0;
    const taxa = parseFloat(reais_por_pontos) || 10.00;
    
    if (saldo <= 0 || taxa <= 0) {
      return 0;
    }

    const descontoReal = saldo / taxa;
    return Number(descontoReal.toFixed(2));
  }

  /**
   * Calcula quantos pontos são necessários para gerar um desconto específico
   * 
   * @param {number} valor_desconto_desejado - Valor em reais do desconto desejado
   * @param {number} reais_por_pontos - Taxa de conversão (ex: 10.00 = 10 pts = R$ 1,00)
   * @returns {number} Quantidade de pontos necessários
   * 
   * @example
   * const pontos = pontosService.calcularPontosNecessarios(5.00, 10.00);
   * // resultado: 50 (R$ 5,00 × 10 = 50 pontos)
   */
  calcularPontosNecessarios(valor_desconto_desejado, reais_por_pontos) {
    const valorDesejado = parseFloat(valor_desconto_desejado) || 0;
    const taxa = parseFloat(reais_por_pontos) || 10.00;
    
    if (valorDesejado <= 0 || taxa <= 0) {
      return 0;
    }

    return Number(valorDesejado * taxa);
  }

  async estornarPontos({
    cliente_id,
    unidade_id,
    usuario_id,
    tipo = PontosService.TIPOS_PONTOS.ESTORNO_VENDAS,
    agendamento_id = null,
    pontos,
    valor_real = null,
    taxa_conversao_snapshot = null,
    descricao,
    observacao = null
  }, trx) {
    if (!cliente_id || !unidade_id) {
      const err = new Error('cliente_id e unidade_id são obrigatórios');
      err.code = 'INVALID_PARAMS';
      throw err;
    }

    const pontosInt = Number(pontos);
    if (!Number.isFinite(pontosInt) || pontosInt <= 0) {
      const err = new Error('pontos deve ser um número positivo');
      err.code = 'INVALID_POINTS_AMOUNT';
      throw err;
    }

    if (!trx) {
      const err = new Error('Transação (trx) é obrigatória para garantir atomicidade');
      err.code = 'MISSING_TRANSACTION';
      throw err;
    }

    const autorId = this.assertUsuarioAutor({ usuario_id });
    const tipoFinal = this.assertTipoPontos({ tipo });

    const valorReal = valor_real == null ? null : parseFloat(valor_real);
    const taxaSnapshot = taxa_conversao_snapshot == null ? null : parseFloat(taxa_conversao_snapshot);

    const descricaoBase = descricao || (agendamento_id
      ? `Estorno automático referente ao cancelamento da venda/agendamento #${agendamento_id}`
      : 'Estorno automático de pontos');

    const descricaoFinal = observacao ? `${descricaoBase} | ${String(observacao)}` : descricaoBase;

    const [historicoRow] = await trx('pontos_historico')
      .insert({
        cliente_id,
        unidade_id,
        usuario_id: autorId,
        agendamento_id: agendamento_id || null,
        tipo: tipoFinal,
        pontos: pontosInt,
        valor_real: Number.isFinite(valorReal) ? valorReal : null,
        descricao: descricaoFinal,
        data_validade: null,
        expirado: false,
        taxa_conversao_snapshot: Number.isFinite(taxaSnapshot) ? taxaSnapshot : null,
        created_at: trx.fn.now()
      })
      .returning('id');

    await trx('clientes')
      .where('id', cliente_id)
      .where('unidade_id', unidade_id)
      .decrement('saldo_pontos', pontosInt);

    return {
      success: true,
      cliente_id,
      unidade_id,
      agendamento_id: agendamento_id || null,
      pontos_estornados: pontosInt,
      historico_id: historicoRow?.id || historicoRow
    };
  }

  async debitarPontos({
    cliente_id,
    unidade_id,
    usuario_id,
    pontos,
    agendamento_id = null,
    valor_desconto_real,
    taxa_conversao_snapshot,
    descricao = null
  }, trx) {
    return this.resgatarPontos({
      cliente_id,
      unidade_id,
      usuario_id,
      pontos_a_resgatar: pontos,
      agendamento_id,
      valor_desconto_real,
      taxa_conversao_snapshot,
      descricao
    }, trx);
  }

  /**
   * Consulta o saldo de pontos disponível para um cliente
   * (Leitura simples - sem lock)
   * 
   * @param {number} cliente_id - ID do cliente
   * @param {number} unidade_id - ID da unidade
   * @param {Object} trx - Transação Knex (opcional)
   * @returns {Promise<number>} Saldo de pontos disponível
   */
  async consultarSaldo(cliente_id, unidade_id, trx = null) {
    const query = (trx || db)('clientes')
      .select('saldo_pontos')
      .where('id', cliente_id)
      .where('unidade_id', unidade_id)
      .first();

    const cliente = await query;

    if (!cliente) {
      return 0;
    }

    return Number(cliente.saldo_pontos) || 0;
  }
}

module.exports = PontosService;

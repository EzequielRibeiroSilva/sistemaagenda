const logger = require('../utils/logger');

class InventoryService {
  constructor(db) {
    this.db = db;
  }

  round3(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 1000) / 1000;
  }

  isIntegerQuantity(qty) {
    return Number.isFinite(qty) && Number.isInteger(qty);
  }

  inferBucket({ tipo, origem_id, motivo, produtoTipoItem }) {
    // Regras da Muralha (transição):
    // - SAIDA sempre afeta saldo_venda
    // - CONSUMO sempre afeta saldo_consumo
    // - ESTORNO: inferir pela origem/motivo (venda vs agendamento) e fallback para tipo_item
    if (tipo === 'SAIDA') return 'VENDA';
    if (tipo === 'CONSUMO') return 'CONSUMO';

    const origemStr = origem_id != null ? String(origem_id) : '';
    const motivoStr = motivo != null ? String(motivo) : '';

    const isAgendamentoOrigem = origemStr && /^\d+$/.test(origemStr);
    const isVendaOrigem = origemStr && (origemStr.startsWith('VENDA:') || origemStr.startsWith('ESTORNO:VENDA:'));
    const isVendaMotivo = motivoStr.toUpperCase().includes('PDV') || motivoStr.toUpperCase().includes('VENDA');

    if (tipo === 'ESTORNO') {
      if (isAgendamentoOrigem) return 'CONSUMO';
      if (isVendaOrigem || isVendaMotivo) return 'VENDA';
    }

    // ENTRADA / AJUSTE: fallback por classificação do produto
    if (String(produtoTipoItem || '').toUpperCase() === 'CONSUMO') return 'CONSUMO';
    return 'VENDA';
  }

  // Ledger é sagrado: este service é append-only para estoque_movimentacoes.
  // Não implemente métodos de update/delete para o ledger.

  /**
   * movimentarEstoque
   * Regra: SEMPRE transacional.
   *
   * @param {Object} params
   * @param {number} params.usuario_id
   * @param {number} params.unidade_id
   * @param {number} params.produto_id
   * @param {'ENTRADA'|'SAIDA'|'AJUSTE'|'CONSUMO'|'ESTORNO'} params.tipo
   * @param {number|string} params.quantidade
   * @param {string} [params.motivo]
   * @param {string} [params.origem_id] UUID
   * @param {number|null} [params.created_by]
   * @param {any} [params.trx] transação externa opcional (knex transaction)
   * @returns {Promise<{ movimentacao: any, saldo_atual: number }>} 
   */
  async movimentarEstoque(params) {
    const {
      usuario_id,
      unidade_id,
      produto_id,
      tipo,
      quantidade,
      motivo,
      origem_id,
      destino,
      preco_custo_entrada,
      created_by,
      trx: trxExternal
    } = params;

    if (!usuario_id || !unidade_id || !produto_id) {
      const err = new Error('Parâmetros obrigatórios ausentes');
      err.code = 'INVALID_PARAMS';
      throw err;
    }

    if (!['ENTRADA', 'SAIDA', 'AJUSTE', 'CONSUMO', 'ESTORNO', 'CONVERSAO_INTERNA'].includes(tipo)) {
      const err = new Error('Tipo de movimentação inválido');
      err.code = 'INVALID_TIPO';
      throw err;
    }

    const qtyRaw = Number(quantidade);
    if (Number.isNaN(qtyRaw) || qtyRaw <= 0) {
      const err = new Error('Quantidade inválida');
      err.code = 'INVALID_QUANTIDADE';
      throw err;
    }

    // Muralha: itens de venda e SAIDA não permitem fracionamento
    // Observação: a validação do tipo_item depende do produto e será feita após o fetch.

    // Para CONVERSAO_INTERNA, não existe delta direto aqui (é um evento de auditoria).
    const deltaLegacy = (tipo === 'ENTRADA' || tipo === 'ESTORNO') ? qtyRaw : -qtyRaw;
    const isDebitLegacy = deltaLegacy < 0;

    const run = async (trx) => {
      let qty = qtyRaw;
      // 1) Segurança multi-tenant: produto precisa pertencer ao usuario_id
      const produto = await trx('produtos')
        .where({ id: produto_id, usuario_id })
        .whereNull('deleted_at')
        .select('id', 'tipo_item', 'uom_consumo', 'fator_conversao', 'preco_custo_medio')
        .first();

      if (!produto) {
        const err = new Error('Produto não encontrado ou acesso negado');
        err.code = 'PRODUTO_NOT_FOUND';
        throw err;
      }

      const produtoTipoItem = produto?.tipo_item ? String(produto.tipo_item).toUpperCase() : 'VENDA';
      let bucket = this.inferBucket({ tipo, origem_id, motivo, produtoTipoItem });

      // Direcionamento explícito de ENTRADA (Sprint 3 - Fase 3)
      if (tipo === 'ENTRADA' && destino) {
        const d = String(destino).toUpperCase();
        if (d === 'VENDA') bucket = 'VENDA';
        if (d === 'CONSUMO') bucket = 'CONSUMO';
      }

      // Regra de negócio: o usuário sempre digita ENTRADA em unidades de compra.
      // Se o destino for CONSUMO e o item for CONSUMO/AMBOS, converter a quantidade para a unidade de consumo.
      if (tipo === 'ENTRADA' && bucket === 'CONSUMO') {
        const tipoItem = String(produtoTipoItem || '').toUpperCase();
        const isConsumoOuAmbos = tipoItem === 'CONSUMO' || tipoItem === 'AMBOS';
        if (isConsumoOuAmbos) {
          const fator = Number(produto?.fator_conversao) || 0;
          if (Number.isFinite(fator) && fator > 0) {
            qty = this.round3(qtyRaw * fator);
          }
        }
      }

      // Atomicidade: impedir fracionamento para VENDA e qualquer SAIDA
      if (tipo === 'SAIDA' || produtoTipoItem === 'VENDA') {
        if (!this.isIntegerQuantity(qty)) {
          const err = new Error('Itens de venda não permitem fracionamento.');
          err.code = 'INVALID_UN_FRACTION';
          throw err;
        }
      }

      // 2) Segurança multi-tenant: unidade precisa pertencer ao usuario_id
      const unidade = await trx('unidades')
        .where({ id: unidade_id, usuario_id })
        .select('id')
        .first();

      if (!unidade) {
        const err = new Error('Unidade não encontrada ou acesso negado');
        err.code = 'UNIDADE_NOT_FOUND';
        throw err;
      }

      // 3) Garantir existência do snapshot (idempotente)
      await trx('estoque_unidades')
        .insert({
          produto_id,
          unidade_id,
          saldo_atual: 0,
          estoque_minimo: null,
          estoque_maximo: null
        })
        .onConflict(['produto_id', 'unidade_id'])
        .ignore();

      // 4) Atualizar snapshot de saldo (com lock otimista via update)
      // Observação: Para alta concorrência, ideal é SELECT ... FOR UPDATE, mas Knex tem suporte via .forUpdate().
      const snapshotBefore = await trx('estoque_unidades')
        .where({ produto_id, unidade_id })
        .forUpdate()
        .select('saldo_atual', 'saldo_venda', 'saldo_consumo')
        .first();

      const saldoAntes = snapshotBefore ? Number(snapshotBefore.saldo_atual) : 0;
      const saldoVendaAntes = snapshotBefore ? Number(snapshotBefore.saldo_venda) : 0;
      const saldoConsumoAntes = snapshotBefore ? Number(snapshotBefore.saldo_consumo) : 0;

      // CMP (Custo Médio Ponderado) - aplicar APENAS em ENTRADA quando vier preco_custo_entrada.
      // Observação: preco_custo_medio em produtos é tratado como:
      // - VENDA: custo por unidade (unidade_medida)
      // - CONSUMO/AMBOS: custo por unidade de consumo (uom_consumo), derivado por fator_conversao
      if (tipo === 'ENTRADA') {
        try {
          // 1. Blindagem estrita de tipos (Garantir que tudo vire número real)
          const currentCost = Number(produto?.preco_custo_medio) || 0;
          const conversionFactor = Number(produto?.fator_conversao) || 1;
          const inputPrice = Number(preco_custo_entrada) || 0;
          const inputQty = Number(qtyRaw) || 0;

          const currentSaleStock = Number(snapshotBefore?.saldo_venda) || 0;
          const currentConsumpStock = Number(snapshotBefore?.saldo_consumo) || 0;

          if (inputPrice <= 0 || inputQty <= 0) {
            // Entrada sem valores válidos não recalcula CMP.
            // A movimentação de estoque (quantidade) continua funcionando.
          } else {
            const tipoItem = String(produto?.tipo_item || produtoTipoItem || 'VENDA').toUpperCase();
            const isConsumoOuAmbos = tipoItem === 'CONSUMO' || tipoItem === 'AMBOS';

            // 2. Recalcule a base qty e o custo unitário da entrada blindando os valores
            let entradaBaseQty = inputQty;
            let entradaBaseUnitCost = inputPrice;

            const destinoFinal = destino ? String(destino).toUpperCase() : bucket;

            if (destinoFinal === 'VENDA' && isConsumoOuAmbos) {
              entradaBaseQty = inputQty * conversionFactor;
              entradaBaseUnitCost = conversionFactor > 0 ? (inputPrice / conversionFactor) : inputPrice;
            } else if (destinoFinal === 'CONSUMO') {
              // Entrada em Bancada: usuário informa unidades de compra (frasco/caixa).
              // O sistema converte para base de consumo (ml/g) e custo unitário técnico.
              if (isConsumoOuAmbos) {
                entradaBaseQty = inputQty * conversionFactor;
                entradaBaseUnitCost = conversionFactor > 0 ? (inputPrice / conversionFactor) : inputPrice;
              } else {
                entradaBaseQty = inputQty;
                entradaBaseUnitCost = inputPrice;
              }
            }

            const saldoBaseAntes = isConsumoOuAmbos
              ? (currentConsumpStock + (currentSaleStock * conversionFactor))
              : currentSaleStock;

            const totalEnteringQty = entradaBaseQty;

            // 3. Cálculo final blindado contra NaN
            let novoCustoFinal = currentCost;
            if (saldoBaseAntes + totalEnteringQty > 0) {
              const valorAtual = saldoBaseAntes * currentCost;
              const valorEntrada = totalEnteringQty * entradaBaseUnitCost;
              novoCustoFinal = (valorAtual + valorEntrada) / (saldoBaseAntes + totalEnteringQty);
            } else {
              novoCustoFinal = entradaBaseUnitCost;
            }

            // 4. Wrap de segurança para o UPDATE
            if (Number.isNaN(novoCustoFinal) || !Number.isFinite(novoCustoFinal)) {
              throw new Error('O cálculo do Custo Médio Ponderado gerou um valor inválido (NaN).');
            }

            const novoCustoFinalRounded = Number(novoCustoFinal.toFixed(6));

            // 🛡️ Guard Clause: Proteção Financeira Elite
            // Impedir que produtos fiquem com custo zero ou negativo
            if (!Number.isFinite(novoCustoFinalRounded) || novoCustoFinalRounded <= 0) {
              const err = new Error('Custo Médio Ponderado inválido: o cálculo resultou em valor zero ou negativo.');
              err.code = 'INVALID_CMP';
              err.statusCode = 422;
              throw err;
            }

            await trx('produtos')
              .where({ id: produto_id, usuario_id })
              .update({
                preco_custo_medio: novoCustoFinalRounded,
                updated_at: new Date()
              });
          }
        } catch (error) {
          console.error('Erro detalhado no estoque:', error);
          throw error;
        }
      }

      // Bifurcação: definir delta por bucket
      const signedQty = (tipo === 'ENTRADA' || tipo === 'ESTORNO') ? qty : -qty;
      const isDebit = signedQty < 0;

      // saldo_atual legado precisa continuar sendo atualizado (compatibilidade com o frontend atual).
      // Nesta fase, definimos saldo_atual = saldo_venda + saldo_consumo (numérico),
      // evitando que a constraint de saldo_atual bloqueie fluxos novos.
      let saldoDepoisLegacy = saldoAntes;

      let saldoVendaDepois = saldoVendaAntes;
      let saldoConsumoDepois = saldoConsumoAntes;

      if (tipo !== 'CONVERSAO_INTERNA') {
        if (bucket === 'VENDA') {
          saldoVendaDepois = saldoVendaAntes + (isDebit ? -Math.abs(signedQty) : Math.abs(signedQty));
        } else {
          saldoConsumoDepois = this.round3(saldoConsumoAntes + signedQty);
        }
      }

      saldoDepoisLegacy = this.round3(saldoVendaDepois + saldoConsumoDepois);

      // Gatilho de conversão (abertura do pote) - apenas no fluxo CONSUMO
      if (tipo === 'CONSUMO') {
        const consumoNecessario = qty;
        let saldoConsumoTemp = saldoConsumoAntes;
        let saldoVendaTemp = saldoVendaAntes;
        let saldoLegacyTemp = saldoAntes;

        const fator = produto?.fator_conversao != null ? Number(produto.fator_conversao) : null;

        if (!Number.isFinite(consumoNecessario) || consumoNecessario <= 0) {
          const err = new Error('Quantidade inválida');
          err.code = 'INVALID_QUANTIDADE';
          throw err;
        }

        if (saldoConsumoTemp < consumoNecessario) {
          if (!Number.isFinite(fator) || fator <= 0) {
            const err = new Error('Produto não configurado para consumo');
            err.code = 'PRODUTO_NOT_CONFIGURED_FOR_CONSUMPTION';
            throw err;
          }

          const deficit = consumoNecessario - saldoConsumoTemp;
          const potesNecessarios = Math.ceil(deficit / fator);

          if (saldoVendaTemp < potesNecessarios) {
            const err = new Error('Saldo insuficiente para movimentação de estoque');
            err.code = 'SALDO_INSUFICIENTE';
            err.produto_id = produto_id;
            err.unidade_id = unidade_id;
            err.quantidade = consumoNecessario;
            throw err;
          }

          for (let i = 1; i <= potesNecessarios; i++) {
            const convOrigemId = `CONVERSAO:${origem_id != null ? String(origem_id) : 'NO_ORIGEM'}:${produto_id}:${unidade_id}:${i}`;

            const convJaExiste = await trx('estoque_movimentacoes')
              .where({
                usuario_id,
                unidade_id,
                produto_id,
                tipo: 'CONVERSAO_INTERNA',
                origem_id: convOrigemId
              })
              .select('id')
              .first();

            if (convJaExiste?.id) {
              continue;
            }

            // Aplicar conversão no snapshot (atômico dentro desta trx):
            // -1 pote (saldo_venda) e +fator em saldo_consumo
            const saldoVendaNovo = saldoVendaTemp - 1;
            const saldoConsumoNovo = this.round3(saldoConsumoTemp + fator);
            const saldoLegacyNovo = this.round3(saldoVendaNovo + saldoConsumoNovo);

            const updatedConv = await trx('estoque_unidades')
              .where({ produto_id, unidade_id })
              .andWhere('saldo_venda', '>=', 1)
              .update({
                saldo_venda: saldoVendaNovo,
                saldo_consumo: saldoConsumoNovo,
                saldo_atual: saldoLegacyNovo
              });

            if (!updatedConv) {
              const err = new Error('Saldo insuficiente para movimentação de estoque');
              err.code = 'SALDO_INSUFICIENTE';
              err.produto_id = produto_id;
              err.unidade_id = unidade_id;
              err.quantidade = 1;
              throw err;
            }

            await trx('estoque_movimentacoes')
              .insert({
                usuario_id,
                unidade_id,
                produto_id,
                tipo: 'CONVERSAO_INTERNA',
                quantidade: 1,
                motivo: `CONVERSAO INTERNA -1 venda +${Number(fator).toFixed(3)} consumo` ,
                origem_id: convOrigemId,
                created_by: created_by || null,
                created_at: new Date()
              });

            saldoVendaTemp = saldoVendaNovo;
            saldoConsumoTemp = saldoConsumoNovo;
            saldoLegacyTemp = saldoLegacyNovo;
          }

          // Recarregar snapshot após conversões para seguir com o débito de consumo corretamente
          const snapshotAfterConv = await trx('estoque_unidades')
            .where({ produto_id, unidade_id })
            .forUpdate()
            .select('saldo_atual', 'saldo_venda', 'saldo_consumo')
            .first();

          const legacyNow = snapshotAfterConv ? Number(snapshotAfterConv.saldo_atual) : saldoAntes;
          const vendaNow = snapshotAfterConv ? Number(snapshotAfterConv.saldo_venda) : saldoVendaAntes;
          const consumoNow = snapshotAfterConv ? Number(snapshotAfterConv.saldo_consumo) : saldoConsumoAntes;

          // Recalcular saldos finais do consumo
          saldoVendaDepois = vendaNow;
          saldoConsumoDepois = this.round3(consumoNow - consumoNecessario);
          saldoDepoisLegacy = this.round3(saldoVendaDepois + saldoConsumoDepois);
        }
      }

      if (tipo !== 'CONVERSAO_INTERNA') {
        if (isDebit) {
          const qtyAbs = Math.abs(signedQty);

          const updatePayload = {
            saldo_atual: saldoDepoisLegacy
          };

          if (bucket === 'VENDA') {
            updatePayload.saldo_venda = saldoVendaDepois;
          } else {
            updatePayload.saldo_consumo = saldoConsumoDepois;
          }

          let q = trx('estoque_unidades')
            .where({ produto_id, unidade_id });

          if (bucket === 'VENDA') {
            q = q.andWhere('saldo_venda', '>=', qtyAbs);
          } else {
            q = q.andWhere('saldo_consumo', '>=', qtyAbs);
          }

          const updated = await q.update(updatePayload);

          if (!updated) {
            const err = new Error('Saldo insuficiente para movimentação de estoque');
            err.code = 'SALDO_INSUFICIENTE';
            err.produto_id = produto_id;
            err.unidade_id = unidade_id;
            err.quantidade = qtyAbs;
            throw err;
          }
        } else {
          const updatePayload = {
            saldo_atual: saldoDepoisLegacy
          };

          if (bucket === 'VENDA') {
            updatePayload.saldo_venda = saldoVendaDepois;
          } else {
            updatePayload.saldo_consumo = saldoConsumoDepois;
          }

          await trx('estoque_unidades')
            .where({ produto_id, unidade_id })
            .update(updatePayload);
        }
      }

      // 5) Registrar no ledger (APPEND-ONLY - Nível Bancário)
      // ✅ IDEMPOTÊNCIA: Verificar se movimentação já existe
      const movExistente = await trx('estoque_movimentacoes')
        .where({
          usuario_id,
          unidade_id,
          produto_id,
          tipo,
          origem_id: origem_id || null
        })
        .select('id', 'quantidade')
        .first();

      let movimentacao = null;

      if (movExistente?.id) {
        const qtyExistente = Number(movExistente.quantidade);
        const diffQty = this.round3(qty - qtyExistente);
        
        if (Math.abs(diffQty) > 0.001) {
          // 🏦 APPEND-ONLY: Em vez de UPDATE, criar movimentação de AJUSTE compensatória
          logger.info('🔄 [InventoryService] Movimentação já existe com quantidade diferente - criando AJUSTE compensatório', {
            movimentacao_id: movExistente.id,
            produto_id,
            tipo_original: tipo,
            origem_id,
            quantidade_anterior: qtyExistente,
            quantidade_nova: qty,
            diferenca: diffQty
          });

          // Idempotência do AJUSTE: verificar se já foi criado anteriormente
          const origemAjuste = `AJUSTE:${movExistente.id}:${tipo}`;
          const ajusteExistente = await trx('estoque_movimentacoes')
            .where({
              usuario_id,
              unidade_id,
              produto_id,
              tipo: 'AJUSTE',
              origem_id: origemAjuste
            })
            .select('id')
            .first();

          if (!ajusteExistente?.id) {
            // Criar movimentação de AJUSTE para compensar a diferença
            const [ajusteRow] = await trx('estoque_movimentacoes')
              .insert({
                usuario_id,
                unidade_id,
                produto_id,
                tipo: 'AJUSTE',
                quantidade: Math.abs(diffQty),
                motivo: `AJUSTE COMPENSATÓRIO - Diferença detectada na movimentação #${movExistente.id} (${tipo}). Delta: ${diffQty > 0 ? '+' : ''}${diffQty}`,
                origem_id: origemAjuste,
                preco_unitario_entrada: null,
                created_by: created_by || null,
                created_at: new Date()
              })
              .returning('*');

            // Aplicar o ajuste no snapshot de saldo
            const deltaAjuste = diffQty;
            const isDebitAjuste = deltaAjuste < 0;
            const qtyAbsAjuste = Math.abs(deltaAjuste);

            const updatePayloadAjuste = {
              saldo_atual: this.round3(saldoDepoisLegacy + deltaAjuste)
            };

            if (bucket === 'VENDA') {
              updatePayloadAjuste.saldo_venda = isDebitAjuste 
                ? saldoVendaDepois - qtyAbsAjuste 
                : saldoVendaDepois + qtyAbsAjuste;
            } else {
              updatePayloadAjuste.saldo_consumo = this.round3(
                isDebitAjuste 
                  ? saldoConsumoDepois - qtyAbsAjuste 
                  : saldoConsumoDepois + qtyAbsAjuste
              );
            }

            await trx('estoque_unidades')
              .where({ produto_id, unidade_id })
              .update(updatePayloadAjuste);

            logger.info('✅ [InventoryService] AJUSTE compensatório criado', {
              ajuste_id: ajusteRow?.id,
              diferenca: diffQty
            });

            movimentacao = ajusteRow || null;
          } else {
            logger.info('ℹ️  [InventoryService] AJUSTE compensatório já existe, ignorando', {
              ajuste_id: ajusteExistente.id
            });

            movimentacao = { id: movExistente.id, quantidade: qtyExistente };
          }
        } else {
          // Quantidade idêntica, apenas retornar registro existente (idempotência estrita)
          logger.info('ℹ️  [InventoryService] Movimentação já existe com mesma quantidade, ignorando', {
            movimentacao_id: movExistente.id,
            produto_id,
            tipo,
            origem_id,
            quantidade: qtyExistente
          });

          movimentacao = { id: movExistente.id, quantidade: qtyExistente };
        }
      } else {
        // Movimentação não existe, fazer INSERT normal
        logger.info('➕ [InventoryService] Criando nova movimentação', {
          produto_id,
          tipo,
          origem_id,
          quantidade: qty
        });

        const [movRow] = await trx('estoque_movimentacoes')
          .insert({
            usuario_id,
            unidade_id,
            produto_id,
            tipo,
            quantidade: qty,
            motivo: motivo || null,
            origem_id: origem_id || null,
            preco_unitario_entrada: tipo === 'ENTRADA' && Number.isFinite(Number(preco_custo_entrada)) ? Number(preco_custo_entrada) : null,
            created_by: created_by || null,
            created_at: new Date()
          })
          .returning('*');

        movimentacao = movRow || null;
      }

      logger.log(`📦 [InventoryService] Movimentação processada: produto_id=${produto_id}, unidade_id=${unidade_id}, tipo=${tipo}, qty=${qty}`);

      return {
        movimentacao,
        saldo_atual: saldoDepoisLegacy
      };
    };

    if (trxExternal) {
      return await run(trxExternal);
    }

    return await this.db.transaction(run);
  }
}

module.exports = InventoryService;

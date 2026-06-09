const logger = require('../utils/logger');
const InventoryService = require('./InventoryService');

class AgendamentoConclusaoService {
  constructor({ db }) {
    this.db = db;
    this.inventoryService = new InventoryService(db);
  }

  toCents(value) {
    if (value == null) return 0;
    const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  centsToDecimal(cents) {
    const n = Number(cents);
    if (!Number.isFinite(n)) return 0;
    return n / 100;
  }

  async reconcileEstoque({ agendamentoId, triggeredByUserId, pagamentos, trx: trxExternal }) {
    const agendamentoIdNum = parseInt(agendamentoId, 10);
    if (!Number.isFinite(agendamentoIdNum)) {
      const err = new Error('agendamentoId inválido');
      err.code = 'INVALID_AGENDAMENTO_ID';
      throw err;
    }

    const run = async (trx) => {
      await trx('agendamentos')
        .where('id', agendamentoIdNum)
        .forUpdate()
        .select('id')
        .first();

      const agendamento = await trx('agendamentos')
        .where('id', agendamentoIdNum)
        .whereNull('deleted_at')
        .select('id', 'unidade_id', 'cliente_id', 'status', 'metodo_pagamento', 'valor_total', 'venda_id')
        .first();

      if (!agendamento) {
        const err = new Error('Agendamento não encontrado');
        err.code = 'AGENDAMENTO_NOT_FOUND';
        throw err;
      }

      const unidade = await trx('unidades')
        .where('id', agendamento.unidade_id)
        .select('id', 'usuario_id')
        .first();

      if (!unidade?.usuario_id) {
        const err = new Error('Unidade inválida');
        err.code = 'UNIDADE_INVALID';
        throw err;
      }

      if (agendamento.status === 'Concluído') {
        try {
          let vendaId = agendamento.venda_id ? Number(agendamento.venda_id) : null;

          if (!vendaId) {
            const vendaExistente = await trx('vendas')
              .where('agendamento_id', agendamentoIdNum)
              .where('status', 'PAID')
              .select('id')
              .first();

            vendaId = vendaExistente?.id ? Number(vendaExistente.id) : null;
          }

          if (!vendaId) {
            const servicosRows = await trx('agendamento_servicos as ags')
              .join('servicos as s', 'ags.servico_id', 's.id')
              .where('ags.agendamento_id', agendamentoIdNum)
              .select(
                's.id as servico_id',
                's.nome as servico_nome',
                'ags.preco_aplicado as preco_aplicado'
              );

            let produtosRows = [];
            try {
              produtosRows = await trx('agendamento_produtos as ap')
                .join('produtos as p', 'ap.produto_id', 'p.id')
                .where('ap.agendamento_id', agendamentoIdNum)
                .where('p.usuario_id', unidade.usuario_id)
                .select(
                  'p.id as produto_id',
                  'p.nome as produto_nome',
                  'p.comissao_percentual as comissao_percentual',
                  'p.preco_custo_medio as preco_custo_medio',
                  'ap.quantidade as quantidade',
                  'ap.preco_aplicado as preco_aplicado',
                  'ap.agente_id as agente_id'
                );
            } catch (err) {
              if (!(err && (err.code === '42P01' || String(err.message || '').includes('agendamento_produtos')))) {
                throw err;
              }
              produtosRows = [];
            }

            const itens = [];
            for (const s of servicosRows || []) {
              const unit = Number(s.preco_aplicado) || 0;
              itens.push({
                item_type: 'SERVICO_AGENDAMENTO',
                reference_id: Number(s.servico_id),
                descricao_snapshot: String(s.servico_nome || 'Serviço'),
                quantidade: 1,
                preco_unitario_snapshot: unit,
                total_snapshot: unit,
                agente_id: null
              });
            }

            for (const p of produtosRows || []) {
              const qty = Number(p.quantidade) || 0;
              const unit = Number(p.preco_aplicado) || 0;
              if (!Number.isFinite(qty) || qty <= 0) continue;
              const qtyThousand = Math.round(qty * 1000);
              const unitCents = this.toCents(unit);
              const totalCents = Math.round((qtyThousand * unitCents) / 1000);
              const totalDecimal = this.centsToDecimal(totalCents);

              const comissaoPercentualSnapshot = Number(p?.comissao_percentual) || 0;
              const comissaoValorSnapshot = Number((totalDecimal * (comissaoPercentualSnapshot / 100)).toFixed(2));
              const precoCustoMedioSnapshot = Number(p?.preco_custo_medio) || 0;
              itens.push({
                item_type: 'PRODUTO',
                reference_id: Number(p.produto_id),
                descricao_snapshot: String(p.produto_nome || 'Produto'),
                quantidade: qty,
                preco_unitario_snapshot: unit,
                total_snapshot: totalDecimal,
                preco_custo_medio_snapshot: precoCustoMedioSnapshot,
                comissao_percentual_snapshot: comissaoPercentualSnapshot,
                comissao_valor_snapshot: comissaoValorSnapshot,
                agente_id: p.agente_id ? Number(p.agente_id) : null
              });
            }

            const subtotalCents = itens.reduce((sum, i) => sum + this.toCents(i.total_snapshot), 0);

            // Sprint 4 (Passo 3): Abater sinal Pix aprovado do total da venda no PDV
            let sinalCents = 0;
            try {
              const sinalRow = await trx('agendamento_pagamentos')
                .where({ agendamento_id: agendamentoIdNum, status: 'APPROVED' })
                .select('amount')
                .orderBy('id', 'desc')
                .first();

              if (sinalRow?.amount != null) {
                sinalCents = this.toCents(sinalRow.amount);
              }
            } catch (_) {
              sinalCents = 0;
            }

            if (Number.isFinite(sinalCents) && sinalCents > 0) {
              const sinalBRL = this.centsToDecimal(sinalCents);
              console.log(`💰 [PDV-Checkout] Sinal de R$ ${sinalBRL} localizado para o agendamento ${agendamentoIdNum}. Abatendo do total da venda.`);
            }

            const totalCents = Math.max(0, subtotalCents - (Number.isFinite(sinalCents) ? sinalCents : 0));

            const subtotal = this.centsToDecimal(subtotalCents);
            const total = this.centsToDecimal(totalCents);

            const [vendaRow] = await trx('vendas')
              .insert({
                usuario_id: unidade.usuario_id,
                unidade_id: agendamento.unidade_id,
                cliente_id: agendamento.cliente_id || null,
                agendamento_id: agendamentoIdNum,
                status: 'PAID',
                subtotal,
                desconto_total: 0,
                total,
                created_by: triggeredByUserId || null,
                paid_at: trx.fn.now(),
                created_at: trx.fn.now(),
                updated_at: trx.fn.now()
              })
              .returning('*');

            vendaId = vendaRow?.id ? Number(vendaRow.id) : null;

            if (!vendaId) {
              const err = new Error('Falha ao criar venda');
              err.code = 'VENDA_CREATE_FAILED';
              throw err;
            }

            if (itens.length > 0) {
              await trx('venda_itens').insert(
                itens.map((i) => ({
                  venda_id: vendaId,
                  item_type: i.item_type,
                  reference_id: i.reference_id || null,
                  descricao_snapshot: i.descricao_snapshot,
                  quantidade: i.quantidade,
                  preco_unitario_snapshot: i.preco_unitario_snapshot,
                  total_snapshot: i.total_snapshot,
                  preco_custo_medio_snapshot: i.preco_custo_medio_snapshot ?? 0,
                  comissao_percentual_snapshot: i.comissao_percentual_snapshot ?? null,
                  comissao_valor_snapshot: i.comissao_valor_snapshot ?? null,
                  agente_id: i.agente_id || null,
                  created_at: trx.fn.now()
                }))
              );
            }

            const pagamentosRows = Array.isArray(pagamentos) ? pagamentos : [];
            const pagamentosValidos = pagamentosRows
              .map((p) => ({
                metodo: String(p?.metodo || '').trim(),
                valorCents: this.toCents(p?.valor)
              }))
              .filter((p) => p.metodo && Number.isFinite(p.valorCents) && p.valorCents > 0);

            const totalPagoCents = pagamentosValidos.reduce((sum, p) => sum + p.valorCents, 0);
            const podeSplit = pagamentosValidos.length > 0 && Math.abs(totalPagoCents - totalCents) <= 1;

            if (podeSplit) {
              await trx('venda_pagamentos').insert(
                pagamentosValidos.map((p) => ({
                  venda_id: vendaId,
                  metodo: p.metodo,
                  valor: this.centsToDecimal(p.valorCents),
                  status: 'CAPTURED',
                  paid_at: trx.fn.now(),
                  created_at: trx.fn.now()
                }))
              );
            } else {
              await trx('venda_pagamentos').insert({
                venda_id: vendaId,
                metodo: agendamento.metodo_pagamento || 'Não definido',
                valor: this.centsToDecimal(totalCents),
                status: 'CAPTURED',
                paid_at: trx.fn.now(),
                created_at: trx.fn.now()
              });
            }

            for (const p of produtosRows || []) {
              const produtoId = Number(p.produto_id);
              const qty = Number(p.quantidade);
              if (!Number.isFinite(produtoId) || !Number.isFinite(qty) || qty <= 0) continue;

              await this.inventoryService.movimentarEstoque({
                usuario_id: unidade.usuario_id,
                unidade_id: agendamento.unidade_id,
                produto_id: produtoId,
                tipo: 'SAIDA',
                quantidade: qty,
                motivo: `VENDA PDV - Venda ${vendaId} (Agendamento ${agendamentoIdNum})`,
                origem_id: `VENDA:${vendaId}`,
                created_by: triggeredByUserId || null,
                trx
              });
            }
          }

          if (vendaId) {
            await trx('agendamentos')
              .where('id', agendamentoIdNum)
              .update({
                venda_id: vendaId,
                status_pagamento: 'Pago',
                updated_at: trx.fn.now()
              });
          }
        } catch (err) {
          if (!(err && (err.code === '42P01' || String(err.message || '').includes('vendas')))) {
            throw err;
          }
        }
      }

      // Desejado: se não estiver concluído => consumo desejado = 0
      const desiredRows = agendamento.status === 'Concluído'
        ? await trx('agendamento_servicos as ags')
          .join('servico_insumos as si', 'ags.servico_id', 'si.servico_id')
          .join('produtos as p', 'si.produto_id', 'p.id')
          .where('ags.agendamento_id', agendamentoIdNum)
          .where('p.usuario_id', unidade.usuario_id)
          .groupBy('si.produto_id')
          .select('si.produto_id')
          .sum({ quantidade_total: 'si.quantidade' })
        : [];

      const desiredByProduto = new Map();
      for (const row of desiredRows) {
        const produtoId = Number(row?.produto_id);
        const qtd = Number(row?.quantidade_total);
        if (!Number.isFinite(produtoId) || !Number.isFinite(qtd) || qtd <= 0) continue;
        desiredByProduto.set(produtoId, Number(qtd.toFixed(3)));
      }

      const currentRows = await trx('estoque_movimentacoes')
        .where('origem_id', String(agendamentoIdNum))
        .whereIn('tipo', ['CONSUMO', 'ESTORNO'])
        .groupBy('produto_id')
        .select('produto_id')
        .sum({ consumo_total: trx.raw("CASE WHEN tipo = 'CONSUMO' THEN quantidade ELSE 0 END") })
        .sum({ estorno_total: trx.raw("CASE WHEN tipo = 'ESTORNO' THEN quantidade ELSE 0 END") });

      const currentNetByProduto = new Map();
      for (const row of currentRows) {
        const produtoId = Number(row?.produto_id);
        const consumo = Number(row?.consumo_total);
        const estorno = Number(row?.estorno_total);
        if (!Number.isFinite(produtoId)) continue;
        const net = Number(((Number.isFinite(consumo) ? consumo : 0) - (Number.isFinite(estorno) ? estorno : 0)).toFixed(3));
        currentNetByProduto.set(produtoId, net);
      }

      const allProdutoIds = new Set([...
        Array.from(desiredByProduto.keys()),
        ...Array.from(currentNetByProduto.keys())
      ]);

      const movimentos = [];
      for (const produtoId of allProdutoIds) {
        const desired = desiredByProduto.get(produtoId) || 0;
        const currentNet = currentNetByProduto.get(produtoId) || 0;
        const delta = Number((desired - currentNet).toFixed(3));

        if (!Number.isFinite(delta) || delta === 0) continue;

        const tipo = delta > 0 ? 'CONSUMO' : 'ESTORNO';
        const quantidade = Math.abs(delta);
        const motivo = tipo === 'CONSUMO'
          ? `CONSUMO AUTOMÁTICO - Agendamento ${agendamentoIdNum}`
          : `ESTORNO AUTOMÁTICO - Agendamento ${agendamentoIdNum}`;

        const mov = await this.inventoryService.movimentarEstoque({
          usuario_id: unidade.usuario_id,
          unidade_id: agendamento.unidade_id,
          produto_id: Number(produtoId),
          tipo,
          quantidade,
          motivo,
          origem_id: String(agendamentoIdNum),
          created_by: triggeredByUserId || null,
          trx
        });

        movimentos.push(mov);
      }

      logger.log(`✅ [AgendamentoConclusaoService] Reconciliação de estoque concluída: agendamento_id=${agendamentoIdNum}, movimentos=${movimentos.length}`);

      return { ok: true, movimentos };
    };

    if (trxExternal) {
      return await run(trxExternal);
    }

    return await this.db.transaction(run);
  }

  async handleConcluido({ agendamentoId, triggeredByUserId, trx }) {
    return await this.reconcileEstoque({ agendamentoId, triggeredByUserId, trx });
  }

  async scheduleConviteRetorno({ agendamentoId }) {
    const agendamentoIdNum = parseInt(agendamentoId, 10);
    if (!Number.isFinite(agendamentoIdNum)) {
      return;
    }

    const agendamento = await this.db('agendamentos')
      .where('id', agendamentoIdNum)
      .whereNull('deleted_at')
      .select('id', 'unidade_id', 'cliente_id')
      .first();

    if (!agendamento) return;

    const servicosElegiveis = await this.db('agendamento_servicos as ags')
      .join('servicos as s', 'ags.servico_id', 's.id')
      .where('ags.agendamento_id', agendamentoIdNum)
      .where('s.convite_retorno_ativo', true)
      .whereNotNull('s.convite_retorno_dias')
      .select('s.id', 's.nome', 's.convite_retorno_dias');

    if (!servicosElegiveis || servicosElegiveis.length === 0) return;

    const diasMin = servicosElegiveis
      .map(s => parseInt(s.convite_retorno_dias, 10))
      .filter(n => !Number.isNaN(n) && n > 0)
      .sort((a, b) => a - b)[0];

    if (!diasMin) return;

    const cliente = await this.db('clientes')
      .where('id', agendamento.cliente_id)
      .select('telefone')
      .first();

    if (!cliente?.telefone) return;

    const enviarEm = new Date();
    enviarEm.setDate(enviarEm.getDate() + diasMin);
    enviarEm.setHours(10, 0, 0, 0);

    await this.db.raw(`
      INSERT INTO lembretes_enviados (
        agendamento_id, unidade_id, tipo_lembrete, tipo_notificacao,
        status, telefone_destino, enviar_em, tentativas, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (agendamento_id, tipo_notificacao)
      WHERE agendamento_id IS NOT NULL AND tipo_notificacao IS NOT NULL
      DO NOTHING
    `, [
      agendamentoIdNum, agendamento.unidade_id, null, 'convite_retorno',
      'programado', cliente.telefone, enviarEm, 0
    ]);
  }
}

module.exports = AgendamentoConclusaoService;

const { db } = require('../config/knex');
const { startOfDay, endOfDay } = require('../utils/timezone');

class DashboardKpiController {
  // GET /api/dashboard/kpis?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD&unidade_id=123&agente_id=1&servico_id=2
  async kpis(req, res) {
    try {
      const { data_inicio, data_fim, unidade_id, agente_id, servico_id } = req.query;

      if (!data_inicio || !data_fim) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          message: 'data_inicio e data_fim são obrigatórios'
        });
      }

      const unidadeId = unidade_id ? Number(unidade_id) : null;
      const agenteId = agente_id ? Number(agente_id) : null;
      const servicoId = servico_id ? Number(servico_id) : null;

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Informe a Unidade.'
        });
      }

      if (agente_id && (!Number.isFinite(agenteId) || agenteId <= 0)) {
        return res.status(400).json({
          success: false,
          error: 'agente_id inválido'
        });
      }

      if (servico_id && (!Number.isFinite(servicoId) || servicoId <= 0)) {
        return res.status(400).json({
          success: false,
          error: 'servico_id inválido'
        });
      }

      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (userRole === 'AGENTE' && userAgenteId) {
        const agente = await db('agentes').where('id', userAgenteId).select('unidade_id').first();
        if (agente?.unidade_id) {
          const unidade = await db('unidades').where('id', agente.unidade_id).select('usuario_id').first();
          if (unidade?.usuario_id) {
            usuarioId = unidade.usuario_id;
          }
        }
      }

      // ✅ Trava multi-unidade: validar que unidade pertence ao tenant (usuario_id)
      const unidadeRow = await db('unidades')
        .where({ id: unidadeId, usuario_id: usuarioId })
        .select('id')
        .first();

      if (!unidadeRow) {
        return res.status(404).json({
          success: false,
          error: 'Unidade não encontrada ou acesso negado'
        });
      }

      const startTs = startOfDay(data_inicio);
      const endTs = endOfDay(data_fim);

      // KPIs baseados em agendamentos (sempre escopado por unidade)
      const baseAg = db('agendamentos')
        .where('unidade_id', unidadeId)
        .whereNull('deleted_at')
        .where('data_agendamento', '>=', data_inicio)
        .where('data_agendamento', '<=', data_fim);

      if (Number.isFinite(agenteId)) {
        baseAg.andWhere('agente_id', agenteId);
      }

      if (Number.isFinite(servicoId)) {
        baseAg.andWhereExists(function () {
          this.select(1)
            .from('agendamento_servicos')
            .whereRaw('agendamento_servicos.agendamento_id = agendamentos.id')
            .where('agendamento_servicos.servico_id', servicoId);
        });
      }

      const baseAgValid = baseAg.clone().whereNot('status', 'Cancelado');
      const baseAgPaidCompleted = baseAg.clone().where('status', 'Concluído').where('status_pagamento', 'Pago');

      const now = new Date();
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const nowTimeStr = now.toLocaleTimeString('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour12: false
      });

      const todayDateSql = db.raw('?::date', [todayStr]);
      const nowTimeSql = db.raw('?::time', [nowTimeStr]);

      const [
        totalRaw,
        canceledRaw,
        completedPaidCountRaw,
        clientesUnicosRaw,
        receitaServicosRaw,
        pendentesRaw
      ] = await Promise.all([
        baseAgValid.clone().count('* as count').first(),
        baseAg.clone().where('status', 'Cancelado').count('* as count').first(),
        baseAgPaidCompleted.clone().count('* as count').first(),
        baseAgValid.clone().countDistinct('cliente_id as count').first(),
        baseAgPaidCompleted.clone().sum('valor_total as total').first(),
        baseAg.clone()
          .where('status', 'Aprovado')
          .andWhere((qb) => {
            qb.where('data_agendamento', '<', todayDateSql)
              .orWhere((qb2) => {
                qb2.where('data_agendamento', todayDateSql)
                  .andWhere('hora_fim', '<', nowTimeSql);
              });
          })
          .count('* as count')
          .first()
      ]);

      const reservasTotais = parseInt(totalRaw?.count, 10) || 0;
      const cancelados = parseInt(canceledRaw?.count, 10) || 0;
      const concluidosPagos = parseInt(completedPaidCountRaw?.count, 10) || 0;
      const clientesUnicos = parseInt(clientesUnicosRaw?.count, 10) || 0;
      const receitaServicos = Number(receitaServicosRaw?.total) || 0;

      const taxaCancelamento = reservasTotais + cancelados > 0
        ? (cancelados / (reservasTotais + cancelados)) * 100
        : 0;

      // Agendamentos pendentes = Aprovado com término já passado (100% via SQL)
      const totalPendentes = parseInt(pendentesRaw?.count, 10) || 0;

      // ✅ Comissão blindada: somente serviços com regra explícita, em agendamentos pagos e concluídos
      const baseComissoes = db('agendamento_servicos as asv')
        .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
        .leftJoin('servicos as s', 's.id', 'asv.servico_id')
        .where('a.unidade_id', unidadeId)
        .whereNull('a.deleted_at')
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim)
        .where('a.status', 'Concluído')
        .where('a.status_pagamento', 'Pago')
        .modify((qb) => {
          if (Number.isFinite(agenteId)) qb.andWhere('a.agente_id', agenteId);
          if (Number.isFinite(servicoId)) qb.andWhere('asv.servico_id', servicoId);
        });

      // Provisão total do período (independe de ter sido paga)
      const comissoesTotalRow = await baseComissoes
        .clone()
        .sum({
          total: db.raw(
            'COALESCE(asv.preco_aplicado, 0) * (COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) / 100.0)'
          )
        })
        .first();

      const comissoesAgentes = Number(comissoesTotalRow?.total) || 0;

      // Comissão já baixada (paga) no período selecionado
      const comissoesPagasRow = await baseComissoes
        .clone()
        .where('asv.comissao_paga', true)
        .sum({
          total: db.raw(
            'COALESCE(asv.preco_aplicado, 0) * (COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) / 100.0)'
          )
        })
        .first();

      const comissoesPagas = Number(comissoesPagasRow?.total) || 0;

      // Comissão pendente (a pagar)
      const comissoesAPagar = Number((comissoesAgentes - comissoesPagas).toFixed(2));

      // ✅ Despesas Pagas no período (padrão contábil: data_pagamento)
      const despesasPagasRow = await db('despesas')
        .where('usuario_id', usuarioId)
        .where('unidade_id', unidadeId)
        .where('status', 'PAID')
        .whereNotNull('data_pagamento')
        .where('data_pagamento', '>=', data_inicio)
        .where('data_pagamento', '<=', data_fim)
        .sum('valor as total')
        .first();

      const despesasPagasTotais = Number(despesasPagasRow?.total) || 0;

      // ✅ Receita Bruta real: serviços pagos + PDV balcão pago (vendas avulsas)
      const vendasAvulsasRow = await db('vendas')
        .where('usuario_id', usuarioId)
        .where('unidade_id', unidadeId)
        .whereNull('agendamento_id')
        .where('status', 'PAID')
        .where('created_at', '>=', startTs)
        .where('created_at', '<=', endTs)
        .sum('total as total')
        .first();

      const receitaBalcao = Number(vendasAvulsasRow?.total) || 0;
      const receitaBruta = Number((receitaServicos + receitaBalcao).toFixed(2));
      const receitaDoProprietario = Number((receitaBruta - comissoesAgentes).toFixed(2));
      // Lucro líquido (fluxo de caixa): só subtrai comissões já pagas
      const lucroLiquido = Number((receitaBruta - comissoesPagas - despesasPagasTotais).toFixed(2));
      const ticketMedio = concluidosPagos > 0 ? receitaServicos / concluidosPagos : 0;

      const alertRows = await db('estoque_unidades as eu')
        .join('unidades as u', 'u.id', 'eu.unidade_id')
        .where('u.usuario_id', usuarioId)
        .where('eu.unidade_id', unidadeId)
        .whereRaw('COALESCE(eu.saldo_atual, 0) <= COALESCE(eu.estoque_minimo, 0)')
        .count('* as count')
        .first();

      const alertaEstoque = parseInt(alertRows?.count, 10) || 0;

      return res.json({
        success: true,
        data: {
          reservas_totais: reservasTotais,
          receita_bruta: receitaBruta,
          receita_servicos: Number(receitaServicos.toFixed(2)),
          receita_balcao: Number(receitaBalcao.toFixed(2)),
          receita_proprietario: receitaDoProprietario,
          comissoes_agentes: Number(comissoesAgentes.toFixed(2)),
          comissoes_pagas: Number(comissoesPagas.toFixed(2)),
          comissoes_a_pagar: Number(comissoesAPagar.toFixed(2)),
          despesas_pagas_totais: Number(despesasPagasTotais.toFixed(2)),
          lucro_liquido: lucroLiquido,
          ticket_medio: Number(ticketMedio.toFixed(2)),
          clientes_unicos: clientesUnicos,
          taxa_cancelamento_pct: Number(taxaCancelamento.toFixed(2)),
          agendamentos_pendentes: totalPendentes,
          alerta_estoque: alertaEstoque
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar KPIs do dashboard',
        message: error.message
      });
    }
  }
}

module.exports = DashboardKpiController;

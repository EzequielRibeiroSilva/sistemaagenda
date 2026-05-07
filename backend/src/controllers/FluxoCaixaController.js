const { db } = require('../config/knex');
const logger = require('../utils/logger');

class FluxoCaixaController {
  // GET /api/financeiro/extrato?unidade_id=1&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
  async extrato(req, res) {
    try {
      const { data_inicio, data_fim, unidade_id } = req.query;

      const unidadeId = unidade_id ? Number(unidade_id) : null;
      const dataInicio = data_inicio ? String(data_inicio).trim() : null;
      const dataFim = data_fim ? String(data_fim).trim() : null;

      let usuarioId = req.user?.id;
      const userRole = req.user?.role;
      const userAgenteId = req.user?.agente_id;

      if (!usuarioId) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não autenticado'
        });
      }

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id é obrigatório'
        });
      }

      if (!dataInicio || !dataFim) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          message: 'data_inicio e data_fim são obrigatórios'
        });
      }

      // Para AGENTE, normalizar o tenant para o usuario_id dono da unidade
      if (userRole === 'AGENTE' && userAgenteId) {
        const agente = await db('agentes').where('id', userAgenteId).select('unidade_id').first();
        if (agente?.unidade_id) {
          const unidade = await db('unidades').where('id', agente.unidade_id).select('usuario_id').first();
          if (unidade?.usuario_id) {
            usuarioId = unidade.usuario_id;
          }
        }
      }

      // Trava multi-unidade: validar que unidade pertence ao tenant (usuario_id)
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

      const startTs = new Date(`${dataInicio}T00:00:00-03:00`);
      const endTs = new Date(`${dataFim}T23:59:59-03:00`);

      // ENTRADAS: venda_pagamentos (somente vendas PAID)
      const entradasRows = await db('venda_pagamentos as vp')
        .join('vendas as v', 'v.id', 'vp.venda_id')
        .leftJoin('agendamentos as a', 'a.id', 'v.agendamento_id')
        .leftJoin('clientes as c', 'c.id', 'a.cliente_id')
        .where('v.usuario_id', usuarioId)
        .where('v.unidade_id', unidadeId)
        .where('v.status', 'PAID')
        .where((qb) => {
          qb.whereBetween('vp.paid_at', [startTs, endTs]).orWhere((qb2) => {
            qb2.whereNull('vp.paid_at').whereBetween('vp.created_at', [startTs, endTs]);
          });
        })
        .select(
          'vp.id as pagamento_id',
          'vp.venda_id',
          'v.agendamento_id',
          'v.id as venda_id',
          'vp.metodo',
          'vp.valor',
          db.raw('COALESCE(vp.paid_at, vp.created_at) as data'),
          db.raw("TRIM(CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))) as cliente_nome")
        );

      const entradas = (entradasRows || []).map((r) => {
        const agendamentoId = r.agendamento_id ? Number(r.agendamento_id) : null;
        const vendaId = r.venda_id ? Number(r.venda_id) : null;
        const clienteNome = r.cliente_nome ? String(r.cliente_nome).trim() : '';

        const descricao = agendamentoId
          ? `Comanda #${agendamentoId}${clienteNome ? ` - ${clienteNome}` : ''}`
          : `Venda Balcão #${vendaId || ''}`.trim();

        return {
          tipo: 'ENTRADA',
          valor: Number(r.valor) || 0,
          data: r.data,
          metodo: r.metodo ? String(r.metodo) : null,
          descricao
        };
      });

      // SAÍDAS: despesas pagas (status=PAID e data_pagamento no período)
      const saidasRows = await db('despesas as d')
        .where('d.usuario_id', usuarioId)
        .where('d.unidade_id', unidadeId)
        .where('d.status', 'PAID')
        .whereNotNull('d.data_pagamento')
        .where('d.data_pagamento', '>=', dataInicio)
        .where('d.data_pagamento', '<=', dataFim)
        .select('d.id', 'd.descricao', 'd.valor', 'd.data_pagamento as data', 'd.forma_pagamento');

      const saidas = (saidasRows || []).map((r) => {
        const v = Number(r.valor) || 0;
        return {
          tipo: 'SAIDA',
          valor: Number((-1 * v).toFixed(2)),
          data: r.data,
          metodo: r.forma_pagamento ? String(r.forma_pagamento) : null,
          descricao: r.descricao ? String(r.descricao) : ''
        };
      });

      const transacoes = [...entradas, ...saidas]
        .map((t) => ({
          ...t,
          _sortTs: new Date(String(t.data)).getTime()
        }))
        .sort((a, b) => {
          const aTs = Number.isFinite(a._sortTs) ? a._sortTs : 0;
          const bTs = Number.isFinite(b._sortTs) ? b._sortTs : 0;
          if (aTs !== bTs) return bTs - aTs;
          // desempate: ENTRADA primeiro
          if (a.tipo !== b.tipo) return a.tipo === 'ENTRADA' ? -1 : 1;
          return 0;
        })
        .map(({ _sortTs, ...t }) => t);

      const totalEntradas = Number(
        entradas.reduce((acc, x) => acc + (Number(x.valor) || 0), 0).toFixed(2)
      );

      const totalSaidasAbs = Number(
        Math.abs(saidas.reduce((acc, x) => acc + (Number(x.valor) || 0), 0)).toFixed(2)
      );

      const saldoPeriodo = Number((totalEntradas - totalSaidasAbs).toFixed(2));

      return res.status(200).json({
        success: true,
        transacoes,
        resumo: {
          total_entradas: totalEntradas,
          total_saidas: totalSaidasAbs,
          saldo_periodo: saldoPeriodo
        }
      });
    } catch (error) {
      logger.error('[FluxoCaixaController.extrato] Erro ao gerar extrato:', {
        message: error?.message,
        stack: error?.stack,
        user: req.user ? { id: req.user.id, role: req.user.role } : null,
        query: req.query
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao gerar extrato de fluxo de caixa',
        message: error.message
      });
    }
  }
}

module.exports = FluxoCaixaController;

const { db } = require('../config/knex');

class ComissaoController {
  // GET /api/comissoes/resumo?unidade_id=123&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
  async resumo(req, res) {
    try {
      const { unidade_id, data_inicio, data_fim } = req.query;

      const unidadeId = unidade_id ? Number(unidade_id) : null;

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({ success: false, error: 'Informe a Unidade.' });
      }

      if (!data_inicio || !data_fim) {
        return res.status(400).json({ success: false, error: 'data_inicio e data_fim são obrigatórios' });
      }

      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({ success: false, error: 'Usuário não autenticado' });
      }

      if (userRole === 'AGENTE') {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }

      const unidadeRow = await db('unidades')
        .where({ id: unidadeId, usuario_id: usuarioId })
        .select('id')
        .first();

      if (!unidadeRow) {
        return res.status(404).json({ success: false, error: 'Unidade não encontrada ou acesso negado' });
      }

      const rows = await db('agendamento_servicos as asv')
        .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
        .join('agentes as ag', 'ag.id', 'a.agente_id')
        .leftJoin('servicos as s', 's.id', 'asv.servico_id')
        .where('a.unidade_id', unidadeId)
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim)
        .where('a.status', 'Concluído')
        .where('a.status_pagamento', 'Pago')
        .groupBy('a.agente_id', 'ag.nome', 'ag.sobrenome', 'ag.nome_exibicao')
        .select(
          'a.agente_id',
          db.raw("COALESCE(NULLIF(TRIM(ag.nome_exibicao), ''), TRIM(CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')))) as agente_nome"),
          db.raw(`
            COALESCE(SUM(
              CASE WHEN asv.comissao_paga = false THEN
                COALESCE(asv.preco_aplicado, 0) * (COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) / 100.0)
              ELSE 0 END
            ), 0) as total_pendente
          `),
          db.raw(`
            COALESCE(SUM(
              CASE WHEN asv.comissao_paga = true THEN
                COALESCE(asv.preco_aplicado, 0) * (COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) / 100.0)
              ELSE 0 END
            ), 0) as total_pago
          `)
        )
        .orderBy('total_pendente', 'desc');

      return res.json({
        success: true,
        data: {
          unidade_id: unidadeId,
          data_inicio,
          data_fim,
          ranking: (rows || []).map((r) => ({
            agente_id: Number(r.agente_id),
            agente_nome: r.agente_nome,
            total_pendente: Number(Number(r.total_pendente || 0).toFixed(2)),
            total_pago: Number(Number(r.total_pago || 0).toFixed(2))
          }))
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar resumo de comissões',
        message: error.message
      });
    }
  }

  // GET /api/comissoes/pendentes?unidade_id=123&agente_id=1&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
  async pendentes(req, res) {
    try {
      const { unidade_id, agente_id, data_inicio, data_fim, status_comissao } = req.query;

      const unidadeId = unidade_id ? Number(unidade_id) : null;
      const agenteId = agente_id ? Number(agente_id) : null;

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({ success: false, error: 'Informe a Unidade.' });
      }

      if (!agenteId || !Number.isFinite(agenteId) || agenteId <= 0) {
        return res.status(400).json({ success: false, error: 'Informe o agente_id.' });
      }

      if (!data_inicio || !data_fim) {
        return res.status(400).json({ success: false, error: 'data_inicio e data_fim são obrigatórios' });
      }

      const statusComissao = status_comissao ? String(status_comissao).toLowerCase() : 'pendente';

      if (statusComissao !== 'pendente' && statusComissao !== 'pago') {
        return res
          .status(400)
          .json({ success: false, error: "status_comissao inválido. Use 'pendente' ou 'pago'." });
      }

      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({ success: false, error: 'Usuário não autenticado' });
      }

      if (userRole === 'AGENTE') {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }

      // ✅ Trava multi-unidade: validar que unidade pertence ao tenant (usuario_id)
      const unidadeRow = await db('unidades')
        .where({ id: unidadeId, usuario_id: usuarioId })
        .select('id')
        .first();

      if (!unidadeRow) {
        return res.status(404).json({ success: false, error: 'Unidade não encontrada ou acesso negado' });
      }

      // ✅ Extrato pendente: serviços em agendamentos concluídos e pagos, com comissão ainda não paga
      const rows = await db('agendamento_servicos as asv')
        .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
        .leftJoin('servicos as s', 's.id', 'asv.servico_id')
        .leftJoin('clientes as c', 'c.id', 'a.cliente_id')
        .where('a.unidade_id', unidadeId)
        .where('a.agente_id', agenteId)
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim)
        .where('a.status', 'Concluído')
        .where('a.status_pagamento', 'Pago')
        .where('asv.comissao_paga', statusComissao === 'pago')
        .select(
          'asv.id as agendamento_servico_id',
          'asv.agendamento_id',
          'a.data_agendamento',
          'a.hora_inicio',
          'a.hora_fim',
          'a.cliente_id',
          db.raw("TRIM(CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))) as cliente_nome"),
          'asv.servico_id',
          db.raw("COALESCE(s.nome, '') as servico_nome"),
          'asv.preco_aplicado',
          db.raw('COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) as comissao_percentual'),
          db.raw(
            'COALESCE(asv.preco_aplicado, 0) * (COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) / 100.0) as comissao_valor'
          ),
          'asv.data_pagamento_comissao',
          'asv.observacao_pagamento'
        )
        .orderBy(
          statusComissao === 'pago' ? 'asv.data_pagamento_comissao' : 'a.data_agendamento',
          statusComissao === 'pago' ? 'desc' : 'asc'
        )
        .orderBy('a.hora_inicio', 'asc');

      const totalRow = await db('agendamento_servicos as asv')
        .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
        .leftJoin('servicos as s', 's.id', 'asv.servico_id')
        .where('a.unidade_id', unidadeId)
        .where('a.agente_id', agenteId)
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim)
        .where('a.status', 'Concluído')
        .where('a.status_pagamento', 'Pago')
        .where('asv.comissao_paga', statusComissao === 'pago')
        .sum({
          total: db.raw(
            'COALESCE(asv.preco_aplicado, 0) * (COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) / 100.0)'
          )
        })
        .first();

      const totalPendente = Number(totalRow?.total) || 0;

      return res.json({
        success: true,
        data: {
          unidade_id: unidadeId,
          agente_id: agenteId,
          data_inicio,
          data_fim,
          status_comissao: statusComissao,
          total_pendente: Number(totalPendente.toFixed(2)),
          itens: rows.map((r) => ({
            agendamento_servico_id: r.agendamento_servico_id,
            agendamento_id: r.agendamento_id,
            data_agendamento: r.data_agendamento,
            hora_inicio: r.hora_inicio,
            hora_fim: r.hora_fim,
            cliente_id: r.cliente_id,
            cliente_nome: r.cliente_nome,
            servico_id: r.servico_id,
            servico_nome: r.servico_nome,
            preco_aplicado: Number(r.preco_aplicado) || 0,
            comissao_percentual: Number(r.comissao_percentual) || 0,
            comissao_valor: Number(r.comissao_valor) || 0,
            data_pagamento_comissao: r.data_pagamento_comissao,
            observacao_pagamento: r.observacao_pagamento
          }))
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar comissões pendentes',
        message: error.message
      });
    }
  }

  // POST /api/comissoes/pagar
  // Body: { unidade_id, agente_id, ids?: number[], data_inicio?: 'YYYY-MM-DD', data_fim?: 'YYYY-MM-DD', data_pagamento_comissao?: ISOString }
  async pagar(req, res) {
    try {
      const { unidade_id, agente_id, ids, data_inicio, data_fim, data_pagamento_comissao, observacao } = req.body || {};

      const unidadeId = unidade_id ? Number(unidade_id) : null;
      const agenteId = agente_id ? Number(agente_id) : null;

      if (!unidadeId || !Number.isFinite(unidadeId) || unidadeId <= 0) {
        return res.status(400).json({ success: false, error: 'Informe a Unidade.' });
      }

      if (!agenteId || !Number.isFinite(agenteId) || agenteId <= 0) {
        return res.status(400).json({ success: false, error: 'Informe o agente_id.' });
      }

      const hasIds = Array.isArray(ids) && ids.length > 0;
      const hasPeriodo = Boolean(data_inicio && data_fim);

      if (!hasIds && !hasPeriodo) {
        return res.status(400).json({
          success: false,
          error: 'Informe ids (array) ou data_inicio + data_fim para efetuar o pagamento.'
        });
      }

      if (observacao != null && typeof observacao !== 'string') {
        return res.status(400).json({ success: false, error: 'observacao deve ser uma string' });
      }

      const usuarioId = req.user?.id;
      const userRole = req.user?.role;

      if (!usuarioId) {
        return res.status(401).json({ success: false, error: 'Usuário não autenticado' });
      }

      if (userRole === 'AGENTE') {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }

      // ✅ Trava multi-unidade: validar que unidade pertence ao tenant (usuario_id)
      const unidadeRow = await db('unidades')
        .where({ id: unidadeId, usuario_id: usuarioId })
        .select('id')
        .first();

      if (!unidadeRow) {
        return res.status(404).json({ success: false, error: 'Unidade não encontrada ou acesso negado' });
      }

      const paidAt = data_pagamento_comissao ? new Date(data_pagamento_comissao) : new Date();
      const observacaoPagamento = typeof observacao === 'string' && observacao.trim() ? observacao.trim() : null;

      const result = await db.transaction(async (trx) => {
        let targetQuery = trx('agendamento_servicos as asv')
          .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
          .where('a.unidade_id', unidadeId)
          .where('a.agente_id', agenteId)
          .where('a.status', 'Concluído')
          .where('a.status_pagamento', 'Pago')
          .where('asv.comissao_paga', false);

        if (hasIds) {
          const idsParsed = (ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
          if (idsParsed.length === 0) {
            return { updated: 0, total_pago: 0 };
          }
          targetQuery = targetQuery.whereIn('asv.id', idsParsed);
        } else {
          targetQuery = targetQuery
            .where('a.data_agendamento', '>=', data_inicio)
            .where('a.data_agendamento', '<=', data_fim);
        }

        // Total a pagar (antes de marcar pago)
        const totalRow = await targetQuery
          .clone()
          .leftJoin('servicos as s', 's.id', 'asv.servico_id')
          .sum({
            total: trx.raw(
              'COALESCE(asv.preco_aplicado, 0) * (COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) / 100.0)'
            )
          })
          .first();

        const totalPago = Number(totalRow?.total) || 0;

        // Update idempotente: só atualiza o que ainda está pendente
        let updatedCount = 0;

        if (hasPeriodo) {
          updatedCount = await trx('agendamento_servicos')
            .whereIn('id', function() {
              this.select('asv.id')
                .from('agendamento_servicos as asv')
                .innerJoin('agendamentos as a', 'a.id', 'asv.agendamento_id')
                .where('a.unidade_id', unidadeId)
                .andWhere('a.agente_id', agenteId)
                .andWhere('a.status', 'Concluído')
                .andWhere('a.status_pagamento', 'Pago')
                .andWhere('asv.comissao_paga', false)
                .andWhere('a.data_agendamento', '>=', data_inicio)
                .andWhere('a.data_agendamento', '<=', data_fim);
            })
            .update({
              comissao_paga: true,
              data_pagamento_comissao: paidAt,
              observacao_pagamento: observacaoPagamento
            });
        } else {
          updatedCount = await targetQuery
            .clone()
            .update({
              comissao_paga: true,
              data_pagamento_comissao: paidAt,
              observacao_pagamento: observacaoPagamento
            });
        }

        return { updated: updatedCount, total_pago: Number(totalPago.toFixed(2)) };
      });

      return res.json({
        success: true,
        data: {
          unidade_id: unidadeId,
          agente_id: agenteId,
          updated: result.updated,
          total_pago: result.total_pago,
          data_pagamento_comissao: paidAt.toISOString()
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao pagar comissões',
        message: error.message
      });
    }
  }
}

module.exports = ComissaoController;

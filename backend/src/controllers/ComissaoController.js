const { db } = require('../config/knex');
const { assertPeriodoAberto, parseYmdToLocalDate } = require('../utils/periodLock');

const toCents = (value) => {
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.replace(',', '.');
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const parts = unsigned.split('.');
  const intPart = (parts[0] || '0').replace(/\D/g, '') || '0';
  const fracRaw = (parts[1] || '').replace(/\D/g, '');
  const fracPadded = fracRaw.padEnd(3, '0');
  const frac2 = fracPadded.slice(0, 2);
  const frac3 = fracPadded.slice(2, 3);
  let cents = (parseInt(intPart, 10) * 100) + parseInt(frac2 || '0', 10);
  if (parseInt(frac3 || '0', 10) >= 5) {
    cents += 1;
  }
  return negative ? -cents : cents;
};

const centsToDecimal = (cents) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
};

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

      const servicoRows = await db('agendamento_servicos as asv')
        .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
        .join('agentes as ag', 'ag.id', 'a.agente_id')
        .leftJoin('servicos as s', 's.id', 'asv.servico_id')
        .where('a.unidade_id', unidadeId)
        .whereNull('a.deleted_at')
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim)
        .where('a.status', 'Concluído')
        .where('a.status_pagamento', 'Pago')
        .groupBy('a.agente_id', 'ag.nome', 'ag.sobrenome', 'ag.nome_exibicao')
        .select(
          'a.agente_id',
          db.raw("(COALESCE(NULLIF(TRIM(ag.nome_exibicao), ''), TRIM(CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')))) || CASE WHEN ag.deleted_at IS NOT NULL THEN ' [Excluído]' ELSE '' END) as agente_nome"),
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
        );

      const vendaProdutoRows = await db('venda_itens as vi')
        .join('vendas as v', 'v.id', 'vi.venda_id')
        .join('agentes as ag', 'ag.id', 'vi.agente_id')
        .where('v.usuario_id', usuarioId)
        .where('v.unidade_id', unidadeId)
        .where('v.status', 'PAID')
        .where('vi.item_type', 'PRODUTO')
        .where('v.created_at', '>=', `${data_inicio}T00:00:00-03:00`)
        .where('v.created_at', '<=', `${data_fim}T23:59:59-03:00`)
        .whereNotNull('vi.agente_id')
        .where(db.raw('COALESCE(vi.comissao_percentual_snapshot, 0) > 0'))
        .groupBy('vi.agente_id', 'ag.nome', 'ag.sobrenome', 'ag.nome_exibicao')
        .select(
          'vi.agente_id',
          db.raw("(COALESCE(NULLIF(TRIM(ag.nome_exibicao), ''), TRIM(CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')))) || CASE WHEN ag.deleted_at IS NOT NULL THEN ' [Excluído]' ELSE '' END) as agente_nome"),
          db.raw(`
            COALESCE(SUM(
              COALESCE(vi.comissao_valor_snapshot, 0)
            ), 0) as total_pendente
          `),
          db.raw('0 as total_pago')
        );

      const produtoRows = await db('agendamento_produtos as ap')
        .join('agendamentos as a', 'a.id', 'ap.agendamento_id')
        .join('agentes as ag', 'ag.id', 'ap.agente_id')
        .join('produtos as p', 'p.id', 'ap.produto_id')
        .where('a.unidade_id', unidadeId)
        .whereNull('a.deleted_at')
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim)
        .where('a.status', 'Concluído')
        .where('a.status_pagamento', 'Pago')
        .whereNotNull('ap.agente_id')
        .where(db.raw('COALESCE(ap.comissao_percentual_snapshot, p.comissao_percentual, 0) > 0'))
        .groupBy('ap.agente_id', 'ag.nome', 'ag.sobrenome', 'ag.nome_exibicao')
        .select(
          'ap.agente_id',
          db.raw("(COALESCE(NULLIF(TRIM(ag.nome_exibicao), ''), TRIM(CONCAT(COALESCE(ag.nome, ''), ' ', COALESCE(ag.sobrenome, '')))) || CASE WHEN ag.deleted_at IS NOT NULL THEN ' [Excluído]' ELSE '' END) as agente_nome"),
          db.raw(`
            COALESCE(SUM(
              CASE WHEN COALESCE(ap.comissao_paga, false) = false THEN
                COALESCE(
                  ap.comissao_valor_snapshot,
                  (COALESCE(ap.preco_aplicado, 0) * COALESCE(ap.quantidade, 0)) * (COALESCE(p.comissao_percentual, 0) / 100.0),
                  0
                )
              ELSE 0 END
            ), 0) as total_pendente
          `),
          db.raw(`
            COALESCE(SUM(
              CASE WHEN COALESCE(ap.comissao_paga, false) = true THEN
                COALESCE(
                  ap.comissao_valor_snapshot,
                  (COALESCE(ap.preco_aplicado, 0) * COALESCE(ap.quantidade, 0)) * (COALESCE(p.comissao_percentual, 0) / 100.0),
                  0
                )
              ELSE 0 END
            ), 0) as total_pago
          `)
        );

      const mergedByAgenteId = new Map();
      for (const r of servicoRows || []) {
        const agenteId = Number(r.agente_id);
        mergedByAgenteId.set(agenteId, {
          agente_id: agenteId,
          agente_nome: r.agente_nome,
          total_pendente_cents: toCents(r.total_pendente),
          total_pago_cents: toCents(r.total_pago)
        });
      }
      for (const r of produtoRows || []) {
        const agenteId = Number(r.agente_id);
        const existing = mergedByAgenteId.get(agenteId);
        const pendenteCents = toCents(r.total_pendente);
        const pagoCents = toCents(r.total_pago);
        if (existing) {
          existing.total_pendente_cents = Number(existing.total_pendente_cents || 0) + pendenteCents;
          existing.total_pago_cents = Number(existing.total_pago_cents || 0) + pagoCents;
        } else {
          mergedByAgenteId.set(agenteId, {
            agente_id: agenteId,
            agente_nome: r.agente_nome,
            total_pendente_cents: pendenteCents,
            total_pago_cents: pagoCents
          });
        }
      }

      const rows = Array.from(mergedByAgenteId.values())
        .map((r) => ({
          agente_id: r.agente_id,
          agente_nome: r.agente_nome,
          total_pendente: centsToDecimal(r.total_pendente_cents || 0),
          total_pago: centsToDecimal(r.total_pago_cents || 0)
        }))
        .sort((a, b) => (b.total_pendente || 0) - (a.total_pendente || 0));

      return res.json({
        success: true,
        data: {
          unidade_id: unidadeId,
          data_inicio,
          data_fim,
          ranking: rows
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

      // ✅ Extrato: serviços em agendamentos concluídos e pagos
      const servicoRows = await db('agendamento_servicos as asv')
        .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
        .leftJoin('servicos as s', 's.id', 'asv.servico_id')
        .leftJoin('clientes as c', 'c.id', 'a.cliente_id')
        .where('a.unidade_id', unidadeId)
        .whereNull('a.deleted_at')
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
          db.raw("(TRIM(CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))) || CASE WHEN c.deleted_at IS NOT NULL THEN ' [Excluído]' ELSE '' END) as cliente_nome"),
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

      const vendaProdutoRows = await db('venda_itens as vi')
        .join('vendas as v', 'v.id', 'vi.venda_id')
        .where('v.usuario_id', usuarioId)
        .where('v.unidade_id', unidadeId)
        .where('v.status', 'PAID')
        .where('vi.item_type', 'PRODUTO')
        .where('vi.agente_id', agenteId)
        .where('v.created_at', '>=', `${data_inicio}T00:00:00-03:00`)
        .where('v.created_at', '<=', `${data_fim}T23:59:59-03:00`)
        .where(db.raw('COALESCE(vi.comissao_percentual_snapshot, 0) > 0'))
        .select(
          'vi.id as agendamento_servico_id',
          db.raw('NULL::integer as agendamento_id'),
          db.raw('NULL::date as data_agendamento'),
          db.raw('NULL::text as hora_inicio'),
          db.raw('NULL::text as hora_fim'),
          db.raw('NULL::integer as cliente_id'),
          db.raw("'' as cliente_nome"),
          db.raw('NULL::integer as servico_id'),
          db.raw("('Venda Balcão #' || COALESCE(v.id::text, '') || ' - ' || COALESCE(vi.descricao_snapshot, 'Produto') || ' (' || REPLACE(TO_CHAR(COALESCE(vi.comissao_percentual_snapshot, 0), 'FM999999990D00'), '.', ',') || '%)') as servico_nome"),
          db.raw('COALESCE(vi.total_snapshot, 0) as preco_aplicado'),
          db.raw('COALESCE(vi.comissao_percentual_snapshot, 0) as comissao_percentual'),
          db.raw('COALESCE(vi.comissao_valor_snapshot, 0) as comissao_valor'),
          db.raw('NULL::timestamp as data_pagamento_comissao'),
          db.raw('NULL::text as observacao_pagamento')
        )
        .orderBy('v.created_at', statusComissao === 'pago' ? 'desc' : 'asc');

      // ✅ Extrato: produtos com comissão > 0 (ignorar comissão 0)
      const produtoRows = await db('agendamento_produtos as ap')
        .join('agendamentos as a', 'a.id', 'ap.agendamento_id')
        .join('produtos as p', 'p.id', 'ap.produto_id')
        .leftJoin('clientes as c', 'c.id', 'a.cliente_id')
        .where('a.unidade_id', unidadeId)
        .whereNull('a.deleted_at')
        .where('ap.agente_id', agenteId)
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim)
        .where('a.status', 'Concluído')
        .where('a.status_pagamento', 'Pago')
        .where(db.raw('COALESCE(ap.comissao_percentual_snapshot, p.comissao_percentual, 0) > 0'))
        .where('ap.comissao_paga', statusComissao === 'pago')
        .select(
          'ap.id as agendamento_servico_id',
          'ap.agendamento_id',
          'a.data_agendamento',
          'a.hora_inicio',
          'a.hora_fim',
          'a.cliente_id',
          db.raw("(TRIM(CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))) || CASE WHEN c.deleted_at IS NOT NULL THEN ' [Excluído]' ELSE '' END) as cliente_nome"),
          db.raw('NULL::integer as servico_id'),
          db.raw("('Produto: ' || (COALESCE(p.nome, '') || CASE WHEN p.deleted_at IS NOT NULL THEN ' [Excluído]' ELSE '' END) || ' - R$ ' || REPLACE(TO_CHAR(COALESCE(ap.preco_aplicado, 0), 'FM999999990D00'), '.', ',') || ' (' || REPLACE(TO_CHAR(COALESCE(ap.comissao_percentual_snapshot, p.comissao_percentual, 0), 'FM999999990D00'), '.', ',') || '%)') as servico_nome"),
          db.raw('COALESCE(ap.preco_aplicado, 0) as preco_aplicado'),
          db.raw('COALESCE(ap.comissao_percentual_snapshot, p.comissao_percentual, 0) as comissao_percentual'),
          db.raw(
            `COALESCE(
              ap.comissao_valor_snapshot,
              (COALESCE(ap.preco_aplicado, 0) * COALESCE(ap.quantidade, 0)) * (COALESCE(p.comissao_percentual, 0) / 100.0),
              0
            ) as comissao_valor`
          ),
          'ap.data_pagamento_comissao',
          'ap.observacao_pagamento'
        )
        .orderBy(
          statusComissao === 'pago' ? 'ap.data_pagamento_comissao' : 'a.data_agendamento',
          statusComissao === 'pago' ? 'desc' : 'asc'
        )
        .orderBy('a.hora_inicio', 'asc');

      const rows = [...(servicoRows || []), ...(produtoRows || []), ...(vendaProdutoRows || [])].sort((a, b) => {
        const da = String(a.data_agendamento || '');
        const dbb = String(b.data_agendamento || '');
        if (da !== dbb) {
          return statusComissao === 'pago' ? (dbb > da ? 1 : -1) : (da > dbb ? 1 : -1);
        }
        const ha = String(a.hora_inicio || '');
        const hb = String(b.hora_inicio || '');
        return ha > hb ? 1 : ha < hb ? -1 : 0;
      });

      const totalServicoRow = await db('agendamento_servicos as asv')
        .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
        .leftJoin('servicos as s', 's.id', 'asv.servico_id')
        .where('a.unidade_id', unidadeId)
        .whereNull('a.deleted_at')
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

      const totalProdutoRow = await db('agendamento_produtos as ap')
        .join('agendamentos as a', 'a.id', 'ap.agendamento_id')
        .join('produtos as p', 'p.id', 'ap.produto_id')
        .where('a.unidade_id', unidadeId)
        .whereNull('a.deleted_at')
        .where('ap.agente_id', agenteId)
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim)
        .where('a.status', 'Concluído')
        .where('a.status_pagamento', 'Pago')
        .where(db.raw('COALESCE(ap.comissao_percentual_snapshot, p.comissao_percentual, 0) > 0'))
        .where('ap.comissao_paga', statusComissao === 'pago')
        .sum({
          total: db.raw(
            `COALESCE(
              ap.comissao_valor_snapshot,
              (COALESCE(ap.preco_aplicado, 0) * COALESCE(ap.quantidade, 0)) * (COALESCE(p.comissao_percentual, 0) / 100.0),
              0
            )`
          )
        })
        .first();

      const totalPendenteCents = toCents(totalServicoRow?.total) + toCents(totalProdutoRow?.total);

      return res.json({
        success: true,
        data: {
          unidade_id: unidadeId,
          agente_id: agenteId,
          data_inicio,
          data_fim,
          status_comissao: statusComissao,
          total_pendente: centsToDecimal(totalPendenteCents),
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
            preco_aplicado: centsToDecimal(toCents(r.preco_aplicado)),
            comissao_percentual: Number(String(r.comissao_percentual || 0).replace(',', '.')) || 0,
            comissao_valor: centsToDecimal(toCents(r.comissao_valor)),
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

      // Period Lock: bloquear pagamento de comissão em período fechado.
      // Regra base: nada contábil do passado deve ser mutável.
      await assertPeriodoAberto({
        unidadeId,
        recordDate: paidAt,
        userRole,
        errorMessage: 'Período fechado: não é permitido pagar comissões de meses anteriores.'
      });

      if (hasPeriodo) {
        await assertPeriodoAberto({
          unidadeId,
          recordDate: parseYmdToLocalDate(data_inicio),
          userRole,
          errorMessage: 'Período fechado: não é permitido pagar comissões de meses anteriores.'
        });
      }

      const result = await db.transaction(async (trx) => {
        if (hasIds) {
          // Quando a seleção é por IDs, checar a data mínima dos itens-alvo.
          const idsParsed = (ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);

          const minServicoRow = await trx('agendamento_servicos as asv')
            .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
            .where('a.unidade_id', unidadeId)
            .whereNull('a.deleted_at')
            .where('a.agente_id', agenteId)
            .whereIn('asv.id', idsParsed)
            .min({ min_data: 'a.data_agendamento' })
            .first();

          const minData = minServicoRow?.min_data;
          if (minData) {
            await assertPeriodoAberto({
              unidadeId,
              recordDate: parseYmdToLocalDate(minData),
              userRole,
              errorMessage: 'Período fechado: não é permitido pagar comissões de meses anteriores.'
            });
          }
        }

        let targetQuery = trx('agendamento_servicos as asv')
          .join('agendamentos as a', 'a.id', 'asv.agendamento_id')
          .where('a.unidade_id', unidadeId)
          .whereNull('a.deleted_at')
          .where('a.agente_id', agenteId)
          .where('a.status', 'Concluído')
          .where('a.status_pagamento', 'Pago')
          .where('asv.comissao_paga', false);

        let targetProdutosByPeriodo = trx('agendamento_produtos as ap')
          .join('agendamentos as a', 'a.id', 'ap.agendamento_id')
          .join('produtos as p', 'p.id', 'ap.produto_id')
          .where('a.unidade_id', unidadeId)
          .whereNull('a.deleted_at')
          .where('ap.agente_id', agenteId)
          .where('a.status', 'Concluído')
          .where('a.status_pagamento', 'Pago')
          .where('p.comissao_percentual', '>', 0)
          .where('ap.comissao_paga', false);

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

          targetProdutosByPeriodo = targetProdutosByPeriodo
            .where('a.data_agendamento', '>=', data_inicio)
            .where('a.data_agendamento', '<=', data_fim);
        }

        // Total a pagar (antes de marcar pago)
        const totalServicoRow = await targetQuery
          .clone()
          .leftJoin('servicos as s', 's.id', 'asv.servico_id')
          .sum({
            total: trx.raw(
              'COALESCE(asv.preco_aplicado, 0) * (COALESCE(asv.comissao_percentual_aplicada, s.comissao_percentual, 0) / 100.0)'
            )
          })
          .first();

        const totalProdutoRow = hasPeriodo
          ? await targetProdutosByPeriodo
            .clone()
            .sum({
              total: trx.raw(
                '(COALESCE(ap.preco_aplicado, 0) * COALESCE(ap.quantidade, 0)) * (COALESCE(p.comissao_percentual, 0) / 100.0)'
              )
            })
            .first()
          : { total: 0 };

        const totalPago = (Number(totalServicoRow?.total) || 0) + (Number(totalProdutoRow?.total) || 0);

        // Update idempotente: só atualiza o que ainda está pendente
        let updatedCount = 0;

        if (hasPeriodo) {
          updatedCount = await trx('agendamento_servicos')
            .whereIn('id', function() {
              this.select('asv.id')
                .from('agendamento_servicos as asv')
                .innerJoin('agendamentos as a', 'a.id', 'asv.agendamento_id')
                .where('a.unidade_id', unidadeId)
                .andWhereNull('a.deleted_at')
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

          await trx('agendamento_produtos')
            .whereIn('id', function() {
              this.select('ap.id')
                .from('agendamento_produtos as ap')
                .innerJoin('agendamentos as a', 'a.id', 'ap.agendamento_id')
                .innerJoin('produtos as p', 'p.id', 'ap.produto_id')
                .where('a.unidade_id', unidadeId)
                .andWhereNull('a.deleted_at')
                .andWhere('ap.agente_id', agenteId)
                .andWhere('a.status', 'Concluído')
                .andWhere('a.status_pagamento', 'Pago')
                .andWhere('p.comissao_percentual', '>', 0)
                .andWhere('ap.comissao_paga', false)
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
      if (error?.code === 'PERIODO_FECHADO') {
        return res.status(409).json({
          success: false,
          code: 'PERIODO_FECHADO',
          error: error.message
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Erro ao pagar comissões',
        message: error.message
      });
    }
  }
}

module.exports = ComissaoController;

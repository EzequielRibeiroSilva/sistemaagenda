const { db } = require('../config/knex');
const logger = require('../utils/logger');
const { startOfDay, endOfDay } = require('../utils/timezone');

class FluxoCaixaController {
  // GET /api/financeiro/extrato?unidade_id=1&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD&page=1&pageSize=50&origem=ALL
  async extrato(req, res) {
    try {
      const { data_inicio, data_fim, unidade_id, origem } = req.query;

      const unidadeId = unidade_id ? Number(unidade_id) : null;
      const dataInicio = data_inicio ? String(data_inicio).trim() : null;
      const dataFim = data_fim ? String(data_fim).trim() : null;

      // 🎯 FILTRO DE ORIGEM SERVER-SIDE: Normalização com defaults seguros
      const origemRaw = origem ? String(origem).trim().toUpperCase() : 'ALL';
      const origemNorm = ['ALL', 'COMANDAS', 'BALCAO'].includes(origemRaw) ? origemRaw : 'ALL';

      // 🚀 PAGINAÇÃO SERVER-SIDE: Parâmetros com defaults seguros
      const pageRaw = Number(req.query?.page);
      const pageSizeRaw = Number(req.query?.pageSize || req.query?.page_size);

      // Padrões: page=1, pageSize=50
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
      const pageSizeRequested = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : 50;

      // 🛡️ Hard Limit: pageSize máximo = 200 (prevenção de DoS)
      const pageSize = Math.min(pageSizeRequested, 200);

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

      const startTs = startOfDay(dataInicio);
      const endTs = endOfDay(dataFim);

      // 🚀 PAGINAÇÃO SQL SERVER-SIDE: UNION ALL com ORDER BY e LIMIT/OFFSET
      // Consolidamos as 3 fontes (entradas, estornos, saídas) em uma única query otimizada
      
      const offset = (page - 1) * pageSize;

      // Subquery 1: ENTRADAS (venda_pagamentos de vendas PAID)
      const entradasQuery = db('venda_pagamentos as vp')
        .join('vendas as v', 'v.id', 'vp.venda_id')
        .leftJoin('agendamentos as a', 'a.id', 'v.agendamento_id')
        .leftJoin('clientes as c', 'c.id', 'a.cliente_id')
        .where('v.usuario_id', usuarioId)
        .where('v.unidade_id', unidadeId)
        .where('v.status', 'PAID')
        .where(function() {
          this.whereNull('v.agendamento_id').orWhereNull('a.deleted_at');
        })
        // 🎯 FILTRO DE ORIGEM: Discriminador por agendamento_id
        .where(function() {
          if (origemNorm === 'COMANDAS') {
            // Apenas vendas vinculadas a agendamentos (comandas)
            this.whereNotNull('v.agendamento_id');
          } else if (origemNorm === 'BALCAO') {
            // Apenas vendas avulsas (sem agendamento)
            this.whereNull('v.agendamento_id');
          }
          // Se origemNorm === 'ALL', não aplica filtro (retorna todos)
        })
        .where((qb) => {
          qb.whereBetween('vp.paid_at', [startTs, endTs]).orWhere((qb2) => {
            qb2.whereNull('vp.paid_at').whereBetween('vp.created_at', [startTs, endTs]);
          });
        })
        .select(
          db.raw("'ENTRADA' as tipo"),
          'vp.valor',
          db.raw('COALESCE(vp.paid_at, vp.created_at) as data'),
          db.raw('vp.metodo as metodo'),
          db.raw(`
            CASE 
              WHEN v.agendamento_id IS NULL THEN CONCAT('Venda Balcão #', v.id)
              ELSE CONCAT(
                'Comanda #', v.agendamento_id,
                CASE WHEN c.id IS NOT NULL THEN 
                  CONCAT(' - ', TRIM(CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))),
                  CASE WHEN c.deleted_at IS NOT NULL THEN ' [Excluído]' ELSE '' END)
                ELSE '' END
              )
            END as descricao
          `),
          db.raw("NULL as criado_por_email")
        );

      // Subquery 2: ESTORNOS (vendas REFUNDED)
      const estornosQuery = db('venda_pagamentos as vp')
        .join('vendas as v', 'v.id', 'vp.venda_id')
        .leftJoin('agendamentos as a', 'a.id', 'v.agendamento_id')
        .leftJoin('clientes as c', 'c.id', 'a.cliente_id')
        .where('v.usuario_id', usuarioId)
        .where('v.unidade_id', unidadeId)
        .where('v.status', 'REFUNDED')
        .where(function() {
          this.whereNull('v.agendamento_id').orWhereNull('a.deleted_at');
        })
        // 🎯 FILTRO DE ORIGEM: Discriminador por agendamento_id
        .where(function() {
          if (origemNorm === 'COMANDAS') {
            this.whereNotNull('v.agendamento_id');
          } else if (origemNorm === 'BALCAO') {
            this.whereNull('v.agendamento_id');
          }
        })
        .whereBetween('v.updated_at', [startTs, endTs])
        .select(
          db.raw("'SAIDA' as tipo"),
          db.raw('(-1 * vp.valor) as valor'),
          db.raw('v.updated_at as data'),
          db.raw('vp.metodo as metodo'),
          db.raw(`
            CASE 
              WHEN v.agendamento_id IS NULL THEN CONCAT('Estorno - Venda Balcão #', v.id)
              ELSE CONCAT(
                'Estorno - Comanda #', v.agendamento_id,
                CASE WHEN c.id IS NOT NULL THEN 
                  CONCAT(' - ', TRIM(CONCAT(COALESCE(c.primeiro_nome, ''), ' ', COALESCE(c.ultimo_nome, ''))),
                  CASE WHEN c.deleted_at IS NOT NULL THEN ' [Excluído]' ELSE '' END)
                ELSE '' END
              )
            END as descricao
          `),
          db.raw("NULL as criado_por_email")
        );

      // Subquery 3: SAÍDAS (despesas pagas)
      const saidasQuery = db('despesas as d')
        .leftJoin('usuarios as criador', 'd.criado_por', 'criador.id')
        .where('d.usuario_id', usuarioId)
        .where('d.unidade_id', unidadeId)
        .where((qb) => {
          qb.where('d.status', 'PAID').orWhere((qb2) => {
            qb2.where('d.status', 'REVERSED').where('d.is_estorno', true);
          });
        })
        .whereBetween(db.raw('COALESCE(d.data_pagamento, d.updated_at)'), [startTs, endTs])
        .select(
          db.raw("'SAIDA' as tipo"),
          db.raw('(-1 * d.valor) as valor'),
          db.raw('COALESCE(d.data_pagamento, d.updated_at) as data'),
          db.raw('d.forma_pagamento as metodo'),
          db.raw('d.descricao as descricao'),
          db.raw('criador.email as criado_por_email')
        );

      // 🔗 UNION ALL: Combinar as 3 queries em uma única
      const unionQuery = db.raw(`
        (${entradasQuery.toString()})
        UNION ALL
        (${estornosQuery.toString()})
        UNION ALL
        (${saidasQuery.toString()})
      `);

      // 📊 QUERY PAGINADA: ORDER BY + LIMIT + OFFSET no banco
      const transacoesPaginadas = await db
        .select('*')
        .from(db.raw(`(${unionQuery}) as transacoes`))
        .orderBy([
          { column: 'data', order: 'desc' },
          { column: 'tipo', order: 'asc' } // ENTRADA antes de SAIDA em caso de empate
        ])
        .limit(pageSize)
        .offset(offset);

      // 🔢 COUNT TOTAL: Mesma lógica de filtragem, mas apenas contagem
      const countResult = await db
        .count('* as total')
        .from(db.raw(`(${unionQuery}) as transacoes`))
        .first();

      const totalTransacoes = Number(countResult?.total) || 0;
      const totalPages = Math.ceil(totalTransacoes / pageSize);

      // 📈 CÁLCULOS DE RESUMO: Queries dedicadas para performance
      // (Não podemos usar apenas a página atual, precisamos do total do período)
      
      // Total de ENTRADAS
      const resumoEntradas = await db('venda_pagamentos as vp')
        .join('vendas as v', 'v.id', 'vp.venda_id')
        .leftJoin('agendamentos as a', 'a.id', 'v.agendamento_id')
        .where('v.usuario_id', usuarioId)
        .where('v.unidade_id', unidadeId)
        .where('v.status', 'PAID')
        .where(function() {
          this.whereNull('v.agendamento_id').orWhereNull('a.deleted_at');
        })
        // 🎯 FILTRO DE ORIGEM: Mesmo filtro aplicado nas entradas
        .where(function() {
          if (origemNorm === 'COMANDAS') {
            this.whereNotNull('v.agendamento_id');
          } else if (origemNorm === 'BALCAO') {
            this.whereNull('v.agendamento_id');
          }
        })
        .where((qb) => {
          qb.whereBetween('vp.paid_at', [startTs, endTs]).orWhere((qb2) => {
            qb2.whereNull('vp.paid_at').whereBetween('vp.created_at', [startTs, endTs]);
          });
        })
        .sum('vp.valor as total')
        .first();

      // Total de ESTORNOS
      const resumoEstornos = await db('venda_pagamentos as vp')
        .join('vendas as v', 'v.id', 'vp.venda_id')
        .leftJoin('agendamentos as a', 'a.id', 'v.agendamento_id')
        .where('v.usuario_id', usuarioId)
        .where('v.unidade_id', unidadeId)
        .where('v.status', 'REFUNDED')
        .where(function() {
          this.whereNull('v.agendamento_id').orWhereNull('a.deleted_at');
        })
        // 🎯 FILTRO DE ORIGEM: Mesmo filtro aplicado nos estornos
        .where(function() {
          if (origemNorm === 'COMANDAS') {
            this.whereNotNull('v.agendamento_id');
          } else if (origemNorm === 'BALCAO') {
            this.whereNull('v.agendamento_id');
          }
        })
        .whereBetween('v.updated_at', [startTs, endTs])
        .sum('vp.valor as total')
        .first();

      // Total de SAÍDAS (despesas)
      const resumoSaidas = await db('despesas as d')
        .where('d.usuario_id', usuarioId)
        .where('d.unidade_id', unidadeId)
        .where((qb) => {
          qb.where('d.status', 'PAID').orWhere((qb2) => {
            qb2.where('d.status', 'REVERSED').where('d.is_estorno', true);
          });
        })
        .whereBetween(db.raw('COALESCE(d.data_pagamento, d.updated_at)'), [startTs, endTs])
        .sum('d.valor as total')
        .first();

      const totalEntradas = Number(resumoEntradas?.total) || 0;
      const totalEstornos = Number(resumoEstornos?.total) || 0;
      const totalSaidasDespesas = Number(resumoSaidas?.total) || 0;
      
      const totalSaidasAbs = Number((totalEstornos + totalSaidasDespesas).toFixed(2));
      const saldoPeriodo = Number((totalEntradas - totalSaidasAbs).toFixed(2));

      // 🔍 DEBUG: Log para rastreamento (pode ser removido em produção)
      logger.info('[FluxoCaixaController.extrato] Resposta SQL Server-Side gerada:', {
        origem: origemNorm,
        totalTransacoes,
        transacoesPaginadas: transacoesPaginadas.length,
        totalEntradas,
        totalSaidasAbs,
        saldoPeriodo,
        page,
        pageSize,
        offset
      });

      return res.status(200).json({
        success: true,
        data: transacoesPaginadas,
        resumo: {
          total_entradas: totalEntradas,
          total_saidas: totalSaidasAbs,
          saldo_periodo: saldoPeriodo
        },
        meta: {
          total: totalTransacoes,
          page,
          pageSize,
          totalPages
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

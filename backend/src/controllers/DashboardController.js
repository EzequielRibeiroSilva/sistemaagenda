const { db } = require('../config/knex');

class DashboardController {
  async clubIntelligence(req, res) {
    try {
      const { data_inicio, data_fim, unidade_id } = req.query;

      if (!data_inicio || !data_fim) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          message: 'data_inicio e data_fim são obrigatórios'
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

      const unidadeId = unidade_id ? Number(unidade_id) : null;
      if (unidade_id && (!Number.isFinite(unidadeId) || unidadeId <= 0)) {
        return res.status(400).json({
          success: false,
          error: 'unidade_id inválido'
        });
      }

      if (Number.isFinite(unidadeId)) {
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
      }

      const baseUnidades = db('unidades').where('usuario_id', usuarioId);
      if (Number.isFinite(unidadeId)) {
        baseUnidades.andWhere('id', unidadeId);
      }

      const unidadesRows = await baseUnidades.clone().select('id');
      const unidadeIds = (unidadesRows || []).map((u) => u.id);

      if (unidadeIds.length === 0) {
        return res.json({
          success: true,
          data: {
            mrr: 0,
            receita_avulsa: 0,
            receita_total: 0,
            percentual_clube: 0,
            ticket_medio_assinante: 0,
            ticket_medio_comum: 0,
            churn_pct: 0,
            canceladas_periodo: 0,
            ativas_atuais: 0
          }
        });
      }

      const startTs = new Date(`${data_inicio}T00:00:00-03:00`);
      const endTs = new Date(`${data_fim}T23:59:59-03:00`);

      let mrr = 0;
      try {
        const hasRenovacoes = await db.schema.hasTable('assinatura_renovacoes');
        if (hasRenovacoes) {
          const hasValorPago = await db.schema.hasColumn('assinatura_renovacoes', 'valor_pago');
          if (hasValorPago) {
            const rows = await db('assinatura_renovacoes as ar')
              .join('clientes as c', 'ar.cliente_id', 'c.id')
              .whereIn('c.unidade_id', unidadeIds)
              .where('ar.data_renovacao', '>=', startTs)
              .where('ar.data_renovacao', '<=', endTs)
              .sum('ar.valor_pago as total')
              .first();
            mrr = Number(rows?.total) || 0;
          } else {
            mrr = 0;
          }
        }
      } catch (err) {
        if (!(err && err.code === '42P01')) {
          throw err;
        }
      }

      const hasAssinaturaUsos = await db.schema.hasTable('assinatura_usos');

      const completedAppointmentsQuery = db('agendamentos as a')
        .join('clientes as c', 'a.cliente_id', 'c.id')
        .whereIn('a.unidade_id', unidadeIds)
        .where('a.status', 'Concluído')
        .where('a.data_agendamento', '>=', data_inicio)
        .where('a.data_agendamento', '<=', data_fim);

      if (hasAssinaturaUsos) {
        completedAppointmentsQuery
          .leftJoin('assinatura_usos as au', 'au.agendamento_id', 'a.id')
          .groupBy('a.id', 'a.valor_total', 'c.assinatura_status')
          .select(
            'a.valor_total',
            db.raw('COUNT(au.id) > 0 as coberto_clube'),
            'c.assinatura_status'
          );
      } else {
        completedAppointmentsQuery.select(
          'a.valor_total',
          db.raw('false as coberto_clube'),
          'c.assinatura_status'
        );
      }

      const completedAppointments = await completedAppointmentsQuery;

      let receitaAvulsa = 0;
      let receitaExtraAssinantes = 0;
      let totalComum = 0;
      let countComum = 0;

      for (const row of completedAppointments) {
        const valor = Number(row.valor_total) || 0;
        const cobertoClube = Boolean(row.coberto_clube);
        const assinaturaAtiva = String(row.assinatura_status || '') === 'Ativo';

        if (!cobertoClube) {
          receitaAvulsa += valor;
        }

        // ✅ Extras pagos por assinantes: agendamentos concluídos não cobertos pelo clube
        if (assinaturaAtiva && !cobertoClube) {
          receitaExtraAssinantes += valor;
        }

        if (!assinaturaAtiva) {
          totalComum += valor;
          countComum += 1;
        }
      }

      const ticketComum = countComum > 0 ? totalComum / countComum : 0;

      const [{ count: ativasRaw }, { count: canceladasRaw }] = await Promise.all([
        db('clientes')
          .whereIn('unidade_id', unidadeIds)
          .where('is_assinante', true)
          .where('assinatura_status', 'Ativo')
          .count('* as count')
          .first(),
        db('clientes')
          .whereIn('unidade_id', unidadeIds)
          .where('is_assinante', true)
          .where('assinatura_status', 'Cancelado')
          .where('mp_last_event_at', '>=', startTs)
          .where('mp_last_event_at', '<=', endTs)
          .count('* as count')
          .first()
      ]);

      const ativasAtuais = parseInt(ativasRaw, 10) || 0;
      const canceladasPeriodo = parseInt(canceladasRaw, 10) || 0;
      const churnBase = ativasAtuais + canceladasPeriodo;
      const churnPct = churnBase > 0 ? (canceladasPeriodo / churnBase) * 100 : 0;

      const ticketAssinanteFinal = ativasAtuais > 0 ? (mrr + receitaExtraAssinantes) / ativasAtuais : 0;

      const receitaTotal = mrr + receitaAvulsa;
      const percentualClube = receitaTotal > 0 ? (mrr / receitaTotal) * 100 : 0;

      return res.json({
        success: true,
        data: {
          mrr,
          receita_avulsa: receitaAvulsa,
          receita_total: receitaTotal,
          percentual_clube: percentualClube,
          ticket_medio_assinante: ticketAssinanteFinal,
          ticket_medio_comum: ticketComum,
          churn_pct: churnPct,
          canceladas_periodo: canceladasPeriodo,
          ativas_atuais: ativasAtuais
        }
      });
    } catch (error) {
      console.error('[DashboardController.clubIntelligence] Erro:', {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        hint: error?.hint,
        where: error?.where,
        stack: error?.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar inteligência do clube',
        message: error.message
      });
    }
  }

  async stats(req, res) {
    try {
      const { data_inicio, data_fim } = req.query;

      if (!data_inicio || !data_fim) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          message: 'data_inicio e data_fim são obrigatórios'
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

      const baseClientes = db('clientes')
        .join('unidades', 'clientes.unidade_id', 'unidades.id')
        .where('unidades.usuario_id', usuarioId);

      const [{ count: assinaturasAtivasRaw }, { count: assinaturasPendentesRaw }] = await Promise.all([
        baseClientes
          .clone()
          .where('clientes.is_assinante', true)
          .where('clientes.assinatura_status', 'Ativo')
          .count('* as count')
          .first(),
        baseClientes
          .clone()
          .where('clientes.assinatura_status', 'Pagamento Pendente')
          .count('* as count')
          .first()
      ]);

      const assinaturas_ativas = parseInt(assinaturasAtivasRaw, 10) || 0;
      const assinaturas_pendentes = parseInt(assinaturasPendentesRaw, 10) || 0;

      let cotas_consumidas = 0;
      try {
        const startTs = new Date(`${data_inicio}T00:00:00-03:00`);
        const endTs = new Date(`${data_fim}T23:59:59-03:00`);
        const [{ count: cotasConsumidasRaw }] = await Promise.all([
          db('assinatura_usos')
            .join('clientes', 'assinatura_usos.cliente_id', 'clientes.id')
            .join('unidades', 'clientes.unidade_id', 'unidades.id')
            .where('unidades.usuario_id', usuarioId)
            .where('assinatura_usos.data_uso', '>=', startTs)
            .where('assinatura_usos.data_uso', '<=', endTs)
            .count('* as count')
            .first()
        ]);

        cotas_consumidas = parseInt(cotasConsumidasRaw, 10) || 0;
      } catch (err) {
        if (!(err && err.code === '42P01')) {
          throw err;
        }
      }

      return res.json({
        success: true,
        data: {
          assinaturas_ativas,
          assinaturas_pendentes,
          cotas_consumidas
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar métricas do dashboard',
        message: error.message
      });
    }
  }
}

module.exports = DashboardController;

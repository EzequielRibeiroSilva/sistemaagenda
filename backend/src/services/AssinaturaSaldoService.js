class AssinaturaSaldoService {
  constructor({ db, getDateStrInTimeZone, normalizeDateStr, getCycleBounds }) {
    this.db = db;
    this.getDateStrInTimeZone = getDateStrInTimeZone;
    this.normalizeDateStr = normalizeDateStr;
    this.getCycleBounds = getCycleBounds;
  }

  addDaysStr(dateStr, days) {
    const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
    const base = Date.UTC(y, (m || 1) - 1, d || 1);
    const next = base + (parseInt(days, 10) || 0) * 86400000;
    const dt = new Date(next);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  parseCsvIds(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .flatMap(v => String(v).split(','))
        .map(v => parseInt(String(v).trim(), 10))
        .filter(n => Number.isFinite(n));
    }
    return String(value)
      .split(',')
      .map(v => parseInt(String(v).trim(), 10))
      .filter(n => Number.isFinite(n));
  }

  async compute({ cliente, unidadeUsuarioId, unidadeId, dataReferencia, servicoIds, servicoExtraIds, dbConn }) {
    const conn = dbConn || this.db;
    const assinaturaStatus = cliente?.assinatura_status || null;
    const assinaturaBloqueada = Boolean(cliente?.is_assinante) && assinaturaStatus !== 'Ativo';

    const respostaBase = {
      success: true,
      data: {
        cliente: cliente
          ? {
              id: cliente.id,
              nome: `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim(),
              telefone: cliente.telefone,
              data_nascimento: cliente.data_nascimento,
              is_assinante: Boolean(cliente.is_assinante),
              assinatura_status: assinaturaStatus
            }
          : null,
        assinatura_ativa: false,
        plano: null,
        ciclo: null,
        saldos: [],
        ...(assinaturaBloqueada ? { motivo_bloqueio: assinaturaStatus || 'INATIVO' } : {})
      }
    };

    if (!cliente || !cliente.is_assinante || !cliente.assinatura_plano_id || !cliente.data_inicio_assinatura || cliente.status !== 'Ativo' || assinaturaBloqueada) {
      return respostaBase;
    }

    const plano = await conn('planos_assinatura')
      .where('id', cliente.assinatura_plano_id)
      .where('usuario_id', unidadeUsuarioId)
      .where('status', 'Ativo')
      .select('id', 'nome', 'validade_dias')
      .first();

    if (!plano) {
      return respostaBase;
    }

    const validadeDias = parseInt(plano.validade_dias, 10) || 31;
    const tz = 'America/Sao_Paulo';
    const referencia = dataReferencia || this.getDateStrInTimeZone(tz);
    const referenciaTs = new Date();

    let cycleStart = null;
    let cycleEndExclusive = null;
    let cycleEndInclusive = null;
    let cycleIndex = null;

    let cycleStartTs = null;
    let cycleEndExclusiveTs = null;

    const hasRenovacoesTable = await conn.schema.hasTable('assinatura_renovacoes');
    let bloqueioFinanceiro = false;
    if (hasRenovacoesTable) {
      const renovacao = await conn('assinatura_renovacoes')
        .where('cliente_id', cliente.id)
        .orderBy('data_renovacao', 'desc')
        .first();

      if (!renovacao?.data_renovacao) {
        bloqueioFinanceiro = true;
      }

      if (renovacao?.data_renovacao) {
        const startTs = new Date(renovacao.data_renovacao);
        const endExclusiveTs = new Date(startTs.getTime() + (parseInt(validadeDias, 10) || 31) * 86400000);

        if (referenciaTs >= startTs && referenciaTs < endExclusiveTs) {
          cycleStartTs = startTs;
          cycleEndExclusiveTs = endExclusiveTs;
          cycleStart = this.normalizeDateStr(renovacao.ciclo_inicio || startTs);
          cycleEndInclusive = this.normalizeDateStr(renovacao.ciclo_fim || this.addDaysStr(cycleStart, (parseInt(validadeDias, 10) || 31) - 1));
          cycleEndExclusive = this.addDaysStr(cycleEndInclusive, 1);
          cycleIndex = 0;
        }
      }
    }

    if (!cycleStart || !cycleEndExclusive || !cycleEndInclusive) {
      if (hasRenovacoesTable) {
        bloqueioFinanceiro = true;
      }
      const dataInicioAssinaturaStr = this.normalizeDateStr(cliente.data_inicio_assinatura);
      if (!dataInicioAssinaturaStr) {
        return respostaBase;
      }

      const bounds = this.getCycleBounds({
        startDateStr: dataInicioAssinaturaStr,
        validadeDias,
        referenceDateStr: referencia
      });
      cycleStart = bounds.cycleStart;
      cycleEndExclusive = bounds.cycleEndExclusive;
      cycleEndInclusive = bounds.cycleEndInclusive;
      cycleIndex = bounds.cycleIndex;

      cycleStartTs = new Date(`${cycleStart}T00:00:00-03:00`);
      cycleEndExclusiveTs = new Date(`${cycleEndExclusive}T00:00:00-03:00`);
    }

    if (!cycleStartTs || !cycleEndExclusiveTs) {
      cycleStartTs = new Date(`${cycleStart}T00:00:00-03:00`);
      cycleEndExclusiveTs = new Date(`${cycleEndExclusive}T00:00:00-03:00`);
    }

    const itens = await conn('planos_assinatura_itens')
      .where('plano_id', plano.id)
      .select('id', 'tipo', 'servico_id', 'servico_extra_id', 'quantidade_por_ciclo');

    const itemIds = (itens || []).map(i => parseInt(i.id, 10)).filter(n => Number.isFinite(n));

    const planoServicoIds = (itens || [])
      .filter(i => i.tipo === 'SERVICO' && i.servico_id)
      .map(i => parseInt(i.servico_id, 10))
      .filter(n => Number.isFinite(n));

    const planoExtraIds = (itens || [])
      .filter(i => i.tipo === 'EXTRA' && i.servico_extra_id)
      .map(i => parseInt(i.servico_extra_id, 10))
      .filter(n => Number.isFinite(n));

    const [servicos, extras] = await Promise.all([
      planoServicoIds.length > 0
        ? conn('servicos').whereIn('id', planoServicoIds).select('id', 'nome')
        : Promise.resolve([]),
      planoExtraIds.length > 0
        ? conn('servicos_extras').whereIn('id', planoExtraIds).select('id', 'nome')
        : Promise.resolve([])
    ]);

    const servicoNomeById = (servicos || []).reduce((acc, row) => {
      acc[String(row.id)] = row.nome;
      return acc;
    }, {});

    const extraNomeById = (extras || []).reduce((acc, row) => {
      acc[String(row.id)] = row.nome;
      return acc;
    }, {});

    let usadosRows = [];
    if (itemIds.length > 0) {
      try {
        // O saldo considera todos os usos no ciclo pelo timestamp (data_uso),
        // inclusive usos "órfãos" (agendamento_id = NULL) gerados por retenção
        // de cota em No-Show. Por isso não filtramos por agendamento_id aqui.
        usadosRows = await conn('assinatura_usos')
          .where('cliente_id', cliente.id)
          .whereIn('plano_item_id', itemIds)
          .where('data_uso', '>=', cycleStartTs)
          .where('data_uso', '<', cycleEndExclusiveTs)
          .groupBy('plano_item_id')
          .select('plano_item_id')
          .sum({ total: 'quantidade' });
      } catch (err) {
        if (!(err && err.code === '42P01')) {
          throw err;
        }
      }
    }

    const usadosByItemId = (usadosRows || []).reduce((acc, row) => {
      const id = String(row.plano_item_id);
      acc[id] = parseInt(row.total, 10) || 0;
      return acc;
    }, {});

    const saldos = (itens || []).map(i => {
      const usados = usadosByItemId[String(i.id)] || 0;
      const quota = i.quantidade_por_ciclo === null || i.quantidade_por_ciclo === undefined
        ? null
        : parseInt(i.quantidade_por_ciclo, 10);
      const restante = quota === null ? null : Math.max(0, quota - usados);

      let nomeItem = null;
      if (i.tipo === 'SERVICO' && i.servico_id) {
        nomeItem = servicoNomeById[String(i.servico_id)] || null;
      }
      if (i.tipo === 'EXTRA' && i.servico_extra_id) {
        nomeItem = extraNomeById[String(i.servico_extra_id)] || null;
      }

      return {
        plano_item_id: i.id,
        tipo: i.tipo,
        servico_id: i.servico_id,
        servico_extra_id: i.servico_extra_id,
        nome: nomeItem,
        quantidade_por_ciclo: quota,
        usados,
        restantes: restante
      };
    });

    const saldosComBloqueio = bloqueioFinanceiro
      ? saldos.map(s => ({ ...s, usados: 0, restantes: s.quantidade_por_ciclo === null ? null : 0 }))
      : saldos;

    const coverageServicoIds = [];
    const coverageExtraIds = [];
    const motivosServico = [];
    const motivosExtra = [];

    const requestServicoIds = Array.isArray(servicoIds) ? servicoIds : this.parseCsvIds(servicoIds);
    const requestExtraIds = Array.isArray(servicoExtraIds) ? servicoExtraIds : this.parseCsvIds(servicoExtraIds);

    if (requestServicoIds.length > 0 || requestExtraIds.length > 0) {
      const saldoServicoById = new Map();
      const saldoExtraById = new Map();

      for (const s of saldos) {
        if (s.tipo === 'SERVICO' && s.servico_id) {
          saldoServicoById.set(parseInt(s.servico_id, 10), s);
        }
        if (s.tipo === 'EXTRA' && s.servico_extra_id) {
          saldoExtraById.set(parseInt(s.servico_extra_id, 10), s);
        }
      }

      for (const sid of requestServicoIds) {
        const itemSaldo = saldoServicoById.get(sid);
        if (!itemSaldo) {
          motivosServico.push({ id: sid, motivo: 'NAO_EXISTE_NO_PLANO' });
          continue;
        }
        if (itemSaldo.restantes === null || (Number(itemSaldo.restantes) || 0) > 0) {
          coverageServicoIds.push(sid);
        } else {
          motivosServico.push({ id: sid, motivo: 'SEM_SALDO' });
        }
      }

      for (const eid of requestExtraIds) {
        const itemSaldo = saldoExtraById.get(eid);
        if (!itemSaldo) {
          motivosExtra.push({ id: eid, motivo: 'NAO_EXISTE_NO_PLANO' });
          continue;
        }
        if (itemSaldo.restantes === null || (Number(itemSaldo.restantes) || 0) > 0) {
          coverageExtraIds.push(eid);
        } else {
          motivosExtra.push({ id: eid, motivo: 'SEM_SALDO' });
        }
      }
    }

    return {
      success: true,
      data: {
        cliente: {
          id: cliente.id,
          nome: `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim(),
          telefone: cliente.telefone,
          data_nascimento: cliente.data_nascimento,
          is_assinante: Boolean(cliente.is_assinante),
          assinatura_status: assinaturaStatus,
          data_inicio_assinatura: cliente.data_inicio_assinatura,
          assinatura_plano_id: cliente.assinatura_plano_id,
          unidade_id: unidadeId
        },
        assinatura_ativa: !bloqueioFinanceiro,
        plano: {
          id: plano.id,
          nome: plano.nome,
          validade_dias: validadeDias
        },
        ciclo: {
          referencia,
          inicio: cycleStart,
          fim: cycleEndInclusive,
          indice: cycleIndex,
          inicio_ts: cycleStartTs ? cycleStartTs.toISOString() : null,
          fim_exclusivo_ts: cycleEndExclusiveTs ? cycleEndExclusiveTs.toISOString() : null
        },
        saldos: saldosComBloqueio,
        ...(requestServicoIds.length > 0 || requestExtraIds.length > 0
          ? {
              cobertura_sugerida: {
                servico_ids: coverageServicoIds,
                servico_extra_ids: coverageExtraIds,
                motivos_exclusao: {
                  servico_ids: motivosServico,
                  servico_extra_ids: motivosExtra
                }
              }
            }
          : {})
      }
    };
  }
}

module.exports = AssinaturaSaldoService;

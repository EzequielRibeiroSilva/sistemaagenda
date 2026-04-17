const { db } = require('../config/knex');

class AssinaturaEstornoService {
  async decidirEstorno({ origem, agendamento, agora, dbConn }) {
    const conn = dbConn || db;

    if (!agendamento?.id || !agendamento?.unidade_id) {
      throw new Error('Agendamento inválido para decisão de estorno');
    }

    if (origem === 'ADMIN' || origem === 'BARBEIRO') {
      return {
        permitir_cancelamento: true,
        dentro_do_prazo: true,
        deve_estornar: true,
        limite_horas: null,
        diferenca_horas: null
      };
    }

    if (origem !== 'CLIENTE_PUBLICO') {
      return {
        permitir_cancelamento: true,
        dentro_do_prazo: false,
        deve_estornar: false,
        limite_horas: null,
        diferenca_horas: null
      };
    }

    let configuracoes = await conn('configuracoes_sistema')
      .where('unidade_id', agendamento.unidade_id)
      .select('permitir_cancelamento', 'tempo_limite_cancelar_horas')
      .first();

    if (!configuracoes) {
      configuracoes = {
        permitir_cancelamento: true,
        tempo_limite_cancelar_horas: 4
      };
    }

    const permitirCancelamento = Boolean(configuracoes.permitir_cancelamento);
    const limiteHoras = parseFloat(configuracoes.tempo_limite_cancelar_horas);

    const agoraDt = agora instanceof Date ? agora : new Date();

    let dataAgendamentoStr;
    if (agendamento.data_agendamento instanceof Date) {
      const ano = agendamento.data_agendamento.getFullYear();
      const mes = String(agendamento.data_agendamento.getMonth() + 1).padStart(2, '0');
      const dia = String(agendamento.data_agendamento.getDate()).padStart(2, '0');
      dataAgendamentoStr = `${ano}-${mes}-${dia}`;
    } else {
      dataAgendamentoStr = String(agendamento.data_agendamento);
    }

    const dataHoraAgendamento = new Date(`${dataAgendamentoStr}T${agendamento.hora_inicio}-03:00`);
    const diferencaMs = dataHoraAgendamento - agoraDt;
    const diferencaHoras = diferencaMs / (1000 * 60 * 60);

    const dentroDoPrazo = diferencaHoras >= limiteHoras;

    return {
      permitir_cancelamento: permitirCancelamento,
      dentro_do_prazo: dentroDoPrazo,
      deve_estornar: permitirCancelamento && dentroDoPrazo,
      limite_horas: limiteHoras,
      diferenca_horas: diferencaHoras
    };
  }

  async aplicarEstornoOuRetencao({ agendamentoId, deveEstornar, dbConn }) {
    const conn = dbConn || db;

    let usoRows = [];
    try {
      usoRows = await conn('assinatura_usos').where('agendamento_id', agendamentoId).select('id');
    } catch (err) {
      if (err && err.code === '42P01') {
        return { hasUso: false, action: 'none' };
      }
      throw err;
    }

    const hasUso = Array.isArray(usoRows) && usoRows.length > 0;
    if (!hasUso) return { hasUso: false, action: 'none' };

    if (deveEstornar) {
      await conn('assinatura_usos').where('agendamento_id', agendamentoId).del();
      return { hasUso: true, action: 'deleted' };
    }

    // Retenção por No-Show: a cota permanece consumida no ciclo do cliente,
    // mas o vínculo com o agendamento é removido ("uso órfão") para não aparecer
    // como consumo associado a um agendamento ativo/finalizado.
    await conn('assinatura_usos')
      .where('agendamento_id', agendamentoId)
      .update({ agendamento_id: null });

    return { hasUso: true, action: 'detached' };
  }
}

module.exports = AssinaturaEstornoService;

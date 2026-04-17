const { db } = require('../config/knex');

class AssinaturaRenovacaoService {
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

  getTodayStrInSaoPaulo() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  async registrarPagamento({
    clienteId,
    planoId,
    mpPaymentId,
    mpPreapprovalId,
    dataRenovacao,
    valorPago,
    validadeDias,
    dbConn
  }) {
    if (!clienteId || !planoId || !mpPaymentId) {
      throw new Error('clienteId, planoId e mpPaymentId são obrigatórios');
    }

    const conn = dbConn || db;

    const startStr = dataRenovacao
      ? new Date(dataRenovacao).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      : this.getTodayStrInSaoPaulo();

    const vd = parseInt(validadeDias, 10) || 31;
    const cicloInicio = startStr;
    const cicloFim = this.addDaysStr(cicloInicio, vd - 1);

    await conn('assinatura_renovacoes')
      .insert({
        cliente_id: clienteId,
        plano_id: planoId,
        mp_payment_id: String(mpPaymentId),
        mp_preapproval_id: mpPreapprovalId ? String(mpPreapprovalId) : null,
        data_renovacao: dataRenovacao ? new Date(dataRenovacao) : new Date(),
        valor_pago: valorPago != null ? Number(valorPago) : null,
        ciclo_inicio: cicloInicio,
        ciclo_fim: cicloFim
      })
      .onConflict('mp_payment_id')
      .ignore();

    const row = await conn('assinatura_renovacoes')
      .where('mp_payment_id', String(mpPaymentId))
      .first();

    return row || null;
  }
}

module.exports = AssinaturaRenovacaoService;

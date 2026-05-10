const { db } = require('../config/knex');

function startOfCurrentMonthLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function parseYmdToLocalDate(ymd) {
  if (!ymd) return null;

  if (ymd instanceof Date && !Number.isNaN(ymd.getTime())) {
    return new Date(ymd.getFullYear(), ymd.getMonth(), ymd.getDate(), 0, 0, 0, 0);
  }

  let s = String(ymd).trim();
  // Aceitar formato ISO vindo do Postgres/Knex, ex: 2026-05-09T03:00:00.000Z
  if (s.includes('T')) {
    s = s.split('T')[0];
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

async function getPeriodoLockStartDate(unidadeId) {
  if (!unidadeId || !Number.isFinite(Number(unidadeId))) {
    return startOfCurrentMonthLocal();
  }

  try {
    const row = await db('configuracoes_sistema')
      .where('unidade_id', Number(unidadeId))
      .select('periodo_lock_inicio')
      .first();

    const fromDb = parseYmdToLocalDate(row?.periodo_lock_inicio);
    return fromDb || startOfCurrentMonthLocal();
  } catch {
    return startOfCurrentMonthLocal();
  }
}

async function assertPeriodoAberto({
  unidadeId,
  recordDate,
  userRole,
  errorMessage = 'Período fechado: alterações em registros de meses anteriores não são permitidas.'
}) {
  const role = userRole ? String(userRole).toUpperCase() : '';
  if (role === 'MASTER') return;

  const dt = recordDate instanceof Date ? recordDate : new Date(recordDate);
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return;

  // Padrão ELITE: mês corrente permanece aberto para ajustes operacionais.
  // Se o registro for do mês atual (local), não aplicar trava.
  const monthStart = startOfCurrentMonthLocal();
  const dtMonthStart = new Date(dt.getFullYear(), dt.getMonth(), 1, 0, 0, 0, 0);
  if (dtMonthStart.getTime() === monthStart.getTime()) {
    return;
  }

  const lockStart = await getPeriodoLockStartDate(unidadeId);

  if (dt < lockStart) {
    const err = new Error(errorMessage);
    err.code = 'PERIODO_FECHADO';
    throw err;
  }
}

module.exports = {
  getPeriodoLockStartDate,
  assertPeriodoAberto,
  parseYmdToLocalDate
};

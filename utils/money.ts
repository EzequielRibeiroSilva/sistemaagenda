export const toMoneyFixedString = (value: unknown) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return '';
  const n = Number(normalized);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
};

export const formatMoneyBR = (value: unknown) => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

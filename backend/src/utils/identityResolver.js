function resolveIdentity(user) {
  const role = user?.role;
  const userId = Number(user?.id);
  const agenteIdRaw = user?.agente_id;
  const agenteId = Number.isFinite(Number(agenteIdRaw)) ? Number(agenteIdRaw) : null;
  const isAgente = role === 'AGENTE';

  return {
    userId: Number.isFinite(userId) ? userId : null,
    agenteId,
    isAgente,
    role
  };
}

module.exports = {
  resolveIdentity
};

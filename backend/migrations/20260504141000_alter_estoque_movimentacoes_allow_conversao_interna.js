/**
 * Sprint 2 - Muralha: permitir CONVERSAO_INTERNA no ledger estoque_movimentacoes
 *
 * Postgres/Knex enu foi materializado como TEXT com CHECK constraint.
 * Precisamos atualizar o constraint para incluir CONVERSAO_INTERNA.
 */

exports.up = async function (knex) {
  await knex.raw('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_tipo_check;');

  await knex.raw(
    "ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_tipo_check CHECK (tipo IN ('ENTRADA','SAIDA','AJUSTE','CONSUMO','ESTORNO','CONVERSAO_INTERNA'));"
  );
};

exports.down = async function (knex) {
  await knex.raw('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_tipo_check;');

  await knex.raw(
    "ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_tipo_check CHECK (tipo IN ('ENTRADA','SAIDA','AJUSTE','CONSUMO','ESTORNO'));"
  );
};

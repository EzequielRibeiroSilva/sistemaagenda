/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.transaction(async (trx) => {
    await trx('estoque_unidades')
      .where('saldo_atual', '<', 0)
      .update({ saldo_atual: 0 });

    await trx.raw(
      "ALTER TABLE estoque_unidades ADD CONSTRAINT chk_estoque_unidades_saldo_nonneg CHECK (saldo_atual >= 0)"
    );
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw(
    'ALTER TABLE estoque_unidades DROP CONSTRAINT IF EXISTS chk_estoque_unidades_saldo_nonneg'
  );
};

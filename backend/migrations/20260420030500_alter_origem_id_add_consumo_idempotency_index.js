exports.up = async function (knex) {
  // origem_id era UUID; para suportar origem por ID numérico (agendamento), migramos para TEXT
  await knex.raw(`
    ALTER TABLE estoque_movimentacoes
    ALTER COLUMN origem_id TYPE text
    USING origem_id::text
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_est_mov_consumo_idempotency
    ON estoque_movimentacoes (origem_id, produto_id, tipo)
    WHERE tipo = 'CONSUMO'
  `);
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS uk_est_mov_consumo_idempotency`);

  // Tentativa de rollback (pode falhar se houver valores não-UUID no origem_id)
  await knex.raw(`
    ALTER TABLE estoque_movimentacoes
    ALTER COLUMN origem_id TYPE uuid
    USING origem_id::uuid
  `);
};

exports.up = async function (knex) {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_est_mov_estorno_idempotency
    ON estoque_movimentacoes (origem_id, produto_id, tipo)
    WHERE tipo = 'ESTORNO'
  `);
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS uk_est_mov_estorno_idempotency`);
};

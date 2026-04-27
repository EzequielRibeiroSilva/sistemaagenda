exports.up = async function (knex) {
  await knex.schema.alterTable('vendas', (table) => {
    table.string('idempotency_key', 64).nullable();
  });

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_vendas_usuario_idempotency_key
    ON vendas (usuario_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS uk_vendas_usuario_idempotency_key');

  await knex.schema.alterTable('vendas', (table) => {
    table.dropColumn('idempotency_key');
  });
};

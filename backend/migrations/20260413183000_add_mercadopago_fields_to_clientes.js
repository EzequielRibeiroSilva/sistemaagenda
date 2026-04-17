/**
 * Fase 6 (Automação Financeira MP): Adiciona campos de vínculo Mercado Pago no cadastro de clientes.
 * O objetivo é permitir que o barbeiro vincule manualmente uma assinatura externa (preapproval) ao cliente.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('clientes', function(table) {
    table.text('mp_preapproval_id').nullable();
    table.text('mp_plan_id').nullable();
    table.text('mp_payer_id').nullable();
    table.text('mp_customer_email').nullable();
    table.text('mp_status').nullable();
    table.timestamp('mp_last_event_at', { useTz: true }).nullable();
  });

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS clientes_mp_preapproval_id_uq
      ON clientes (mp_preapproval_id)
      WHERE mp_preapproval_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS clientes_mp_customer_email_idx
      ON clientes (mp_customer_email)
      WHERE mp_customer_email IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS clientes_mp_last_event_at_idx
      ON clientes (mp_last_event_at);
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.raw('DROP INDEX IF EXISTS clientes_mp_last_event_at_idx;');
  await knex.raw('DROP INDEX IF EXISTS clientes_mp_customer_email_idx;');
  await knex.raw('DROP INDEX IF EXISTS clientes_mp_preapproval_id_uq;');

  await knex.schema.alterTable('clientes', function(table) {
    table.dropColumn('mp_last_event_at');
    table.dropColumn('mp_status');
    table.dropColumn('mp_customer_email');
    table.dropColumn('mp_payer_id');
    table.dropColumn('mp_plan_id');
    table.dropColumn('mp_preapproval_id');
  });
};

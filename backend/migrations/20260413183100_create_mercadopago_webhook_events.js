/**
 * Fase 6 (Automação Financeira MP): Tabela de eventos de webhook para idempotência e auditoria.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('mercadopago_webhook_events', function(table) {
    table.bigIncrements('id').primary();

    table.text('topic').nullable();
    table.text('action').nullable();
    table.text('resource_id').nullable();

    table.text('x_request_id').nullable();
    table.text('x_signature').nullable();

    table.jsonb('payload').notNullable();

    table.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('processed_at', { useTz: true }).nullable();
    table.text('processing_error').nullable();

    table.unique(['topic', 'resource_id', 'action', 'x_request_id'], 'mercadopago_webhook_events_dedupe_uq');
    table.index(['topic', 'resource_id'], 'mercadopago_webhook_events_resource_idx');
    table.index(['received_at'], 'mercadopago_webhook_events_received_at_idx');
    table.index(['processed_at'], 'mercadopago_webhook_events_processed_at_idx');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('mercadopago_webhook_events');
};

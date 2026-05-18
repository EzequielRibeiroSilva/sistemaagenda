/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('agendamento_pagamentos', (table) => {
    table.increments('id').primary();

    table
      .integer('usuario_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('CASCADE');

    table
      .integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE');

    table
      .integer('agendamento_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('agendamentos')
      .onDelete('CASCADE');

    table.string('mp_payment_id', 255).notNullable().unique();
    table.string('external_reference', 255).notNullable();

    table
      .enu('status', ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'], {
        useNative: false
      })
      .notNullable()
      .defaultTo('PENDING');

    table.decimal('amount', 10, 2).notNullable();

    table.string('idempotency_key', 64).notNullable();

    table.text('pix_qr_code_base64').notNullable();
    table.text('pix_copia_cola').notNullable();

    table.timestamp('expires_at', { useTz: true }).notNullable();

    table.timestamps(true, true);

    // Idempotência (mesmo padrão do VendaController)
    table.unique(['usuario_id', 'idempotency_key'], 'uk_agendamento_pagamentos_usuario_idempotency_key');

    table.index(['usuario_id', 'unidade_id', 'agendamento_id'], 'idx_agendamento_pagamentos_tenant');
    table.index(['status', 'expires_at'], 'idx_agendamento_pagamentos_status_expires');
    table.index(['external_reference'], 'idx_agendamento_pagamentos_external_reference');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('agendamento_pagamentos');
};

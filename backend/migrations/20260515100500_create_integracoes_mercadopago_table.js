/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('integracoes_mercadopago', (table) => {
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

    table.string('mp_user_id', 255).notNullable();

    table.text('access_token_ciphertext').notNullable();
    table.string('access_token_iv', 64).notNullable();
    table.string('access_token_auth_tag', 64).notNullable();

    table.text('refresh_token_ciphertext').notNullable();
    table.string('refresh_token_iv', 64).notNullable();
    table.string('refresh_token_auth_tag', 64).notNullable();

    table.timestamp('expires_at', { useTz: true }).notNullable();

    table
      .enu('status', ['CONNECTED', 'DISCONNECTED', 'ERROR'], {
        useNative: false
      })
      .notNullable()
      .defaultTo('DISCONNECTED');

    table.timestamps(true, true);

    // Multi-tenant: apenas 1 integração por unidade (estabelecimento)
    table.unique(['unidade_id'], 'uk_integracoes_mercadopago_unidade');

    table.index(['usuario_id', 'unidade_id'], 'idx_integracoes_mercadopago_tenant');
    table.index(['status'], 'idx_integracoes_mercadopago_status');
    table.index(['expires_at'], 'idx_integracoes_mercadopago_expires_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('integracoes_mercadopago');
};

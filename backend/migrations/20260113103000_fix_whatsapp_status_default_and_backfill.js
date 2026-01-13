/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1) Backfill: usuários que nunca configuraram instância devem ter whatsapp_status = NULL
  await knex('usuarios')
    .whereNull('whatsapp_instance_name')
    .update({ whatsapp_status: null });

  // 2) Remover default do campo whatsapp_status (evita conta nova começar como 'close')
  await knex.schema.alterTable('usuarios', function (table) {
    table.string('whatsapp_status', 50).nullable().defaultTo(null).alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Reaplicar o default antigo
  await knex.schema.alterTable('usuarios', function (table) {
    table.string('whatsapp_status', 50).nullable().defaultTo('close').alter();
  });

  // Reverter o backfill: usuários sem instância voltam a ter 'close'
  await knex('usuarios')
    .whereNull('whatsapp_instance_name')
    .update({ whatsapp_status: 'close' });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('usuarios', function(table) {
    table.string('whatsapp_instance_name', 255).nullable().unique();
    table.string('whatsapp_instance_token', 255).nullable();
    table.string('whatsapp_status', 50).nullable().defaultTo('close');
    table.string('whatsapp_number', 50).nullable();

    table.index('whatsapp_instance_name');
    table.index('whatsapp_status');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('usuarios', function(table) {
    table.dropIndex('whatsapp_instance_name');
    table.dropIndex('whatsapp_status');

    table.dropColumn('whatsapp_instance_name');
    table.dropColumn('whatsapp_instance_token');
    table.dropColumn('whatsapp_status');
    table.dropColumn('whatsapp_number');
  });
};

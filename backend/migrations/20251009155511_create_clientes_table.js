/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('clientes', function(table) {
    table.increments('id').primary();
    table.string('nome', 255).notNullable();
    table.string('telefone', 20).notNullable();
    table.string('email', 255);
    table.integer('whatsapp_id');
    table.boolean('assinante').defaultTo(false);
    table.date('data_inicio_assinatura');
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios').onDelete('CASCADE');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('clientes');
};

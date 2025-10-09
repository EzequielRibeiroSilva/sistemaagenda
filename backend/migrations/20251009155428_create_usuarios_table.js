/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('usuarios', function(table) {
    table.increments('id').primary();
    table.string('nome', 255).notNullable();
    table.string('email', 255).unique().notNullable();
    table.string('senha_hash', 255).notNullable();
    table.string('telefone', 20);
    table.enu('tipo_usuario', ['admin', 'salon', 'agent']).notNullable();
    table.enu('status', ['Ativo', 'Bloqueado']).defaultTo('Ativo');
    table.enu('plano', ['Single', 'Multi']);
    table.integer('limite_unidades').defaultTo(1);
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('usuarios');
};

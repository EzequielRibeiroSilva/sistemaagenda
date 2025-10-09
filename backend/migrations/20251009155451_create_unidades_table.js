/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('unidades', function(table) {
    table.increments('id').primary();
    table.string('nome', 255).notNullable();
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios').onDelete('CASCADE');
    table.enu('status', ['Ativo', 'Bloqueado']).defaultTo('Ativo');
    table.text('endereco');
    table.string('telefone', 20);
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('unidades');
};

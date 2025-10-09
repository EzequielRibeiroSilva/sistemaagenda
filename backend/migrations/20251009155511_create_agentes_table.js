/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('agentes', function(table) {
    table.increments('id').primary();
    table.string('nome', 255).notNullable();
    table.string('email', 255);
    table.string('telefone', 20);
    table.string('avatar_url', 500);
    table.text('biografia');
    table.string('nome_exibicao', 255);
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios').onDelete('CASCADE');
    table.enu('status', ['Ativo', 'Bloqueado']).defaultTo('Ativo');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('agentes');
};

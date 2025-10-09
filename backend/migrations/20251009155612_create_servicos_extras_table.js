/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('servicos_extras', function(table) {
    table.increments('id').primary();
    table.string('nome', 255).notNullable();
    table.integer('duracao_minutos').defaultTo(0);
    table.decimal('preco', 10, 2).notNullable().defaultTo(0.00);
    table.integer('quantidade_maxima').defaultTo(1);
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios').onDelete('CASCADE');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('servicos_extras');
};

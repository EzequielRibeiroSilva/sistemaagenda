exports.up = function (knex) {
  return knex.schema.createTable('categorias', function (table) {
    table.increments('id').primary();

    table
      .integer('usuario_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('CASCADE');

    table.string('nome', 255).notNullable();

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['usuario_id', 'nome'], 'uk_categorias_usuario_nome');
    table.index(['usuario_id'], 'idx_categorias_usuario');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('categorias');
};

exports.up = function (knex) {
  return knex.schema.createTable('servico_insumos', (table) => {
    table.increments('id').primary();

    table.integer('servico_id').unsigned().notNullable()
      .references('id').inTable('servicos')
      .onDelete('CASCADE');

    table.integer('produto_id').unsigned().notNullable()
      .references('id').inTable('produtos')
      .onDelete('RESTRICT');

    table.decimal('quantidade', 14, 3).notNullable();

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['servico_id', 'produto_id']);
    table.index(['servico_id']);
    table.index(['produto_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('servico_insumos');
};

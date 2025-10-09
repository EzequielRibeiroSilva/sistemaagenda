/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('servicos', function(table) {
    table.increments('id').primary();
    table.string('nome', 255).notNullable();
    table.text('descricao');
    table.integer('duracao_minutos').notNullable().defaultTo(60);
    table.decimal('preco', 10, 2).notNullable().defaultTo(0.00);
    table.decimal('valor_custo', 10, 2).defaultTo(0.00);
    table.decimal('comissao_percentual', 5, 2).defaultTo(70.00);
    table.decimal('preco_minimo_exibicao', 10, 2).defaultTo(0.00);
    table.decimal('preco_maximo_exibicao', 10, 2).defaultTo(0.00);
    table.integer('categoria_id').unsigned().references('id').inTable('categorias_servicos');
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
  return knex.schema.dropTableIfExists('servicos');
};

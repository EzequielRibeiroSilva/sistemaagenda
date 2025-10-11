/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Tabela pivô servico_servicos_extras (N:N entre servicos e servicos_extras)
  await knex.schema.createTable('servico_servicos_extras', function(table) {
    table.increments('id').primary();
    table.integer('servico_id').unsigned().references('id').inTable('servicos').onDelete('CASCADE');
    table.integer('servico_extra_id').unsigned().references('id').inTable('servicos_extras').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Índices para performance
    table.index(['servico_id', 'servico_extra_id']);
    table.index('servico_id');
    table.index('servico_extra_id');
    
    // Constraint única para evitar duplicatas
    table.unique(['servico_id', 'servico_extra_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('servico_servicos_extras');
};

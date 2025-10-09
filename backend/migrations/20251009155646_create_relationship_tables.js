/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Tabela agendamento_servicos
  await knex.schema.createTable('agendamento_servicos', function(table) {
    table.increments('id').primary();
    table.integer('agendamento_id').unsigned().references('id').inTable('agendamentos').onDelete('CASCADE');
    table.integer('servico_id').unsigned().references('id').inTable('servicos').onDelete('CASCADE');
    table.decimal('preco_aplicado', 10, 2).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Tabela agendamento_servicos_extras
  await knex.schema.createTable('agendamento_servicos_extras', function(table) {
    table.increments('id').primary();
    table.integer('agendamento_id').unsigned().references('id').inTable('agendamentos').onDelete('CASCADE');
    table.integer('servico_extra_id').unsigned().references('id').inTable('servicos_extras').onDelete('CASCADE');
    table.integer('quantidade').defaultTo(1);
    table.decimal('preco_aplicado', 10, 2).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Tabela agente_servicos
  await knex.schema.createTable('agente_servicos', function(table) {
    table.increments('id').primary();
    table.integer('agente_id').unsigned().references('id').inTable('agentes').onDelete('CASCADE');
    table.integer('servico_id').unsigned().references('id').inTable('servicos').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Tabela agente_unidades
  await knex.schema.createTable('agente_unidades', function(table) {
    table.increments('id').primary();
    table.integer('agente_id').unsigned().references('id').inTable('agentes').onDelete('CASCADE');
    table.integer('unidade_id').unsigned().references('id').inTable('unidades').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('agente_unidades');
  await knex.schema.dropTableIfExists('agente_servicos');
  await knex.schema.dropTableIfExists('agendamento_servicos_extras');
  await knex.schema.dropTableIfExists('agendamento_servicos');
};

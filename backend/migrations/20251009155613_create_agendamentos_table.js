/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('agendamentos', function(table) {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().references('id').inTable('clientes').onDelete('CASCADE');
    table.integer('agente_id').unsigned().references('id').inTable('agentes').onDelete('CASCADE');
    table.integer('unidade_id').unsigned().references('id').inTable('unidades').onDelete('CASCADE');
    table.date('data_agendamento').notNullable();
    table.time('hora_inicio').notNullable();
    table.time('hora_fim').notNullable();
    table.enu('status', ['Aprovado', 'Concluído', 'Cancelado', 'Não Compareceu']).defaultTo('Aprovado');
    table.enu('status_pagamento', ['Pago', 'Não Pago']).defaultTo('Não Pago');
    table.string('metodo_pagamento', 50).defaultTo('Não definido');
    table.decimal('valor_total', 10, 2).defaultTo(0.00);
    table.text('observacoes');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('agendamentos');
};

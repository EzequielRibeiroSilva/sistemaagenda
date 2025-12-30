 exports.up = async function(knex) {
  await knex.schema.createTable('assinatura_usos', function(table) {
    table.increments('id').primary();

    table.integer('cliente_id').unsigned().notNullable().references('id').inTable('clientes').onDelete('CASCADE');
    table.integer('plano_id').unsigned().notNullable().references('id').inTable('planos_assinatura').onDelete('CASCADE');
    table.integer('plano_item_id').unsigned().notNullable().references('id').inTable('planos_assinatura_itens').onDelete('CASCADE');

    table.integer('agendamento_id').unsigned().references('id').inTable('agendamentos').onDelete('SET NULL');

    table.date('data_uso').notNullable();
    table.integer('quantidade').notNullable().defaultTo(1);

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['cliente_id', 'data_uso'], 'idx_assinatura_usos_cliente_data');
    table.index(['cliente_id', 'plano_item_id', 'data_uso'], 'idx_assinatura_usos_cliente_item_data');
    table.unique(['agendamento_id', 'plano_item_id'], 'uk_assinatura_usos_agendamento_item');
  });
};

 exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('assinatura_usos');
};

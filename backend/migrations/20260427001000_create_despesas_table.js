exports.up = async function (knex) {
  await knex.schema.createTable('despesas', function (table) {
    table.increments('id').primary();

    table
      .integer('unidade_id')
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE');

    table
      .integer('usuario_id')
      .notNullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('CASCADE');

    table.text('descricao').notNullable();
    table.string('categoria').notNullable();

    table.decimal('valor', 12, 2).notNullable();

    table.date('data_vencimento').notNullable();
    table.date('data_pagamento').nullable();

    table.string('status').notNullable().defaultTo('PENDING');
    table.string('forma_pagamento').nullable();

    table.timestamps(true, true);

    table.index(['unidade_id'], 'idx_despesas_unidade_id');
    table.index(['unidade_id', 'data_vencimento'], 'idx_despesas_unidade_venc');
    table.index(['unidade_id', 'data_pagamento'], 'idx_despesas_unidade_pag');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('despesas');
};

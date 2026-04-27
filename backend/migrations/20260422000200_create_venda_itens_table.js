/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('venda_itens', function (table) {
    table.increments('id').primary();

    table
      .integer('venda_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('vendas')
      .onDelete('CASCADE');

    table
      .enu('item_type', ['SERVICO_AGENDAMENTO', 'PRODUTO'])
      .notNullable();

    table.integer('reference_id').unsigned().nullable();

    table.string('descricao_snapshot', 255).notNullable();
    table.decimal('quantidade', 14, 3).notNullable().defaultTo(1);
    table.decimal('preco_unitario_snapshot', 10, 2).notNullable().defaultTo(0);
    table.decimal('total_snapshot', 10, 2).notNullable().defaultTo(0);

    table
      .integer('agente_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('agentes')
      .onDelete('SET NULL');

    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index(['venda_id'], 'idx_venda_itens_venda');
    table.index(['item_type', 'reference_id'], 'idx_venda_itens_ref');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('venda_itens');
};

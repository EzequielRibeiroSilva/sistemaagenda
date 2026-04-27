/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('vendas', function (table) {
    table.increments('id').primary();

    table
      .integer('usuario_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('CASCADE');

    table
      .integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE');

    table
      .integer('cliente_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('clientes')
      .onDelete('SET NULL');

    table
      .integer('agendamento_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('agendamentos')
      .onDelete('SET NULL');

    table
      .enu('status', ['DRAFT', 'PAID', 'CANCELLED', 'REFUNDED'])
      .notNullable()
      .defaultTo('DRAFT');

    table.decimal('subtotal', 10, 2).notNullable().defaultTo(0);
    table.decimal('desconto_total', 10, 2).notNullable().defaultTo(0);
    table.decimal('total', 10, 2).notNullable().defaultTo(0);

    table
      .integer('created_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('SET NULL');

    table.timestamp('paid_at').nullable();

    table.timestamps(true, true);

    table.index(['usuario_id', 'created_at'], 'idx_vendas_usuario_data');
    table.index(['unidade_id', 'created_at'], 'idx_vendas_unidade_data');
    table.index(['status', 'created_at'], 'idx_vendas_status_data');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_vendas_agendamento
    ON vendas (agendamento_id)
    WHERE agendamento_id IS NOT NULL
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS uk_vendas_agendamento');
  await knex.schema.dropTableIfExists('vendas');
};

exports.up = async function up(knex) {
  await knex.schema.createTable('assinatura_renovacoes', (table) => {
    table.increments('id').primary();
    table.integer('cliente_id').notNullable();
    table.integer('plano_id').notNullable();
    table.string('mp_payment_id').notNullable().unique();
    table.string('mp_preapproval_id').nullable();
    table.timestamp('data_renovacao').notNullable().defaultTo(knex.fn.now());
    table.date('ciclo_inicio').notNullable();
    table.date('ciclo_fim').notNullable();

    table.index(['cliente_id']);
    table.index(['mp_preapproval_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('assinatura_renovacoes');
};

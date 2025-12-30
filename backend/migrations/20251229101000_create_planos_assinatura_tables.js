/**
 * Cria as tabelas do Clube de Assinatura (Planos por Unidade)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('planos_assinatura', function(table) {
    table.increments('id').primary();
    table.integer('unidade_id').unsigned().notNullable().references('id').inTable('unidades').onDelete('CASCADE');
    table.string('nome', 255).notNullable();
    table.integer('validade_dias').notNullable().defaultTo(31);
    table.decimal('valor', 10, 2).notNullable().defaultTo(0.00);
    table.boolean('renovacao_automatica').notNullable().defaultTo(false);
    table.enu('status', ['Ativo', 'Bloqueado']).defaultTo('Ativo');
    table.timestamps(true, true);

    table.index('unidade_id');
    table.index(['unidade_id', 'status'], 'idx_planos_assinatura_unidade_status');
    table.unique(['unidade_id', 'nome'], 'uk_planos_assinatura_unidade_nome');
  });

  await knex.schema.createTable('planos_assinatura_itens', function(table) {
    table.increments('id').primary();
    table.integer('plano_id').unsigned().notNullable().references('id').inTable('planos_assinatura').onDelete('CASCADE');
    table.enu('tipo', ['SERVICO', 'EXTRA']).notNullable();
    table.integer('servico_id').unsigned().references('id').inTable('servicos').onDelete('CASCADE');
    table.integer('servico_extra_id').unsigned().references('id').inTable('servicos_extras').onDelete('CASCADE');
    table.integer('quantidade_por_ciclo');
    table.timestamps(true, true);

    table.index('plano_id');
    table.index(['plano_id', 'tipo'], 'idx_planos_assinatura_itens_plano_tipo');
    table.unique(['plano_id', 'tipo', 'servico_id', 'servico_extra_id'], 'uk_planos_assinatura_itens_unico');
  });

  await knex.schema.alterTable('clientes', function(table) {
    table.integer('assinatura_plano_id').unsigned().references('id').inTable('planos_assinatura').onDelete('SET NULL');
    table.index(['unidade_id', 'assinatura_plano_id'], 'idx_clientes_unidade_assinatura_plano');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('clientes', function(table) {
    table.dropIndex(['unidade_id', 'assinatura_plano_id'], 'idx_clientes_unidade_assinatura_plano');
    table.dropColumn('assinatura_plano_id');
  });

  await knex.schema.dropTableIfExists('planos_assinatura_itens');
  await knex.schema.dropTableIfExists('planos_assinatura');
};

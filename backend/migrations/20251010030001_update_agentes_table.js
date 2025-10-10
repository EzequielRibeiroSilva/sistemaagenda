/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('agentes', function(table) {
    // Adicionar campos necessários para o gerenciamento completo
    table.string('sobrenome', 255);
    table.string('senha_hash', 255); // Para login do agente
    table.integer('unidade_id').unsigned().references('id').inTable('unidades').onDelete('CASCADE');
    table.boolean('agenda_personalizada').defaultTo(false).comment('Se true, usa horarios_funcionamento. Se false, usa horário padrão da unidade');
    table.text('observacoes');
    table.date('data_admissao');
    table.decimal('comissao_percentual', 5, 2).defaultTo(0.00).comment('Percentual de comissão do agente');
    
    // Índices para performance
    table.index('unidade_id');
    table.index('email');
    table.index(['status', 'unidade_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('agentes', function(table) {
    table.dropColumn('sobrenome');
    table.dropColumn('senha_hash');
    table.dropColumn('unidade_id');
    table.dropColumn('agenda_personalizada');
    table.dropColumn('observacoes');
    table.dropColumn('data_admissao');
    table.dropColumn('comissao_percentual');
  });
};

/**
 * MIGRATION: Criar tabela agente_servico_comissao
 * FASE 2 - Sistema de Exceções de Comissão
 * 
 * Objetivo: Permitir comissões customizadas por agente/serviço,
 * sobrescrevendo a comissão padrão do serviço.
 * 
 * Regra de Prioridade (implementada na próxima fase):
 * 1. Se existe registro em agente_servico_comissao → usar comissão específica
 * 2. Senão → usar comissão padrão do serviço (servicos.comissao_percentual)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('agente_servico_comissao', function(table) {
    // Chave primária
    table.increments('id').primary();
    
    // Relacionamentos (Foreign Keys com CASCADE para tabela auxiliar)
    table.integer('agente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('agentes')
      .onDelete('CASCADE')
      .comment('ID do agente com comissão customizada');
    
    table.integer('servico_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('servicos')
      .onDelete('CASCADE')
      .comment('ID do serviço com comissão customizada');
    
    // Valor da comissão (0 a 100%)
    table.decimal('comissao_percentual', 5, 2)
      .notNullable()
      .checkBetween([0, 100], 'chk_agente_servico_comissao_percentual_range')
      .comment('Comissão específica para este agente/serviço (0-100)');
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    
    // UNIQUE CONSTRAINT: evitar duplicatas
    table.unique(['agente_id', 'servico_id'], 'unq_agente_servico_comissao');
    
    // Índices para performance de leitura (queries frequentes em agendamentos)
    table.index(['agente_id'], 'idx_agente_servico_comissao_agente');
    table.index(['servico_id'], 'idx_agente_servico_comissao_servico');
    table.index(['agente_id', 'servico_id'], 'idx_agente_servico_comissao_compound');
  });
};

/**
 * Rollback: remover tabela de exceções de comissão
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('agente_servico_comissao');
};

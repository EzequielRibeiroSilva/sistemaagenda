/**
 * Migration: Adicionar tabelas de relacionamento para cupons com serviços e unidades
 * 
 * Tabelas criadas:
 * 1. cupom_servicos - Relaciona cupons com serviços específicos
 * 2. cupom_unidades - Relaciona cupons com unidades específicas
 * 
 * Se nenhum registro existir nessas tabelas para um cupom, ele é válido para todos os serviços/unidades
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Tabela de relacionamento cupom-serviços
    .createTable('cupom_servicos', function(table) {
      table.increments('id').primary();
      table.integer('cupom_id').unsigned().notNullable().references('id').inTable('cupons').onDelete('CASCADE');
      table.integer('servico_id').unsigned().notNullable().references('id').inTable('servicos').onDelete('CASCADE');
      table.timestamps(true, true);
      
      // Índices
      table.index('cupom_id');
      table.index('servico_id');
      
      // Garantir que não haja duplicatas
      table.unique(['cupom_id', 'servico_id']);
    })
    
    // Tabela de relacionamento cupom-unidades
    .createTable('cupom_unidades', function(table) {
      table.increments('id').primary();
      table.integer('cupom_id').unsigned().notNullable().references('id').inTable('cupons').onDelete('CASCADE');
      table.integer('unidade_id').unsigned().notNullable().references('id').inTable('unidades').onDelete('CASCADE');
      table.timestamps(true, true);
      
      // Índices
      table.index('cupom_id');
      table.index('unidade_id');
      
      // Garantir que não haja duplicatas
      table.unique(['cupom_id', 'unidade_id']);
    });
};

/**
 * Reverter migration
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('cupom_unidades')
    .dropTableIfExists('cupom_servicos');
};

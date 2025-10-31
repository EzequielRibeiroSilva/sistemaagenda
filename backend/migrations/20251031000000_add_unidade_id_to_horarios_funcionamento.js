/**
 * Migration: Adicionar coluna unidade_id à tabela horarios_funcionamento
 * 
 * CONTEXTO:
 * - Sistema migrou de agendas single-unit para multi-unit
 * - Tabela horarios_funcionamento precisa armazenar qual unidade cada horário pertence
 * - Frontend EditAgentPage.tsx espera horarios_funcionamento com unidade_id para agrupar por unidade
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('horarios_funcionamento', function(table) {
    // Adicionar coluna unidade_id (nullable para retrocompatibilidade)
    table.integer('unidade_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE')
      .comment('Unidade onde o agente trabalha neste horário (multi-unit support)');
    
    // Adicionar índice para performance em queries multi-unidade
    table.index(['agente_id', 'unidade_id', 'dia_semana']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('horarios_funcionamento', function(table) {
    table.dropIndex(['agente_id', 'unidade_id', 'dia_semana']);
    table.dropColumn('unidade_id');
  });
};

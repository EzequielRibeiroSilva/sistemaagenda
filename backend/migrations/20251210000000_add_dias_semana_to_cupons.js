/**
 * Migration: Adicionar campo dias_semana_permitidos à tabela cupons
 * 
 * Este campo permite restringir o uso do cupom a dias específicos da semana.
 * Útil para promoções em dias de menor movimento (ex: Segunda, Terça, Quarta).
 * 
 * Formato: Array JSON com números de 0 (Domingo) a 6 (Sábado)
 * Exemplo: [1, 2, 3] = Segunda, Terça, Quarta
 * 
 * Se o campo for NULL ou array vazio, o cupom é válido para todos os dias.
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('cupons', function(table) {
    // Adicionar coluna para armazenar dias da semana permitidos
    // Tipo JSON para armazenar array de números [0-6]
    // NULL ou array vazio = cupom válido para todos os dias
    table.json('dias_semana_permitidos').nullable().defaultTo(null);
  });
};

/**
 * Reverter migration - Remover coluna dias_semana_permitidos
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('cupons', function(table) {
    table.dropColumn('dias_semana_permitidos');
  });
};

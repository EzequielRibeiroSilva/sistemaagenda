/**
 * Migration: Adicionar campo config_perfil à tabela unidades
 * 
 * Este campo armazenará configurações de personalidade da IA por unidade:
 * - tom_de_voz: "Formal", "Descontraído", "Jovem", etc.
 * - nome_assistente: Nome customizado da assistente virtual
 * - saudacao_personalizada: Mensagem de boas-vindas customizada
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('unidades', function(table) {
    table.text('config_perfil').nullable().comment('Configuração JSON do perfil de atendimento da IA');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('unidades', function(table) {
    table.dropColumn('config_perfil');
  });
};

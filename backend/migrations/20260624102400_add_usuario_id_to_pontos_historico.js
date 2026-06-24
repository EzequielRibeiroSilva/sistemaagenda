/**
 * Migration: Adicionar usuario_id em pontos_historico
 * Descrição: Rastrear autoria (quem autorizou crédito/débito/estorno)
 * Data: 2026-06-24
 */

exports.up = function(knex) {
  return knex.schema.alterTable('pontos_historico', function(table) {
    table.integer('usuario_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('SET NULL');

    table.index('usuario_id');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('pontos_historico', function(table) {
    table.dropIndex('usuario_id');
    table.dropForeign('usuario_id');
    table.dropColumn('usuario_id');
  });
};

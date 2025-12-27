exports.up = function(knex) {
  return knex.schema.alterTable('unidade_excecoes_calendario', function(table) {
    table.time('hora_inicio').nullable();
    table.time('hora_fim').nullable();

    table.index(['unidade_id', 'data_inicio', 'data_fim', 'hora_inicio', 'hora_fim'], 'idx_unidade_excecoes_calendario_unidade_data_horas');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('unidade_excecoes_calendario', function(table) {
    table.dropIndex(['unidade_id', 'data_inicio', 'data_fim', 'hora_inicio', 'hora_fim'], 'idx_unidade_excecoes_calendario_unidade_data_horas');

    table.dropColumn('hora_inicio');
    table.dropColumn('hora_fim');
  });
};

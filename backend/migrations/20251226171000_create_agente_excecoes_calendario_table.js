/**
 * Migration: Criar tabela agente_excecoes_calendario
 *
 * Esta tabela armazena exceções de calendário (folgas, férias, eventos, etc.)
 * por AGENTE, permitindo bloquear datas específicas (dia inteiro) ou intervalos
 * de horários dentro de um dia, sem alterar a agenda semanal.
 */

exports.up = function(knex) {
  return knex.schema.createTable('agente_excecoes_calendario', function(table) {
    table.increments('id').primary();

    table.integer('agente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('agentes')
      .onDelete('CASCADE')
      .onUpdate('CASCADE')
      .comment('ID do agente afetado pela exceção');

    table.date('data_inicio')
      .notNullable()
      .comment('Data de início do bloqueio (inclusivo)');

    table.date('data_fim')
      .notNullable()
      .comment('Data de fim do bloqueio (inclusivo)');

    table.time('hora_inicio')
      .nullable()
      .comment('Hora de início do bloqueio (HH:MM) para bloqueios parciais');

    table.time('hora_fim')
      .nullable()
      .comment('Hora de fim do bloqueio (HH:MM) para bloqueios parciais');

    table.enum('tipo', ['Feriado', 'Férias', 'Evento Especial', 'Manutenção', 'Outro'])
      .notNullable()
      .defaultTo('Outro')
      .comment('Categoria da exceção para organização');

    table.text('descricao')
      .nullable()
      .comment('Descrição opcional');

    table.timestamps(true, true);

    table.index(['agente_id']);
    table.index(['agente_id', 'data_inicio', 'data_fim']);
    table.index(['data_inicio', 'data_fim']);

    table.check('data_fim >= data_inicio', [], 'check_agente_excecao_data_fim_maior_igual_inicio');
    table.check(
      '(hora_inicio IS NULL AND hora_fim IS NULL) OR (hora_inicio IS NOT NULL AND hora_fim IS NOT NULL AND hora_fim > hora_inicio)',
      [],
      'check_agente_excecao_horas_validas'
    );
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('agente_excecoes_calendario');
};

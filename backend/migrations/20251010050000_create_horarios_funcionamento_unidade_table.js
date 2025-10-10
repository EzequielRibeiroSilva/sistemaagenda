/**
 * Migration: Criar tabela horarios_funcionamento_unidade
 * 
 * Esta tabela armazena os horários de funcionamento semanais para cada unidade,
 * permitindo múltiplos períodos por dia usando JSONB para flexibilidade.
 */

exports.up = function(knex) {
  return knex.schema.createTable('horarios_funcionamento_unidade', function(table) {
    // Chave primária
    table.increments('id').primary();
    
    // Chave estrangeira para unidades
    table.integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
    
    // Dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
    table.integer('dia_semana')
      .notNullable()
      .checkIn([0, 1, 2, 3, 4, 5, 6]);
    
    // Horários em formato JSONB para flexibilidade
    // Formato: [{"inicio": "08:00", "fim": "12:00"}, {"inicio": "14:00", "fim": "18:00"}]
    table.jsonb('horarios_json')
      .notNullable()
      .defaultTo('[]');
    
    // Se o local está aberto neste dia
    table.boolean('is_aberto')
      .notNullable()
      .defaultTo(false);
    
    // Timestamps
    table.timestamps(true, true);
    
    // Índices para performance
    table.index(['unidade_id']);
    table.index(['unidade_id', 'dia_semana']);
    
    // Constraint única: uma entrada por unidade por dia da semana
    table.unique(['unidade_id', 'dia_semana']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('horarios_funcionamento_unidade');
};

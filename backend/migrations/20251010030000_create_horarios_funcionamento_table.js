/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('horarios_funcionamento', function(table) {
    table.increments('id').primary();
    table.integer('agente_id').unsigned().references('id').inTable('agentes').onDelete('CASCADE');
    table.integer('dia_semana').notNullable().comment('0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado');
    table.jsonb('periodos').notNullable().comment('Array de períodos: [{start: "08:00", end: "12:00"}, {start: "14:00", end: "18:00"}]');
    table.boolean('ativo').defaultTo(true);
    table.timestamps(true, true);
    
    // Índices para performance
    table.index(['agente_id', 'dia_semana']);
    table.index('agente_id');
    
    // Constraint para garantir que dia_semana seja entre 0-6
    table.check('dia_semana >= 0 AND dia_semana <= 6');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('horarios_funcionamento');
};

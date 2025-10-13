/**
 * Migration: Criar tabela configuracoes_sistema
 * Descrição: Tabela para armazenar configurações do sistema por unidade
 * Data: 2025-10-13
 */

exports.up = function(knex) {
  return knex.schema.createTable('configuracoes_sistema', function(table) {
    // Chave primária e isolamento por unidade
    table.integer('unidade_id').primary().references('id').inTable('unidades').onDelete('CASCADE');
    
    // Informações do negócio
    table.string('nome_negocio', 255).notNullable().defaultTo('Meu Negócio');
    table.text('logo_url').nullable();
    
    // Configurações de agendamento
    table.integer('duracao_servico_minutos').notNullable().defaultTo(60); // 1 hora em minutos
    table.integer('tempo_limite_agendar_horas').notNullable().defaultTo(2); // 2 horas antes
    table.boolean('permitir_cancelamento').notNullable().defaultTo(true);
    table.integer('tempo_limite_cancelar_horas').notNullable().defaultTo(4); // 4 horas antes
    table.integer('periodo_futuro_dias').notNullable().defaultTo(365); // 1 ano
    
    // Timestamps
    table.timestamps(true, true);
    
    // Índices
    table.index('unidade_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('configuracoes_sistema');
};

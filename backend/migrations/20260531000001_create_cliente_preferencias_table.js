/**
 * Migration: Criar tabela cliente_preferencias
 * 
 * FASE 3: Memória de Preferências
 * Permite que o sistema "lembre" das preferências de cada cliente:
 * - Profissional preferido
 * - Observações personalizadas (ex: "Sempre pede café sem açúcar")
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('cliente_preferencias', function(table) {
    table.increments('id').primary();
    
    // FK para cliente (obrigatório)
    table.integer('cliente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clientes')
      .onDelete('CASCADE')
      .comment('Cliente ao qual as preferências pertencem');
    
    // FK para agente preferido (opcional)
    table.integer('profissional_preferido_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('agentes')
      .onDelete('SET NULL')
      .comment('Profissional preferido do cliente');
    
    // Observações em formato texto livre ou JSON
    table.text('observacoes_preferencia')
      .nullable()
      .comment('Observações sobre preferências do cliente (ex: "Sempre pede café sem açúcar", "Prefere horários pela manhã")');
    
    // Timestamps
    table.timestamps(true, true);
    
    // Índice para busca rápida por cliente
    table.index('cliente_id', 'idx_cliente_preferencias_cliente_id');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('cliente_preferencias');
};

/**
 * Migration: Criar tabelas para sistema de cupons de desconto
 * 
 * Tabelas criadas:
 * 1. cupons - Armazena os cupons de desconto criados pelo ADMIN
 * 2. cupons_uso - Rastreia o uso de cupons por clientes
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Tabela principal de cupons
    .createTable('cupons', function(table) {
      table.increments('id').primary();
      
      // Informações básicas do cupom
      table.string('codigo', 50).notNullable().unique();
      table.text('descricao');
      
      // Tipo e valor do desconto
      table.enum('tipo_desconto', ['percentual', 'valor_fixo']).notNullable().defaultTo('percentual');
      table.decimal('valor_desconto', 10, 2).notNullable(); // Percentual (0-100) ou valor em R$
      
      // Valor mínimo do pedido para aplicar o cupom (opcional)
      table.decimal('valor_minimo_pedido', 10, 2).nullable();
      
      // Desconto máximo em R$ (útil para cupons percentuais)
      table.decimal('desconto_maximo', 10, 2).nullable();
      
      // Validade temporal
      table.timestamp('data_inicio').nullable(); // null = sem data de início
      table.timestamp('data_fim').nullable(); // null = sem data de expiração
      
      // Limites de uso
      table.integer('limite_uso_total').nullable(); // null = ilimitado
      table.integer('limite_uso_por_cliente').nullable(); // null = ilimitado
      table.integer('uso_atual').notNullable().defaultTo(0); // Contador de usos totais
      
      // Status e controle
      table.enum('status', ['Ativo', 'Inativo', 'Expirado']).notNullable().defaultTo('Ativo');
      table.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
      
      // Timestamps
      table.timestamps(true, true);
      
      // Índices para performance
      table.index('codigo');
      table.index('status');
      table.index('usuario_id');
      table.index(['data_inicio', 'data_fim']);
    })
    
    // Tabela de rastreamento de uso de cupons
    .createTable('cupons_uso', function(table) {
      table.increments('id').primary();
      
      // Relacionamentos
      table.integer('cupom_id').unsigned().notNullable().references('id').inTable('cupons').onDelete('CASCADE');
      table.integer('cliente_id').unsigned().notNullable().references('id').inTable('clientes').onDelete('CASCADE');
      table.integer('agendamento_id').unsigned().nullable().references('id').inTable('agendamentos').onDelete('SET NULL');
      
      // Informações do uso
      table.decimal('valor_original', 10, 2).notNullable(); // Valor antes do desconto
      table.decimal('valor_desconto', 10, 2).notNullable(); // Valor do desconto aplicado
      table.decimal('valor_final', 10, 2).notNullable(); // Valor após desconto
      
      // Timestamp do uso
      table.timestamp('usado_em').notNullable().defaultTo(knex.fn.now());
      
      // Índices para performance e integridade
      table.index('cupom_id');
      table.index('cliente_id');
      table.index('agendamento_id');
      table.index('usado_em');
      
      // Índice composto para verificar uso por cliente
      table.index(['cupom_id', 'cliente_id']);
    });
};

/**
 * Reverter migration - Remover tabelas de cupons
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('cupons_uso')
    .dropTableIfExists('cupons');
};

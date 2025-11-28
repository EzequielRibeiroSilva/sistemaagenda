/**
 * Migration: Criar tabela pontos_historico
 * Descrição: Armazena histórico de movimentações de pontos (créditos e débitos)
 * Data: 2025-11-28
 */

exports.up = function(knex) {
  return knex.schema.createTable('pontos_historico', function(table) {
    // Chave primária
    table.increments('id').primary();
    
    // Relacionamentos
    table.integer('cliente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clientes')
      .onDelete('CASCADE')
      .comment('Cliente dono dos pontos');
    
    table.integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE')
      .comment('Unidade onde a movimentação ocorreu');
    
    table.integer('agendamento_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('agendamentos')
      .onDelete('SET NULL')
      .comment('Agendamento relacionado (se aplicável)');
    
    // Dados da movimentação
    table.enum('tipo', ['CREDITO', 'DEBITO'])
      .notNullable()
      .comment('Tipo de movimentação: CREDITO (ganhou pontos) ou DEBITO (usou pontos)');
    
    table.decimal('pontos', 10, 2)
      .notNullable()
      .comment('Quantidade de pontos movimentados (sempre positivo)');
    
    table.decimal('valor_real', 10, 2)
      .nullable()
      .comment('Valor em reais relacionado à movimentação');
    
    table.text('descricao')
      .nullable()
      .comment('Descrição da movimentação (ex: "Ganhou pontos pelo agendamento #123")');
    
    // Validade (para créditos)
    table.date('data_validade')
      .nullable()
      .comment('Data de validade dos pontos (apenas para CREDITO)');
    
    table.boolean('expirado')
      .defaultTo(false)
      .comment('Indica se os pontos expiraram');
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Índices para performance
    table.index('cliente_id');
    table.index('unidade_id');
    table.index('agendamento_id');
    table.index('tipo');
    table.index('data_validade');
    table.index(['cliente_id', 'unidade_id']);
    table.index(['cliente_id', 'tipo']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('pontos_historico');
};

/**
 * Migration: Criar tabela lista_espera
 * 
 * FASE 4: Lista de Espera Inteligente
 * Permite que clientes entrem em lista de espera quando não há horários disponíveis.
 * Sistema automatizado notifica clientes quando surgem vagas por cancelamento.
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('lista_espera', function(table) {
    table.increments('id').primary();
    
    // FK para unidade (obrigatório - multi-tenant)
    table.integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE')
      .comment('Unidade onde o cliente quer agendar');
    
    // FK para cliente (obrigatório)
    table.integer('cliente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clientes')
      .onDelete('CASCADE')
      .comment('Cliente que está na lista de espera');
    
    // FK para agente/profissional (opcional - pode querer qualquer profissional)
    table.integer('agente_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('agentes')
      .onDelete('SET NULL')
      .comment('Profissional desejado (null = qualquer profissional)');
    
    // Data desejada
    table.date('data_desejada')
      .notNullable()
      .comment('Data em que o cliente deseja agendar');
    
    // Hora de início desejada (opcional - pode aceitar qualquer horário)
    table.time('hora_inicio')
      .nullable()
      .comment('Horário específico desejado (null = qualquer horário do dia)');
    
    // Serviços desejados (JSON array de IDs)
    table.jsonb('servicos')
      .notNullable()
      .comment('Array de IDs de serviços desejados [1, 2, 3]');
    
    // Status da lista de espera
    table.enum('status', ['pendente', 'notificado', 'atendido', 'cancelado', 'expirado'])
      .notNullable()
      .defaultTo('pendente')
      .comment('Status: pendente (aguardando vaga), notificado (cliente foi avisado), atendido (agendou), cancelado (desistiu), expirado (passou a data)');
    
    // Telefone do cliente (desnormalizado para facilitar notificação)
    table.string('telefone_cliente', 20)
      .notNullable()
      .comment('Telefone do cliente (desnormalizado para performance)');
    
    // Data/hora da notificação (quando o cliente foi avisado)
    table.timestamp('notificado_em')
      .nullable()
      .comment('Quando o cliente foi notificado sobre uma vaga');
    
    // ID do agendamento que gerou a vaga (para auditoria)
    table.integer('agendamento_cancelado_id')
      .unsigned()
      .nullable()
      .comment('ID do agendamento cancelado que gerou a vaga (auditoria)');
    
    // Timestamps
    table.timestamps(true, true);
    
    // Índices para performance
    table.index('unidade_id', 'idx_lista_espera_unidade_id');
    table.index('cliente_id', 'idx_lista_espera_cliente_id');
    table.index('status', 'idx_lista_espera_status');
    table.index(['data_desejada', 'status'], 'idx_lista_espera_data_status');
    table.index(['unidade_id', 'data_desejada', 'status'], 'idx_lista_espera_busca_vagas');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('lista_espera');
};

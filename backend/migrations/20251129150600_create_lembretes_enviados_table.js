/**
 * Migration: Criar tabela lembretes_enviados
 * Descrição: Tabela para rastrear lembretes enviados e prevenir duplicatas
 * Data: 2025-11-29
 */

exports.up = function(knex) {
  return knex.schema.createTable('lembretes_enviados', (table) => {
    // Chave primária
    table.increments('id').primary();

    // Relacionamentos
    table.integer('agendamento_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('agendamentos')
      .onDelete('CASCADE')
      .comment('ID do agendamento relacionado');

    table.integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE')
      .comment('ID da unidade (multi-tenancy)');

    // Tipo de lembrete
    table.enum('tipo_lembrete', ['24h', '2h'])
      .notNullable()
      .comment('Tipo do lembrete: 24h ou 2h antes do agendamento');

    // Status do envio
    table.enum('status', ['pendente', 'enviado', 'falha', 'falha_permanente'])
      .notNullable()
      .defaultTo('pendente')
      .comment('Status do envio do lembrete');

    // Tentativas de envio
    table.integer('tentativas')
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment('Número de tentativas de envio');

    // Dados do envio
    table.string('telefone_destino', 20)
      .notNullable()
      .comment('Telefone do cliente que recebeu o lembrete');

    table.text('mensagem_enviada')
      .nullable()
      .comment('Conteúdo da mensagem enviada');

    table.string('whatsapp_message_id', 100)
      .nullable()
      .comment('ID da mensagem retornado pela Evolution API');

    // Logs de erro
    table.text('erro_detalhes')
      .nullable()
      .comment('Detalhes do erro em caso de falha');

    table.timestamp('ultima_tentativa')
      .nullable()
      .comment('Data/hora da última tentativa de envio');

    // Timestamps
    table.timestamp('enviado_em')
      .nullable()
      .comment('Data/hora do envio bem-sucedido');

    table.timestamp('created_at')
      .defaultTo(knex.fn.now())
      .notNullable();

    table.timestamp('updated_at')
      .defaultTo(knex.fn.now())
      .notNullable();

    // Índices para performance
    table.index('agendamento_id', 'idx_lembretes_agendamento');
    table.index('unidade_id', 'idx_lembretes_unidade');
    table.index('status', 'idx_lembretes_status');
    table.index('tipo_lembrete', 'idx_lembretes_tipo');
    table.index(['agendamento_id', 'tipo_lembrete'], 'idx_lembretes_agendamento_tipo');
    table.index('created_at', 'idx_lembretes_created');

    // Constraint única: um lembrete de cada tipo por agendamento
    table.unique(['agendamento_id', 'tipo_lembrete'], 'uk_lembretes_agendamento_tipo');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('lembretes_enviados');
};

/**
 * Migration: Criar tabela aniversarios_enviados
 * Descrição: Rastrear envios de mensagens de feliz aniversário (1x/ano por cliente/unidade)
 * Data: 2025-12-28
 */

exports.up = function(knex) {
  return knex.schema.createTable('aniversarios_enviados', (table) => {
    table.increments('id').primary();

    table.integer('cliente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clientes')
      .onDelete('CASCADE');

    table.integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE');

    table.integer('ano')
      .unsigned()
      .notNullable();

    table.enum('status', ['programado', 'pendente', 'enviado', 'falha', 'falha_permanente'])
      .notNullable()
      .defaultTo('programado');

    table.integer('tentativas')
      .unsigned()
      .notNullable()
      .defaultTo(0);

    table.string('telefone_destino', 20)
      .notNullable();

    table.text('mensagem_enviada')
      .nullable();

    table.string('whatsapp_message_id', 100)
      .nullable();

    table.text('erro_detalhes')
      .nullable();

    table.timestamp('ultima_tentativa')
      .nullable();

    table.timestamp('enviar_em')
      .nullable();

    table.timestamp('enviado_em')
      .nullable();

    table.timestamp('created_at')
      .defaultTo(knex.fn.now())
      .notNullable();

    table.timestamp('updated_at')
      .defaultTo(knex.fn.now())
      .notNullable();

    table.unique(['cliente_id', 'unidade_id', 'ano'], 'uk_aniversarios_cliente_unidade_ano');
    table.index(['status', 'enviar_em'], 'idx_aniversarios_programados');
    table.index('cliente_id', 'idx_aniversarios_cliente');
    table.index('unidade_id', 'idx_aniversarios_unidade');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('aniversarios_enviados');
};

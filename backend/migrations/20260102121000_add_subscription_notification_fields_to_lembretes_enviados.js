exports.up = async function(knex) {
  await knex.schema.table('lembretes_enviados', function(table) {
    table.integer('cliente_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('clientes')
      .onDelete('SET NULL');

    // Referência do ciclo/validade da assinatura (YYYY-MM-DD)
    table.date('assinatura_referencia')
      .nullable();

    table.index(['cliente_id', 'tipo_notificacao'], 'idx_lembretes_cliente_tipo_notificacao');
    table.index(['assinatura_referencia'], 'idx_lembretes_assinatura_referencia');
  });

  // Unicidade para notificações de assinatura (quando NÃO há agendamento)
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_lembretes_cliente_tipo_notificacao_assinatura_ref
    ON lembretes_enviados (cliente_id, tipo_notificacao, assinatura_referencia)
    WHERE agendamento_id IS NULL AND cliente_id IS NOT NULL AND tipo_notificacao IS NOT NULL AND assinatura_referencia IS NOT NULL;
  `);
};

exports.down = async function(knex) {
  // Não reverter automaticamente (pode haver dados dependentes)
  console.log('Down migration não implementada: campos de assinatura permanecem');
};

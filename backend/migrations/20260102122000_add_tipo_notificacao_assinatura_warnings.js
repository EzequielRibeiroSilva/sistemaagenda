exports.up = async function(knex) {
  await knex.raw(`
    ALTER TABLE lembretes_enviados
    DROP CONSTRAINT IF EXISTS lembretes_enviados_tipo_notificacao_check;
  `);

  await knex.raw(`
    ALTER TABLE lembretes_enviados
    ADD CONSTRAINT lembretes_enviados_tipo_notificacao_check
    CHECK (
      tipo_notificacao = ANY (
        ARRAY[
          'confirmacao'::text,
          'cancelamento'::text,
          'reagendamento'::text,
          'lembrete_24h'::text,
          'lembrete_1h'::text,
          'convite_retorno'::text,
          'assinatura_aviso_admin'::text,
          'assinatura_aviso_cliente'::text
        ]
      )
    );
  `);
};

exports.down = async function(knex) {
  // Reverter removendo os tipos novos do CHECK
  await knex.raw(`
    ALTER TABLE lembretes_enviados
    DROP CONSTRAINT IF EXISTS lembretes_enviados_tipo_notificacao_check;
  `);

  await knex.raw(`
    ALTER TABLE lembretes_enviados
    ADD CONSTRAINT lembretes_enviados_tipo_notificacao_check
    CHECK (
      tipo_notificacao = ANY (
        ARRAY[
          'confirmacao'::text,
          'cancelamento'::text,
          'reagendamento'::text,
          'lembrete_24h'::text,
          'lembrete_1h'::text,
          'convite_retorno'::text
        ]
      )
    );
  `);
};

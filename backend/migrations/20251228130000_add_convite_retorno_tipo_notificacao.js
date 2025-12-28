/**
 * Migration: Adicionar tipo_notificacao 'convite_retorno'
 * Descrição: Expande enum tipo_notificacao para suportar Convite de retorno pós-serviço
 * Data: 2025-12-28
 */

exports.up = async function(knex) {
  // ✅ IMPORTANTE: neste projeto, tipo_notificacao foi criado como TEXT + CHECK constraint
  // (não como enum nativo do PostgreSQL). Portanto, devemos expandir o CHECK.
  // Ainda assim, mantemos fallback para o caso de existir enum nativo em outros ambientes.

  // 1) Se existir enum nativo, tentar adicionar o valor
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'lembretes_enviados_tipo_notificacao_enum'
      ) THEN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'lembretes_enviados_tipo_notificacao_enum'
            AND e.enumlabel = 'convite_retorno'
        ) THEN
          ALTER TYPE lembretes_enviados_tipo_notificacao_enum ADD VALUE 'convite_retorno';
        END IF;
      END IF;
    END$$;
  `);

  // 2) Atualizar CHECK constraint (ambiente atual)
  await knex.raw(`
    ALTER TABLE lembretes_enviados
    DROP CONSTRAINT IF EXISTS lembretes_enviados_tipo_notificacao_check;

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

exports.down = async function(knex) {
  // Reverter o CHECK constraint para o conjunto anterior.
  // Obs: Se existir enum nativo, não removemos o valor (PostgreSQL não suporta facilmente).
  await knex.raw(`
    ALTER TABLE lembretes_enviados
    DROP CONSTRAINT IF EXISTS lembretes_enviados_tipo_notificacao_check;

    ALTER TABLE lembretes_enviados
    ADD CONSTRAINT lembretes_enviados_tipo_notificacao_check
    CHECK (
      tipo_notificacao = ANY (
        ARRAY[
          'confirmacao'::text,
          'cancelamento'::text,
          'reagendamento'::text,
          'lembrete_24h'::text,
          'lembrete_1h'::text
        ]
      )
    );
  `);
};

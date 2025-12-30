exports.up = async function(knex) {
  // 1) Remover NOT NULL do agendamento_id
  await knex.raw(`
    ALTER TABLE lembretes_enviados
    ALTER COLUMN agendamento_id DROP NOT NULL;
  `);

  // 1.1) Remover duplicidades históricas (agendamento_id, tipo_lembrete)
  // Mantém o registro mais antigo (menor id) para permitir a criação do índice único.
  await knex.raw(`
    DELETE FROM lembretes_enviados le
    USING (
      SELECT agendamento_id, tipo_lembrete, MIN(id) AS keep_id
      FROM lembretes_enviados
      WHERE agendamento_id IS NOT NULL
        AND tipo_lembrete IS NOT NULL
      GROUP BY agendamento_id, tipo_lembrete
      HAVING COUNT(*) > 1
    ) d
    WHERE le.agendamento_id = d.agendamento_id
      AND le.tipo_lembrete = d.tipo_lembrete
      AND le.id <> d.keep_id;
  `);

  // 2) Ajustar índice único legado (agendamento_id, tipo_lembrete) para não bloquear registros sem agendamento
  // Mantém o comportamento anterior para lembretes ligados a agendamento.
  await knex.raw(`
    DROP INDEX IF EXISTS uk_lembretes_agendamento_tipo;
    CREATE UNIQUE INDEX IF NOT EXISTS uk_lembretes_agendamento_tipo
    ON lembretes_enviados (agendamento_id, tipo_lembrete)
    WHERE agendamento_id IS NOT NULL AND tipo_lembrete IS NOT NULL;
  `);

  // 3) Ajustar índice único parcial por (agendamento_id, tipo_notificacao)
  // Mantém o comportamento anterior para notificações ligadas a agendamento.
  await knex.raw(`
    DROP INDEX IF EXISTS uk_lembretes_agendamento_tipo_notificacao;
    CREATE UNIQUE INDEX IF NOT EXISTS uk_lembretes_agendamento_tipo_notificacao
    ON lembretes_enviados (agendamento_id, tipo_notificacao)
    WHERE agendamento_id IS NOT NULL AND tipo_notificacao IS NOT NULL;
  `);
};

exports.down = async function(knex) {
  // Não reverter automaticamente para evitar quebrar notificações já registradas sem agendamento.
  // Caso seja realmente necessário, teria que excluir/ajustar esses registros antes.
  console.log('Down migration não implementada: agendamento_id permanece nullable');
};

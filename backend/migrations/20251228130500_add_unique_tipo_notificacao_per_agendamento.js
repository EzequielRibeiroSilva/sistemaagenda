/**
 * Migration: Garantir unicidade por agendamento + tipo_notificacao
 * Descrição: Evita duplicidade de notificações programadas (inclui convite_retorno)
 * Data: 2025-12-28
 */

exports.up = async function(knex) {
  // ✅ Pré-requisito: Remover duplicidades históricas
  // Motivo: já existem registros duplicados (agendamento_id, tipo_notificacao) e isso impede
  // a criação do índice único. Mantemos o registro mais antigo (menor id) e removemos os demais.
  await knex.raw(`
    DELETE FROM lembretes_enviados le
    USING (
      SELECT agendamento_id, tipo_notificacao, MIN(id) AS keep_id
      FROM lembretes_enviados
      WHERE tipo_notificacao IS NOT NULL
      GROUP BY agendamento_id, tipo_notificacao
      HAVING COUNT(*) > 1
    ) d
    WHERE le.agendamento_id = d.agendamento_id
      AND le.tipo_notificacao = d.tipo_notificacao
      AND le.id <> d.keep_id;
  `);

  // Criar índice único parcial: somente quando tipo_notificacao NÃO é null
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_lembretes_agendamento_tipo_notificacao
    ON lembretes_enviados (agendamento_id, tipo_notificacao)
    WHERE tipo_notificacao IS NOT NULL;
  `);
};

exports.down = async function(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS uk_lembretes_agendamento_tipo_notificacao;
  `);
};

/**
 * Migration: Adicionar constraint única para avisos de assinatura
 * 
 * Problema: Avisos de assinatura (agendamento_id=NULL) não estão protegidos
 * contra duplicidade, causando erros de "duplicate key value violates unique constraint"
 * 
 * Solução: Criar índice único parcial para (cliente_id, tipo_notificacao, assinatura_referencia)
 * quando agendamento_id IS NULL
 */

exports.up = async function(knex) {
  // 1) Remover duplicatas existentes (mantém o registro mais antigo)
  await knex.raw(`
    DELETE FROM lembretes_enviados le
    USING (
      SELECT 
        cliente_id, 
        tipo_notificacao, 
        assinatura_referencia, 
        MIN(id) AS keep_id
      FROM lembretes_enviados
      WHERE agendamento_id IS NULL
        AND cliente_id IS NOT NULL
        AND tipo_notificacao IS NOT NULL
        AND assinatura_referencia IS NOT NULL
      GROUP BY cliente_id, tipo_notificacao, assinatura_referencia
      HAVING COUNT(*) > 1
    ) AS dups
    WHERE le.cliente_id = dups.cliente_id
      AND le.tipo_notificacao = dups.tipo_notificacao
      AND le.assinatura_referencia = dups.assinatura_referencia
      AND le.id != dups.keep_id
      AND le.agendamento_id IS NULL;
  `);

  // 2) Criar índice único parcial para avisos de assinatura
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_lembretes_assinatura_cliente_tipo_ref
    ON lembretes_enviados (cliente_id, tipo_notificacao, assinatura_referencia)
    WHERE agendamento_id IS NULL 
      AND cliente_id IS NOT NULL 
      AND tipo_notificacao IS NOT NULL 
      AND assinatura_referencia IS NOT NULL;
  `);

  console.log('✅ [Migration] Constraint única para avisos de assinatura criada com sucesso');
};

exports.down = async function(knex) {
  // Remover o índice único
  await knex.raw(`
    DROP INDEX IF EXISTS uk_lembretes_assinatura_cliente_tipo_ref;
  `);

  console.log('✅ [Migration] Constraint única para avisos de assinatura removida');
};

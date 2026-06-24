/**
 * Migration: Padronizar taxonomia do campo tipo em pontos_historico
 * Data: 2026-06-24
 */

const OLD_TYPES = ['CREDITO', 'DEBITO'];
const NEW_TYPES = [
  'CREDITO_VENDAS',
  'DEBITO_RESGATE',
  'ESTORNO_VENDAS',
  'AJUSTE_MANUAL',
  'EXPIRACAO'
];

exports.up = async function(knex) {
  // 1) Remover constraint antiga (se existir) para evitar bloqueio durante migração
  await knex.raw(`
    ALTER TABLE pontos_historico
    DROP CONSTRAINT IF EXISTS pontos_historico_tipo_check;
  `);

  // 2) Trocar o tipo da coluna para TEXT (enum/check antigo pode bloquear novos valores)
  await knex.raw(`
    ALTER TABLE pontos_historico
    ALTER COLUMN tipo TYPE TEXT
    USING tipo::text;
  `);

  // 3) Migrar dados legados para os novos tipos
  // - CREDITO (legado) -> CREDITO_VENDAS
  // - DEBITO (legado)  -> DEBITO_RESGATE
  await knex('pontos_historico')
    .where('tipo', 'CREDITO')
    .update({ tipo: 'CREDITO_VENDAS' });

  await knex('pontos_historico')
    .where('tipo', 'DEBITO')
    .update({ tipo: 'DEBITO_RESGATE' });

  // 4) Aplicar constraint rígida
  await knex.raw(`
    ALTER TABLE pontos_historico
    ADD CONSTRAINT pontos_historico_tipo_check
    CHECK (tipo IN (${NEW_TYPES.map(t => `'${t}'`).join(', ')}));
  `);
};

exports.down = async function(knex) {
  // 1) Remover constraint
  await knex.raw(`
    ALTER TABLE pontos_historico
    DROP CONSTRAINT IF EXISTS pontos_historico_tipo_check;
  `);

  // 2) Garantir que a coluna é TEXT para permitir rollback dos valores
  await knex.raw(`
    ALTER TABLE pontos_historico
    ALTER COLUMN tipo TYPE TEXT
    USING tipo::text;
  `);

  // 3) Voltar dados para tipos antigos
  await knex('pontos_historico')
    .where('tipo', 'CREDITO_VENDAS')
    .update({ tipo: 'CREDITO' });

  await knex('pontos_historico')
    .where('tipo', 'DEBITO_RESGATE')
    .update({ tipo: 'DEBITO' });

  await knex('pontos_historico')
    .whereIn('tipo', ['ESTORNO_VENDAS', 'AJUSTE_MANUAL', 'EXPIRACAO'])
    .update({ tipo: 'DEBITO' });

  // 4) Reintroduzir check simples para ['CREDITO','DEBITO'] para compatibilidade.
  await knex.raw(`
    ALTER TABLE pontos_historico
    ADD CONSTRAINT pontos_historico_tipo_check
    CHECK (tipo IN (${OLD_TYPES.map(t => `'${t}'`).join(', ')}));
  `);
};

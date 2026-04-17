/**
 * Fase 2.1 (Clube): Adiciona campo explícito de status da assinatura.
 * Domínio: 'Ativo' | 'Pagamento Pendente' | 'Cancelado' | NULL (nunca assinou)
 * Backfill: clientes legados com is_assinante=true -> 'Ativo'
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('clientes', function(table) {
    table.string('assinatura_status', 30).nullable();
    table.index(['assinatura_status'], 'idx_clientes_assinatura_status');
  });

  // Backfill legado: assinantes atuais viram Ativo (somente se ainda não definido)
  await knex('clientes')
    .where('is_assinante', true)
    .whereNull('assinatura_status')
    .update({ assinatura_status: 'Ativo' });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('clientes', function(table) {
    table.dropIndex(['assinatura_status'], 'idx_clientes_assinatura_status');
    table.dropColumn('assinatura_status');
  });
};

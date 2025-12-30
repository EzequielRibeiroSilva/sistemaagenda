/**
 * Ajusta o escopo do Clube de Assinatura para ser por usuário (ADMIN)
 * - Adiciona usuario_id em planos_assinatura
 * - Torna unidade_id opcional (mantido apenas para compatibilidade)
 * - Atualiza índices/constraints para usuario_id + nome
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  // 1) Adicionar coluna usuario_id (nullable inicialmente para permitir backfill)
  await knex.schema.alterTable('planos_assinatura', (table) => {
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios').onDelete('CASCADE');
    table.index('usuario_id');
  });

  // 2) Backfill (se existirem dados): usuario_id = unidades.usuario_id
  await knex('planos_assinatura')
    .whereNull('usuario_id')
    .update({
      usuario_id: knex.raw('(select u.usuario_id from unidades u where u.id = planos_assinatura.unidade_id)')
    });

  // 3) Ajustar unidade_id para nullable (compatibilidade)
  await knex.schema.alterTable('planos_assinatura', (table) => {
    table.integer('unidade_id').unsigned().nullable().alter();
  });

  // 4) Tornar usuario_id NOT NULL após backfill
  await knex.schema.alterTable('planos_assinatura', (table) => {
    table.integer('usuario_id').unsigned().notNullable().alter();
  });

  // 5) Ajustar constraints/índices
  // Remover unique antigo por unidade (se existir)
  await knex.raw('ALTER TABLE planos_assinatura DROP CONSTRAINT IF EXISTS uk_planos_assinatura_unidade_nome');

  // Criar unique por usuario
  await knex.schema.alterTable('planos_assinatura', (table) => {
    table.unique(['usuario_id', 'nome'], 'uk_planos_assinatura_usuario_nome');
    table.index(['usuario_id', 'status'], 'idx_planos_assinatura_usuario_status');
  });
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  // Remover índices/constraints novos
  await knex.raw('ALTER TABLE planos_assinatura DROP CONSTRAINT IF EXISTS uk_planos_assinatura_usuario_nome');
  await knex.raw('DROP INDEX IF EXISTS idx_planos_assinatura_usuario_status');

  // Restaurar unique antigo por unidade
  await knex.schema.alterTable('planos_assinatura', (table) => {
    table.unique(['unidade_id', 'nome'], 'uk_planos_assinatura_unidade_nome');
  });

  // Voltar unidade_id para NOT NULL
  await knex.schema.alterTable('planos_assinatura', (table) => {
    table.integer('unidade_id').unsigned().notNullable().alter();
  });

  // Remover usuario_id
  await knex.schema.alterTable('planos_assinatura', (table) => {
    table.dropIndex('usuario_id');
    table.dropColumn('usuario_id');
  });
};

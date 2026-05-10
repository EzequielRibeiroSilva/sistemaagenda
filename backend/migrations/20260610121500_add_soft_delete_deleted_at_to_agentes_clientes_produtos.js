/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasDeletedAtAgentes = await knex.schema.hasColumn('agentes', 'deleted_at');
  if (!hasDeletedAtAgentes) {
    await knex.schema.alterTable('agentes', (table) => {
      table.timestamp('deleted_at').nullable();
      table.index(['usuario_id', 'deleted_at'], 'idx_agentes_usuario_deleted_at');
    });
  }

  const hasDeletedAtClientes = await knex.schema.hasColumn('clientes', 'deleted_at');
  if (!hasDeletedAtClientes) {
    const hasUnidadeIdClientes = await knex.schema.hasColumn('clientes', 'unidade_id');
    await knex.schema.alterTable('clientes', (table) => {
      table.timestamp('deleted_at').nullable();
      if (hasUnidadeIdClientes) {
        table.index(['unidade_id', 'deleted_at'], 'idx_clientes_unidade_deleted_at');
      } else {
        table.index(['usuario_id', 'deleted_at'], 'idx_clientes_usuario_deleted_at');
      }
    });
  }

  const hasDeletedAtProdutos = await knex.schema.hasColumn('produtos', 'deleted_at');
  if (!hasDeletedAtProdutos) {
    await knex.schema.alterTable('produtos', (table) => {
      table.timestamp('deleted_at').nullable();
      table.index(['usuario_id', 'deleted_at'], 'idx_produtos_usuario_deleted_at');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasDeletedAtAgentes = await knex.schema.hasColumn('agentes', 'deleted_at');
  if (hasDeletedAtAgentes) {
    await knex.schema.alterTable('agentes', (table) => {
      table.dropIndex(['usuario_id', 'deleted_at'], 'idx_agentes_usuario_deleted_at');
      table.dropColumn('deleted_at');
    });
  }

  const hasDeletedAtClientes = await knex.schema.hasColumn('clientes', 'deleted_at');
  if (hasDeletedAtClientes) {
    const hasUnidadeIdClientes = await knex.schema.hasColumn('clientes', 'unidade_id');
    await knex.schema.alterTable('clientes', (table) => {
      if (hasUnidadeIdClientes) {
        table.dropIndex(['unidade_id', 'deleted_at'], 'idx_clientes_unidade_deleted_at');
      } else {
        table.dropIndex(['usuario_id', 'deleted_at'], 'idx_clientes_usuario_deleted_at');
      }
      table.dropColumn('deleted_at');
    });
  }

  const hasDeletedAtProdutos = await knex.schema.hasColumn('produtos', 'deleted_at');
  if (hasDeletedAtProdutos) {
    await knex.schema.alterTable('produtos', (table) => {
      table.dropIndex(['usuario_id', 'deleted_at'], 'idx_produtos_usuario_deleted_at');
      table.dropColumn('deleted_at');
    });
  }
};

/**
 * Migration: Adicionar comissao_percentual em produtos
 */

exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('produtos', 'comissao_percentual');
  if (!hasColumn) {
    await knex.schema.alterTable('produtos', (table) => {
      table.decimal('comissao_percentual', 5, 2).notNullable().defaultTo(0.0);
      table.index(['usuario_id', 'comissao_percentual'], 'idx_produtos_usuario_comissao_percentual');
    });
  }
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('produtos', 'comissao_percentual');
  if (hasColumn) {
    await knex.schema.alterTable('produtos', (table) => {
      table.dropIndex(['usuario_id', 'comissao_percentual'], 'idx_produtos_usuario_comissao_percentual');
      table.dropColumn('comissao_percentual');
    });
  }
};

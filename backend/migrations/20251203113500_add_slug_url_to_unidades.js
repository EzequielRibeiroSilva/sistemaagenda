/**
 * Migration: Adicionar coluna slug_url na tabela unidades
 * Data: 03/12/2025
 * Descrição: Adiciona campo slug_url para gerar links de booking personalizados
 * NOTA: Esta migration verifica se a coluna já existe antes de adicionar
 */

exports.up = async function(knex) {
  // Verificar se a coluna já existe
  const hasColumn = await knex.schema.hasColumn('unidades', 'slug_url');

  if (!hasColumn) {
    return knex.schema.table('unidades', function(table) {
      // Adicionar coluna slug_url (URL amigável para booking)
      table.string('slug_url', 255).nullable();

      // Adicionar índice para busca rápida por slug
      table.index('slug_url');
    });
  }

  // Coluna já existe, não fazer nada
  console.log('Coluna slug_url já existe na tabela unidades, pulando...');
};

exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('unidades', 'slug_url');

  if (hasColumn) {
    return knex.schema.table('unidades', function(table) {
      // Remover índice
      table.dropIndex('slug_url');

      // Remover coluna
      table.dropColumn('slug_url');
    });
  }
};

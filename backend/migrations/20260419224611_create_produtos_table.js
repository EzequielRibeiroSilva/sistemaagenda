/**
 * Migration: Criar tabela produtos (catálogo global por tenant)
 * Sprint 1 - Estoque ELITE
 *
 * Produto é global do usuário (tenant) via usuario_id.
 */

exports.up = function (knex) {
  return knex.schema.createTable('produtos', function (table) {
    table.increments('id').primary();

    table
      .integer('usuario_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('usuarios')
      .onDelete('CASCADE');

    table.string('nome', 255).notNullable();
    table.text('descricao').nullable();

    // SKU interno / EAN (barcode)
    table.string('sku_ean', 100).nullable();

    table.string('marca', 255).nullable();

    table
      .enu('unidade_medida', ['UN', 'ML', 'G'])
      .notNullable()
      .defaultTo('UN');

    table.decimal('preco_custo_medio', 10, 2).notNullable().defaultTo(0.0);

    table.timestamps(true, true);

    // Índices
    table.index(['usuario_id'], 'idx_produtos_usuario');
    table.index(['usuario_id', 'nome'], 'idx_produtos_usuario_nome');
  }).then(() => {
    // Índice único parcial: permitir múltiplos NULLs, mas evitar duplicidade quando sku_ean for informado
    return knex.raw(
      'CREATE UNIQUE INDEX uk_produtos_usuario_sku_ean ON produtos (usuario_id, sku_ean) WHERE sku_ean IS NOT NULL;'
    );
  });
};

exports.down = function (knex) {
  return knex.schema
    .raw('DROP INDEX IF EXISTS uk_produtos_usuario_sku_ean;')
    .then(() => knex.schema.dropTableIfExists('produtos'));
};

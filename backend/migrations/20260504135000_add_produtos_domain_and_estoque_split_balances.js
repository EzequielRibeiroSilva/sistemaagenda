/**
 * Sprint 1 - DNA do Estoque (Muralha de Domínios)
 * - Evolução do catálogo (produtos): tipo_item, uom_consumo, fator_conversao
 * - Isolamento de saldos (estoque_unidades): saldo_venda, saldo_consumo
 */

exports.up = async function (knex) {
  await knex.schema.alterTable('produtos', function (table) {
    table
      .enu('tipo_item', ['VENDA', 'CONSUMO', 'AMBOS'])
      .notNullable()
      .defaultTo('VENDA');

    table
      .enu('uom_consumo', ['ML', 'G', 'UN'])
      .notNullable()
      .defaultTo('UN');

    table.decimal('fator_conversao', 14, 3).nullable();

    table.index(['tipo_item'], 'idx_produtos_tipo_item');
  });

  await knex.schema.alterTable('estoque_unidades', function (table) {
    table.integer('saldo_venda').notNullable().defaultTo(0);
    table.decimal('saldo_consumo', 14, 3).notNullable().defaultTo(0);
  });

  await knex.raw(
    "ALTER TABLE estoque_unidades ADD CONSTRAINT chk_estoque_unidades_saldo_venda_nonneg CHECK (saldo_venda >= 0);"
  );

  await knex.raw(
    "ALTER TABLE estoque_unidades ADD CONSTRAINT chk_estoque_unidades_saldo_consumo_nonneg CHECK (saldo_consumo >= 0);"
  );
};

exports.down = async function (knex) {
  await knex.raw(
    'ALTER TABLE estoque_unidades DROP CONSTRAINT IF EXISTS chk_estoque_unidades_saldo_venda_nonneg;'
  );

  await knex.raw(
    'ALTER TABLE estoque_unidades DROP CONSTRAINT IF EXISTS chk_estoque_unidades_saldo_consumo_nonneg;'
  );

  await knex.schema.alterTable('estoque_unidades', function (table) {
    table.dropColumn('saldo_venda');
    table.dropColumn('saldo_consumo');
  });

  await knex.schema.alterTable('produtos', function (table) {
    table.dropIndex(['tipo_item'], 'idx_produtos_tipo_item');
    table.dropColumn('tipo_item');
    table.dropColumn('uom_consumo');
    table.dropColumn('fator_conversao');
  });
};

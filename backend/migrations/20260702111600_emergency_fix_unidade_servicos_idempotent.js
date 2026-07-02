/**
 * EMERGENCY MIGRATION (Idempotent)
 * Goal: Ensure unidade_servicos table exists and is structurally robust.
 *
 * Must succeed in:
 * - Environments where the table does not exist
 * - Environments with schema drift / partial objects
 */

async function constraintExists(knex, constraintName) {
  const result = await knex.raw(
    `SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = ?
    ) as exists`,
    [constraintName]
  );

  return result.rows?.[0]?.exists === true;
}

async function indexExists(knex, indexName) {
  const result = await knex.raw(
    `SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE indexname = ?
    ) as exists`,
    [indexName]
  );

  return result.rows?.[0]?.exists === true;
}

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('unidade_servicos');

  if (!hasTable) {
    await knex.schema.createTable('unidade_servicos', (table) => {
      table.increments('id').primary();

      table
        .integer('unidade_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('unidades')
        .onDelete('CASCADE');

      table
        .integer('servico_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('servicos')
        .onDelete('CASCADE');

      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['unidade_id'], 'idx_unidade_servicos_unidade_id');
      table.index(['servico_id'], 'idx_unidade_servicos_servico_id');
    });
  }

  const hasUnidadeId = await knex.schema.hasColumn('unidade_servicos', 'unidade_id');
  const hasServicoId = await knex.schema.hasColumn('unidade_servicos', 'servico_id');

  if (!hasUnidadeId || !hasServicoId) {
    throw new Error(
      'Migration cannot proceed: unidade_servicos exists but is missing required columns (unidade_id and/or servico_id).'
    );
  }

  const uniqueConstraintName = 'unq_unidade_servicos_unidade_servico';
  const uniqueExists = await constraintExists(knex, uniqueConstraintName);

  if (!uniqueExists) {
    await knex.raw(
      `ALTER TABLE unidade_servicos
       ADD CONSTRAINT ${uniqueConstraintName}
       UNIQUE (unidade_id, servico_id)`
    );
  }

  const idxCompoundName = 'idx_unidade_servicos_unidade_servico';
  const compoundIndexExists = await indexExists(knex, idxCompoundName);

  if (!compoundIndexExists) {
    await knex.raw(
      `CREATE INDEX ${idxCompoundName}
       ON unidade_servicos (unidade_id, servico_id)`
    );
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('unidade_servicos');
};

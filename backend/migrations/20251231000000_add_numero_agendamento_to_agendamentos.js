exports.up = async function(knex) {
  // 1) Adicionar colunas como NULLABLE primeiro (para permitir backfill)
  await knex.schema.table('agendamentos', function(table) {
    table.integer('usuario_id').unsigned().nullable();
    table.integer('numero_agendamento').unsigned().nullable();
  });

  // 2) Backfill usuario_id via unidades.usuario_id
  await knex.raw(`
    UPDATE agendamentos a
    SET usuario_id = u.usuario_id
    FROM unidades u
    WHERE a.unidade_id = u.id
      AND a.usuario_id IS NULL;
  `);

  // 3) Backfill numero_agendamento sequencial por usuario_id
  // Ordenação: created_at ASC, id ASC (conforme combinado)
  await knex.raw(`
    WITH numbered AS (
      SELECT
        a.id,
        ROW_NUMBER() OVER (
          PARTITION BY a.usuario_id
          ORDER BY a.created_at ASC, a.id ASC
        ) AS numero
      FROM agendamentos a
      WHERE a.usuario_id IS NOT NULL
    )
    UPDATE agendamentos a
    SET numero_agendamento = n.numero
    FROM numbered n
    WHERE a.id = n.id
      AND a.numero_agendamento IS NULL;
  `);

  // 4) Garantir NOT NULL (depois do backfill)
  await knex.raw(`
    ALTER TABLE agendamentos
      ALTER COLUMN usuario_id SET NOT NULL,
      ALTER COLUMN numero_agendamento SET NOT NULL;
  `);

  // 5) Constraints e índices
  await knex.schema.table('agendamentos', function(table) {
    table
      .foreign('usuario_id')
      .references('id')
      .inTable('usuarios')
      .onDelete('CASCADE');

    table.unique(['usuario_id', 'numero_agendamento'], 'agendamentos_usuario_numero_unique');
    table.index(['usuario_id', 'numero_agendamento'], 'idx_agendamentos_usuario_numero');
    table.index(['usuario_id'], 'idx_agendamentos_usuario_id');
  });
};

exports.down = async function(knex) {
  // Remover índices/constraints antes de dropar colunas
  await knex.schema.table('agendamentos', function(table) {
    table.dropIndex(['usuario_id', 'numero_agendamento'], 'idx_agendamentos_usuario_numero');
    table.dropIndex(['usuario_id'], 'idx_agendamentos_usuario_id');
    table.dropUnique(['usuario_id', 'numero_agendamento'], 'agendamentos_usuario_numero_unique');
    table.dropForeign(['usuario_id']);
  });

  await knex.schema.table('agendamentos', function(table) {
    table.dropColumn('numero_agendamento');
    table.dropColumn('usuario_id');
  });
};

exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('agendamento_servicos', 'comissao_percentual_aplicada');

  if (!hasColumn) {
    await knex.schema.alterTable('agendamento_servicos', (table) => {
      table.decimal('comissao_percentual_aplicada', 7, 2).nullable();
    });

    // Backfill best-effort (hard-deleted services will remain NULL)
    await knex.raw(`
      UPDATE agendamento_servicos as asv
      SET comissao_percentual_aplicada = s.comissao_percentual
      FROM servicos as s
      WHERE s.id = asv.servico_id
        AND asv.comissao_percentual_aplicada IS NULL
    `);
  }

  // Performance indexes (safe / idempotent)
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data ON agendamentos (unidade_id, data_agendamento)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data_status ON agendamentos (unidade_id, data_agendamento, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data_status_pag ON agendamentos (unidade_id, data_agendamento, status, status_pagamento)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data_agente ON agendamentos (unidade_id, data_agendamento, agente_id)');

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_agendamento_id ON agendamento_servicos (agendamento_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_servico_id ON agendamento_servicos (servico_id)');

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_vendas_unidade_created_at ON vendas (unidade_id, created_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_vendas_usuario_unidade_created_at_status ON vendas (usuario_id, unidade_id, created_at, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_vendas_agendamento_id ON vendas (agendamento_id)');
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_vendas_agendamento_id');
  await knex.raw('DROP INDEX IF EXISTS idx_vendas_usuario_unidade_created_at_status');
  await knex.raw('DROP INDEX IF EXISTS idx_vendas_unidade_created_at');

  await knex.raw('DROP INDEX IF EXISTS idx_agendamento_servicos_servico_id');
  await knex.raw('DROP INDEX IF EXISTS idx_agendamento_servicos_agendamento_id');

  await knex.raw('DROP INDEX IF EXISTS idx_agendamentos_unidade_data_agente');
  await knex.raw('DROP INDEX IF EXISTS idx_agendamentos_unidade_data_status_pag');
  await knex.raw('DROP INDEX IF EXISTS idx_agendamentos_unidade_data_status');
  await knex.raw('DROP INDEX IF EXISTS idx_agendamentos_unidade_data');

  const hasColumn = await knex.schema.hasColumn('agendamento_servicos', 'comissao_percentual_aplicada');
  if (hasColumn) {
    await knex.schema.alterTable('agendamento_servicos', (table) => {
      table.dropColumn('comissao_percentual_aplicada');
    });
  }
};

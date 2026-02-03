exports.up = async function(knex) {
  await knex.schema.table('agendamentos', function(table) {
    table.uuid('recorrencia_group_id').nullable();
    table.jsonb('recorrencia_config').nullable();
  });

  await knex.schema.table('agendamentos', function(table) {
    table.index(['recorrencia_group_id'], 'idx_agendamentos_recorrencia_group_id');
  });
};

exports.down = async function(knex) {
  await knex.schema.table('agendamentos', function(table) {
    table.dropIndex(['recorrencia_group_id'], 'idx_agendamentos_recorrencia_group_id');
  });

  await knex.schema.table('agendamentos', function(table) {
    table.dropColumn('recorrencia_config');
    table.dropColumn('recorrencia_group_id');
  });
};

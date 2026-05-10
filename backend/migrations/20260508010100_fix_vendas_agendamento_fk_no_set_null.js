/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Remove FK antiga (provavelmente criada sem nome explícito)
  await knex.schema.alterTable('vendas', function (table) {
    table.dropForeign('agendamento_id');
  });

  // Recriar FK SEM ON DELETE SET NULL (indissociável)
  // - Mantém nullable para compatibilidade (vendas avulsas têm agendamento_id null)
  // - Quando houver agendamento_id, a deleção do agendamento será bloqueada pelo FK
  await knex.schema.alterTable('vendas', function (table) {
    table
      .foreign('agendamento_id')
      .references('agendamentos.id')
      .onDelete('RESTRICT');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('vendas', function (table) {
    table.dropForeign('agendamento_id');
  });

  await knex.schema.alterTable('vendas', function (table) {
    table
      .foreign('agendamento_id')
      .references('agendamentos.id')
      .onDelete('SET NULL');
  });
};

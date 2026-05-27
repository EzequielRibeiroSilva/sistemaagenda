exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('chat_sessions');
  if (!exists) {
    return knex.schema.createTable('chat_sessions', (table) => {
      table.increments('id').primary();
      table.integer('usuario_id').unsigned().references('id').inTable('usuarios').onDelete('CASCADE');
      table.integer('unidade_id').unsigned().references('id').inTable('unidades').onDelete('CASCADE');
      table.string('cliente_telefone').notNullable(); // telefone_limpo
      table.string('status').defaultTo('active'); // active, paused_by_human
      table.timestamp('last_interaction_at').defaultTo(knex.fn.now());
      table.timestamps(true, true);
      
      // Index para busca rápida por telefone e unidade
      table.index(['unidade_id', 'cliente_telefone']);
    });
  }
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('chat_sessions');
};

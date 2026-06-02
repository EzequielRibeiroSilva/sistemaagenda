exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('chat_messages');
  if (!exists) {
    return knex.schema.createTable('chat_messages', (table) => {
      table.increments('id').primary();
      table.integer('chat_session_id').unsigned().notNullable()
        .references('id').inTable('chat_sessions')
        .onDelete('CASCADE');
      table.string('role').notNullable();
      table.text('content').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['chat_session_id', 'created_at']);
    });
  }
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('chat_messages');
};

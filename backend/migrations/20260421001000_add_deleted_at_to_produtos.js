exports.up = function (knex) {
  return knex.schema.alterTable('produtos', (table) => {
    table.timestamp('deleted_at').nullable();
    table.index(['usuario_id', 'deleted_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('produtos', (table) => {
    table.dropIndex(['usuario_id', 'deleted_at']);
    table.dropColumn('deleted_at');
  });
};

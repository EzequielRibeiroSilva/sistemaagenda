/**
 * Migration temporária para resolver corrupção do diretório de migrations
 * Esta migration foi executada anteriormente mas o arquivo foi removido
 */

exports.up = function(knex) {
  // Não faz nada - a tabela já foi criada por outra migration
  return Promise.resolve();
};

exports.down = function(knex) {
  // Não faz nada
  return Promise.resolve();
};

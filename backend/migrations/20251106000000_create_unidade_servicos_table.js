/**
 * Migration temporária para resolver corrupção do diretório de migrations
 * Esta migration foi executada anteriormente mas o arquivo foi removido
 */

exports.up = function(knex) {
  return Promise.resolve();
};

exports.down = function(knex) {
  return Promise.resolve();
};

exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE assinatura_usos
    ALTER COLUMN data_uso
    TYPE TIMESTAMP WITH TIME ZONE
    USING (data_uso::timestamp AT TIME ZONE 'America/Sao_Paulo');
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE assinatura_usos
    ALTER COLUMN data_uso
    TYPE DATE
    USING ((data_uso AT TIME ZONE 'America/Sao_Paulo')::date);
  `);
};

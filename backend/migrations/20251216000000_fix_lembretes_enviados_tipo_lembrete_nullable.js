/**
 * Migration: Fix lembretes_enviados tipo_lembrete nullable
 * 
 * Esta migration já foi aplicada no banco de dados.
 * O arquivo foi recriado para manter a consistência com o registro na tabela knex_migrations.
 */

exports.up = async function(knex) {
  // Migration já aplicada - tipo_lembrete já é nullable
  // Verificar se a constraint existe antes de tentar modificar
  const constraintExists = await knex.raw(`
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'lembretes_enviados_tipo_lembrete_check'
  `);
  
  if (constraintExists.rows.length === 0) {
    console.log('Constraint já foi modificada anteriormente');
  }
};

exports.down = async function(knex) {
  // Não reverter - manter tipo_lembrete como nullable
  console.log('Down migration não implementada - tipo_lembrete permanece nullable');
};


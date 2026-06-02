/**
 * Migration: Tornar tipo_lembrete nullable
 * 
 * Motivo: A coluna tipo_lembrete é usada apenas para lembretes automáticos (24h, 2h),
 * mas a tabela lembretes_enviados também armazena outros tipos de notificações
 * (confirmação, cancelamento, etc.) que não têm tipo_lembrete.
 * 
 * Correção: Tornar a coluna nullable para permitir notificações sem tipo_lembrete.
 */

exports.up = async function(knex) {
  await knex.schema.alterTable('lembretes_enviados', function(table) {
    // Tornar tipo_lembrete nullable
    table.text('tipo_lembrete').nullable().alter();
  });
  
  console.log('✅ Migration aplicada: tipo_lembrete agora é nullable');
};

exports.down = async function(knex) {
  await knex.schema.alterTable('lembretes_enviados', function(table) {
    // Reverter: tornar NOT NULL novamente
    table.text('tipo_lembrete').notNullable().alter();
  });
  
  console.log('✅ Migration revertida: tipo_lembrete voltou a ser NOT NULL');
};

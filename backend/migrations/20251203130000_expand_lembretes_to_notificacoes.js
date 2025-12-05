/**
 * Migration: Expandir tabela lembretes_enviados para suportar todos os tipos de notificações
 * Descrição: Adiciona tipos de notificação (confirmação, cancelamento, reagendamento) além dos lembretes
 * Data: 2025-12-03
 */

exports.up = function(knex) {
  return knex.schema.alterTable('lembretes_enviados', (table) => {
    // Alterar enum tipo_lembrete para incluir novos tipos
    // PostgreSQL não permite ALTER TYPE diretamente, então precisamos:
    // 1. Adicionar nova coluna temporária
    // 2. Copiar dados
    // 3. Remover coluna antiga
    // 4. Renomear nova coluna
    
    // Adicionar nova coluna com tipos expandidos
    table.enum('tipo_notificacao', [
      'confirmacao',      // Notificação de confirmação de agendamento
      'cancelamento',     // Notificação de cancelamento
      'reagendamento',    // Notificação de reagendamento
      'lembrete_24h',     // Lembrete 24h antes
      'lembrete_1h'       // Lembrete 1h antes (anteriormente '2h')
    ])
    .nullable()
    .comment('Tipo da notificação enviada');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('lembretes_enviados', (table) => {
    table.dropColumn('tipo_notificacao');
  });
};

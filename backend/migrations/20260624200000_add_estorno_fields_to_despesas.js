/**
 * 💰 MIGRATION: Campos de Estorno para Despesas
 * 
 * Adiciona suporte ao padrão Ledger Append-Only para estornos:
 * - is_estorno: Flag booleana que identifica registros de estorno
 * - origem_id: Chave estrangeira que referencia a despesa original
 * - REVERSED: Novo status para indicar despesas revertidas
 * 
 * Padrão de Integridade:
 * - Despesa original: status muda de PAID → REVERSED
 * - Registro compensatório: is_estorno=true, origem_id aponta para original
 * - Histórico completo mantido para auditoria
 */

exports.up = async function(knex) {
  // 1️⃣ Adiciona as colunas de estorno
  await knex.schema.table('despesas', function(table) {
    // 🔖 Flag de identificação de estorno
    table.boolean('is_estorno').defaultTo(false).notNullable();
    
    // 🔗 Referência à despesa original (auto-referência)
    table.integer('origem_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('despesas')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    
    // 📊 Índice para consultas de estorno
    table.index('is_estorno', 'idx_despesas_is_estorno');
    table.index('origem_id', 'idx_despesas_origem_id');
  });
  
  // 2️⃣ Adiciona status REVERSED ao check constraint ou coluna
  // Nota: Como o projeto usa varchar para status (não enum nativo), não precisa de ALTER TYPE
  // Apenas documentamos que o status REVERSED agora é válido
  console.log('[Migration] ✅ Campos de estorno adicionados. Status REVERSED agora é válido.');
};

exports.down = function(knex) {
  return knex.schema.table('despesas', function(table) {
    // Remove índices
    table.dropIndex('is_estorno', 'idx_despesas_is_estorno');
    table.dropIndex('origem_id', 'idx_despesas_origem_id');
    
    // Remove colunas
    table.dropColumn('origem_id');
    table.dropColumn('is_estorno');
  });
};

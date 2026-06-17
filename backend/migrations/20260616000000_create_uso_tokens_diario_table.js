/**
 * TASK 3.3 - FASE 1: DASHBOARD DE TOKENS
 * 
 * Tabela de agregação diária para monitoramento de consumo de tokens
 * da Inteligência Artificial por usuário (dono da barbearia).
 * 
 * Estratégia: Janela móvel de 30 dias com limpeza automática via Cron Job.
 * 
 * Constraint ÚNICA (usuario_id, data) garante UPSERT perfeito:
 * - INSERT na primeira chamada do dia
 * - UPDATE (soma) nas chamadas subsequentes do mesmo dia
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('uso_tokens_diario');
  
  if (!exists) {
    return knex.schema.createTable('uso_tokens_diario', (table) => {
      // Chave primária
      table.increments('id').primary();
      
      // FK para o dono da barbearia (usuário ADMIN)
      table.integer('usuario_id').unsigned().notNullable()
        .references('id').inTable('usuarios')
        .onDelete('CASCADE'); // Se usuário for excluído, remove registros de tokens
      
      // Data do consumo (apenas dia, sem hora - para agregação)
      table.date('data').notNullable();
      
      // Total de tokens consumidos neste dia por este usuário
      table.integer('total_tokens').defaultTo(0).notNullable();
      
      // Timestamps de auditoria
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // ⚡ CONSTRAINT CRÍTICA: Combinação única (usuario_id, data)
      // Permite UPSERT: INSERT na primeira vez, UPDATE nas seguintes
      table.unique(['usuario_id', 'data'], 'uk_uso_tokens_usuario_data');
      
      // Índices de performance
      table.index(['usuario_id'], 'idx_uso_tokens_usuario');
      table.index(['data'], 'idx_uso_tokens_data');
      table.index(['usuario_id', 'data'], 'idx_uso_tokens_lookup'); // Consulta principal
    });
  }
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('uso_tokens_diario');
};
/**
 * Migration: Adicionar coluna contexto_json à tabela chat_sessions
 * 
 * TASK 2.1 - CONVERSATION STATE MANAGER (HARDENING SPRINT)
 * 
 * PROPÓSITO:
 * Migrar de sistema de "summary" (texto comprimido) para contexto estruturado (JSON).
 * 
 * BENEFÍCIOS:
 * ✅ Estado estruturado preserva IDs críticos (agendamento_id, cliente_id, etc.)
 * ✅ Recuperação de contexto após purge de histórico
 * ✅ Debugging facilitado (JSON legível)
 * ✅ Versionamento de estado (timestamps)
 */

exports.up = async function(knex) {
  // Verificar se a tabela existe
  const hasTable = await knex.schema.hasTable('chat_sessions');
  if (!hasTable) {
    throw new Error('Tabela chat_sessions não existe. Execute a migration anterior primeiro.');
  }

  // Verificar se a coluna já existe
  const hasColumn = await knex.schema.hasColumn('chat_sessions', 'contexto_json');
  if (hasColumn) {
    console.log('⚠️  Coluna contexto_json já existe - pulando migration');
    return;
  }

  // Adicionar coluna contexto_json (JSONB no PostgreSQL, JSON no MySQL/SQLite)
  await knex.schema.table('chat_sessions', (table) => {
    // PostgreSQL suporta JSONB (binário, mais eficiente)
    // MySQL/MariaDB suportam JSON nativo
    // SQLite armazena como TEXT mas valida JSON
    if (knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql') {
      table.jsonb('contexto_json').nullable().comment('Estado estruturado da conversa (JSON)');
    } else {
      table.json('contexto_json').nullable().comment('Estado estruturado da conversa (JSON)');
    }
  });

  // Inicializar estados padrão para sessões existentes
  const estadoPadrao = JSON.stringify({
    unidade_id: null,
    agente_id: null,
    cliente_id: null,
    servicos_selecionados: [],
    data_agendamento: null,
    hora_inicio: null,
    status: 'iniciada',
    etapa_atual: 'identificacao',
    pagamento_pendente: false,
    pix_gerado: false,
    agendamento_id: null,
    tentativas_reagendamento: 0,
    ultima_atualizacao: new Date().toISOString()
  });

  // Atualizar sessões ativas com estado padrão
  const sessionsCount = await knex('chat_sessions')
    .where('status', 'active')
    .whereNull('contexto_json')
    .update({
      contexto_json: estadoPadrao,
      updated_at: knex.fn.now()
    });

  console.log(`✅ Coluna contexto_json adicionada com sucesso`);
  console.log(`📊 ${sessionsCount} sessões ativas inicializadas com estado padrão`);
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('chat_sessions');
  if (!hasTable) {
    console.log('⚠️  Tabela chat_sessions não existe - pulando rollback');
    return;
  }

  const hasColumn = await knex.schema.hasColumn('chat_sessions', 'contexto_json');
  if (!hasColumn) {
    console.log('⚠️  Coluna contexto_json não existe - pulando rollback');
    return;
  }

  await knex.schema.table('chat_sessions', (table) => {
    table.dropColumn('contexto_json');
  });

  console.log('✅ Coluna contexto_json removida com sucesso');
};

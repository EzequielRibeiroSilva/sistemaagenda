/**
 * FASE 1 - Persistência Estrutural de Contexto (Role 'tool')
 *
 * Prepara a tabela `chat_messages` para suportar o formato nativo de
 * function calling da API OpenAI/OpenRouter:
 *  - tool_calls   (JSONB)  -> array de chamadas de função emitido pelo assistant
 *  - tool_call_id (string) -> id de ligação da resposta da tool
 *  - name         (string) -> nome da ferramenta executada
 *
 * Também torna `content` nullable, pois mensagens do assistant que apenas
 * disparam tool_calls possuem content = null (padrão OpenAI).
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('chat_messages');
  if (!exists) return;

  const hasToolCalls = await knex.schema.hasColumn('chat_messages', 'tool_calls');
  const hasToolCallId = await knex.schema.hasColumn('chat_messages', 'tool_call_id');
  const hasName = await knex.schema.hasColumn('chat_messages', 'name');

  await knex.schema.alterTable('chat_messages', (table) => {
    if (!hasToolCalls) {
      table.jsonb('tool_calls').nullable();
    }
    if (!hasToolCallId) {
      table.string('tool_call_id').nullable();
    }
    if (!hasName) {
      table.string('name').nullable();
    }
  });

  // Mensagens do assistant que só disparam tool_calls têm content = null.
  await knex.schema.alterTable('chat_messages', (table) => {
    table.text('content').nullable().alter();
  });
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasTable('chat_messages');
  if (!exists) return;

  const hasToolCalls = await knex.schema.hasColumn('chat_messages', 'tool_calls');
  const hasToolCallId = await knex.schema.hasColumn('chat_messages', 'tool_call_id');
  const hasName = await knex.schema.hasColumn('chat_messages', 'name');

  await knex.schema.alterTable('chat_messages', (table) => {
    if (hasToolCalls) table.dropColumn('tool_calls');
    if (hasToolCallId) table.dropColumn('tool_call_id');
    if (hasName) table.dropColumn('name');
  });

  // Reverte content para NOT NULL. Linhas com content = null receberiam '' antes
  // do rollback para não violar a constraint.
  await knex('chat_messages').whereNull('content').update({ content: '' });
  await knex.schema.alterTable('chat_messages', (table) => {
    table.text('content').notNullable().alter();
  });
};

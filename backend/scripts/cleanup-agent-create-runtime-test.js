const { db } = require('../src/config/knex');

const prefix = process.argv[2] || 'agent_create_runtime_test';

async function cleanup() {
  await db('agendamento_servicos')
    .whereRaw('agendamento_id IN (SELECT id FROM agendamentos WHERE observacoes LIKE ?)', [`%${prefix}%`])
    .del();

  await db('agendamentos')
    .where('observacoes', 'like', `%${prefix}%`)
    .del();

  await db('agente_servicos')
    .whereRaw('agente_id IN (SELECT id FROM agentes WHERE nome LIKE ? OR email LIKE ?)', [`%${prefix}%`, `%${prefix}%`])
    .del();

  await db('horarios_funcionamento')
    .whereRaw('agente_id IN (SELECT id FROM agentes WHERE nome LIKE ? OR email LIKE ?)', [`%${prefix}%`, `%${prefix}%`])
    .del();

  await db('agente_unidades')
    .whereRaw('agente_id IN (SELECT id FROM agentes WHERE nome LIKE ? OR email LIKE ?)', [`%${prefix}%`, `%${prefix}%`])
    .del();

  await db('agentes')
    .where(function () {
      this.where('nome', 'like', `%${prefix}%`).orWhere('email', 'like', `%${prefix}%`);
    })
    .del();

  await db('clientes')
    .where('primeiro_nome', 'like', `%${prefix}%`)
    .del();

  await db('servicos')
    .where('nome', 'like', `%${prefix}%`)
    .del();

  await db('unidades')
    .where('nome', 'like', `%${prefix}%`)
    .del();

  await db('usuarios')
    .where('email', 'like', `%${prefix}%`)
    .del();
}

cleanup()
  .then(async () => {
    console.log(`Cleanup concluído para prefixo: ${prefix}`);
    await db.destroy();
  })
  .catch(async (error) => {
    console.error(`Erro no cleanup para prefixo ${prefix}:`, error);
    await db.destroy();
    process.exit(1);
  });

const { db, closeConnection } = require('./src/config/knex');

async function main() {
  const usuarioId = Number(process.argv[2] || 1);
  const unidadeId = Number(process.argv[3] || 40);

  console.log('--- debug-kb.js ---');
  console.log('usuarioId:', usuarioId);
  console.log('unidadeId:', unidadeId);

  try {
    console.time('unidade_query_ms');
    const unidade = await db('unidades')
      .where('id', unidadeId)
      .where('usuario_id', usuarioId)
      .first();
    console.timeEnd('unidade_query_ms');

    console.log('unidade_found:', !!unidade);
    console.log('unidade_row:', unidade);

    if (!unidade) {
      console.log('\n[DIAGNÓSTICO]');
      console.log('- A query direta retornou null. Isso indica:');
      console.log('  1) unidadeId incorreto para este usuarioId, ou');
      console.log('  2) unidade existe mas pertence a outro usuario_id, ou');
      console.log('  3) unidade está soft-deletada/filtrada em outro lugar (não aqui), ou');
      console.log('  4) você está apontando para outro banco/ambiente.');
    }

    console.log('\n--- queries auxiliares ---');

    console.time('unidade_by_id_only_ms');
    const unidadeByIdOnly = await db('unidades')
      .where('id', unidadeId)
      .first();
    console.timeEnd('unidade_by_id_only_ms');
    console.log('unidade_by_id_only_found:', !!unidadeByIdOnly);
    console.log('unidade_by_id_only_row:', unidadeByIdOnly);

    console.time('unidades_do_usuario_ms');
    const unidadesDoUsuario = await db('unidades')
      .where('usuario_id', usuarioId)
      .select('id', 'nome', 'status')
      .orderBy('id', 'asc')
      .limit(20);
    console.timeEnd('unidades_do_usuario_ms');
    console.log('unidades_do_usuario_count:', unidadesDoUsuario.length);
    console.log('unidades_do_usuario_sample:', unidadesDoUsuario);

  } catch (err) {
    console.error('❌ debug-kb.js ERROR (raw):', err);
    console.error('❌ debug-kb.js ERROR (details):', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint,
      where: err?.where,
      schema: err?.schema,
      table: err?.table,
      constraint: err?.constraint,
      routine: err?.routine
    });
    process.exitCode = 1;
  } finally {
    try {
      await closeConnection();
    } catch (e) {
      // ignore
    }
  }
}

main();

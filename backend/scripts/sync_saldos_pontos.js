const { db } = require('../src/config/knex');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const rows = await db('clientes')
    .whereNull('deleted_at')
    .select('id', 'unidade_id');

  let updated = 0;

  await db.transaction(async (trx) => {
    for (const c of rows) {
      const creditosRow = await trx('pontos_historico')
        .where('cliente_id', c.id)
        .where('unidade_id', c.unidade_id)
        .where('tipo', 'CREDITO')
        .where('expirado', false)
        .where(function () {
          this.whereNull('data_validade').orWhere('data_validade', '>=', hoje);
        })
        .sum('pontos as total')
        .first();

      const debitosRow = await trx('pontos_historico')
        .where('cliente_id', c.id)
        .where('unidade_id', c.unidade_id)
        .where('tipo', 'DEBITO')
        .sum('pontos as total')
        .first();

      const creditos = Number(creditosRow?.total || 0);
      const debitos = Number(debitosRow?.total || 0);
      const saldo = Math.floor(creditos - debitos);

      if (!dryRun) {
        await trx('clientes')
          .where('id', c.id)
          .where('unidade_id', c.unidade_id)
          .update({ saldo_pontos: saldo, updated_at: trx.fn.now() });
      }

      updated++;

      if (updated % 250 === 0) {
        process.stdout.write(`Processados: ${updated}/${rows.length}\r`);
      }
    }
  });

  process.stdout.write('\n');
  console.log(`Concluído. Clientes processados: ${updated}. Dry-run: ${dryRun}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao sincronizar saldos de pontos:', err);
  process.exit(1);
});

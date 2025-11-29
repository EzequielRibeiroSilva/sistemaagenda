/**
 * Script: Verificar Últimos Agendamentos
 */

require('dotenv').config();
const { query } = require('./src/config/database');

async function checkLastAgendamentos() {
  console.log('\n🔍 ÚLTIMOS AGENDAMENTOS CRIADOS:\n');

  try {
    const result = await query(`
      SELECT 
        a.id,
        a.data_agendamento,
        a.hora_inicio,
        a.status,
        a.created_at,
        c.primeiro_nome || ' ' || c.ultimo_nome as cliente_nome,
        c.telefone as cliente_telefone,
        ag.nome || ' ' || COALESCE(ag.sobrenome, '') as agente_nome,
        ag.telefone as agente_telefone,
        u.nome as unidade_nome,
        u.telefone as unidade_telefone
      FROM agendamentos a
      JOIN clientes c ON a.cliente_id = c.id
      JOIN agentes ag ON a.agente_id = ag.id
      JOIN unidades u ON a.unidade_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log('❌ Nenhum agendamento encontrado!\n');
      return;
    }

    console.log(`✅ ${result.rows.length} agendamento(s) encontrado(s):\n`);
    
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. AGENDAMENTO #${row.id}`);
      console.log(`   Cliente: ${row.cliente_nome} (${row.cliente_telefone || 'SEM TELEFONE ⚠️'})`);
      console.log(`   Agente: ${row.agente_nome} (${row.agente_telefone || 'SEM TELEFONE ⚠️'})`);
      console.log(`   Unidade: ${row.unidade_nome} (${row.unidade_telefone || 'SEM TELEFONE ⚠️'})`);
      console.log(`   Data: ${row.data_agendamento} às ${row.hora_inicio}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Criado em: ${row.created_at}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkLastAgendamentos()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

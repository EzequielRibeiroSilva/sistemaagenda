/**
 * Script para verificar agendamentos de hoje
 */

const { query } = require('./src/config/database');

async function checkTodayAppointments() {
  try {
    console.log('🔍 Verificando agendamentos de HOJE...\n');

    const today = new Date().toISOString().split('T')[0];
    
    console.log(`📅 Data de hoje: ${today}\n`);
    console.log('='.repeat(80));

    const result = await query(`
      SELECT 
        a.id,
        a.data_agendamento,
        a.hora_inicio,
        a.hora_fim,
        a.status,
        a.created_at,
        CONCAT(c.primeiro_nome, ' ', c.ultimo_nome) as cliente_nome,
        c.telefone as cliente_telefone,
        CONCAT(ag.nome, ' ', COALESCE(ag.sobrenome, '')) as agente_nome,
        ag.telefone as agente_telefone,
        u.nome as unidade_nome
      FROM agendamentos a
      JOIN clientes c ON a.cliente_id = c.id
      JOIN agentes ag ON a.agente_id = ag.id
      JOIN unidades u ON a.unidade_id = u.id
      WHERE a.data_agendamento = $1
      ORDER BY a.hora_inicio ASC
    `, [today]);

    if (result.rows.length === 0) {
      console.log('⚠️  NENHUM AGENDAMENTO ENCONTRADO PARA HOJE!\n');
      console.log('💡 Isso significa que:');
      console.log('1. O agendamento #105 não foi salvo no banco de dados');
      console.log('2. Pode ter havido um erro na criação do agendamento');
      console.log('3. O ID #105 pode ser apenas visual no frontend\n');
      
      // Buscar agendamentos recentes (últimas 24h)
      console.log('🔍 Buscando agendamentos criados nas últimas 24 horas...\n');
      console.log('='.repeat(80));
      
      const recentResult = await query(`
        SELECT 
          a.id,
          a.data_agendamento,
          a.hora_inicio,
          a.hora_fim,
          a.status,
          a.created_at,
          CONCAT(c.primeiro_nome, ' ', c.ultimo_nome) as cliente_nome,
          CONCAT(ag.nome, ' ', COALESCE(ag.sobrenome, '')) as agente_nome,
          u.nome as unidade_nome
        FROM agendamentos a
        JOIN clientes c ON a.cliente_id = c.id
        JOIN agentes ag ON a.agente_id = ag.id
        JOIN unidades u ON a.unidade_id = u.id
        WHERE a.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY a.created_at DESC
      `);
      
      if (recentResult.rows.length === 0) {
        console.log('⚠️  Nenhum agendamento criado nas últimas 24 horas.\n');
      } else {
        console.log(`✅ ${recentResult.rows.length} agendamento(s) criado(s) nas últimas 24 horas:\n`);
        recentResult.rows.forEach((apt, index) => {
          console.log(`${index + 1}. AGENDAMENTO #${apt.id}`);
          console.log(`   Cliente: ${apt.cliente_nome}`);
          console.log(`   Agente: ${apt.agente_nome}`);
          console.log(`   Unidade: ${apt.unidade_nome}`);
          console.log(`   Data: ${apt.data_agendamento} às ${apt.hora_inicio}`);
          console.log(`   Status: ${apt.status}`);
          console.log(`   Criado em: ${apt.created_at}\n`);
        });
      }
    } else {
      console.log(`✅ ${result.rows.length} AGENDAMENTO(S) ENCONTRADO(S) PARA HOJE:\n`);
      
      result.rows.forEach((apt, index) => {
        console.log(`${index + 1}. AGENDAMENTO #${apt.id}`);
        console.log(`   Cliente: ${apt.cliente_nome} (${apt.cliente_telefone})`);
        console.log(`   Agente: ${apt.agente_nome} (${apt.agente_telefone})`);
        console.log(`   Unidade: ${apt.unidade_nome}`);
        console.log(`   Horário: ${apt.hora_inicio} - ${apt.hora_fim}`);
        console.log(`   Status: ${apt.status}`);
        console.log(`   Criado em: ${apt.created_at}\n`);
        
        // Verificar se tem lembrete
        console.log(`   🔍 Verificando lembretes...`);
      });
      
      // Verificar lembretes para cada agendamento
      for (const apt of result.rows) {
        const lembreteResult = await query(`
          SELECT 
            id,
            tipo_lembrete,
            status,
            tentativas,
            enviado_em,
            created_at
          FROM lembretes_enviados
          WHERE agendamento_id = $1
          ORDER BY created_at DESC
        `, [apt.id]);
        
        if (lembreteResult.rows.length > 0) {
          console.log(`   📬 ${lembreteResult.rows.length} lembrete(s) encontrado(s):`);
          lembreteResult.rows.forEach(l => {
            console.log(`      - ${l.tipo_lembrete}: ${l.status} (${l.tentativas} tentativa(s))`);
          });
        } else {
          console.log(`   ⚠️  Nenhum lembrete enviado ainda`);
        }
        console.log('');
      }
    }
    
    console.log('='.repeat(80) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao verificar agendamentos:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Executar
checkTodayAppointments();

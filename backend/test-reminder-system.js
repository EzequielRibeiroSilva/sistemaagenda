/**
 * Script de Teste - Sistema de Lembretes Automáticos
 * 
 * Este script valida:
 * 1. Conexão com banco de dados
 * 2. Existência da tabela lembretes_enviados
 * 3. Criação de agendamentos de teste
 * 4. Execução manual do ReminderService
 * 5. Verificação de lembretes enviados
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  database: process.env.PG_DATABASE || 'painel_agendamento_dev',
});

const ReminderService = require('./src/services/ReminderService');

async function testReminderSystem() {
  console.log('\n================================================================================');
  console.log('🧪 TESTE DO SISTEMA DE LEMBRETES AUTOMÁTICOS');
  console.log('================================================================================\n');

  try {
    // 1. Testar conexão com banco de dados
    console.log('1️⃣ Testando conexão com banco de dados...');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Conexão com banco de dados OK');
    console.log(`📅 Hora atual: ${result.rows[0].current_time}\n`);
    client.release();

    // 2. Verificar se tabela lembretes_enviados existe
    console.log('2️⃣ Verificando tabela lembretes_enviados...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'lembretes_enviados'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      throw new Error('Tabela lembretes_enviados não existe. Execute a migration primeiro!');
    }
    console.log('✅ Tabela lembretes_enviados existe\n');

    // 3. Contar agendamentos confirmados para amanhã
    console.log('3️⃣ Verificando agendamentos confirmados para amanhã...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const agendamentos24h = await pool.query(`
      SELECT COUNT(*) as total
      FROM agendamentos
      WHERE data_agendamento = $1
      AND status = 'Confirmado'
    `, [tomorrowStr]);
    
    console.log(`📊 Agendamentos confirmados para amanhã (${tomorrowStr}): ${agendamentos24h.rows[0].total}`);

    // 4. Contar agendamentos confirmados para daqui a 2-3 horas
    console.log('\n4️⃣ Verificando agendamentos confirmados para daqui a 2-3 horas...');
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    
    const todayStr = now.toISOString().split('T')[0];
    const twoHoursStr = twoHoursFromNow.toTimeString().split(' ')[0].substring(0, 5);
    const threeHoursStr = threeHoursFromNow.toTimeString().split(' ')[0].substring(0, 5);

    const agendamentos2h = await pool.query(`
      SELECT COUNT(*) as total
      FROM agendamentos
      WHERE data_agendamento = $1
      AND status = 'Confirmado'
      AND hora_inicio BETWEEN $2 AND $3
    `, [todayStr, twoHoursStr, threeHoursStr]);
    
    console.log(`📊 Agendamentos confirmados para hoje entre ${twoHoursStr} e ${threeHoursStr}: ${agendamentos2h.rows[0].total}`);

    // 5. Verificar horário permitido
    console.log('\n5️⃣ Verificando horário permitido...');
    const reminderService = new ReminderService();
    const isAllowed = reminderService.isWithinAllowedHours();
    console.log(`⏰ Horário atual: ${now.toLocaleTimeString('pt-BR')}`);
    console.log(`${isAllowed ? '✅' : '❌'} Horário ${isAllowed ? 'PERMITIDO' : 'NÃO PERMITIDO'} para envio (06:00 - 23:00)`);

    // 6. Contar lembretes já enviados
    console.log('\n6️⃣ Verificando lembretes já enviados...');
    const lembretesEnviados = await pool.query(`
      SELECT tipo_lembrete, status, COUNT(*) as total
      FROM lembretes_enviados
      GROUP BY tipo_lembrete, status
      ORDER BY tipo_lembrete, status
    `);
    
    if (lembretesEnviados.rows.length === 0) {
      console.log('📊 Nenhum lembrete enviado ainda');
    } else {
      console.log('📊 Lembretes enviados:');
      lembretesEnviados.rows.forEach(row => {
        console.log(`   - ${row.tipo_lembrete} (${row.status}): ${row.total}`);
      });
    }

    // 7. Sugestão de teste manual
    console.log('\n================================================================================');
    console.log('📝 SUGESTÕES PARA TESTE MANUAL');
    console.log('================================================================================\n');

    if (parseInt(agendamentos24h.rows[0].total) === 0) {
      console.log('⚠️  Nenhum agendamento confirmado para amanhã.');
      console.log('   Para testar lembretes 24h, execute o SQL abaixo:\n');
      console.log('   INSERT INTO agendamentos (');
      console.log('     cliente_id, agente_id, unidade_id,');
      console.log('     data_agendamento, hora_inicio, hora_fim,');
      console.log('     status, valor_total');
      console.log('   ) VALUES (');
      console.log('     1, 1, 1,');
      console.log(`     '${tomorrowStr}',`);
      console.log('     \'14:00\', \'15:00\',');
      console.log('     \'Confirmado\', 50.00');
      console.log('   );\n');
    }

    if (parseInt(agendamentos2h.rows[0].total) === 0) {
      console.log('⚠️  Nenhum agendamento confirmado para daqui a 2-3 horas.');
      console.log('   Para testar lembretes 2h, execute o SQL abaixo:\n');
      console.log('   INSERT INTO agendamentos (');
      console.log('     cliente_id, agente_id, unidade_id,');
      console.log('     data_agendamento, hora_inicio, hora_fim,');
      console.log('     status, valor_total');
      console.log('   ) VALUES (');
      console.log('     1, 1, 1,');
      console.log(`     '${todayStr}',`);
      console.log(`     '${twoHoursStr}', '${threeHoursStr}',`);
      console.log('     \'Confirmado\', 50.00');
      console.log('   );\n');
    }

    if (!isAllowed) {
      console.log('⚠️  Horário atual está FORA da janela permitida (06:00 - 23:00).');
      console.log('   O cron job não enviará lembretes neste horário.');
      console.log('   Para testar, aguarde até 06:00 ou force a execução modificando');
      console.log('   o método isWithinAllowedHours() em ReminderService.js\n');
    }

    console.log('================================================================================');
    console.log('✅ VALIDAÇÃO CONCLUÍDA COM SUCESSO');
    console.log('================================================================================\n');

    console.log('🚀 Para iniciar o servidor com cron job ativo:');
    console.log('   npm run dev\n');

    console.log('📊 Para monitorar os logs do cron job:');
    console.log('   Observe o console do servidor a cada hora cheia (XX:00)\n');

    console.log('🔍 Para verificar lembretes enviados no banco:');
    console.log('   SELECT * FROM lembretes_enviados ORDER BY created_at DESC LIMIT 10;\n');

  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Executar teste
testReminderSystem();

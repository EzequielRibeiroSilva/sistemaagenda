/**
 * Script para verificar se o lembrete do agendamento #105 foi enviado
 */

const { query } = require('./src/config/database');

async function checkReminder() {
  try {
    console.log('🔍 Verificando status do lembrete para agendamento #105...\n');

    // 1. Verificar dados do agendamento
    console.log('📋 DADOS DO AGENDAMENTO:');
    console.log('='.repeat(80));
    
    const agendamentoResult = await query(`
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
        u.nome as unidade_nome
      FROM agendamentos a
      JOIN clientes c ON a.cliente_id = c.id
      JOIN agentes ag ON a.agente_id = ag.id
      JOIN unidades u ON a.unidade_id = u.id
      WHERE a.id = 105
    `);

    if (agendamentoResult.rows.length === 0) {
      console.log('❌ Agendamento #105 não encontrado!\n');
      process.exit(1);
    }

    const agendamento = agendamentoResult.rows[0];
    console.log(`ID: #${agendamento.id}`);
    console.log(`Cliente: ${agendamento.cliente_nome} (${agendamento.cliente_telefone})`);
    console.log(`Agente: ${agendamento.agente_nome}`);
    console.log(`Unidade: ${agendamento.unidade_nome}`);
    console.log(`Data: ${agendamento.data_agendamento}`);
    console.log(`Horário: ${agendamento.hora_inicio} - ${agendamento.hora_fim}`);
    console.log(`Status: ${agendamento.status}`);
    console.log(`Criado em: ${agendamento.created_at}`);
    console.log('='.repeat(80) + '\n');

    // 2. Verificar se existe registro na tabela lembretes_enviados
    console.log('📬 LEMBRETES ENVIADOS:');
    console.log('='.repeat(80));
    
    const lembretesResult = await query(`
      SELECT 
        id,
        agendamento_id,
        tipo_lembrete,
        status,
        tentativas,
        telefone_destino,
        enviado_em,
        ultima_tentativa,
        erro_detalhes,
        whatsapp_message_id,
        created_at,
        updated_at
      FROM lembretes_enviados
      WHERE agendamento_id = 105
      ORDER BY created_at DESC
    `);

    if (lembretesResult.rows.length === 0) {
      console.log('⚠️  NENHUM LEMBRETE ENCONTRADO PARA ESTE AGENDAMENTO!');
      console.log('');
      console.log('🔍 POSSÍVEIS CAUSAS:');
      console.log('1. O cron job ainda não foi executado às 12:00');
      console.log('2. O agendamento não atende aos critérios de busca:');
      console.log(`   - Status deve ser "Confirmado" (atual: "${agendamento.status}")`);
      console.log(`   - Data deve ser hoje (${new Date().toISOString().split('T')[0]})`);
      console.log(`   - Hora deve estar entre 14:00 e 15:00 (atual: ${agendamento.hora_inicio})`);
      console.log('3. O cron job pode ter falhado silenciosamente');
      console.log('');
      console.log('💡 PRÓXIMOS PASSOS:');
      console.log('1. Verificar os logs do servidor backend para ver se o cron job foi executado');
      console.log('2. Verificar se o status do agendamento é "Confirmado"');
      console.log('3. Aguardar a próxima execução do cron (13:00)');
      console.log('='.repeat(80) + '\n');
    } else {
      console.log(`✅ ${lembretesResult.rows.length} LEMBRETE(S) ENCONTRADO(S):\n`);
      
      lembretesResult.rows.forEach((lembrete, index) => {
        console.log(`--- LEMBRETE #${index + 1} (ID: ${lembrete.id}) ---`);
        console.log(`Tipo: ${lembrete.tipo_lembrete}`);
        console.log(`Status: ${lembrete.status}`);
        console.log(`Tentativas: ${lembrete.tentativas}`);
        console.log(`Telefone destino: ${lembrete.telefone_destino}`);
        console.log(`Criado em: ${lembrete.created_at}`);
        console.log(`Última tentativa: ${lembrete.ultima_tentativa || 'N/A'}`);
        console.log(`Enviado em: ${lembrete.enviado_em || 'N/A'}`);
        console.log(`WhatsApp Message ID: ${lembrete.whatsapp_message_id || 'N/A'}`);
        
        if (lembrete.erro_detalhes) {
          console.log(`Erro: ${lembrete.erro_detalhes}`);
        }
        
        console.log('');
      });
      
      console.log('='.repeat(80) + '\n');
      
      // Análise do resultado
      const lembreteEnviado = lembretesResult.rows.find(l => l.status === 'enviado');
      const lembreteFalha = lembretesResult.rows.find(l => l.status === 'falha_permanente' || l.status === 'falha');
      
      if (lembreteEnviado) {
        console.log('✅ SUCESSO! O lembrete foi enviado com sucesso!');
        console.log(`📱 Tipo: ${lembreteEnviado.tipo_lembrete}`);
        console.log(`⏰ Enviado em: ${lembreteEnviado.enviado_em}`);
        console.log(`📞 Para: ${lembreteEnviado.telefone_destino}`);
        if (lembreteEnviado.whatsapp_message_id) {
          console.log(`🆔 WhatsApp Message ID: ${lembreteEnviado.whatsapp_message_id}`);
        }
      } else if (lembreteFalha) {
        console.log('❌ FALHA! O lembrete não foi enviado com sucesso!');
        console.log(`📱 Tipo: ${lembreteFalha.tipo_lembrete}`);
        console.log(`🔄 Tentativas: ${lembreteFalha.tentativas}`);
        console.log(`⏰ Última tentativa: ${lembreteFalha.ultima_tentativa}`);
        if (lembreteFalha.erro_detalhes) {
          console.log(`❌ Erro: ${lembreteFalha.erro_detalhes}`);
        }
      } else {
        console.log('⏳ PENDENTE! O lembrete está em processamento...');
      }
    }

    // 3. Verificar critérios de elegibilidade para lembrete de 2h
    console.log('\n🔍 VERIFICAÇÃO DE ELEGIBILIDADE (LEMBRETE 2H):');
    console.log('='.repeat(80));
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const startTime = twoHoursLater.toTimeString().slice(0, 5);
    const endTime = threeHoursLater.toTimeString().slice(0, 5);
    
    console.log(`Data de hoje: ${todayStr}`);
    console.log(`Data do agendamento: ${agendamento.data_agendamento}`);
    console.log(`Janela de busca (2h a 3h): ${startTime} - ${endTime}`);
    console.log(`Horário do agendamento: ${agendamento.hora_inicio}`);
    console.log(`Status do agendamento: ${agendamento.status}`);
    
    const dataMatch = agendamento.data_agendamento === todayStr;
    const statusMatch = agendamento.status === 'Confirmado';
    const horaMatch = agendamento.hora_inicio >= startTime && agendamento.hora_inicio <= endTime;
    
    console.log('');
    console.log(`✓ Data é hoje? ${dataMatch ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`✓ Status é "Confirmado"? ${statusMatch ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`✓ Horário está na janela? ${horaMatch ? '✅ SIM' : '❌ NÃO'}`);
    
    if (dataMatch && statusMatch && horaMatch) {
      console.log('\n✅ AGENDAMENTO ELEGÍVEL para lembrete de 2h!');
    } else {
      console.log('\n❌ AGENDAMENTO NÃO ELEGÍVEL para lembrete de 2h!');
      console.log('\n💡 MOTIVOS:');
      if (!dataMatch) console.log('   - Data do agendamento não é hoje');
      if (!statusMatch) console.log(`   - Status não é "Confirmado" (atual: "${agendamento.status}")`);
      if (!horaMatch) console.log(`   - Horário ${agendamento.hora_inicio} não está na janela ${startTime} - ${endTime}`);
    }
    
    console.log('='.repeat(80) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao verificar lembrete:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Executar
checkReminder();

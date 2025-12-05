/**
 * Teste de Proteção contra Race Conditions
 * Simula duas execuções simultâneas tentando processar os mesmos lembretes
 */

const ReminderService = require('./src/services/ReminderService');

async function testRaceConditionProtection() {
  console.log('\n🧪 TESTE: Proteção contra Race Conditions\n');
  console.log('=' .repeat(80));
  console.log('Simulando duas execuções simultâneas do processamento de lembretes...');
  console.log('=' .repeat(80) + '\n');

  const service1 = new ReminderService();
  const service2 = new ReminderService();

  // Executar ambos os serviços simultaneamente
  const startTime = Date.now();
  
  const [result1, result2] = await Promise.all([
    service1.processScheduledReminders(),
    service2.processScheduledReminders()
  ]);

  const duration = Date.now() - startTime;

  console.log('\n' + '=' .repeat(80));
  console.log('📊 RESULTADOS DO TESTE');
  console.log('=' .repeat(80));
  console.log(`⏱️  Duração total: ${duration}ms\n`);
  
  console.log('📋 Execução 1:');
  console.log(`   - Processados: ${result1.processed}`);
  console.log(`   - Enviados: ${result1.sent}`);
  console.log(`   - Falhas: ${result1.failed}`);
  console.log(`   - Pulados: ${result1.skipped}\n`);
  
  console.log('📋 Execução 2:');
  console.log(`   - Processados: ${result2.processed}`);
  console.log(`   - Enviados: ${result2.sent}`);
  console.log(`   - Falhas: ${result2.failed}`);
  console.log(`   - Pulados: ${result2.skipped}\n`);

  const totalProcessed = result1.processed + result2.processed;
  const totalSent = result1.sent + result2.sent;

  console.log('=' .repeat(80));
  console.log('✅ ANÁLISE:');
  console.log('=' .repeat(80));
  console.log(`📊 Total de lembretes processados: ${totalProcessed}`);
  console.log(`📤 Total de mensagens enviadas: ${totalSent}`);
  
  if (totalProcessed > 0 && totalSent === totalProcessed) {
    console.log('\n✅ SUCESSO! Cada lembrete foi enviado apenas UMA vez!');
    console.log('🔒 A proteção contra race conditions está funcionando corretamente!');
  } else if (totalSent > totalProcessed) {
    console.log('\n❌ FALHA! Alguns lembretes foram enviados mais de uma vez!');
    console.log('⚠️  A proteção contra race conditions NÃO está funcionando!');
  } else {
    console.log('\n✅ Nenhum lembrete estava pronto para envio no momento do teste.');
  }
  
  console.log('=' .repeat(80) + '\n');
}

// Executar teste
testRaceConditionProtection()
  .then(() => {
    console.log('🏁 Teste concluído!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
  });

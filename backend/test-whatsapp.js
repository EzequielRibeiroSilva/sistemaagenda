/**
 * Teste manual do WhatsAppService
 */

const WhatsAppService = require('./src/services/WhatsAppService');

async function testWhatsApp() {
  console.log('🧪 Iniciando teste do WhatsAppService...\n');
  
  const whatsAppService = new WhatsAppService();
  
  // 1. Verificar se está habilitado
  console.log('1. Verificando se WhatsApp está habilitado...');
  const isEnabled = whatsAppService.isEnabled();
  console.log(`   ✅ WhatsApp habilitado: ${isEnabled}\n`);
  
  if (!isEnabled) {
    console.log('❌ WhatsApp não está habilitado. Verifique as variáveis de ambiente.');
    return;
  }
  
  // 2. Testar conexão
  console.log('2. Testando conexão com Evolution API...');
  try {
    const connectionTest = await whatsAppService.testConnection();
    console.log('   ✅ Conexão:', JSON.stringify(connectionTest, null, 2), '\n');
  } catch (error) {
    console.log('   ❌ Erro na conexão:', error.message, '\n');
  }
  
  // 3. Testar envio de mensagem simples
  console.log('3. Testando envio de mensagem...');
  try {
    const result = await whatsAppService.sendMessage(
      '+5585991913656', // Seu número
      'Teste de mensagem do sistema de agendamentos'
    );
    console.log('   ✅ Mensagem enviada:', JSON.stringify(result, null, 2), '\n');
  } catch (error) {
    console.log('   ❌ Erro ao enviar mensagem:', error.message);
    console.log('   Stack:', error.stack, '\n');
  }
  
  console.log('🏁 Teste concluído!');
}

testWhatsApp().catch(console.error);


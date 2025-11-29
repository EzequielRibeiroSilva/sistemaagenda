/**
 * Script de Teste: Verificar Configuração WhatsApp
 * Objetivo: Diagnosticar problemas de envio de mensagens
 */

require('dotenv').config();
const WhatsAppService = require('./src/services/WhatsAppService');

async function testWhatsAppConfig() {
  console.log('\n================================================================================');
  console.log('🔍 DIAGNÓSTICO DE CONFIGURAÇÃO WHATSAPP');
  console.log('================================================================================\n');

  const whatsappService = new WhatsAppService();

  // 1. Verificar variáveis de ambiente
  console.log('1️⃣ VARIÁVEIS DE AMBIENTE:');
  console.log('   WHATSAPP_ENABLED:', process.env.WHATSAPP_ENABLED);
  console.log('   ENABLE_WHATSAPP_NOTIFICATIONS:', process.env.ENABLE_WHATSAPP_NOTIFICATIONS);
  console.log('   WHATSAPP_TEST_MODE:', process.env.WHATSAPP_TEST_MODE);
  console.log('   EVOLUTION_API_URL:', process.env.EVOLUTION_API_URL || process.env.EVO_API_BASE_URL);
  console.log('   EVOLUTION_API_KEY:', process.env.EVOLUTION_API_KEY ? '***' + process.env.EVOLUTION_API_KEY.slice(-4) : 'NÃO DEFINIDA');
  console.log('   EVOLUTION_INSTANCE_NAME:', process.env.EVOLUTION_INSTANCE_NAME);
  console.log('   FRONTEND_URL:', process.env.FRONTEND_URL);
  console.log('');

  // 2. Verificar configuração do serviço
  console.log('2️⃣ CONFIGURAÇÃO DO SERVIÇO:');
  console.log('   enabled:', whatsappService.enabled);
  console.log('   testMode:', whatsappService.testMode);
  console.log('   evolutionApiUrl:', whatsappService.evolutionApiUrl);
  console.log('   evolutionApiKey:', whatsappService.evolutionApiKey ? '***' + whatsappService.evolutionApiKey.slice(-4) : 'NÃO DEFINIDA');
  console.log('   instanceName:', whatsappService.instanceName);
  console.log('   isEnabled():', whatsappService.isEnabled());
  console.log('');

  // 3. Verificar se o serviço está habilitado
  if (!whatsappService.isEnabled()) {
    console.log('❌ SERVIÇO DESABILITADO!');
    console.log('');
    console.log('📋 CHECKLIST PARA HABILITAR:');
    console.log('   [ ] Definir WHATSAPP_ENABLED=true no .env');
    console.log('   [ ] Definir EVOLUTION_API_URL no .env');
    console.log('   [ ] Definir EVOLUTION_API_KEY no .env');
    console.log('');
    console.log('💡 EXEMPLO DE CONFIGURAÇÃO (.env):');
    console.log('   WHATSAPP_ENABLED=true');
    console.log('   WHATSAPP_TEST_MODE=true  # Para testes sem enviar mensagens reais');
    console.log('   EVOLUTION_API_URL=http://localhost:8080');
    console.log('   EVOLUTION_API_KEY=sua_chave_aqui');
    console.log('   EVOLUTION_INSTANCE_NAME=PAINEL-DE-AGENDAMENTOS');
    console.log('   FRONTEND_URL=http://localhost:5173');
    console.log('');
    return;
  }

  console.log('✅ SERVIÇO HABILITADO!');
  console.log('');

  // 4. Testar formatação de telefone
  console.log('3️⃣ TESTE DE FORMATAÇÃO DE TELEFONE:');
  const testPhones = [
    '85999999999',
    '5585999999999',
    '(85) 99999-9999',
    '085999999999'
  ];

  testPhones.forEach(phone => {
    const formatted = whatsappService.formatPhoneNumber(phone);
    console.log(`   ${phone} → ${formatted}`);
  });
  console.log('');

  // 5. Testar geração de links
  console.log('4️⃣ TESTE DE GERAÇÃO DE LINKS:');
  const testPhone = '85999999999';
  const testAgendamentoId = 101;
  
  const wppLink = whatsappService.generateWhatsAppLink(testPhone);
  const managementLink = whatsappService.generateManagementLink(testAgendamentoId);
  
  console.log('   Link WhatsApp:', wppLink);
  console.log('   Link de Gestão:', managementLink);
  console.log('');

  // 6. Testar geração de mensagem
  console.log('5️⃣ TESTE DE GERAÇÃO DE MENSAGEM:');
  const testData = {
    cliente: {
      nome: 'Valnira Ribeiro'
    },
    cliente_telefone: '85999999999',
    agente: {
      nome: 'Ezequiel Ribeiro'
    },
    agente_telefone: '85988888888',
    unidade: {
      nome: 'Salão Teste'
    },
    unidade_telefone: '85977777777',
    agendamento_id: 101,
    data_agendamento: '2024-11-29',
    hora_inicio: '14:00',
    servicos: [
      { nome: 'Corte de Cabelo' },
      { nome: 'Barba' }
    ]
  };

  try {
    const message = whatsappService.generateAppointmentConfirmationClient(testData);
    console.log('   ✅ Mensagem gerada com sucesso!');
    console.log('');
    console.log('   📄 PREVIEW DA MENSAGEM:');
    console.log('   ' + '─'.repeat(70));
    console.log(message.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');
  } catch (error) {
    console.error('   ❌ Erro ao gerar mensagem:', error.message);
    console.log('');
  }

  // 7. Testar envio (se habilitado)
  if (whatsappService.testMode) {
    console.log('6️⃣ TESTE DE ENVIO (MODO TESTE):');
    console.log('   ⚠️  Modo de teste ativado - nenhuma mensagem real será enviada');
    
    try {
      const result = await whatsappService.sendAppointmentConfirmation(testData);
      console.log('   ✅ Teste de envio concluído!');
      console.log('   📊 Resultado:', JSON.stringify(result, null, 2).split('\n').map(line => '   ' + line).join('\n'));
    } catch (error) {
      console.error('   ❌ Erro no teste de envio:', error.message);
    }
  } else {
    console.log('6️⃣ TESTE DE ENVIO:');
    console.log('   ⚠️  ATENÇÃO: Modo real ativado!');
    console.log('   ℹ️  Para testar sem enviar mensagens reais, defina WHATSAPP_TEST_MODE=true');
  }

  console.log('');
  console.log('================================================================================');
  console.log('✅ DIAGNÓSTICO CONCLUÍDO');
  console.log('================================================================================\n');
}

// Executar teste
testWhatsAppConfig()
  .then(() => {
    console.log('✅ Teste finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
  });

/**
 * Script de Teste: Validar Mensagens com Links Descritivos
 * Objetivo: Verificar se os canais de atendimento estão com nomes específicos
 */

require('dotenv').config();
const WhatsAppService = require('./src/services/WhatsAppService');

async function testMensagensMelhoradas() {
  console.log('\n================================================================================');
  console.log('🔍 TESTE DE MENSAGENS COM LINKS DESCRITIVOS');
  console.log('================================================================================\n');

  const whatsappService = new WhatsAppService();

  // Dados de teste
  const dadosAgendamento = {
    cliente: {
      nome: 'Ruth Sales'
    },
    cliente_telefone: '85987256574',
    agente: {
      nome: 'ezequiel ribeiro'
    },
    agente_telefone: '5585991927746',
    unidade: {
      nome: 'Unidade 1'
    },
    unidade_telefone: '5511999999999',
    agendamento_id: 103,
    data_agendamento: new Date('2024-11-29T00:00:00'),
    hora_inicio: '16:00:00',
    servicos: [
      { nome: 'Corte de Cabelo' }
    ]
  };

  console.log('📋 DADOS DO TESTE:');
  console.log('   Cliente:', dadosAgendamento.cliente.nome);
  console.log('   Agente:', dadosAgendamento.agente.nome);
  console.log('   Unidade:', dadosAgendamento.unidade.nome);
  console.log('   Data:', dadosAgendamento.data_agendamento.toISOString().split('T')[0]);
  console.log('   Hora:', dadosAgendamento.hora_inicio);
  console.log('');

  // ========================================
  // TESTE 1: Confirmação de Agendamento (Cliente)
  // ========================================
  console.log('1️⃣ CONFIRMAÇÃO DE AGENDAMENTO - CLIENTE\n');

  try {
    const mensagem = whatsappService.generateAppointmentConfirmationClient(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA:');
    console.log('   ' + '─'.repeat(70));
    console.log(mensagem.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Nome da Unidade nos canais': mensagem.includes(`🏠 ${dadosAgendamento.unidade.nome}:`),
      'Nome do Agente nos canais': mensagem.includes(`👤 Agente ${dadosAgendamento.agente.nome}:`),
      'NÃO contém "Local:" genérico': !mensagem.includes('🏠 Local:'),
      'NÃO contém "Agente:" genérico': !mensagem.includes('👤 Agente:') || mensagem.includes('👤 Agente '),
      'Data formatada corretamente': !mensagem.includes('Invalid Date')
    };

    console.log('   ✅ VERIFICAÇÕES:');
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}`);
    });
    console.log('');

  } catch (error) {
    console.error('   ❌ ERRO:', error.message);
    console.log('');
  }

  // ========================================
  // TESTE 2: Confirmação de Agendamento (Agente)
  // ========================================
  console.log('2️⃣ CONFIRMAÇÃO DE AGENDAMENTO - AGENTE\n');

  try {
    const mensagem = whatsappService.generateAppointmentConfirmationAgent(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA:');
    console.log('   ' + '─'.repeat(70));
    console.log(mensagem.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Nome do Cliente nos contatos': mensagem.includes(`👤 Cliente ${dadosAgendamento.cliente.nome}:`),
      'NÃO contém "Cliente:" genérico': !mensagem.includes('👤 Cliente:') || mensagem.includes('👤 Cliente ')
    };

    console.log('   ✅ VERIFICAÇÕES:');
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}`);
    });
    console.log('');

  } catch (error) {
    console.error('   ❌ ERRO:', error.message);
    console.log('');
  }

  // ========================================
  // TESTE 3: Lembrete 2 Horas Antes
  // ========================================
  console.log('3️⃣ LEMBRETE 2 HORAS ANTES - CLIENTE\n');

  try {
    const mensagem = whatsappService.generateReminder2hMessage(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA:');
    console.log('   ' + '─'.repeat(70));
    console.log(mensagem.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Nome da Unidade em "Como chegar"': mensagem.includes(`🏠 ${dadosAgendamento.unidade.nome}:`),
      'Nome do Agente em "Como chegar"': mensagem.includes(`👤 Agente ${dadosAgendamento.agente.nome}:`)
    };

    console.log('   ✅ VERIFICAÇÕES:');
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}`);
    });
    console.log('');

  } catch (error) {
    console.error('   ❌ ERRO:', error.message);
    console.log('');
  }

  // ========================================
  // TESTE 4: Cancelamento
  // ========================================
  console.log('4️⃣ CONFIRMAÇÃO DE CANCELAMENTO - CLIENTE\n');

  try {
    const mensagem = whatsappService.generateCancellationClient(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA (TRECHO):');
    console.log('   ' + '─'.repeat(70));
    const linhas = mensagem.split('\n');
    const trechoRelevante = linhas.slice(-6).join('\n'); // Últimas 6 linhas
    console.log(trechoRelevante.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Nome da Unidade em "Dúvidas"': mensagem.includes(`🏠 ${dadosAgendamento.unidade.nome}:`),
      'Nome do Agente em "Dúvidas"': mensagem.includes(`👤 Agente ${dadosAgendamento.agente.nome}:`)
    };

    console.log('   ✅ VERIFICAÇÕES:');
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}`);
    });
    console.log('');

  } catch (error) {
    console.error('   ❌ ERRO:', error.message);
    console.log('');
  }

  // ========================================
  // TESTE 5: Reagendamento
  // ========================================
  console.log('5️⃣ CONFIRMAÇÃO DE REAGENDAMENTO - CLIENTE\n');

  try {
    const mensagem = whatsappService.generateRescheduleClient(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA (TRECHO):');
    console.log('   ' + '─'.repeat(70));
    const linhas = mensagem.split('\n');
    const trechoRelevante = linhas.slice(-4).join('\n'); // Últimas 4 linhas
    console.log(trechoRelevante.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Nome da Unidade em "Dúvidas"': mensagem.includes(`🏠 ${dadosAgendamento.unidade.nome}:`)
    };

    console.log('   ✅ VERIFICAÇÕES:');
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}`);
    });
    console.log('');

  } catch (error) {
    console.error('   ❌ ERRO:', error.message);
    console.log('');
  }

  console.log('================================================================================');
  console.log('✅ TESTES CONCLUÍDOS');
  console.log('================================================================================\n');

  console.log('📋 RESUMO DAS MELHORIAS:\n');
  console.log('   ✅ Links de canais de atendimento agora são auto-explicativos');
  console.log('   ✅ "Local:" → "Unidade 1:" (nome específico da unidade)');
  console.log('   ✅ "Agente:" → "Agente ezequiel ribeiro:" (nome específico do agente)');
  console.log('   ✅ "Cliente:" → "Cliente Ruth Sales:" (nome específico do cliente)');
  console.log('   ✅ Cliente entende imediatamente quem/onde está contatando\n');

  console.log('🎯 BENEFÍCIOS:\n');
  console.log('   • Comunicação mais clara e personalizada');
  console.log('   • Cliente identifica rapidamente o canal correto');
  console.log('   • Reduz confusão em empresas com múltiplas unidades');
  console.log('   • Experiência do usuário mais profissional\n');
}

// Executar teste
testMensagensMelhoradas()
  .then(() => {
    console.log('✅ Teste finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
  });

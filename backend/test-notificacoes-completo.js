/**
 * Script de Teste: Notificações de Cancelamento e Reagendamento
 * Descrição: Testa as novas funcionalidades de notificação automática
 */

const WhatsAppService = require('./src/services/WhatsAppService');

async function testarNotificacoes() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TESTE: NOTIFICAÇÕES DE CANCELAMENTO E REAGENDAMENTO');
  console.log('='.repeat(80) + '\n');

  const whatsappService = new WhatsAppService();

  // Dados de teste
  const dadosAgendamento = {
    cliente: {
      nome: 'Maria Silva'
    },
    cliente_telefone: '5585987654321',
    agente: {
      nome: 'João Santos'
    },
    agente_telefone: '5585991234567',
    unidade: {
      id: 40,
      nome: 'Salão Beleza Total',
      endereco: 'Rua das Flores, 123 - Centro, Fortaleza - CE',
      slug_url: 'salao-beleza-total'
    },
    unidade_telefone: '5585988888888',
    unidade_endereco: 'Rua das Flores, 123 - Centro, Fortaleza - CE',
    unidade_slug: 'salao-beleza-total',
    agendamento_id: 999,
    data_agendamento: new Date('2025-12-05T00:00:00'),
    hora_inicio: '14:00:00',
    hora_fim: '15:00:00',
    servicos: [
      { nome: 'Corte de Cabelo', preco: 50 },
      { nome: 'Escova', preco: 30 }
    ]
  };

  console.log('📋 DADOS DO TESTE:');
  console.log('   Cliente:', dadosAgendamento.cliente.nome);
  console.log('   Agente:', dadosAgendamento.agente.nome);
  console.log('   Unidade:', dadosAgendamento.unidade.nome);
  console.log('   Endereço:', dadosAgendamento.unidade_endereco);
  console.log('   Data:', dadosAgendamento.data_agendamento.toISOString().split('T')[0]);
  console.log('   Hora:', dadosAgendamento.hora_inicio);
  console.log('');

  // ========================================
  // TESTE 1: Lembrete 1h com Endereço
  // ========================================
  console.log('1️⃣ LEMBRETE 1H - COM ENDEREÇO\n');

  try {
    const mensagem = whatsappService.generateReminder2hMessage(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA:');
    console.log('   ' + '─'.repeat(70));
    console.log(mensagem.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Contém endereço da unidade': mensagem.includes(dadosAgendamento.unidade_endereco),
      'Contém emoji de casa 🏠': mensagem.includes('🏠'),
      'Contém emoji de telefone 📞': mensagem.includes('📞'),
      'Contém emoji de agente 👤': mensagem.includes('👤'),
      'Contém nome da unidade': mensagem.includes(dadosAgendamento.unidade.nome),
      'Contém nome do agente': mensagem.includes(dadosAgendamento.agente.nome),
      'Contém horário': mensagem.includes(dadosAgendamento.hora_inicio)
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
  // TESTE 2: Cancelamento - Cliente
  // ========================================
  console.log('2️⃣ CANCELAMENTO - CLIENTE\n');

  try {
    const mensagem = whatsappService.generateCancellationClient(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA:');
    console.log('   ' + '─'.repeat(70));
    console.log(mensagem.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Contém emoji de cancelamento ❌': mensagem.includes('❌'),
      'Contém nome do cliente': mensagem.includes(dadosAgendamento.cliente.nome),
      'Contém nome da unidade': mensagem.includes(dadosAgendamento.unidade.nome),
      'Contém link de booking (novo agendamento)': mensagem.includes('/booking'),
      'NÃO contém link de gerenciamento': !mensagem.includes('gerenciar-agendamento'),
      'Contém informações de contato': mensagem.includes('🏠') && mensagem.includes('👤')
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
  // TESTE 3: Cancelamento - Agente
  // ========================================
  console.log('3️⃣ CANCELAMENTO - AGENTE\n');

  try {
    const mensagem = whatsappService.generateCancellationAgent(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA:');
    console.log('   ' + '─'.repeat(70));
    console.log(mensagem.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Contém emoji de cancelamento 🚫': mensagem.includes('🚫'),
      'Contém nome do cliente': mensagem.includes(dadosAgendamento.cliente.nome),
      'Contém ID do agendamento': mensagem.includes(`#${dadosAgendamento.agendamento_id}`),
      'Informa liberação da agenda': mensagem.includes('agenda') && mensagem.includes('liberada')
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
  // TESTE 4: Reagendamento - Cliente
  // ========================================
  console.log('4️⃣ REAGENDAMENTO - CLIENTE\n');

  try {
    const mensagem = whatsappService.generateRescheduleClient(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA:');
    console.log('   ' + '─'.repeat(70));
    console.log(mensagem.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Contém emoji de reagendamento 🔄': mensagem.includes('🔄'),
      'Contém nome do cliente': mensagem.includes(dadosAgendamento.cliente.nome),
      'Contém nova data/hora': mensagem.includes('Nova Data'),
      'Contém nome do agente': mensagem.includes(dadosAgendamento.agente.nome),
      'Contém link de gestão': mensagem.includes('gerenciar-agendamento'),
      'Contém ID do agendamento': mensagem.includes(`#${dadosAgendamento.agendamento_id}`)
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
  // TESTE 5: Reagendamento - Agente
  // ========================================
  console.log('5️⃣ REAGENDAMENTO - AGENTE\n');

  try {
    const mensagem = whatsappService.generateRescheduleAgent(dadosAgendamento);
    
    console.log('   📄 MENSAGEM GERADA:');
    console.log('   ' + '─'.repeat(70));
    console.log(mensagem.split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '─'.repeat(70));
    console.log('');

    // Verificações
    const checks = {
      'Contém emoji de atualização 🔄': mensagem.includes('🔄'),
      'Contém nome do cliente': mensagem.includes(dadosAgendamento.cliente.nome),
      'Contém novo horário': mensagem.includes('Novo Horário'),
      'Contém ID do agendamento': mensagem.includes(`#${dadosAgendamento.agendamento_id}`)
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

  console.log('='.repeat(80));
  console.log('✅ TESTES CONCLUÍDOS');
  console.log('='.repeat(80) + '\n');
}

// Executar testes
testarNotificacoes().catch(error => {
  console.error('❌ Erro ao executar testes:', error);
  process.exit(1);
});

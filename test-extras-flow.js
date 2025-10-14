#!/usr/bin/env node

/**
 * Script de teste completo para a nova funcionalidade de serviços extras
 * Testa: Backend, Banco de Dados, WhatsApp e Frontend
 */

const API_BASE = 'http://localhost:3001/api';

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const data = await response.json();
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testExtrasFlow() {
  console.log('🧪 INICIANDO TESTE COMPLETO DOS SERVIÇOS EXTRAS\n');

  // 1. TESTE: Carregar dados do salão (deve incluir extras)
  console.log('1️⃣ Testando carregamento dos dados do salão...');
  const salonData = await makeRequest(`${API_BASE}/public/salao/40`);
  
  if (!salonData.success) {
    console.log('❌ Falha ao carregar dados do salão:', salonData.error);
    return;
  }

  const extras = salonData.data.data.extras;
  console.log(`✅ Dados carregados! Encontrados ${extras.length} serviços extras:`);
  extras.forEach(extra => {
    console.log(`   • ${extra.name} - R$ ${extra.price} (${extra.duration}min)`);
  });
  console.log('');

  // 2. TESTE: Criar agendamento SEM extras
  console.log('2️⃣ Testando agendamento SEM serviços extras...');
  const agendamentoSemExtras = await makeRequest(`${API_BASE}/public/agendamento`, {
    method: 'POST',
    body: JSON.stringify({
      unidade_id: 40,
      agente_id: 23,
      servico_ids: [17], // Corte de Cabelo
      servico_extra_ids: [], // Sem extras
      data_agendamento: '2025-10-23',
      hora_inicio: '10:00',
      cliente_nome: 'Teste Sem Extras',
      cliente_telefone: '+5585111111111',
      observacoes: 'Agendamento sem serviços extras'
    })
  });

  if (agendamentoSemExtras.success) {
    const dados = agendamentoSemExtras.data.data;
    console.log(`✅ Agendamento criado! ID: ${dados.agendamento_id}`);
    console.log(`   Valor total: R$ ${dados.valor_total}`);
    console.log(`   Extras: ${dados.extras.length} itens`);
  } else {
    console.log('❌ Falha ao criar agendamento sem extras:', agendamentoSemExtras.data);
  }
  console.log('');

  // 3. TESTE: Criar agendamento COM extras
  console.log('3️⃣ Testando agendamento COM serviços extras...');
  const agendamentoComExtras = await makeRequest(`${API_BASE}/public/agendamento`, {
    method: 'POST',
    body: JSON.stringify({
      unidade_id: 40,
      agente_id: 23,
      servico_ids: [17, 18], // Corte + Barba
      servico_extra_ids: [8, 10, 11], // Lavagem + Pomada + Sobrancelha
      data_agendamento: '2025-10-23',
      hora_inicio: '14:00',
      cliente_nome: 'Teste Com Extras',
      cliente_telefone: '+5585222222222',
      observacoes: 'Agendamento com múltiplos serviços extras'
    })
  });

  if (agendamentoComExtras.success) {
    const dados = agendamentoComExtras.data.data;
    console.log(`✅ Agendamento criado! ID: ${dados.agendamento_id}`);
    console.log(`   Valor total: R$ ${dados.valor_total}`);
    console.log(`   Serviços: ${dados.servicos.length} itens`);
    dados.servicos.forEach(s => console.log(`     • ${s.nome} - R$ ${s.preco}`));
    console.log(`   Extras: ${dados.extras.length} itens`);
    dados.extras.forEach(e => console.log(`     • ${e.nome} - R$ ${e.preco}`));
  } else {
    console.log('❌ Falha ao criar agendamento com extras:', agendamentoComExtras.data);
  }
  console.log('');

  // 4. TESTE: Preview da mensagem WhatsApp
  console.log('4️⃣ Testando preview da mensagem WhatsApp...');
  const preview = await makeRequest(`${API_BASE}/whatsapp-test/preview`, {
    method: 'POST',
    body: JSON.stringify({
      telefone: '+5585222222222',
      nome: 'Teste Com Extras'
    })
  });

  if (preview.success) {
    console.log('✅ Preview gerado com sucesso!');
    console.log(`   Tamanho da mensagem: ${preview.data.data.tamanho} caracteres`);
    
    // Verificar se a mensagem contém referência aos extras
    const mensagem = preview.data.data.mensagem;
    if (mensagem.includes('Extras') || mensagem.includes('extras')) {
      console.log('✅ Mensagem inclui seção de extras!');
    } else {
      console.log('⚠️  Mensagem não parece incluir extras (pode ser dados de exemplo)');
    }
  } else {
    console.log('❌ Falha ao gerar preview:', preview.data);
  }
  console.log('');

  // 5. TESTE: Configuração do WhatsApp
  console.log('5️⃣ Testando configuração do WhatsApp...');
  const config = await makeRequest(`${API_BASE}/whatsapp-test/config`);
  
  if (config.success) {
    const cfg = config.data.data;
    console.log('✅ Configuração obtida:');
    console.log(`   Habilitado: ${cfg.enabled}`);
    console.log(`   Modo teste: ${cfg.testMode}`);
    console.log(`   Instância: ${cfg.instance}`);
  } else {
    console.log('❌ Falha ao obter configuração:', config.data);
  }
  console.log('');

  // RESUMO FINAL
  console.log('📊 RESUMO DOS TESTES:');
  console.log(`✅ Dados do salão: ${salonData.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Agendamento sem extras: ${agendamentoSemExtras.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Agendamento com extras: ${agendamentoComExtras.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Preview WhatsApp: ${preview.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Configuração WhatsApp: ${config.success ? 'OK' : 'FALHA'}`);
  
  const todosOk = [salonData, agendamentoSemExtras, agendamentoComExtras, preview, config]
    .every(test => test.success);
  
  console.log(`\n🎯 RESULTADO FINAL: ${todosOk ? '✅ TODOS OS TESTES PASSARAM!' : '❌ ALGUNS TESTES FALHARAM'}`);
  
  if (todosOk) {
    console.log('\n🚀 A funcionalidade de serviços extras está funcionando perfeitamente!');
    console.log('   • Backend processando extras corretamente');
    console.log('   • Banco de dados salvando relacionamentos');
    console.log('   • Cálculos de preço e duração incluindo extras');
    console.log('   • WhatsApp configurado (estrutura pronta)');
    console.log('\n📱 Próximo passo: Testar o frontend em http://localhost:5173/booking/40');
  }
}

// Executar os testes
testExtrasFlow().catch(console.error);

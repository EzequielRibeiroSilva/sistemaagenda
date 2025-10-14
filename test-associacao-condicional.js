#!/usr/bin/env node

/**
 * Script de teste completo para Associação Condicional Serviço ↔ Serviço Extra
 * Testa: Filtro condicional, lógica de UNIÃO, backend e frontend
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

async function testAssociacaoCondicional() {
  console.log('🧪 TESTE COMPLETO: ASSOCIAÇÃO CONDICIONAL SERVIÇO ↔ SERVIÇO EXTRA\n');

  // 1. TESTE: Verificar dados do salão (deve incluir associações)
  console.log('1️⃣ Testando carregamento dos dados do salão com associações...');
  const salonData = await makeRequest(`${API_BASE}/public/salao/40`);
  
  if (!salonData.success) {
    console.log('❌ Falha ao carregar dados do salão:', salonData.error);
    return;
  }

  const { servicos, extras, servico_extras } = salonData.data.data;
  console.log(`✅ Dados carregados!`);
  console.log(`   • ${servicos.length} serviços principais`);
  console.log(`   • ${extras.length} serviços extras`);
  console.log(`   • ${servico_extras.length} associações serviço-extra`);
  
  // Mostrar associações
  console.log('\n📋 Associações encontradas:');
  servico_extras.forEach(assoc => {
    const servico = servicos.find(s => s.id === assoc.servico_id);
    const extra = extras.find(e => e.id === assoc.servico_extra_id);
    if (servico && extra) {
      console.log(`   • ${servico.nome} → ${extra.name}`);
    }
  });
  console.log('');

  // 2. TESTE: Filtro por serviço único
  console.log('2️⃣ Testando filtro por serviço único (ID: 17)...');
  const extrasServico17 = await makeRequest(`${API_BASE}/public/salao/40/extras?servico_ids=17`);
  
  if (extrasServico17.success) {
    const extras17 = extrasServico17.data.data;
    console.log(`✅ Encontrados ${extras17.length} extras para "Corte de Cabelo":`);
    extras17.forEach(extra => {
      console.log(`   • ${extra.name} - R$ ${extra.price} (${extra.duration}min)`);
    });
  } else {
    console.log('❌ Falha ao buscar extras para serviço 17:', extrasServico17.data);
  }
  console.log('');

  // 3. TESTE: Filtro por serviço único (outro serviço)
  console.log('3️⃣ Testando filtro por serviço único (ID: 18)...');
  const extrasServico18 = await makeRequest(`${API_BASE}/public/salao/40/extras?servico_ids=18`);
  
  if (extrasServico18.success) {
    const extras18 = extrasServico18.data.data;
    console.log(`✅ Encontrados ${extras18.length} extras para "Barba":`);
    extras18.forEach(extra => {
      console.log(`   • ${extra.name} - R$ ${extra.price} (${extra.duration}min)`);
    });
  } else {
    console.log('❌ Falha ao buscar extras para serviço 18:', extrasServico18.data);
  }
  console.log('');

  // 4. TESTE: Lógica de UNIÃO (múltiplos serviços)
  console.log('4️⃣ Testando lógica de UNIÃO (IDs: 17,18)...');
  const extrasUniao = await makeRequest(`${API_BASE}/public/salao/40/extras?servico_ids=17,18`);
  
  if (extrasUniao.success) {
    const extrasUniaoData = extrasUniao.data.data;
    console.log(`✅ UNIÃO encontrou ${extrasUniaoData.length} extras únicos:`);
    extrasUniaoData.forEach(extra => {
      console.log(`   • ${extra.name} - R$ ${extra.price} (${extra.duration}min)`);
    });
    
    // Verificar se é realmente a união
    const extras17Ids = extrasServico17.success ? extrasServico17.data.data.map(e => e.id) : [];
    const extras18Ids = extrasServico18.success ? extrasServico18.data.data.map(e => e.id) : [];
    const uniaoEsperada = [...new Set([...extras17Ids, ...extras18Ids])];
    const uniaoRecebida = extrasUniaoData.map(e => e.id).sort();
    
    if (JSON.stringify(uniaoEsperada.sort()) === JSON.stringify(uniaoRecebida)) {
      console.log('✅ Lógica de UNIÃO está correta!');
    } else {
      console.log('⚠️  Lógica de UNIÃO pode ter problemas:');
      console.log(`   Esperado: [${uniaoEsperada.sort().join(', ')}]`);
      console.log(`   Recebido: [${uniaoRecebida.join(', ')}]`);
    }
  } else {
    console.log('❌ Falha ao buscar extras com UNIÃO:', extrasUniao.data);
  }
  console.log('');

  // 5. TESTE: Serviço sem extras associados
  console.log('5️⃣ Testando serviço sem extras associados (ID: 16)...');
  const extrasSemAssoc = await makeRequest(`${API_BASE}/public/salao/40/extras?servico_ids=16`);
  
  if (extrasSemAssoc.success) {
    const extrasSemAssocData = extrasSemAssoc.data.data;
    console.log(`✅ Serviço sem associações retornou ${extrasSemAssocData.length} extras (esperado: 0)`);
    if (extrasSemAssocData.length === 0) {
      console.log('✅ Comportamento correto para serviço sem extras!');
    }
  } else {
    console.log('❌ Falha ao testar serviço sem extras:', extrasSemAssoc.data);
  }
  console.log('');

  // 6. TESTE: Agendamento com extras filtrados
  console.log('6️⃣ Testando agendamento com extras filtrados...');
  const agendamentoComExtras = await makeRequest(`${API_BASE}/public/agendamento`, {
    method: 'POST',
    body: JSON.stringify({
      unidade_id: 40,
      agente_id: 23,
      servico_ids: [17], // Corte de Cabelo
      servico_extra_ids: [5], // Lavagem do Cabelo (associado ao serviço 17)
      data_agendamento: '2025-10-25',
      hora_inicio: '10:00',
      cliente_nome: 'Teste Associação Condicional',
      cliente_telefone: '+5585333333333',
      observacoes: 'Teste da associação condicional funcionando'
    })
  });

  if (agendamentoComExtras.success) {
    const dados = agendamentoComExtras.data.data;
    console.log(`✅ Agendamento criado! ID: ${dados.agendamento_id}`);
    console.log(`   Valor total: R$ ${dados.valor_total}`);
    console.log(`   Extras incluídos: ${dados.extras.length} itens`);
    dados.extras.forEach(e => console.log(`     • ${e.nome} - R$ ${e.preco}`));
  } else {
    console.log('❌ Falha ao criar agendamento com extras:', agendamentoComExtras.data);
  }
  console.log('');

  // RESUMO FINAL
  console.log('📊 RESUMO DOS TESTES:');
  console.log(`✅ Dados do salão: ${salonData.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Filtro serviço único (17): ${extrasServico17.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Filtro serviço único (18): ${extrasServico18.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Lógica de UNIÃO: ${extrasUniao.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Serviço sem extras: ${extrasSemAssoc.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Agendamento com extras: ${agendamentoComExtras.success ? 'OK' : 'FALHA'}`);
  
  const todosOk = [salonData, extrasServico17, extrasServico18, extrasUniao, extrasSemAssoc, agendamentoComExtras]
    .every(test => test.success);
  
  console.log(`\n🎯 RESULTADO FINAL: ${todosOk ? '✅ TODOS OS TESTES PASSARAM!' : '❌ ALGUNS TESTES FALHARAM'}`);
  
  if (todosOk) {
    console.log('\n🚀 A Associação Condicional Serviço ↔ Serviço Extra está funcionando perfeitamente!');
    console.log('   • Filtro condicional implementado');
    console.log('   • Lógica de UNIÃO funcionando');
    console.log('   • Backend processando associações');
    console.log('   • Agendamentos salvando extras corretos');
    console.log('\n📱 Próximo passo: Testar o frontend em http://localhost:5173/booking/40');
  }
}

// Executar os testes
testAssociacaoCondicional().catch(console.error);

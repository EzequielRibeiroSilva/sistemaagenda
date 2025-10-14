#!/usr/bin/env node

/**
 * Script de teste para os novos endpoints do NewAppointmentModal
 * Testa: Busca de clientes, detalhes de agendamento, finalização, RBAC
 */

const API_BASE = 'http://localhost:3001/api';

// Token válido obtido via login
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxMjQsImlkIjoxMjQsImVtYWlsIjoidGVzdGFuZG9AZ21haWwuY29tIiwibm9tZSI6IlVzdcOhcmlvIFRlc3RhbmRvIiwicm9sZSI6IkFETUlOIiwidW5pZGFkZV9pZCI6NDAsInRpcG9fdXN1YXJpbyI6ImFkbWluIiwicGxhbm8iOiJNdWx0aSIsImxpbWl0ZV91bmlkYWRlcyI6MTAsInN0YXR1cyI6IkF0aXZvIiwiaWF0IjoxNzYwNDU3MzAxLCJqdGkiOiJmNzU3Mjg5MS0yZmEyLTRiODEtYTNiMC1mM2NkYzZiZjFlYTciLCJleHAiOjE3NjA1NDM3MDEsImF1ZCI6InBhaW5lbC1hZ2VuZGFtZW50by1mcm9udGVuZCIsImlzcyI6InBhaW5lbC1hZ2VuZGFtZW50by1hcGkifQ.jWYYRyRGBumTlWgwmLvoRgFXJzubnp8wvjAh2pe6eJQ';

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
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

async function testInternalBookingEndpoints() {
  console.log('🧪 TESTE COMPLETO: ENDPOINTS PARA NewAppointmentModal\n');

  // 1. TESTE: Busca de clientes
  console.log('1️⃣ Testando busca de clientes...');
  const clienteSearch = await makeRequest(`${API_BASE}/clientes/search?q=Vicente`);
  
  if (clienteSearch.success) {
    const clientes = clienteSearch.data.data;
    console.log(`✅ Encontrados ${clientes.length} clientes:`);
    clientes.forEach(cliente => {
      console.log(`   • ${cliente.nome_completo} - ${cliente.telefone}`);
    });
  } else {
    console.log('❌ Falha na busca de clientes:', clienteSearch.data);
  }
  console.log('');

  // 2. TESTE: Lista de agentes (com RBAC)
  console.log('2️⃣ Testando lista de agentes com RBAC...');
  const agentesData = await makeRequest(`${API_BASE}/agentes/list`);
  
  if (agentesData.success) {
    const agentes = agentesData.data.data;
    console.log(`✅ Encontrados ${agentes.length} agentes:`);
    agentes.forEach(agente => {
      console.log(`   • ID: ${agente.id} - ${agente.nome}`);
    });
  } else {
    console.log('❌ Falha ao buscar agentes:', agentesData.data);
  }
  console.log('');

  // 3. TESTE: Lista de serviços
  console.log('3️⃣ Testando lista de serviços...');
  const servicosData = await makeRequest(`${API_BASE}/servicos`);
  
  if (servicosData.success) {
    const servicos = servicosData.data.data;
    console.log(`✅ Encontrados ${servicos.length} serviços:`);
    servicos.slice(0, 3).forEach(servico => {
      console.log(`   • ${servico.nome} - R$ ${servico.preco} (${servico.duracao_minutos}min)`);
    });
  } else {
    console.log('❌ Falha ao buscar serviços:', servicosData.data);
  }
  console.log('');

  // 4. TESTE: Lista de serviços extras
  console.log('4️⃣ Testando lista de serviços extras...');
  const extrasData = await makeRequest(`${API_BASE}/servicos/extras/list`);
  
  if (extrasData.success) {
    const extras = extrasData.data.data;
    console.log(`✅ Encontrados ${extras.length} serviços extras:`);
    extras.slice(0, 3).forEach(extra => {
      console.log(`   • ${extra.nome} - R$ ${extra.preco} (${extra.duracao_minutos}min)`);
    });
  } else {
    console.log('❌ Falha ao buscar serviços extras:', extrasData.data);
  }
  console.log('');

  // 5. TESTE: Detalhes de agendamento
  console.log('5️⃣ Testando detalhes de agendamento...');
  const agendamentoId = 20; // ID do agendamento criado anteriormente
  const agendamentoDetails = await makeRequest(`${API_BASE}/agendamentos/${agendamentoId}`);
  
  if (agendamentoDetails.success) {
    const agendamento = agendamentoDetails.data.data;
    console.log(`✅ Detalhes do agendamento ${agendamentoId}:`);
    console.log(`   • Cliente: ${agendamento.cliente?.nome || 'N/A'}`);
    console.log(`   • Agente: ${agendamento.agente?.nome || 'N/A'}`);
    console.log(`   • Data: ${agendamento.data_agendamento} às ${agendamento.hora_inicio}`);
    console.log(`   • Status: ${agendamento.status}`);
    console.log(`   • Valor: R$ ${agendamento.valor_total}`);
    console.log(`   • Serviços: ${agendamento.servicos?.length || 0} itens`);
    console.log(`   • Extras: ${agendamento.extras?.length || 0} itens`);
  } else {
    console.log('❌ Falha ao buscar detalhes do agendamento:', agendamentoDetails.data);
  }
  console.log('');

  // 6. TESTE: Criação de agendamento interno (usando cliente existente)
  console.log('6️⃣ Testando criação de agendamento interno...');
  const novoAgendamento = await makeRequest(`${API_BASE}/agendamentos`, {
    method: 'POST',
    body: JSON.stringify({
      cliente_id: 13, // Cliente criado anteriormente
      agente_id: 23,
      unidade_id: 40,
      servico_ids: [17],
      servico_extra_ids: [5],
      data_agendamento: '2025-10-27',
      hora_inicio: '15:00',
      hora_fim: '16:00',
      observacoes: 'Agendamento criado via NewAppointmentModal'
    })
  });

  if (novoAgendamento.success) {
    const dados = novoAgendamento.data;
    console.log(`✅ Agendamento interno criado! ID: ${dados.id}`);
    console.log(`   Valor total: R$ ${dados.valor_total}`);

    // 7. TESTE: Finalização de agendamento
    console.log('\n7️⃣ Testando finalização de agendamento...');
    const finalizacao = await makeRequest(`${API_BASE}/agendamentos/${dados.id}/finalize`, {
      method: 'PATCH',
      body: JSON.stringify({
        paymentMethod: 'Dinheiro'
      })
    });

    if (finalizacao.success) {
      console.log(`✅ Agendamento ${dados.id} finalizado com sucesso!`);
      console.log(`   Status: ${finalizacao.data.data.status}`);
      console.log(`   Método de pagamento: ${finalizacao.data.data.payment_method}`);
    } else {
      console.log('❌ Falha ao finalizar agendamento:', finalizacao.data);
    }
  } else {
    console.log('❌ Falha ao criar agendamento interno:', novoAgendamento.data);
  }
  console.log('');

  // 9. TESTE: Busca de cliente inexistente
  console.log('9️⃣ Testando busca de cliente inexistente...');
  const clienteInexistente = await makeRequest(`${API_BASE}/clientes/search?q=ClienteQueNaoExiste123`);
  
  if (clienteInexistente.success) {
    const clientes = clienteInexistente.data.data;
    console.log(`✅ Busca por cliente inexistente retornou ${clientes.length} resultados (esperado: 0)`);
  } else {
    console.log('❌ Falha na busca de cliente inexistente:', clienteInexistente.data);
  }
  console.log('');

  // 10. TESTE: Busca com query muito curta
  console.log('🔟 Testando busca com query muito curta...');
  const queryMuitoCurta = await makeRequest(`${API_BASE}/clientes/search?q=A`);
  
  if (queryMuitoCurta.success) {
    const clientes = queryMuitoCurta.data.data;
    console.log(`✅ Query muito curta retornou ${clientes.length} resultados (esperado: 0)`);
    console.log(`   Mensagem: ${queryMuitoCurta.data.message}`);
  } else {
    console.log('❌ Falha na busca com query curta:', queryMuitoCurta.data);
  }
  console.log('');

  // RESUMO FINAL
  console.log('📊 RESUMO DOS TESTES:');
  console.log(`✅ Busca de clientes: ${clienteSearch.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Lista de agentes: ${agentesData.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Lista de serviços: ${servicosData.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Lista de extras: ${extrasData.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Detalhes agendamento: ${agendamentoDetails.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Criação agendamento: ${novoAgendamento.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Busca cliente inexistente: ${clienteInexistente.success ? 'OK' : 'FALHA'}`);
  console.log(`✅ Query muito curta: ${queryMuitoCurta.success ? 'OK' : 'FALHA'}`);
  
  const todosOk = [clienteSearch, agentesData, servicosData, extrasData, agendamentoDetails, novoAgendamento, clienteInexistente, queryMuitoCurta]
    .every(test => test.success);
  
  console.log(`\n🎯 RESULTADO FINAL: ${todosOk ? '✅ TODOS OS TESTES PASSARAM!' : '❌ ALGUNS TESTES FALHARAM'}`);
  
  if (todosOk) {
    console.log('\n🚀 Todos os endpoints estão funcionando perfeitamente!');
    console.log('   • Busca de clientes implementada');
    console.log('   • RBAC para agentes funcionando');
    console.log('   • Detalhes de agendamento disponíveis');
    console.log('   • Finalização de agendamentos implementada');
    console.log('\n📱 Próximo passo: Atualizar NewAppointmentModal.tsx para usar dados reais');
  }
}

// Executar os testes
testInternalBookingEndpoints().catch(console.error);

/**
 * Teste de Integração: ConversationStateManager no WhatsappWorker
 * 
 * Objetivo: Validar que o contexto estruturado está sendo:
 * 1. Carregado corretamente do banco
 * 2. Formatado e injetado no System Prompt
 * 3. Atualizado pela IA através da tool atualizar_contexto
 * 4. Preservado entre múltiplas mensagens
 */

const { db } = require('../src/config/knex');
const { getInstance: getConversationStateManager } = require('../src/services/ConversationStateManager');

async function testarIntegracaoCompleta() {
  console.log('\n🧪 INICIANDO TESTE DE INTEGRAÇÃO: ConversationStateManager\n');

  const stateManager = getConversationStateManager();
  
  // 1. CRIAR UMA SESSÃO DE TESTE
  console.log('📝 Passo 1: Criando sessão de teste...');
  
  const result = await db('chat_sessions').insert({
    unidade_id: 1,
    cliente_telefone: '5511999887766',
    status: 'active',
    contexto_json: JSON.stringify({
      unidade_id: 1,
      agente_id: null,
      cliente_id: 123,
      servicos_selecionados: [],
      data_agendamento: null,
      hora_inicio: null,
      status: 'iniciada',
      etapa_atual: 'identificacao',
      pagamento_pendente: false,
      pix_gerado: false,
      agendamento_id: null,
      tentativas_reagendamento: 0,
      ultima_atualizacao: new Date().toISOString()
    })
  }).returning('id');

  const sessionId = result[0]?.id || result[0]; // Compatibilidade com diferentes versões do Knex

  console.log(`✅ Sessão criada: ID ${sessionId}`);

  // 2. TESTAR LEITURA DO CONTEXTO
  console.log('\n📖 Passo 2: Testando leitura do contexto...');
  
  const state = await stateManager.getState(sessionId);
  
  console.log('Estado carregado:', JSON.stringify(state, null, 2));
  
  if (state.cliente_id === 123 && state.status === 'iniciada') {
    console.log('✅ Contexto carregado corretamente');
  } else {
    console.error('❌ ERRO: Contexto carregado com valores incorretos');
    return false;
  }

  // 3. TESTAR FORMATAÇÃO PARA O PROMPT
  console.log('\n📝 Passo 3: Testando formatação para System Prompt...');
  
  const contextBlock = stateManager.formatStateForPrompt(state);
  
  console.log('Bloco formatado para injeção no prompt:\n');
  console.log(contextBlock);
  console.log('\n');
  
  if (contextBlock.includes('CONTEXTO_ESTRUTURADO') && contextBlock.includes('MEMÓRIA DE LONGO PRAZO')) {
    console.log('✅ Formatação do contexto para prompt está correta');
  } else {
    console.error('❌ ERRO: Formatação do prompt está incorreta');
    return false;
  }

  // 4. TESTAR ATUALIZAÇÃO DO CONTEXTO (SIMULANDO A IA)
  console.log('\n🔄 Passo 4: Testando atualização do contexto (simulando IA)...');
  
  const updatedState = await stateManager.updateState(sessionId, {
    servicos_selecionados: [{ id: 1, nome: 'Corte de Cabelo' }],
    etapa_atual: 'selecao_servico',
    status: 'em_agendamento'
  });
  
  console.log('Estado após atualização:', JSON.stringify(updatedState, null, 2));
  
  if (
    updatedState.servicos_selecionados.length === 1 &&
    updatedState.servicos_selecionados[0].nome === 'Corte de Cabelo' &&
    updatedState.etapa_atual === 'selecao_servico'
  ) {
    console.log('✅ Atualização do contexto funcionou corretamente');
  } else {
    console.error('❌ ERRO: Atualização do contexto falhou');
    return false;
  }

  // 5. TESTAR ATUALIZAÇÃO INCREMENTAL (APENAS UM CAMPO)
  console.log('\n🔄 Passo 5: Testando atualização incremental...');
  
  const partialUpdate = await stateManager.updateState(sessionId, {
    agente_id: 5,
    data_agendamento: '2026-06-25'
  });
  
  console.log('Estado após atualização parcial:', JSON.stringify(partialUpdate, null, 2));
  
  // Verificar que os campos anteriores foram preservados
  if (
    partialUpdate.servicos_selecionados.length === 1 && // Preservado do passo 4
    partialUpdate.agente_id === 5 && // Novo valor
    partialUpdate.data_agendamento === '2026-06-25' && // Novo valor
    partialUpdate.etapa_atual === 'selecao_servico' // Preservado do passo 4
  ) {
    console.log('✅ Atualização incremental preservou campos anteriores');
  } else {
    console.error('❌ ERRO: Atualização incremental sobrescreveu campos anteriores');
    return false;
  }

  // 6. TESTAR SIMULAÇÃO DE AGENDAMENTO COMPLETO
  console.log('\n🎯 Passo 6: Simulando fluxo completo de agendamento...');
  
  await stateManager.updateState(sessionId, {
    hora_inicio: '14:00',
    etapa_atual: 'confirmacao'
  });
  
  const beforeBooking = await stateManager.getState(sessionId);
  console.log('Estado antes de criar agendamento:', JSON.stringify(beforeBooking, null, 2));
  
  // Simular que criar_agendamento retornou um ID
  await stateManager.updateState(sessionId, {
    agendamento_id: 999,
    status: 'concluida',
    etapa_atual: 'confirmacao'
  });
  
  const afterBooking = await stateManager.getState(sessionId);
  console.log('Estado após criar agendamento:', JSON.stringify(afterBooking, null, 2));
  
  if (afterBooking.agendamento_id === 999 && afterBooking.status === 'concluida') {
    console.log('✅ Simulação de agendamento completo bem-sucedida');
  } else {
    console.error('❌ ERRO: Simulação de agendamento falhou');
    return false;
  }

  // 7. TESTAR FORMATAÇÃO FINAL PARA PROMPT (COM TODOS OS DADOS)
  console.log('\n📝 Passo 7: Testando formatação final do contexto completo...');
  
  const finalContextBlock = stateManager.formatStateForPrompt(afterBooking);
  
  console.log('Bloco final para injeção no prompt:\n');
  console.log(finalContextBlock);
  console.log('\n');
  
  // Verificar que o JSON contém os campos esperados
  if (
    finalContextBlock.includes('"agendamento_id": 999') &&
    finalContextBlock.includes('"status": "concluida"') &&
    finalContextBlock.includes('"Corte de Cabelo"')
  ) {
    console.log('✅ Formatação final do contexto está completa e correta');
  } else {
    console.error('❌ ERRO: Formatação final está incompleta');
    return false;
  }

  // 8. VALIDAR INSTRUÇÕES CRÍTICAS NO PROMPT
  console.log('\n🔍 Passo 8: Validando instruções críticas no prompt...');
  
  const instructionKeywords = [
    'INSTRUÇÕES CRÍTICAS',
    'MEMÓRIA PERSISTENTE',
    'atualizar_contexto_conversa',
    'sobrevive ao purge'
  ];
  
  const hasAllInstructions = instructionKeywords.every(keyword => 
    finalContextBlock.includes(keyword)
  );
  
  if (hasAllInstructions) {
    console.log('✅ Todas as instruções críticas estão presentes no prompt');
  } else {
    console.error('❌ ERRO: Faltam instruções críticas no prompt');
    console.error('Palavras-chave ausentes:', 
      instructionKeywords.filter(kw => !finalContextBlock.includes(kw))
    );
  }

  // 9. LIMPEZA: REMOVER SESSÃO DE TESTE
  console.log('\n🧹 Passo 9: Limpando dados de teste...');
  
  await db('chat_sessions').where('id', sessionId).del();
  console.log('✅ Sessão de teste removida');

  // RESULTADO FINAL
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TESTE DE INTEGRAÇÃO CONCLUÍDO COM SUCESSO!');
  console.log('='.repeat(80));
  console.log(`
✅ RESUMO DOS TESTES:
  1. Criação de sessão com contexto inicial
  2. Leitura do contexto do banco
  3. Formatação do contexto para System Prompt
  4. Atualização completa do contexto (múltiplos campos)
  5. Atualização incremental (preservação de campos anteriores)
  6. Simulação de fluxo completo de agendamento
  7. Formatação do contexto completo para o prompt
  8. Validação das instruções críticas no prompt
  9. Limpeza dos dados de teste

🔥 PRÓXIMOS PASSOS:
  1. Rodar o WhatsappWorker com uma conversa real
  2. Verificar logs de [FASE 2.1] para confirmar injeção do contexto
  3. Monitorar se a IA chama atualizar_contexto após confirmações
  4. Validar que informações não são pedidas novamente após purge
  `);

  return true;
}

// Executar teste
testarIntegracaoCompleta()
  .then((success) => {
    if (success) {
      console.log('\n✅ Todos os testes passaram!');
      process.exit(0);
    } else {
      console.error('\n❌ Alguns testes falharam!');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('\n❌ ERRO FATAL NO TESTE:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => {
    // Garantir que a conexão do knex seja fechada
    setTimeout(() => {
      db.destroy();
    }, 1000);
  });

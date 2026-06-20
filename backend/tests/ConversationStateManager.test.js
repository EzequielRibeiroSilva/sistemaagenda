/**
 * Script de Teste - ConversationStateManager
 * 
 * TASK 2.1 - VALIDAÇÃO OBRIGATÓRIA (HARDENING SPRINT)
 * 
 * OBJETIVO:
 * Simular uma conversa longa (20+ mensagens) e verificar que o contexto estruturado
 * (unidade_id, agente_id, servicos_selecionados) sobrevive ao purge de mensagens antigas.
 * 
 * CENÁRIO DE TESTE:
 * 1. Criar sessão de chat
 * 2. Simular 25 mensagens (excede o limite de 12 do Smart Pruning)
 * 3. Atualizar contexto estruturado nas mensagens #1 (unidade) e #5 (agente)
 * 4. Carregar histórico (que sofrerá purge)
 * 5. Verificar se o contexto JSON ainda contém unidade_id e agente_id
 * 
 * CRITÉRIO DE SUCESSO:
 * ✅ Após purge de 25 mensagens para 12, o contexto_json ainda deve conter:
 *    - unidade_id definido na mensagem #1
 *    - agente_id definido na mensagem #5
 *    - servicos_selecionados definidos na mensagem #10
 */

require('dotenv').config();
const { db } = require('../src/config/knex');
const { getInstance } = require('../src/services/ConversationStateManager');

const stateManager = getInstance();

async function limparDadosTeste() {
  console.log('🧹 Limpando dados de teste anteriores...');
  
  try {
    // Deletar mensagens de teste
    await db('chat_messages')
      .whereIn('chat_session_id', function() {
        this.select('id')
          .from('chat_sessions')
          .where('cliente_telefone', 'like', 'TEST_%');
      })
      .del();

    // Deletar sessões de teste
    await db('chat_sessions')
      .where('cliente_telefone', 'like', 'TEST_%')
      .del();

    console.log('✅ Dados de teste limpos');
  } catch (error) {
    console.error('❌ Erro ao limpar dados de teste:', error.message);
  }
}

async function criarSessaoTeste() {
  console.log('\n📝 Criando sessão de teste...');
  
  const telefone = `TEST_${Date.now()}`;
  const unidadeId = 1; // Assumindo que existe uma unidade com ID 1
  
  const [sessionId] = await db('chat_sessions')
    .insert({
      usuario_id: 1,
      unidade_id: unidadeId,
      cliente_telefone: telefone,
      status: 'active',
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    })
    .returning('id');

  const id = typeof sessionId === 'object' ? sessionId.id : sessionId;
  
  console.log(`✅ Sessão criada: ID ${id} | Telefone: ${telefone}`);
  
  return { sessionId: id, telefone, unidadeId };
}

async function simularConversaLonga(sessionId) {
  console.log('\n💬 Simulando conversa longa (25 mensagens)...');
  
  const mensagens = [
    // Mensagens 1-5: Identificação
    { role: 'user', content: 'Olá!' },
    { role: 'assistant', content: 'Olá! Bem-vindo. Como posso ajudar?' },
    { role: 'user', content: 'Quero agendar um corte' },
    { role: 'assistant', content: 'Ótimo! Qual profissional você prefere?' },
    { role: 'user', content: 'Prefiro o João' },
    
    // Mensagens 6-10: Seleção de serviço
    { role: 'assistant', content: 'Perfeito! Quais serviços você deseja?' },
    { role: 'user', content: 'Corte e barba' },
    { role: 'assistant', content: 'Entendi. Corte + barba. Qual data você prefere?' },
    { role: 'user', content: 'Amanhã' },
    { role: 'assistant', content: 'Vou verificar disponibilidade para amanhã...' },
    
    // Mensagens 11-15: Escolha de horário
    { role: 'user', content: '14:00' },
    { role: 'assistant', content: 'Verificando horário 14:00...' },
    { role: 'user', content: 'Confirmo' },
    { role: 'assistant', content: 'Agendamento criado com sucesso!' },
    { role: 'user', content: 'Obrigado' },
    
    // Mensagens 16-20: Conversa adicional (filler)
    { role: 'assistant', content: 'De nada! Posso ajudar em mais alguma coisa?' },
    { role: 'user', content: 'Qual o endereço?' },
    { role: 'assistant', content: 'Estamos na Rua Exemplo, 123' },
    { role: 'user', content: 'Tem estacionamento?' },
    { role: 'assistant', content: 'Sim, temos estacionamento gratuito para clientes.' },
    
    // Mensagens 21-25: Mais filler para exceder limite
    { role: 'user', content: 'Perfeito' },
    { role: 'assistant', content: 'Mais alguma dúvida?' },
    { role: 'user', content: 'Não, obrigado' },
    { role: 'assistant', content: 'Até amanhã então!' },
    { role: 'user', content: 'Até!' }
  ];
  
  // Inserir todas as mensagens
  for (let i = 0; i < mensagens.length; i++) {
    await db('chat_messages').insert({
      chat_session_id: sessionId,
      role: mensagens[i].role,
      content: mensagens[i].content,
      created_at: new Date(Date.now() + i * 1000) // Espaçar 1 segundo entre cada
    });
  }
  
  console.log(`✅ ${mensagens.length} mensagens inseridas`);
  console.log(`⚠️  Histórico excede limite de 12 mensagens (Smart Pruning será aplicado)`);
}

async function atualizarContextoEstruturado(sessionId, unidadeId) {
  console.log('\n🔄 Atualizando contexto estruturado...');
  
  // Mensagem #1: Definir unidade_id
  console.log('   📍 Mensagem #1: Definindo unidade_id');
  await stateManager.updateState(sessionId, {
    unidade_id: unidadeId,
    status: 'iniciada',
    etapa_atual: 'identificacao'
  });
  
  // Mensagem #5: Definir agente_id
  console.log('   👤 Mensagem #5: Definindo agente_id');
  await stateManager.updateState(sessionId, {
    agente_id: 1, // João
    etapa_atual: 'selecao_servico'
  });
  
  // Mensagem #10: Definir serviços selecionados
  console.log('   ✂️  Mensagem #10: Definindo servicos_selecionados');
  await stateManager.updateState(sessionId, {
    servicos_selecionados: [
      { id: 1, nome: 'Corte' },
      { id: 2, nome: 'Barba' }
    ],
    etapa_atual: 'escolha_data'
  });
  
  // Mensagem #14: Definir agendamento_id
  console.log('   📅 Mensagem #14: Definindo agendamento_id');
  await stateManager.updateState(sessionId, {
    agendamento_id: 999,
    data_agendamento: '2026-06-19',
    hora_inicio: '14:00',
    status: 'concluida',
    etapa_atual: 'confirmacao'
  });
  
  console.log('✅ Contexto estruturado atualizado em 4 pontos da conversa');
}

async function carregarEValidarHistorico(sessionId) {
  console.log('\n🔍 Carregando histórico (com Smart Pruning)...');
  
  // Carregar mensagens (simulando loadHistory do Worker)
  const rows = await db('chat_messages')
    .where('chat_session_id', sessionId)
    .select('role', 'content', 'created_at')
    .orderBy('created_at', 'desc')
    .limit(30);
  
  const fullHistory = rows.reverse();
  const MAX_MESSAGES = 12;
  
  console.log(`   📊 Total de mensagens no banco: ${fullHistory.length}`);
  console.log(`   ✂️  Smart Pruning vai limitar para: ${MAX_MESSAGES} mensagens`);
  
  const prunedHistory = fullHistory.slice(-MAX_MESSAGES);
  
  console.log(`   ✅ Mensagens após purge: ${prunedHistory.length}`);
  console.log(`   🗑️  Mensagens descartadas: ${fullHistory.length - prunedHistory.length}`);
  
  // Exibir primeiras 3 mensagens do histórico purgado
  console.log('\n   📝 Primeiras 3 mensagens do histórico purgado:');
  prunedHistory.slice(0, 3).forEach((msg, idx) => {
    console.log(`      ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 50)}...`);
  });
}

async function validarContextoAposPurge(sessionId, unidadeId) {
  console.log('\n🎯 VALIDAÇÃO CRÍTICA: Contexto após purge de histórico');
  console.log('   ════════════════════════════════════════════════════');
  
  const estado = await stateManager.getState(sessionId);
  
  // Validação 1: unidade_id deve estar presente
  console.log(`\n   ✓ unidade_id: ${estado.unidade_id}`);
  if (estado.unidade_id === unidadeId) {
    console.log('     ✅ SUCESSO: unidade_id preservado (definido na mensagem #1)');
  } else {
    console.log(`     ❌ FALHA: unidade_id perdido! Esperado: ${unidadeId}, Recebido: ${estado.unidade_id}`);
    return false;
  }
  
  // Validação 2: agente_id deve estar presente
  console.log(`\n   ✓ agente_id: ${estado.agente_id}`);
  if (estado.agente_id === 1) {
    console.log('     ✅ SUCESSO: agente_id preservado (definido na mensagem #5)');
  } else {
    console.log(`     ❌ FALHA: agente_id perdido! Esperado: 1, Recebido: ${estado.agente_id}`);
    return false;
  }
  
  // Validação 3: servicos_selecionados deve estar presente
  console.log(`\n   ✓ servicos_selecionados: ${JSON.stringify(estado.servicos_selecionados)}`);
  if (Array.isArray(estado.servicos_selecionados) && estado.servicos_selecionados.length === 2) {
    console.log('     ✅ SUCESSO: servicos_selecionados preservado (definido na mensagem #10)');
  } else {
    console.log('     ❌ FALHA: servicos_selecionados perdido ou incompleto!');
    return false;
  }
  
  // Validação 4: agendamento_id deve estar presente
  console.log(`\n   ✓ agendamento_id: ${estado.agendamento_id}`);
  if (estado.agendamento_id === 999) {
    console.log('     ✅ SUCESSO: agendamento_id preservado (definido na mensagem #14)');
  } else {
    console.log(`     ❌ FALHA: agendamento_id perdido! Esperado: 999, Recebido: ${estado.agendamento_id}`);
    return false;
  }
  
  // Validação 5: Metadata deve estar presente
  console.log(`\n   ✓ status: ${estado.status}`);
  console.log(`   ✓ etapa_atual: ${estado.etapa_atual}`);
  console.log(`   ✓ ultima_atualizacao: ${estado.ultima_atualizacao}`);
  
  console.log('\n   ════════════════════════════════════════════════════');
  console.log('   🎉 TESTE PASSOU: Contexto estruturado sobreviveu ao purge!');
  console.log('   ════════════════════════════════════════════════════\n');
  
  return true;
}

async function executarTeste() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧪 TESTE DE VALIDAÇÃO - CONVERSATION STATE MANAGER (TASK 2.1)');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log('OBJETIVO: Verificar que o contexto JSON sobrevive ao purge de histórico\n');
  
  try {
    // 1. Limpar dados anteriores
    await limparDadosTeste();
    
    // 2. Criar sessão de teste
    const { sessionId, telefone, unidadeId } = await criarSessaoTeste();
    
    // 3. Simular conversa longa (25 mensagens)
    await simularConversaLonga(sessionId);
    
    // 4. Atualizar contexto estruturado em pontos-chave
    await atualizarContextoEstruturado(sessionId, unidadeId);
    
    // 5. Carregar histórico e aplicar Smart Pruning
    await carregarEValidarHistorico(sessionId);
    
    // 6. Validar que contexto JSON sobreviveu ao purge
    const sucesso = await validarContextoAposPurge(sessionId, unidadeId);
    
    if (sucesso) {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('✅ TESTE COMPLETO: ConversationStateManager está funcionando!');
      console.log('════════════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('❌ TESTE FALHOU: Contexto não foi preservado corretamente');
      console.log('════════════════════════════════════════════════════════════════\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error('\n📋 Stack trace:');
    console.error(error.stack);
    console.log('\n════════════════════════════════════════════════════════════════\n');
    process.exit(1);
  } finally {
    // Desconectar do banco
    await db.destroy();
  }
}

// Executar teste
executarTeste();

/**
 * Script de Teste: Verificar Agendamento #101
 * Objetivo: Diagnosticar por que a mensagem não foi enviada
 */

require('dotenv').config();
const { query } = require('./src/config/database');
const WhatsAppService = require('./src/services/WhatsAppService');

async function testAgendamento101() {
  console.log('\n================================================================================');
  console.log('🔍 DIAGNÓSTICO DO AGENDAMENTO #101');
  console.log('================================================================================\n');

  try {
    // 1. Buscar agendamento
    console.log('1️⃣ BUSCANDO AGENDAMENTO #101...');
    const agendamentoResult = await query('SELECT * FROM agendamentos WHERE id = $1', [101]);
    const agendamento = agendamentoResult.rows[0];

    if (!agendamento) {
      console.error('❌ Agendamento #101 não encontrado!');
      return;
    }

    console.log('✅ Agendamento encontrado:');
    console.log('   ID:', agendamento.id);
    console.log('   Cliente ID:', agendamento.cliente_id);
    console.log('   Agente ID:', agendamento.agente_id);
    console.log('   Unidade ID:', agendamento.unidade_id);
    console.log('   Data:', agendamento.data_agendamento);
    console.log('   Hora:', agendamento.hora_inicio);
    console.log('   Status:', agendamento.status);
    console.log('');

    // 2. Buscar cliente
    console.log('2️⃣ BUSCANDO DADOS DO CLIENTE #' + agendamento.cliente_id + '...');
    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [agendamento.cliente_id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) {
      console.error('❌ Cliente não encontrado!');
      return;
    }

    const nomeCliente = cliente.nome || `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();
    console.log('✅ Cliente encontrado:');
    console.log('   Nome:', nomeCliente);
    console.log('   Telefone:', cliente.telefone);
    console.log('   Email:', cliente.email || 'N/A');
    console.log('');

    // 3. Buscar agente
    console.log('3️⃣ BUSCANDO DADOS DO AGENTE #' + agendamento.agente_id + '...');
    const agenteResult = await query('SELECT * FROM agentes WHERE id = $1', [agendamento.agente_id]);
    const agente = agenteResult.rows[0];

    if (!agente) {
      console.error('❌ Agente não encontrado!');
      return;
    }

    const nomeAgente = `${agente.nome} ${agente.sobrenome || ''}`.trim();
    console.log('✅ Agente encontrado:');
    console.log('   Nome:', nomeAgente);
    console.log('   Telefone:', agente.telefone || 'NÃO CADASTRADO ⚠️');
    console.log('   Email:', agente.email || 'N/A');
    console.log('');

    // 4. Buscar unidade
    console.log('4️⃣ BUSCANDO DADOS DA UNIDADE #' + agendamento.unidade_id + '...');
    const unidadeResult = await query('SELECT * FROM unidades WHERE id = $1', [agendamento.unidade_id]);
    const unidade = unidadeResult.rows[0];

    if (!unidade) {
      console.error('❌ Unidade não encontrada!');
      return;
    }

    console.log('✅ Unidade encontrada:');
    console.log('   Nome:', unidade.nome);
    console.log('   Telefone:', unidade.telefone || 'NÃO CADASTRADO ⚠️');
    console.log('   Endereço:', unidade.endereco || 'N/A');
    console.log('');

    // 5. Buscar serviços
    console.log('5️⃣ BUSCANDO SERVIÇOS DO AGENDAMENTO...');
    const servicosResult = await query(`
      SELECT s.nome, s.preco
      FROM agendamento_servicos ags
      JOIN servicos s ON ags.servico_id = s.id
      WHERE ags.agendamento_id = $1
    `, [101]);
    const servicos = servicosResult.rows;

    if (servicos.length === 0) {
      console.warn('⚠️  Nenhum serviço encontrado!');
    } else {
      console.log(`✅ ${servicos.length} serviço(s) encontrado(s):`);
      servicos.forEach(s => {
        console.log(`   - ${s.nome} (R$ ${s.preco})`);
      });
    }
    console.log('');

    // 6. Verificar dados necessários para envio
    console.log('6️⃣ VERIFICANDO DADOS NECESSÁRIOS PARA ENVIO:');
    const checks = {
      'Cliente Telefone': !!cliente.telefone,
      'Agente Telefone': !!agente.telefone,
      'Unidade Telefone': !!unidade.telefone,
      'Serviços': servicos.length > 0
    };

    let allOk = true;
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}`);
      if (!value) allOk = false;
    });
    console.log('');

    if (!allOk) {
      console.error('❌ DADOS INCOMPLETOS! Não é possível enviar mensagem.');
      console.log('');
      console.log('📋 AÇÕES NECESSÁRIAS:');
      if (!cliente.telefone) console.log('   - Adicionar telefone ao cliente #' + cliente.id);
      if (!agente.telefone) console.log('   - Adicionar telefone ao agente #' + agente.id);
      if (!unidade.telefone) console.log('   - Adicionar telefone à unidade #' + unidade.id);
      if (servicos.length === 0) console.log('   - Adicionar serviços ao agendamento #101');
      console.log('');
      return;
    }

    // 7. Montar dados completos
    console.log('7️⃣ MONTANDO DADOS COMPLETOS...');
    const dadosCompletos = {
      cliente: {
        nome: nomeCliente
      },
      cliente_telefone: cliente.telefone,
      agente: {
        nome: nomeAgente
      },
      agente_telefone: agente.telefone,
      unidade: {
        nome: unidade.nome
      },
      unidade_telefone: unidade.telefone,
      agendamento_id: agendamento.id,
      data_agendamento: agendamento.data_agendamento,
      hora_inicio: agendamento.hora_inicio,
      hora_fim: agendamento.hora_fim,
      valor_total: agendamento.valor_total,
      servicos: servicos.map(s => ({
        nome: s.nome,
        preco: s.preco
      }))
    };

    console.log('✅ Dados completos montados!');
    console.log('');

    // 8. Testar geração de mensagem
    console.log('8️⃣ TESTANDO GERAÇÃO DE MENSAGEM...');
    const whatsappService = new WhatsAppService();
    
    try {
      const mensagemCliente = whatsappService.generateAppointmentConfirmationClient(dadosCompletos);
      console.log('✅ Mensagem para cliente gerada com sucesso!');
      console.log('');
      console.log('📄 PREVIEW DA MENSAGEM (CLIENTE):');
      console.log('─'.repeat(80));
      console.log(mensagemCliente);
      console.log('─'.repeat(80));
      console.log('');

      const mensagemAgente = whatsappService.generateAppointmentConfirmationAgent(dadosCompletos);
      console.log('✅ Mensagem para agente gerada com sucesso!');
      console.log('');
      console.log('📄 PREVIEW DA MENSAGEM (AGENTE):');
      console.log('─'.repeat(80));
      console.log(mensagemAgente);
      console.log('─'.repeat(80));
      console.log('');
    } catch (error) {
      console.error('❌ Erro ao gerar mensagem:', error.message);
      console.error('Stack:', error.stack);
      return;
    }

    // 9. Verificar se WhatsApp está habilitado
    console.log('9️⃣ VERIFICANDO CONFIGURAÇÃO WHATSAPP...');
    console.log('   Serviço habilitado:', whatsappService.isEnabled());
    console.log('   Modo de teste:', whatsappService.testMode);
    console.log('   URL da API:', whatsappService.evolutionApiUrl);
    console.log('   Instance:', whatsappService.instanceName);
    console.log('');

    if (!whatsappService.isEnabled()) {
      console.error('❌ SERVIÇO WHATSAPP DESABILITADO!');
      console.log('   Configure as variáveis de ambiente no .env');
      return;
    }

    // 10. Simular envio
    console.log('🔟 SIMULANDO ENVIO...');
    console.log('   ⚠️  Este é apenas um teste. Para enviar de verdade, use o endpoint da API.');
    console.log('');
    console.log('   📤 Endpoint sugerido:');
    console.log('   POST /api/agendamentos/101/resend-whatsapp');
    console.log('');

  } catch (error) {
    console.error('❌ ERRO NO DIAGNÓSTICO:', error.message);
    console.error('Stack:', error.stack);
  }

  console.log('================================================================================');
  console.log('✅ DIAGNÓSTICO CONCLUÍDO');
  console.log('================================================================================\n');
}

// Executar teste
testAgendamento101()
  .then(() => {
    console.log('✅ Teste finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });

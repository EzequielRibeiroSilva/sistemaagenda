#!/usr/bin/env node

/**
 * Script de teste para verificar a acessibilidade da Evolution API
 * Executa: node checkEvolutionStatus.js
 */

const axios = require('axios');
require('dotenv').config();

async function checkEvolutionApiStatus() {
  console.log('🔍 Iniciando teste de acessibilidade da Evolution API...\n');
  
  const baseUrl = process.env.EVO_API_BASE_URL;
  const instanceId = process.env.EVO_API_INSTANCE_ID;
  const apiKey = process.env.EVO_API_KEY;
  
  // Verificar se as variáveis estão configuradas
  if (!baseUrl || !instanceId) {
    console.log('❌ CONFIGURAÇÃO INCOMPLETA');
    console.log('🚨 Verifique se as seguintes variáveis estão definidas no .env:');
    console.log('   - EVO_API_BASE_URL');
    console.log('   - EVO_API_INSTANCE_ID');
    console.log('   - EVO_API_KEY (opcional para este teste)\n');
    process.exit(1);
  }
  
  console.log('📋 Configurações utilizadas:');
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Instance ID: ${instanceId}`);
  console.log(`   API Key: ${apiKey ? '***configurada***' : 'não configurada'}\n`);
  
  try {
    // Lista de endpoints para testar
    const endpointsToTest = [
      `/instance/status/${instanceId}`,
      `/instance/${instanceId}/status`,
      `/instance/${instanceId}`,
      `/instances`,
      `/health`,
      `/status`,
      '/'
    ];

    let successfulResponse = null;
    let lastError = null;

    // Configurar headers se API key estiver disponível
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Painel-Agendamento-Backend/1.0'
    };

    if (apiKey && apiKey !== 'SUA_API_KEY_AQUI') {
      headers['apikey'] = apiKey; // Evolution API geralmente usa 'apikey' header
    }

    // Testar diferentes endpoints
    for (const endpoint of endpointsToTest) {
      const testUrl = `${baseUrl.replace(/\/$/, '')}${endpoint}`;
      console.log(`🌐 Testando endpoint: ${testUrl}`);

      try {
        const response = await axios.get(testUrl, {
          headers,
          timeout: 10000, // 10 segundos de timeout
          validateStatus: function (status) {
            // Aceitar códigos de status 200-299 e alguns códigos específicos
            return (status >= 200 && status < 300) || status === 401 || status === 403;
          }
        });

        console.log(`📡 Status HTTP: ${response.status}`);

        if (response.status === 200) {
          successfulResponse = response;
          console.log('✅ Endpoint respondeu com sucesso!');
          break;
        } else if (response.status === 401 || response.status === 403) {
          successfulResponse = response;
          console.log('⚠️  Endpoint acessível, mas requer autenticação');
          break;
        }

      } catch (error) {
        lastError = error;
        if (error.response && error.response.status === 404) {
          console.log('❌ 404 - Endpoint não encontrado');
        } else {
          console.log(`❌ Erro: ${error.message}`);
        }
        continue;
      }
    }

    if (!successfulResponse) {
      throw lastError || new Error('Nenhum endpoint respondeu com sucesso');
    }

    const response = successfulResponse;
    
    console.log(`📡 Status HTTP: ${response.status}`);
    console.log(`📄 Response Headers:`, response.headers['content-type'] || 'N/A');
    
    if (response.status === 200) {
      console.log('📊 Dados da resposta:', JSON.stringify(response.data, null, 2));
      console.log('\n✅ TESTE DE ACESSIBILIDADE EVOLUTION API: SUCESSO');
      console.log('🎉 A Evolution API está acessível e respondendo!\n');
      
      // Verificar se a instância está conectada
      if (response.data && response.data.instance) {
        const instanceStatus = response.data.instance.state || response.data.state || 'unknown';
        console.log(`📱 Status da instância: ${instanceStatus}`);
        
        if (instanceStatus.toLowerCase().includes('open') || 
            instanceStatus.toLowerCase().includes('connected') ||
            instanceStatus.toLowerCase().includes('ready')) {
          console.log('✅ Instância WhatsApp está conectada e pronta!');
        } else {
          console.log('⚠️  Instância pode não estar totalmente conectada');
        }
      }
      
    } else if (response.status === 401) {
      console.log('\n⚠️  TESTE DE ACESSIBILIDADE EVOLUTION API: PARCIAL');
      console.log('🔐 API acessível, mas requer autenticação (API Key)');
      console.log('💡 Configure a EVO_API_KEY no arquivo .env para acesso completo\n');
      
    } else if (response.status === 403) {
      console.log('\n⚠️  TESTE DE ACESSIBILIDADE EVOLUTION API: PARCIAL');
      console.log('🚫 API acessível, mas acesso negado (verifique permissões)');
      console.log('💡 Verifique se a API Key está correta no arquivo .env\n');
      
    } else {
      console.log(`\n⚠️  Status inesperado: ${response.status}`);
      console.log('📄 Resposta:', response.data);
    }
    
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.log('\n❌ TESTE DE ACESSIBILIDADE EVOLUTION API: FALHOU');
      console.log('🌐 Erro de DNS - URL não encontrada');
      console.log('💡 Verifique se a EVO_API_BASE_URL está correta\n');
      
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n❌ TESTE DE ACESSIBILIDADE EVOLUTION API: FALHOU');
      console.log('🔌 Conexão recusada - serviço pode estar offline');
      console.log('💡 Verifique se a Evolution API está rodando\n');
      
    } else if (error.code === 'ETIMEDOUT') {
      console.log('\n❌ TESTE DE ACESSIBILIDADE EVOLUTION API: FALHOU');
      console.log('⏱️  Timeout - serviço demorou para responder');
      console.log('💡 Tente novamente ou verifique a conectividade\n');
      
    } else if (error.response) {
      console.log(`\n❌ ERRO HTTP ${error.response.status}: ${error.response.statusText}`);
      console.log('📄 Resposta do servidor:', error.response.data);
      
    } else {
      console.log('\n💥 Erro inesperado:', error.message);
    }
    
    console.log('\n📝 Possíveis soluções:');
    console.log('   1. Verifique se a Evolution API está online');
    console.log('   2. Confirme a URL base no arquivo .env');
    console.log('   3. Verifique o ID da instância');
    console.log('   4. Teste a conectividade de rede');
    console.log('   5. Configure a API Key se necessário\n');
    
    process.exit(1);
  }
}

// Executar o teste
if (require.main === module) {
  checkEvolutionApiStatus();
}

module.exports = { checkEvolutionApiStatus };

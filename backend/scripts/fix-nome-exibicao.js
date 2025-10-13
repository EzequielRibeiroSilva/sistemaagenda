#!/usr/bin/env node

/**
 * Script para corrigir o campo nome_exibicao dos agentes
 * Executa: node scripts/fix-nome-exibicao.js
 */

const { db } = require('../src/config/knex');

async function fixNomeExibicao() {
  console.log('🔧 Iniciando correção do campo nome_exibicao...\n');
  
  try {
    // 1. Buscar todos os agentes com nome_exibicao vazio ou nulo
    const agentesComProblema = await db('agentes')
      .where(function() {
        this.whereNull('nome_exibicao')
            .orWhere('nome_exibicao', '')
            .orWhere('nome_exibicao', ' ');
      })
      .select('id', 'nome', 'sobrenome', 'nome_exibicao', 'email');

    console.log(`📊 Encontrados ${agentesComProblema.length} agentes com nome_exibicao problemático:`);
    
    if (agentesComProblema.length === 0) {
      console.log('✅ Nenhum agente com problema encontrado!');
      return;
    }

    // 2. Exibir agentes problemáticos
    agentesComProblema.forEach((agente, index) => {
      console.log(`  ${index + 1}. ID: ${agente.id} | Nome: "${agente.nome} ${agente.sobrenome || ''}" | Nome Exibição: "${agente.nome_exibicao}" | Email: ${agente.email}`);
    });

    console.log('\n🔧 Aplicando correções...\n');

    // 3. Corrigir cada agente
    let corrigidos = 0;
    
    for (const agente of agentesComProblema) {
      // Gerar nome_exibicao baseado no nome e sobrenome
      let nomeExibicao;
      
      if (agente.sobrenome && agente.sobrenome.trim()) {
        // Se tem sobrenome, usar "Nome Sobrenome - Especialista"
        nomeExibicao = `${agente.nome} ${agente.sobrenome.trim()} - Especialista`;
      } else {
        // Se não tem sobrenome, usar apenas "Nome - Especialista"
        nomeExibicao = `${agente.nome} - Especialista`;
      }

      // Atualizar no banco
      const resultado = await db('agentes')
        .where('id', agente.id)
        .update({
          nome_exibicao: nomeExibicao,
          updated_at: new Date()
        });

      if (resultado > 0) {
        console.log(`  ✅ Agente ID ${agente.id}: "${agente.nome}" → "${nomeExibicao}"`);
        corrigidos++;
      } else {
        console.log(`  ❌ Falha ao corrigir agente ID ${agente.id}`);
      }
    }

    console.log(`\n🎉 Correção concluída! ${corrigidos}/${agentesComProblema.length} agentes corrigidos.`);

    // 4. Verificar resultado final
    console.log('\n🔍 Verificando resultado final...');
    
    const agentesVerificacao = await db('agentes')
      .whereIn('id', agentesComProblema.map(a => a.id))
      .select('id', 'nome', 'sobrenome', 'nome_exibicao');

    agentesVerificacao.forEach((agente, index) => {
      console.log(`  ${index + 1}. ID: ${agente.id} | Nome: "${agente.nome} ${agente.sobrenome || ''}" | Nome Exibição: "${agente.nome_exibicao}"`);
    });

    console.log('\n✅ Script executado com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante a correção:', error.message);
    console.error(error.stack);
  } finally {
    await db.destroy();
  }
}

// Executar o script se for chamado diretamente
if (require.main === module) {
  fixNomeExibicao();
}

module.exports = { fixNomeExibicao };

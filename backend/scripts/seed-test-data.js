const bcrypt = require('bcryptjs');
const { db } = require('../src/config/knex');

/**
 * Script para popular dados de teste para o usuário ADMIN (testando@gmail.com)
 * Cria serviços e agentes necessários para testar o formulário de Unidades
 */

const ADMIN_USER_ID = 105; // testando@gmail.com
const ADMIN_EMAIL = 'testando@gmail.com';

async function seedTestData() {
  console.log('🌱 Iniciando seeding de dados de teste...');
  
  try {
    // Verificar se o usuário existe
    const user = await db('usuarios').where('id', ADMIN_USER_ID).first();
    if (!user) {
      throw new Error(`Usuário com ID ${ADMIN_USER_ID} não encontrado`);
    }
    
    console.log(`✅ Usuário encontrado: ${user.nome} (${user.email})`);

    // 1. CRIAR CATEGORIAS DE SERVIÇOS
    console.log('\n📂 Criando categorias de serviços...');
    
    const categorias = [
      { nome: 'Cabelo', usuario_id: ADMIN_USER_ID },
      { nome: 'Estética', usuario_id: ADMIN_USER_ID },
      { nome: 'Unhas', usuario_id: ADMIN_USER_ID }
    ];

    // Verificar se já existem categorias
    const existingCategorias = await db('categorias_servicos')
      .where('usuario_id', ADMIN_USER_ID);
    
    let categoriaIds = {};
    
    if (existingCategorias.length === 0) {
      for (const categoria of categorias) {
        const [insertedCategoria] = await db('categorias_servicos')
          .insert(categoria)
          .returning('*');
        categoriaIds[categoria.nome] = insertedCategoria.id;
        console.log(`  ✅ Categoria criada: ${categoria.nome} (ID: ${insertedCategoria.id})`);
      }
    } else {
      existingCategorias.forEach(cat => {
        categoriaIds[cat.nome] = cat.id;
      });
      console.log(`  ℹ️  Categorias já existem (${existingCategorias.length})`);
    }

    // 2. CRIAR SERVIÇOS
    console.log('\n💇 Criando serviços...');
    
    const servicos = [
      {
        nome: 'CORTE',
        descricao: 'Corte de cabelo masculino e feminino',
        duracao_minutos: 45,
        preco: 35.00,
        valor_custo: 10.00,
        comissao_percentual: 70.00,
        categoria_id: categoriaIds['Cabelo'],
        usuario_id: ADMIN_USER_ID,
        status: 'Ativo'
      },
      {
        nome: 'DEPILAÇÃO',
        descricao: 'Depilação com cera quente',
        duracao_minutos: 60,
        preco: 50.00,
        valor_custo: 15.00,
        comissao_percentual: 65.00,
        categoria_id: categoriaIds['Estética'],
        usuario_id: ADMIN_USER_ID,
        status: 'Ativo'
      },
      {
        nome: 'MANICURE',
        descricao: 'Manicure completa com esmaltação',
        duracao_minutos: 90,
        preco: 25.00,
        valor_custo: 8.00,
        comissao_percentual: 75.00,
        categoria_id: categoriaIds['Unhas'],
        usuario_id: ADMIN_USER_ID,
        status: 'Ativo'
      }
    ];

    // Verificar se já existem serviços
    const existingServicos = await db('servicos')
      .where('usuario_id', ADMIN_USER_ID);
    
    let servicoIds = [];
    
    if (existingServicos.length === 0) {
      for (const servico of servicos) {
        const [insertedServico] = await db('servicos')
          .insert(servico)
          .returning('*');
        servicoIds.push(insertedServico.id);
        console.log(`  ✅ Serviço criado: ${servico.nome} (ID: ${insertedServico.id}) - R$ ${servico.preco}`);
      }
    } else {
      servicoIds = existingServicos.map(s => s.id);
      console.log(`  ℹ️  Serviços já existem (${existingServicos.length})`);
    }

    // 3. CRIAR AGENTES
    console.log('\n👨‍💼 Criando agentes...');
    
    const agentes = [
      {
        nome: 'Luiz Miguel',
        sobrenome: 'Santos',
        email: 'luiz.miguel@salon.com',
        telefone: '85987654321',
        nome_exibicao: 'Luiz Miguel',
        biografia: 'Especialista em cortes masculinos com 8 anos de experiência',
        senha_hash: await bcrypt.hash('123456', 10),
        usuario_id: ADMIN_USER_ID,
        status: 'Ativo',
        agenda_personalizada: false,
        data_admissao: new Date('2023-01-15'),
        comissao_percentual: 70.00
      },
      {
        nome: 'Tiago Lima',
        sobrenome: 'Oliveira',
        email: 'tiago.lima@salon.com',
        telefone: '85987654322',
        nome_exibicao: 'Tiago Lima',
        biografia: 'Expert em depilação e tratamentos estéticos',
        senha_hash: await bcrypt.hash('123456', 10),
        usuario_id: ADMIN_USER_ID,
        status: 'Ativo',
        agenda_personalizada: false,
        data_admissao: new Date('2023-03-20'),
        comissao_percentual: 65.00
      }
    ];

    // Verificar se já existem agentes
    const existingAgentes = await db('agentes')
      .where('usuario_id', ADMIN_USER_ID);
    
    let agenteIds = [];
    
    if (existingAgentes.length === 0) {
      for (const agente of agentes) {
        const [insertedAgente] = await db('agentes')
          .insert(agente)
          .returning('*');
        agenteIds.push(insertedAgente.id);
        console.log(`  ✅ Agente criado: ${agente.nome} ${agente.sobrenome} (ID: ${insertedAgente.id})`);
      }
    } else {
      agenteIds = existingAgentes.map(a => a.id);
      console.log(`  ℹ️  Agentes já existem (${existingAgentes.length})`);
    }

    // 4. ASSOCIAR AGENTES COM SERVIÇOS (Tabela Pivô)
    console.log('\n🔗 Associando agentes com serviços...');
    
    // Verificar se já existem associações
    const existingAssociacoes = await db('agente_servicos')
      .whereIn('agente_id', agenteIds);
    
    if (existingAssociacoes.length === 0) {
      // Luiz Miguel -> CORTE e MANICURE
      const luizId = agenteIds[0];
      const corteId = servicoIds[0];
      const manicureId = servicoIds[2];
      
      await db('agente_servicos').insert([
        { agente_id: luizId, servico_id: corteId },
        { agente_id: luizId, servico_id: manicureId }
      ]);
      
      // Tiago Lima -> DEPILAÇÃO e MANICURE
      const tiagoId = agenteIds[1];
      const depilacaoId = servicoIds[1];
      
      await db('agente_servicos').insert([
        { agente_id: tiagoId, servico_id: depilacaoId },
        { agente_id: tiagoId, servico_id: manicureId }
      ]);
      
      console.log('  ✅ Luiz Miguel associado com: CORTE, MANICURE');
      console.log('  ✅ Tiago Lima associado com: DEPILAÇÃO, MANICURE');
    } else {
      console.log(`  ℹ️  Associações já existem (${existingAssociacoes.length})`);
    }

    console.log('\n🎉 Seeding concluído com sucesso!');
    console.log('\n📊 Resumo dos dados criados:');
    console.log(`  - Categorias: ${Object.keys(categoriaIds).length}`);
    console.log(`  - Serviços: ${servicoIds.length}`);
    console.log(`  - Agentes: ${agenteIds.length}`);
    console.log(`  - Usuário: ${user.nome} (${user.email})`);
    
  } catch (error) {
    console.error('❌ Erro durante o seeding:', error.message);
    console.error(error.stack);
  } finally {
    await db.destroy();
  }
}

// Executar o seeding se o script for chamado diretamente
if (require.main === module) {
  seedTestData();
}

module.exports = { seedTestData };

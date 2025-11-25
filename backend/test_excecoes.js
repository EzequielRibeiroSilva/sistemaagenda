// Script de teste para verificar criação de exceções
const { db } = require('./src/config/knex');
const ExcecaoCalendario = require('./src/models/ExcecaoCalendario');

async function testarExcecoes() {
  try {
    console.log('🧪 Iniciando teste de exceções de calendário...\n');

    // 1. Verificar se a tabela existe
    console.log('1️⃣ Verificando se a tabela existe...');
    const tableExists = await db.schema.hasTable('unidade_excecoes_calendario');
    console.log(`   Tabela existe: ${tableExists ? '✅ SIM' : '❌ NÃO'}\n`);

    if (!tableExists) {
      console.error('❌ ERRO: Tabela não existe!');
      process.exit(1);
    }

    // 2. Buscar uma unidade existente
    console.log('2️⃣ Buscando unidade existente...');
    const unidade = await db('unidades').first();
    
    if (!unidade) {
      console.error('❌ ERRO: Nenhuma unidade encontrada!');
      process.exit(1);
    }
    
    console.log(`   Unidade encontrada: ID ${unidade.id} - ${unidade.nome}\n`);

    // 3. Tentar criar uma exceção
    console.log('3️⃣ Criando exceção de teste...');
    const excecaoData = {
      unidade_id: unidade.id,
      data_inicio: '2025-12-25',
      data_fim: '2025-12-25',
      tipo: 'Feriado',
      descricao: 'Natal - Teste'
    };

    console.log('   Dados da exceção:', JSON.stringify(excecaoData, null, 2));

    const excecaoCriada = await ExcecaoCalendario.create(excecaoData);
    console.log('   ✅ Exceção criada com sucesso!');
    console.log('   ID:', excecaoCriada.id);
    console.log('   Dados:', JSON.stringify(excecaoCriada, null, 2), '\n');

    // 4. Buscar exceções da unidade
    console.log('4️⃣ Buscando exceções da unidade...');
    const excecoes = await ExcecaoCalendario.findByUnidade(unidade.id);
    console.log(`   Total de exceções: ${excecoes.length}`);
    console.log('   Exceções:', JSON.stringify(excecoes, null, 2), '\n');

    // 5. Limpar teste
    console.log('5️⃣ Limpando dados de teste...');
    await ExcecaoCalendario.delete(excecaoCriada.id);
    console.log('   ✅ Exceção de teste removida\n');

    console.log('✅ TODOS OS TESTES PASSARAM!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testarExcecoes();

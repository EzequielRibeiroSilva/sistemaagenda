const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  console.log('🔐 Criando usuários master/admin...');

  try {
    // Hash das senhas fornecidas
    const senha1Hash = await bcrypt.hash('fGLoDvMptFquielMk', 10);
    const senha2Hash = await bcrypt.hash('zWQuielTgIazwwO', 10);

    // Verificar se os usuários já existem
    const usuario1Existe = await knex('usuarios').where('email', 'admineumaster@gmail.com').first();
    const usuario2Existe = await knex('usuarios').where('email', 'masteragendamentosadeu@gmail.com').first();

    const usuariosParaInserir = [];

    // Usuário 1 - Admin/Dono do Sistema
    if (!usuario1Existe) {
      usuariosParaInserir.push({
        id: 100, // ID alto para não conflitar com seeds de teste
        nome: 'Admin Master',
        email: 'admineumaster@gmail.com',
        senha_hash: senha1Hash,
        tipo_usuario: 'admin',
        plano: 'Multi',
        limite_unidades: 999,
        status: 'Ativo',
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log('✅ Usuário admineumaster@gmail.com será criado');
    } else {
      console.log('⚠️  Usuário admineumaster@gmail.com já existe');
    }

    // Usuário 2 - Admin/Dono do Sistema
    if (!usuario2Existe) {
      usuariosParaInserir.push({
        id: 101, // ID alto para não conflitar com seeds de teste
        nome: 'Master Agendamentos',
        email: 'masteragendamentosadeu@gmail.com',
        senha_hash: senha2Hash,
        tipo_usuario: 'admin',
        plano: 'Multi',
        limite_unidades: 999,
        status: 'Ativo',
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log('✅ Usuário masteragendamentosadeu@gmail.com será criado');
    } else {
      console.log('⚠️  Usuário masteragendamentosadeu@gmail.com já existe');
    }

    // Inserir usuários se houver algum para inserir
    if (usuariosParaInserir.length > 0) {
      await knex('usuarios').insert(usuariosParaInserir);
      console.log(`✅ ${usuariosParaInserir.length} usuário(s) master criado(s) com sucesso!`);
    } else {
      console.log('ℹ️  Nenhum usuário master precisou ser criado');
    }

    // Verificar se foram criados corretamente
    const totalUsuarios = await knex('usuarios').count('id as count').first();
    console.log(`📊 Total de usuários no sistema: ${totalUsuarios.count}`);

    console.log('');
    console.log('🔑 CREDENCIAIS DOS USUÁRIOS MASTER:');
    console.log('=====================================');
    console.log('👤 Usuário 1:');
    console.log('   Email: admineumaster@gmail.com');
    console.log('   Senha: fGLoDvMptFquielMk');
    console.log('   Tipo: admin');
    console.log('');
    console.log('👤 Usuário 2:');
    console.log('   Email: masteragendamentosadeu@gmail.com');
    console.log('   Senha: zWQuielTgIazwwO');
    console.log('   Tipo: admin');
    console.log('=====================================');
    console.log('');

  } catch (error) {
    console.error('❌ Erro ao criar usuários master:', error);
    throw error;
  }
};

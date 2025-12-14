const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  const env = process.env.NODE_ENV || 'development';
  const allowInitAdmin = process.env.ALLOW_INIT_ADMIN === 'true';
 
  if (!allowInitAdmin) {
    return;
  }
 
  if (env !== 'production' && env !== 'staging') {
    return;
  }
 
  console.log('🔐 Verificando/criando usuários iniciais (produção/staging)...');

  try {
    const adminEmail1 = process.env.ADMIN_INIT_EMAIL_1;
    const adminPassword1 = process.env.ADMIN_INIT_PASSWORD_1;
    const adminEmail2 = process.env.ADMIN_INIT_EMAIL_2;
    const adminPassword2 = process.env.ADMIN_INIT_PASSWORD_2;
 
    if (!adminEmail1 || !adminPassword1) {
      throw new Error('ADMIN_INIT_EMAIL_1 e ADMIN_INIT_PASSWORD_1 devem ser definidos para inicialização');
    }
 
    if (adminPassword1.length < 12) {
      throw new Error('ADMIN_INIT_PASSWORD_1 deve ter no mínimo 12 caracteres');
    }
 
    if (adminEmail2 && (!adminPassword2 || adminPassword2.length < 12)) {
      throw new Error('ADMIN_INIT_PASSWORD_2 deve ter no mínimo 12 caracteres quando ADMIN_INIT_EMAIL_2 estiver definido');
    }
 
    const senha1Hash = await bcrypt.hash(adminPassword1, 12);
    const senha2Hash = adminEmail2 ? await bcrypt.hash(adminPassword2, 12) : null;

    // Verificar se os usuários já existem
    const usuario1Existe = await knex('usuarios').where('email', adminEmail1).first();
    const usuario2Existe = adminEmail2 ? await knex('usuarios').where('email', adminEmail2).first() : null;

    const usuariosParaInserir = [];

    // Usuário 1 - Admin/Dono do Sistema
    if (!usuario1Existe) {
      usuariosParaInserir.push({
        id: 100, // ID alto para não conflitar com seeds de teste
        nome: 'Admin Master',
        email: adminEmail1,
        senha_hash: senha1Hash,
        tipo_usuario: 'admin',
        plano: 'Multi',
        limite_unidades: 999,
        status: 'Ativo',
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log(`✅ Usuário inicial será criado: ${adminEmail1}`);
    } else {
      console.log(`⚠️  Usuário inicial já existe: ${adminEmail1}`);
    }

    // Usuário 2 - Admin/Dono do Sistema
    if (adminEmail2 && !usuario2Existe) {
      usuariosParaInserir.push({
        id: 101, // ID alto para não conflitar com seeds de teste
        nome: 'Master Agendamentos',
        email: adminEmail2,
        senha_hash: senha2Hash,
        tipo_usuario: 'admin',
        plano: 'Multi',
        limite_unidades: 999,
        status: 'Ativo',
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log(`✅ Usuário inicial será criado: ${adminEmail2}`);
    } else if (adminEmail2 && usuario2Existe) {
      console.log(`⚠️  Usuário inicial já existe: ${adminEmail2}`);
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

    console.log('✅ Seed de usuários iniciais concluída (sem logar senhas).');

  } catch (error) {
    console.error('❌ Erro ao criar usuários master:', error);
    throw error;
  }
};

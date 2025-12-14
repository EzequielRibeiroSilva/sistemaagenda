const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  const env = process.env.NODE_ENV || 'development';
  const allowTestSeeds = process.env.ALLOW_TEST_SEEDS === 'true';
 
  if (env === 'production' || env === 'staging' || !allowTestSeeds) {
    return;
  }
 
  const testPassword = process.env.TEST_USERS_PASSWORD;
  if (!testPassword || testPassword.length < 8) {
    throw new Error('TEST_USERS_PASSWORD deve ser definido (min 8 chars) para rodar seeds de teste');
  }
 
  // Inserir usuários de teste (não deletar tabela inteira)
  const existing = await knex('usuarios')
    .whereIn('email', ['admin@teste.com', 'salao@teste.com', 'agente@teste.com'])
    .select('email');
 
  const existingEmails = new Set(existing.map(u => u.email));
 
  const rows = [];
 
  if (!existingEmails.has('admin@teste.com')) {
    rows.push({
      id: 1,
      nome: 'Administrador Teste',
      email: 'admin@teste.com',
      senha_hash: await bcrypt.hash(testPassword, 10),
      telefone: '(11) 99999-9999',
      tipo_usuario: 'admin',
      status: 'Ativo',
      plano: 'Multi',
      limite_unidades: 10,
      created_at: new Date(),
      updated_at: new Date()
    });
  }
 
  if (!existingEmails.has('salao@teste.com')) {
    rows.push({
      id: 2,
      nome: 'Salão Teste',
      email: 'salao@teste.com',
      senha_hash: await bcrypt.hash(testPassword, 10),
      telefone: '(11) 88888-8888',
      tipo_usuario: 'salon',
      status: 'Ativo',
      plano: 'Multi',
      limite_unidades: 5,
      created_at: new Date(),
      updated_at: new Date()
    });
  }
 
  if (!existingEmails.has('agente@teste.com')) {
    rows.push({
      id: 3,
      nome: 'Agente Teste',
      email: 'agente@teste.com',
      senha_hash: await bcrypt.hash(testPassword, 10),
      telefone: '(11) 77777-7777',
      tipo_usuario: 'agent',
      status: 'Ativo',
      plano: 'Single',
      limite_unidades: 1,
      created_at: new Date(),
      updated_at: new Date()
    });
  }
 
  if (rows.length > 0) {
    await knex('usuarios').insert(rows);
  }

  return;

  /*
  // legacy seed removed
  await knex('usuarios').insert([
    {
      id: 1,
      nome: 'Administrador Teste',
      email: 'admin@teste.com',
      senha_hash: await bcrypt.hash('123456', 10),
      telefone: '(11) 99999-9999',
      tipo_usuario: 'admin',
      status: 'Ativo',
      plano: 'Multi',
      limite_unidades: 10,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 2,
      nome: 'Salão Teste',
      email: 'salao@teste.com',
      senha_hash: await bcrypt.hash('123456', 10),
      telefone: '(11) 88888-8888',
      tipo_usuario: 'salon',
      status: 'Ativo',
      plano: 'Multi',
      limite_unidades: 5,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 3,
      nome: 'Agente Teste',
      email: 'agente@teste.com',
      senha_hash: await bcrypt.hash('123456', 10),
      telefone: '(11) 77777-7777',
      tipo_usuario: 'agent',
      status: 'Ativo',
      plano: 'Single',
      limite_unidades: 1,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  */
};

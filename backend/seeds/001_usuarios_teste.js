const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Limpar dados existentes
  await knex('usuarios').del();
  
  // Inserir usuários de teste
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
};

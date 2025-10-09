/**
 * Seed para migrar usuários existentes para o sistema RBAC
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  try {
    console.log('🔄 Iniciando migração de usuários para RBAC...');

    // 1. Migrar usuários master existentes
    const usuariosMaster = await knex('usuarios')
      .whereIn('email', ['admineumaster@gmail.com', 'masteragendamentosadeu@gmail.com'])
      .select('id', 'email', 'tipo_usuario');

    for (const usuario of usuariosMaster) {
      await knex('usuarios')
        .where('id', usuario.id)
        .update({
          role: 'MASTER',
          unidade_id: null, // MASTER não pertence a uma unidade específica
          updated_at: knex.fn.now()
        });
      
      console.log(`✅ Usuário ${usuario.email} migrado para role MASTER`);
    }

    // 2. Migrar usuários admin existentes (tipo_usuario = 'admin')
    const usuariosAdmin = await knex('usuarios')
      .where('tipo_usuario', 'admin')
      .whereNotIn('email', ['admineumaster@gmail.com', 'masteragendamentosadeu@gmail.com'])
      .select('id', 'email', 'nome');

    for (const usuario of usuariosAdmin) {
      await knex('usuarios')
        .where('id', usuario.id)
        .update({
          role: 'ADMIN',
          // unidade_id será definido quando o admin for associado a uma unidade
          updated_at: knex.fn.now()
        });
      
      console.log(`✅ Usuário ${usuario.email} migrado para role ADMIN`);
    }

    // 3. Migrar usuários salon existentes (tipo_usuario = 'salon')
    const usuariosSalon = await knex('usuarios')
      .where('tipo_usuario', 'salon')
      .select('id', 'email', 'nome');

    for (const usuario of usuariosSalon) {
      await knex('usuarios')
        .where('id', usuario.id)
        .update({
          role: 'ADMIN', // salon vira ADMIN no novo sistema
          updated_at: knex.fn.now()
        });
      
      console.log(`✅ Usuário ${usuario.email} migrado de salon para role ADMIN`);
    }

    // 4. Migrar usuários agent existentes (tipo_usuario = 'agent')
    const usuariosAgent = await knex('usuarios')
      .where('tipo_usuario', 'agent')
      .select('id', 'email', 'nome');

    for (const usuario of usuariosAgent) {
      await knex('usuarios')
        .where('id', usuario.id)
        .update({
          role: 'AGENTE',
          updated_at: knex.fn.now()
        });
      
      console.log(`✅ Usuário ${usuario.email} migrado para role AGENTE`);
    }

    // 5. Associar usuários ADMIN às suas unidades (se existirem)
    const unidades = await knex('unidades').select('id', 'usuario_id');
    
    for (const unidade of unidades) {
      if (unidade.usuario_id) {
        await knex('usuarios')
          .where('id', unidade.usuario_id)
          .update({
            unidade_id: unidade.id,
            updated_at: knex.fn.now()
          });
        
        console.log(`✅ Usuário ID ${unidade.usuario_id} associado à unidade ID ${unidade.id}`);
      }
    }

    // 6. Associar agentes às suas unidades através da tabela agentes
    const agentes = await knex('agentes').select('id', 'usuario_id');
    
    for (const agente of agentes) {
      if (agente.usuario_id) {
        // Buscar a unidade do agente através dos agendamentos ou definir uma lógica
        // Por enquanto, vamos deixar null e será definido manualmente
        console.log(`ℹ️ Agente ID ${agente.id} (usuário ${agente.usuario_id}) precisa ser associado manualmente a uma unidade`);
      }
    }

    console.log('✅ Migração RBAC concluída com sucesso!');
    
    // 7. Mostrar resumo
    const resumo = await knex('usuarios')
      .select('role')
      .count('* as total')
      .groupBy('role');
    
    console.log('\n📊 RESUMO DA MIGRAÇÃO:');
    for (const item of resumo) {
      console.log(`   ${item.role}: ${item.total} usuários`);
    }

  } catch (error) {
    console.error('❌ Erro na migração RBAC:', error);
    throw error;
  }
};

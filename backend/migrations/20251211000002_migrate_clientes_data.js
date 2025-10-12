/**
 * Migração para migrar dados existentes da tabela clientes
 * e limpar campos antigos após migração dos dados
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Migrar dados existentes do campo 'nome' para 'primeiro_nome' e 'ultimo_nome'
  const clientes = await knex('clientes').select('id', 'nome', 'telefone', 'assinante');
  
  for (const cliente of clientes) {
    if (cliente.nome) {
      const nomePartes = cliente.nome.trim().split(' ');
      const primeiroNome = nomePartes[0] || '';
      const ultimoNome = nomePartes.slice(1).join(' ') || '';
      
      // Limpar telefone (remover formatação)
      const telefoneLimpo = cliente.telefone ? cliente.telefone.replace(/\D/g, '') : '';
      
      await knex('clientes')
        .where('id', cliente.id)
        .update({
          primeiro_nome: primeiroNome,
          ultimo_nome: ultimoNome,
          telefone_limpo: telefoneLimpo,
          is_assinante: cliente.assinante || false,
          // Para clientes existentes sem unidade_id, vamos associar ao primeiro usuário admin
          unidade_id: knex.raw(`(
            SELECT u.id 
            FROM unidades u 
            INNER JOIN usuarios usr ON u.usuario_id = usr.id 
            WHERE usr.tipo_usuario = 'admin' 
            LIMIT 1
          )`)
        });
    }
  }
  
  // 2. Remover campos antigos que não são mais necessários
  return knex.schema.alterTable('clientes', function(table) {
    table.dropColumn('nome');
    table.dropColumn('assinante');
    table.dropColumn('usuario_id'); // Agora usamos unidade_id para Multi-Tenant
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Recriar campos antigos
  await knex.schema.alterTable('clientes', function(table) {
    table.string('nome', 255);
    table.boolean('assinante').defaultTo(false);
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios').onDelete('CASCADE');
  });
  
  // Migrar dados de volta
  const clientes = await knex('clientes').select('id', 'primeiro_nome', 'ultimo_nome', 'is_assinante');
  
  for (const cliente of clientes) {
    const nomeCompleto = `${cliente.primeiro_nome || ''} ${cliente.ultimo_nome || ''}`.trim();
    
    await knex('clientes')
      .where('id', cliente.id)
      .update({
        nome: nomeCompleto,
        assinante: cliente.is_assinante || false
      });
  }
};

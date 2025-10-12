/**
 * Migração para atualizar tabela clientes com campos para Assinantes
 * Seguindo especificações técnicas do módulo de Clientes e Multi-Tenant
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('clientes', function(table) {
    // 1. CRÍTICO: Adicionar unidade_id para isolamento Multi-Tenant
    table.integer('unidade_id').unsigned().references('id').inTable('unidades').onDelete('CASCADE');
    
    // 2. Reestruturar campos de nome para primeiro_nome e ultimo_nome
    table.string('primeiro_nome', 255);
    table.string('ultimo_nome', 255);
    
    // 3. Renomear campo assinante para is_assinante (mais semântico)
    table.boolean('is_assinante').defaultTo(false);
    
    // 4. Adicionar campo status para controle de estado
    table.enu('status', ['Ativo', 'Bloqueado']).defaultTo('Ativo');
    
    // 5. Melhorar campo telefone para suportar formatação
    table.string('telefone_limpo', 20).comment('Telefone apenas com números para validação única');
    
    // 6. Índices para performance e validações Multi-Tenant
    table.index('unidade_id');
    table.index(['unidade_id', 'telefone_limpo'], 'idx_clientes_unidade_telefone');
    table.index(['unidade_id', 'is_assinante'], 'idx_clientes_unidade_assinante');
    table.index(['unidade_id', 'status'], 'idx_clientes_unidade_status');
    table.index(['primeiro_nome', 'ultimo_nome'], 'idx_clientes_nome_completo');
    
    // 7. Constraint única: telefone_limpo deve ser único por unidade_id
    table.unique(['unidade_id', 'telefone_limpo'], 'uk_clientes_unidade_telefone');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('clientes', function(table) {
    // Remover campos adicionados
    table.dropColumn('unidade_id');
    table.dropColumn('primeiro_nome');
    table.dropColumn('ultimo_nome');
    table.dropColumn('is_assinante');
    table.dropColumn('status');
    table.dropColumn('telefone_limpo');
    
    // Remover índices (serão removidos automaticamente com as colunas)
  });
};

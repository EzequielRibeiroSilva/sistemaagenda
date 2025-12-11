/**
 * Migration: Criar tabela audit_logs para sistema de auditoria
 * FASE 2.1 - Logs de Auditoria
 * 
 * Esta tabela armazena todos os logs de ações críticas realizadas no sistema
 * para fins de auditoria, compliance e segurança.
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('audit_logs', function(table) {
    // Chave primária
    table.increments('id').primary();
    
    // Identificação do usuário que executou a ação
    table.integer('usuario_id').unsigned().nullable();
    table.foreign('usuario_id').references('usuarios.id').onDelete('SET NULL');
    table.string('usuario_email', 255).nullable(); // Backup caso usuário seja deletado
    table.string('usuario_nome', 255).nullable(); // Backup caso usuário seja deletado
    table.string('usuario_role', 50).nullable(); // MASTER, ADMIN, AGENTE
    
    // Detalhes da ação
    table.string('action', 100).notNullable().index(); // Ex: CRIAR_AGENDAMENTO, DELETAR_CLIENTE
    table.string('resource_type', 50).nullable().index(); // Ex: agendamento, cliente, agente
    table.integer('resource_id').unsigned().nullable().index(); // ID do recurso afetado
    table.string('method', 10).nullable(); // GET, POST, PUT, DELETE, PATCH
    table.string('endpoint', 500).nullable(); // URL do endpoint
    
    // Informações da requisição
    table.string('ip_address', 45).nullable(); // IPv4 ou IPv6
    table.text('user_agent').nullable(); // Navegador/dispositivo
    table.integer('status_code').unsigned().nullable(); // 200, 201, 400, 403, 500, etc.
    
    // Dados da requisição e resposta (sanitizados)
    table.json('request_data').nullable(); // Dados enviados (sem senhas/tokens)
    table.json('response_data').nullable(); // Dados retornados (resumo)
    table.text('error_message').nullable(); // Mensagem de erro se houver
    
    // Metadados adicionais
    table.integer('unidade_id').unsigned().nullable().index(); // Unidade relacionada
    table.foreign('unidade_id').references('unidades.id').onDelete('SET NULL');
    table.integer('duration_ms').unsigned().nullable(); // Tempo de execução em ms
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable().index();
    
    // Índices compostos para queries comuns
    table.index(['usuario_id', 'created_at'], 'idx_audit_usuario_data');
    table.index(['action', 'created_at'], 'idx_audit_action_data');
    table.index(['resource_type', 'resource_id'], 'idx_audit_resource');
    table.index(['unidade_id', 'created_at'], 'idx_audit_unidade_data');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('audit_logs');
};

/**
 * Migration: Tabelas de Arquivo/Histórico
 * 
 * Esta migration cria tabelas de arquivo para dados antigos:
 * 1. agendamentos_arquivo - Agendamentos com mais de 1 ano
 * 2. audit_logs_arquivo - Logs de auditoria com mais de 6 meses
 * 3. lembretes_arquivo - Lembretes enviados com mais de 3 meses
 * 
 * BENEFÍCIOS:
 * - Mantém tabelas principais pequenas e rápidas
 * - Dados históricos disponíveis para consulta quando necessário
 * - Melhora performance de queries no dia-a-dia
 * - Facilita backup diferenciado (dados ativos vs arquivo)
 */

exports.up = async function(knex) {
  // ============================================
  // 1. TABELA DE ARQUIVO DE AGENDAMENTOS
  // ============================================
  await knex.schema.createTable('agendamentos_arquivo', (table) => {
    table.integer('id').primary();
    table.integer('cliente_id');
    table.integer('agente_id');
    table.integer('unidade_id').index();
    table.date('data_agendamento').index();
    table.time('hora_inicio');
    table.time('hora_fim');
    table.text('status');
    table.text('status_pagamento');
    table.string('metodo_pagamento', 50);
    table.decimal('valor_total', 10, 2);
    table.text('observacoes');
    table.timestamp('created_at');
    table.timestamp('updated_at');
    table.timestamp('archived_at').defaultTo(knex.fn.now());
    
    // Índices para consultas em arquivo
    table.index(['unidade_id', 'data_agendamento'], 'idx_arquivo_unidade_data');
    table.index('archived_at', 'idx_arquivo_archived_at');
  });

  // ============================================
  // 2. TABELA DE ARQUIVO DE AUDIT LOGS
  // ============================================
  await knex.schema.createTable('audit_logs_arquivo', (table) => {
    table.integer('id').primary();
    table.integer('usuario_id');
    table.integer('unidade_id').index();
    table.string('action', 100);
    table.string('resource_type', 100);
    table.integer('resource_id');
    table.jsonb('old_values');
    table.jsonb('new_values');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('created_at');
    table.timestamp('archived_at').defaultTo(knex.fn.now());
    
    // Índice BRIN para arquivo (muito eficiente para dados históricos)
    table.index('created_at', 'idx_audit_arquivo_created');
  });

  // ============================================
  // 3. TABELA DE ARQUIVO DE LEMBRETES
  // ============================================
  await knex.schema.createTable('lembretes_arquivo', (table) => {
    table.integer('id').primary();
    table.integer('agendamento_id');
    table.string('tipo_lembrete', 50);
    table.string('canal', 20);
    table.string('telefone', 20);
    table.text('mensagem');
    table.string('status', 20);
    table.text('erro_detalhes');
    table.timestamp('enviado_em');
    table.timestamp('created_at');
    table.timestamp('archived_at').defaultTo(knex.fn.now());
    
    table.index('created_at', 'idx_lembretes_arquivo_created');
  });

  // ============================================
  // 4. TABELA DE CONFIGURAÇÃO DE RETENÇÃO
  // ============================================
  await knex.schema.createTable('data_retention_config', (table) => {
    table.increments('id').primary();
    table.string('table_name', 100).notNullable().unique();
    table.integer('retention_days').notNullable().defaultTo(365);
    table.string('archive_table', 100);
    table.boolean('auto_archive').defaultTo(true);
    table.boolean('auto_delete_archive').defaultTo(false);
    table.integer('delete_archive_after_days');
    table.timestamp('last_archive_run');
    table.integer('last_archive_count').defaultTo(0);
    table.timestamps(true, true);
  });

  // Inserir configurações padrão
  await knex('data_retention_config').insert([
    {
      table_name: 'agendamentos',
      retention_days: 365,  // 1 ano
      archive_table: 'agendamentos_arquivo',
      auto_archive: true,
      auto_delete_archive: true,
      delete_archive_after_days: 2190  // 6 anos (requisitos fiscais)
    },
    {
      table_name: 'audit_logs',
      retention_days: 180,  // 6 meses
      archive_table: 'audit_logs_arquivo',
      auto_archive: true,
      auto_delete_archive: true,
      delete_archive_after_days: 1095  // 3 anos
    },
    {
      table_name: 'lembretes_enviados',
      retention_days: 90,   // 3 meses
      archive_table: 'lembretes_arquivo',
      auto_archive: true,
      auto_delete_archive: true,
      delete_archive_after_days: 365   // 1 ano
    }
  ]);

  console.log('✅ Tabelas de arquivo criadas com sucesso!');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('data_retention_config');
  await knex.schema.dropTableIfExists('lembretes_arquivo');
  await knex.schema.dropTableIfExists('audit_logs_arquivo');
  await knex.schema.dropTableIfExists('agendamentos_arquivo');
  
  console.log('✅ Tabelas de arquivo removidas!');
};


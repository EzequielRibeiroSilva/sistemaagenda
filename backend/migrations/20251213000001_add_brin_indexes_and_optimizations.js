/**
 * Migration: Índices BRIN e Otimizações de Performance
 * 
 * Esta migration adiciona:
 * 1. Índices BRIN para tabelas com colunas timestamp (muito mais compactos)
 * 2. Índices covering para queries frequentes (evita heap access)
 * 3. Configurações de autovacuum otimizadas para tabelas críticas
 * 
 * BRIN (Block Range Index) é ideal para:
 * - Colunas que crescem naturalmente (timestamps, IDs sequenciais)
 * - Tabelas grandes onde os dados são inseridos em ordem
 * - Economiza até 99% do espaço comparado a B-tree
 */

exports.up = async function(knex) {
  // ============================================
  // 1. ÍNDICES BRIN PARA TABELAS COM TIMESTAMP
  // ============================================
  
  // Agendamentos - tabela mais crítica
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_agendamentos_created_brin 
    ON agendamentos USING brin (created_at)
    WITH (pages_per_range = 32);
  `);
  
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_agendamentos_data_brin 
    ON agendamentos USING brin (data_agendamento)
    WITH (pages_per_range = 32);
  `);
  
  // Audit Logs - cresce muito rápido
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_brin 
    ON audit_logs USING brin (created_at)
    WITH (pages_per_range = 64);
  `);
  
  // Lembretes Enviados
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_lembretes_created_brin 
    ON lembretes_enviados USING brin (created_at)
    WITH (pages_per_range = 32);
  `);
  
  // Clientes
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_clientes_created_brin 
    ON clientes USING brin (created_at)
    WITH (pages_per_range = 32);
  `);
  
  // Pontos Histórico
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pontos_historico_created_brin 
    ON pontos_historico USING brin (created_at)
    WITH (pages_per_range = 32);
  `);
  
  // Cupons Uso
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_cupons_uso_usado_brin 
    ON cupons_uso USING brin (usado_em)
    WITH (pages_per_range = 32);
  `);

  // ============================================
  // 2. ÍNDICES COVERING PARA QUERIES FREQUENTES
  // ============================================

  // Configurações do sistema - query mais executada (10173 scans!)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_config_sistema_covering
    ON configuracoes_sistema (unidade_id)
    INCLUDE (
      tempo_limite_agendar_horas,
      tempo_limite_cancelar_horas,
      permitir_cancelamento,
      duracao_servico_minutos
    );
  `);

  // Agendamentos para dashboard (query frequente)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_agendamentos_dashboard_covering
    ON agendamentos (unidade_id, data_agendamento, status)
    INCLUDE (hora_inicio, hora_fim, cliente_id, agente_id, valor_total);
  `);

  // Clientes por unidade com dados básicos
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_clientes_unidade_covering
    ON clientes (unidade_id, telefone_limpo)
    INCLUDE (primeiro_nome, ultimo_nome, status, is_assinante);
  `);

  // ============================================
  // 3. CONFIGURAÇÕES DE AUTOVACUUM OTIMIZADAS
  // ============================================
  
  // Tabelas muito ativas precisam de vacuum mais frequente
  await knex.raw(`
    ALTER TABLE agendamentos SET (
      autovacuum_vacuum_scale_factor = 0.05,
      autovacuum_analyze_scale_factor = 0.02,
      autovacuum_vacuum_cost_delay = 10
    );
  `);
  
  await knex.raw(`
    ALTER TABLE audit_logs SET (
      autovacuum_vacuum_scale_factor = 0.1,
      autovacuum_analyze_scale_factor = 0.05
    );
  `);
  
  await knex.raw(`
    ALTER TABLE lembretes_enviados SET (
      autovacuum_vacuum_scale_factor = 0.1,
      autovacuum_analyze_scale_factor = 0.05
    );
  `);
  
  await knex.raw(`
    ALTER TABLE clientes SET (
      autovacuum_vacuum_scale_factor = 0.1,
      autovacuum_analyze_scale_factor = 0.05
    );
  `);

  // ============================================
  // 4. ATUALIZAR ESTATÍSTICAS
  // ============================================
  await knex.raw('ANALYZE agendamentos;');
  await knex.raw('ANALYZE clientes;');
  await knex.raw('ANALYZE audit_logs;');
  await knex.raw('ANALYZE configuracoes_sistema;');
  
  console.log('✅ Índices BRIN e otimizações criados com sucesso!');
};

exports.down = async function(knex) {
  // Remover índices BRIN
  await knex.raw('DROP INDEX IF EXISTS idx_agendamentos_created_brin;');
  await knex.raw('DROP INDEX IF EXISTS idx_agendamentos_data_brin;');
  await knex.raw('DROP INDEX IF EXISTS idx_audit_logs_created_brin;');
  await knex.raw('DROP INDEX IF EXISTS idx_lembretes_created_brin;');
  await knex.raw('DROP INDEX IF EXISTS idx_clientes_created_brin;');
  await knex.raw('DROP INDEX IF EXISTS idx_pontos_historico_created_brin;');
  await knex.raw('DROP INDEX IF EXISTS idx_cupons_uso_usado_brin;');
  
  // Remover índices covering
  await knex.raw('DROP INDEX IF EXISTS idx_config_sistema_covering;');
  await knex.raw('DROP INDEX IF EXISTS idx_agendamentos_dashboard_covering;');
  await knex.raw('DROP INDEX IF EXISTS idx_clientes_unidade_covering;');
  
  // Resetar configurações de autovacuum para default
  await knex.raw('ALTER TABLE agendamentos RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor, autovacuum_vacuum_cost_delay);');
  await knex.raw('ALTER TABLE audit_logs RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);');
  await knex.raw('ALTER TABLE lembretes_enviados RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);');
  await knex.raw('ALTER TABLE clientes RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);');
  
  console.log('✅ Índices BRIN e otimizações removidos!');
};


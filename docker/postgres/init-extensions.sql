-- ============================================
-- Inicialização do PostgreSQL para Produção
-- Extensões e Configurações Iniciais
-- ============================================

-- Extensão para índices GiST (usado na constraint EXCLUDE)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Extensão para monitoramento de queries
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Extensão para UUID (se necessário)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Extensão para funções de texto
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- Configurações de monitoramento
-- ============================================

-- View para queries lentas
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
    calls,
    round(total_exec_time::numeric, 2) as total_time_ms,
    round(mean_exec_time::numeric, 2) as mean_time_ms,
    round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) as percent_time,
    query
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Queries com média > 100ms
ORDER BY mean_exec_time DESC
LIMIT 50;

-- View para estatísticas de tabelas
CREATE OR REPLACE VIEW table_stats AS
SELECT 
    schemaname,
    relname as table_name,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;

-- View para índices não utilizados
CREATE OR REPLACE VIEW unused_indexes AS
SELECT 
    schemaname,
    relname as table_name,
    indexrelname as index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan as index_scans
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexrelname NOT LIKE '%pkey%'
AND indexrelname NOT LIKE '%unique%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- View para conexões ativas
CREATE OR REPLACE VIEW active_connections AS
SELECT 
    datname as database,
    usename as username,
    application_name,
    client_addr,
    state,
    query_start,
    NOW() - query_start as query_duration,
    LEFT(query, 100) as query_preview
FROM pg_stat_activity
WHERE state != 'idle'
AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;

-- View para locks bloqueantes
CREATE OR REPLACE VIEW blocking_locks AS
SELECT 
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_query,
    blocking_activity.query AS blocking_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- ============================================
-- Função para health check
-- ============================================
CREATE OR REPLACE FUNCTION db_health_check()
RETURNS TABLE (
    metric text,
    value text,
    status text
) AS $$
BEGIN
    -- Conexões
    RETURN QUERY
    SELECT 
        'connections'::text,
        (SELECT count(*)::text FROM pg_stat_activity),
        CASE 
            WHEN (SELECT count(*) FROM pg_stat_activity) > 80 THEN 'warning'
            ELSE 'ok'
        END;
    
    -- Dead tuples
    RETURN QUERY
    SELECT 
        'dead_tuples'::text,
        (SELECT sum(n_dead_tup)::text FROM pg_stat_user_tables),
        CASE 
            WHEN (SELECT sum(n_dead_tup) FROM pg_stat_user_tables) > 10000 THEN 'warning'
            ELSE 'ok'
        END;
    
    -- Database size
    RETURN QUERY
    SELECT 
        'database_size'::text,
        pg_size_pretty(pg_database_size(current_database())),
        'ok'::text;
    
    -- Uptime
    RETURN QUERY
    SELECT 
        'uptime'::text,
        (NOW() - pg_postmaster_start_time())::text,
        'ok'::text;
END;
$$ LANGUAGE plpgsql;

-- Permissões
GRANT SELECT ON slow_queries TO PUBLIC;
GRANT SELECT ON table_stats TO PUBLIC;
GRANT SELECT ON unused_indexes TO PUBLIC;
GRANT SELECT ON active_connections TO PUBLIC;
GRANT SELECT ON blocking_locks TO PUBLIC;
GRANT EXECUTE ON FUNCTION db_health_check() TO PUBLIC;

-- Mensagem de conclusão
DO $$
BEGIN
    RAISE NOTICE '✅ Extensões e views de monitoramento criadas com sucesso!';
END $$;


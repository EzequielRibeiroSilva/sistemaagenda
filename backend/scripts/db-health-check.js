#!/usr/bin/env node

/**
 * Health Check do Banco de Dados
 * 
 * Este script verifica a saúde do banco:
 * - Conexões ativas
 * - Queries lentas
 * - Dead tuples (necessidade de VACUUM)
 * - Índices não utilizados
 * - Tamanho das tabelas
 * - Locks bloqueantes
 * 
 * USO:
 *   node scripts/db-health-check.js
 * 
 * RETORNO:
 *   Exit code 0 = Saudável
 *   Exit code 1 = Atenção necessária
 *   Exit code 2 = Crítico
 */

require('dotenv').config();
const { db: knex } = require('../src/config/knex');

const THRESHOLDS = {
  maxConnections: 80,           // % de max_connections
  maxDeadTuples: 10000,         // Total de dead tuples
  maxDeadTuplesPct: 20,         // % de dead tuples por tabela
  slowQueryThresholdMs: 5000,   // Queries > 5s
  maxBlockingLocks: 0,          // Locks bloqueantes
  maxIndexScanZero: 10,         // Índices sem uso
};

let exitCode = 0;

async function runHealthCheck() {
  console.log('🏥 Health Check do Banco de Dados');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log('='.repeat(50));
  
  try {
    // 1. Verificar conexões
    await checkConnections();
    
    // 2. Verificar dead tuples
    await checkDeadTuples();
    
    // 3. Verificar queries lentas (se pg_stat_statements estiver ativo)
    await checkSlowQueries();
    
    // 4. Verificar índices não utilizados
    await checkUnusedIndexes();
    
    // 5. Verificar locks bloqueantes
    await checkBlockingLocks();
    
    // 6. Verificar tamanho do banco
    await checkDatabaseSize();
    
    // 7. Verificar configurações críticas
    await checkConfiguration();
    
    // Resumo final
    console.log('\n' + '='.repeat(50));
    if (exitCode === 0) {
      console.log('✅ RESULTADO: Banco de dados SAUDÁVEL');
    } else if (exitCode === 1) {
      console.log('⚠️ RESULTADO: ATENÇÃO necessária');
    } else {
      console.log('🔴 RESULTADO: Estado CRÍTICO');
    }
    
  } catch (error) {
    console.error('❌ Erro no health check:', error.message);
    exitCode = 2;
  } finally {
    await knex.destroy();
    process.exit(exitCode);
  }
}

async function checkConnections() {
  console.log('\n📊 1. Conexões');
  
  const result = await knex.raw(`
    SELECT 
      (SELECT count(*) FROM pg_stat_activity) as active,
      (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max
  `);
  
  const { active, max } = result.rows[0];
  const pct = Math.round(100 * active / max);
  
  console.log(`   Ativas: ${active}/${max} (${pct}%)`);
  
  if (pct > THRESHOLDS.maxConnections) {
    console.log(`   ⚠️ ALERTA: Conexões acima de ${THRESHOLDS.maxConnections}%`);
    exitCode = Math.max(exitCode, 1);
  } else {
    console.log('   ✅ OK');
  }
}

async function checkDeadTuples() {
  console.log('\n🧹 2. Dead Tuples (necessidade de VACUUM)');
  
  const result = await knex.raw(`
    SELECT 
      relname,
      n_live_tup,
      n_dead_tup,
      CASE WHEN n_live_tup > 0 
        THEN round(100.0 * n_dead_tup / n_live_tup, 1) 
        ELSE 0 
      END as dead_pct
    FROM pg_stat_user_tables
    WHERE n_dead_tup > 100
    ORDER BY n_dead_tup DESC
    LIMIT 5
  `);
  
  const totalDead = result.rows.reduce((sum, r) => sum + parseInt(r.n_dead_tup), 0);
  console.log(`   Total dead tuples: ${totalDead}`);
  
  if (result.rows.length > 0) {
    console.log('   Tabelas com mais dead tuples:');
    result.rows.forEach(r => {
      const status = parseFloat(r.dead_pct) > THRESHOLDS.maxDeadTuplesPct ? '⚠️' : '  ';
      console.log(`   ${status} ${r.relname}: ${r.n_dead_tup} (${r.dead_pct}%)`);
    });
  }
  
  if (totalDead > THRESHOLDS.maxDeadTuples) {
    console.log(`   ⚠️ ALERTA: Executar VACUUM ANALYZE`);
    exitCode = Math.max(exitCode, 1);
  } else {
    console.log('   ✅ OK');
  }
}

async function checkSlowQueries() {
  console.log('\n🐌 3. Queries Lentas');
  
  try {
    const result = await knex.raw(`
      SELECT 
        calls,
        round(mean_exec_time::numeric, 2) as mean_ms,
        round(total_exec_time::numeric, 2) as total_ms,
        LEFT(query, 60) as query_preview
      FROM pg_stat_statements
      WHERE mean_exec_time > ?
      ORDER BY mean_exec_time DESC
      LIMIT 3
    `, [THRESHOLDS.slowQueryThresholdMs]);
    
    if (result.rows.length > 0) {
      console.log(`   ⚠️ Queries com média > ${THRESHOLDS.slowQueryThresholdMs}ms:`);
      result.rows.forEach(r => {
        console.log(`      ${r.mean_ms}ms avg (${r.calls} calls): ${r.query_preview}...`);
      });
      exitCode = Math.max(exitCode, 1);
    } else {
      console.log('   ✅ Nenhuma query lenta detectada');
    }
  } catch (error) {
    console.log('   ℹ️ pg_stat_statements não disponível');
  }
}

async function checkUnusedIndexes() {
  console.log('\n📇 4. Índices Não Utilizados');
  
  const result = await knex.raw(`
    SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) as size
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
    AND indexrelname NOT LIKE '%pkey%'
    AND indexrelname NOT LIKE '%unique%'
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 5
  `);
  
  console.log(`   Total: ${result.rows.length} índices sem uso`);
  
  if (result.rows.length > THRESHOLDS.maxIndexScanZero) {
    console.log('   ⚠️ Considere remover índices não utilizados:');
    result.rows.slice(0, 5).forEach(r => {
      console.log(`      ${r.indexrelname} (${r.size})`);
    });
    exitCode = Math.max(exitCode, 1);
  } else {
    console.log('   ✅ OK');
  }
}

async function checkBlockingLocks() {
  console.log('\n🔒 5. Locks Bloqueantes');
  
  const result = await knex.raw(`
    SELECT count(*) as blocking_count
    FROM pg_catalog.pg_locks blocked_locks
    JOIN pg_catalog.pg_locks blocking_locks 
      ON blocking_locks.locktype = blocked_locks.locktype
      AND blocking_locks.pid != blocked_locks.pid
    WHERE NOT blocked_locks.granted
  `);
  
  const count = parseInt(result.rows[0].blocking_count);
  console.log(`   Locks bloqueantes: ${count}`);
  
  if (count > THRESHOLDS.maxBlockingLocks) {
    console.log('   🔴 CRÍTICO: Existem locks bloqueantes!');
    exitCode = 2;
  } else {
    console.log('   ✅ OK');
  }
}

async function checkDatabaseSize() {
  console.log('\n💾 6. Tamanho do Banco');
  
  const result = await knex.raw(`
    SELECT pg_size_pretty(pg_database_size(current_database())) as size
  `);
  
  console.log(`   Tamanho total: ${result.rows[0].size}`);
  console.log('   ✅ OK');
}

async function checkConfiguration() {
  console.log('\n⚙️ 7. Configurações');
  
  const result = await knex.raw(`
    SELECT name, setting, unit
    FROM pg_settings
    WHERE name IN (
      'shared_buffers', 'work_mem', 'maintenance_work_mem',
      'effective_cache_size', 'max_connections', 'autovacuum'
    )
    ORDER BY name
  `);
  
  result.rows.forEach(r => {
    const value = r.unit ? `${r.setting} ${r.unit}` : r.setting;
    console.log(`   ${r.name}: ${value}`);
  });
  console.log('   ✅ OK');
}

// Executar
runHealthCheck();


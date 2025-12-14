#!/usr/bin/env node

/**
 * Script de Manutenção do Banco de Dados
 * 
 * Este script executa tarefas de manutenção:
 * - VACUUM ANALYZE em tabelas críticas
 * - Reindex de índices fragmentados
 * - Limpeza de dados temporários
 * - Atualização de estatísticas
 * 
 * USO:
 *   node scripts/db-maintenance.js [--full] [--analyze-only]
 * 
 * RECOMENDAÇÃO: Executar diariamente às 4:00 AM
 */

require('dotenv').config();
const { db: knex } = require('../src/config/knex');

const args = process.argv.slice(2);
const FULL_VACUUM = args.includes('--full');
const ANALYZE_ONLY = args.includes('--analyze-only');

// Tabelas críticas que precisam de manutenção frequente
const CRITICAL_TABLES = [
  'agendamentos',
  'clientes',
  'audit_logs',
  'lembretes_enviados',
  'pontos_historico',
  'cupons_uso'
];

async function runMaintenance() {
  console.log('🔧 Iniciando manutenção do banco de dados...');
  console.log(`📅 Data: ${new Date().toISOString()}`);
  console.log(`⚙️ Modo: ${FULL_VACUUM ? 'VACUUM FULL' : ANALYZE_ONLY ? 'ANALYZE ONLY' : 'VACUUM ANALYZE'}`);
  console.log('-------------------------------------------');
  
  const startTime = Date.now();
  const results = [];
  
  try {
    // 1. Verificar estatísticas antes
    console.log('\n📊 Estatísticas antes da manutenção:');
    const statsBefore = await getTableStats();
    console.table(statsBefore);
    
    // 2. Executar VACUUM/ANALYZE em cada tabela
    for (const table of CRITICAL_TABLES) {
      const tableStart = Date.now();
      
      try {
        if (ANALYZE_ONLY) {
          console.log(`📈 ANALYZE ${table}...`);
          await knex.raw(`ANALYZE ${table};`);
        } else if (FULL_VACUUM) {
          console.log(`🧹 VACUUM FULL ANALYZE ${table}...`);
          await knex.raw(`VACUUM FULL ANALYZE ${table};`);
        } else {
          console.log(`🧹 VACUUM ANALYZE ${table}...`);
          await knex.raw(`VACUUM ANALYZE ${table};`);
        }
        
        const duration = Date.now() - tableStart;
        results.push({ table, status: '✅ OK', duration: `${duration}ms` });
        
      } catch (error) {
        results.push({ table, status: '❌ ERRO', error: error.message });
      }
    }
    
    // 3. Limpar dados temporários
    console.log('\n🗑️ Limpando dados temporários...');
    
    // Limpar tokens expirados (se houver tabela)
    // await knex('expired_tokens').where('expires_at', '<', new Date()).delete();
    
    // Limpar jobs antigos de cron (se houver)
    // await knex('cron_jobs_history').where('created_at', '<', knex.raw("NOW() - INTERVAL '30 days'")).delete();
    
    // 4. Reindexar índices fragmentados (apenas em FULL mode)
    if (FULL_VACUUM) {
      console.log('\n🔄 Reindexando índices...');
      for (const table of CRITICAL_TABLES) {
        try {
          await knex.raw(`REINDEX TABLE ${table};`);
          console.log(`  ✅ ${table} reindexado`);
        } catch (error) {
          console.log(`  ⚠️ Erro ao reindexar ${table}: ${error.message}`);
        }
      }
    }
    
    // 5. Estatísticas depois
    console.log('\n📊 Estatísticas após manutenção:');
    const statsAfter = await getTableStats();
    console.table(statsAfter);
    
    // 6. Resumo
    const totalDuration = Date.now() - startTime;
    console.log('\n-------------------------------------------');
    console.log('📋 Resumo da manutenção:');
    console.table(results);
    console.log(`\n⏱️ Tempo total: ${(totalDuration / 1000).toFixed(2)} segundos`);
    console.log('✅ Manutenção concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante manutenção:', error.message);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

async function getTableStats() {
  const result = await knex.raw(`
    SELECT 
      relname as table_name,
      n_live_tup as live_rows,
      n_dead_tup as dead_rows,
      CASE WHEN n_live_tup > 0 
        THEN round(100.0 * n_dead_tup / n_live_tup, 1) 
        ELSE 0 
      END as dead_pct,
      pg_size_pretty(pg_total_relation_size(relid)) as size
    FROM pg_stat_user_tables
    WHERE relname IN (${CRITICAL_TABLES.map(() => '?').join(',')})
    ORDER BY n_dead_tup DESC
  `, CRITICAL_TABLES);
  
  return result.rows;
}

// Executar
runMaintenance();


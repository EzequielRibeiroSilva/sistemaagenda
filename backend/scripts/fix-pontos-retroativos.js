/**
 * Script para corrigir pontos retroativos
 * 
 * Este script:
 * 1. Ativa o sistema de pontos para unidades específicas
 * 2. Gera pontos retroativos para agendamentos aprovados que não geraram pontos
 * 
 * Uso: node scripts/fix-pontos-retroativos.js [unidade_id]
 */

const { db } = require('../src/config/knex');
const logger = require('../src/utils/logger');

async function gerarPontosRetroativos(unidadeId = null) {
  try {
    console.log('🔧 [Fix] Iniciando correção de pontos retroativos...');

    // Buscar configurações da unidade
    let query = db('configuracoes_sistema');
    if (unidadeId) {
      query = query.where('unidade_id', unidadeId);
    }
    
    const configuracoes = await query.select('*');

    for (const config of configuracoes) {
      console.log(`\n📍 [Fix] Processando unidade ${config.unidade_id}...`);
      console.log(`   - Pontos ativo: ${config.pontos_ativo}`);
      console.log(`   - Pontos por real: ${config.pontos_por_real}`);
      console.log(`   - Validade (meses): ${config.pontos_validade_meses}`);

      if (!config.pontos_ativo) {
        console.log(`   ⚠️  Sistema de pontos DESATIVADO para unidade ${config.unidade_id}`);
        console.log(`   💡 Ativando sistema de pontos...`);
        
        await db('configuracoes_sistema')
          .where('unidade_id', config.unidade_id)
          .update({ pontos_ativo: true });
        
        console.log(`   ✅ Sistema de pontos ATIVADO para unidade ${config.unidade_id}`);
      }

      // Buscar agendamentos aprovados sem pontos gerados
      const agendamentosSemPontos = await db('agendamentos as a')
        .leftJoin('pontos_historico as ph', function() {
          this.on('ph.agendamento_id', '=', 'a.id')
              .andOn('ph.tipo', '=', db.raw('?', ['CREDITO']));
        })
        .where('a.unidade_id', config.unidade_id)
        .where('a.status', 'Aprovado')
        .where('a.valor_total', '>', 0)
        .whereNull('ph.id') // Não tem pontos gerados
        .select(
          'a.id as agendamento_id',
          'a.cliente_id',
          'a.unidade_id',
          'a.valor_total',
          'a.created_at'
        )
        .orderBy('a.created_at', 'asc');

      console.log(`   📊 Encontrados ${agendamentosSemPontos.length} agendamentos sem pontos`);

      if (agendamentosSemPontos.length === 0) {
        console.log(`   ✅ Nenhum agendamento pendente de pontos`);
        continue;
      }

      // Gerar pontos para cada agendamento
      let pontosGerados = 0;
      for (const agendamento of agendamentosSemPontos) {
        const pontosPorReal = parseFloat(config.pontos_por_real) || 1.0;
        const pontosValidade = parseInt(config.pontos_validade_meses, 10) || 12;
        const pontosCalculados = Math.floor(agendamento.valor_total * pontosPorReal);

        if (pontosCalculados > 0) {
          // Calcular data de validade
          const dataValidade = new Date(agendamento.created_at);
          dataValidade.setMonth(dataValidade.getMonth() + pontosValidade);

          await db('pontos_historico').insert({
            cliente_id: agendamento.cliente_id,
            unidade_id: agendamento.unidade_id,
            agendamento_id: agendamento.agendamento_id,
            tipo: 'CREDITO',
            pontos: pontosCalculados,
            valor_real: agendamento.valor_total,
            descricao: `Pontos gerados retroativamente - Agendamento #${agendamento.agendamento_id}`,
            data_validade: dataValidade.toISOString().split('T')[0],
            expirado: false,
            created_at: agendamento.created_at // Manter data original
          });

          pontosGerados++;
          console.log(`   ✅ Pontos gerados: ${pontosCalculados} pts para agendamento #${agendamento.agendamento_id} (Cliente #${agendamento.cliente_id})`);
        }
      }

      console.log(`   🎉 Total de ${pontosGerados} registros de pontos criados para unidade ${config.unidade_id}`);
    }

    console.log('\n✅ [Fix] Correção de pontos retroativos concluída!');
    process.exit(0);

  } catch (error) {
    console.error('❌ [Fix] Erro ao gerar pontos retroativos:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Executar script
const unidadeId = process.argv[2] ? parseInt(process.argv[2]) : null;

if (unidadeId) {
  console.log(`🎯 [Fix] Processando apenas unidade ${unidadeId}`);
} else {
  console.log(`🌍 [Fix] Processando TODAS as unidades`);
}

gerarPontosRetroativos(unidadeId);


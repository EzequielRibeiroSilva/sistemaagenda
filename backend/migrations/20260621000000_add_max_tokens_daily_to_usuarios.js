/**
 * Migration: Adicionar limite diário de tokens por usuário
 * Feature: TOKEN BUDGET - Fase 1 - Sprint de Hardening (Due Diligence)
 * 
 * Objetivo: Criar a "Cerca Elétrica" para proteger contra consumo excessivo de tokens da OpenAI.
 * 
 * Contexto Técnico:
 * - Modelo atual: gpt-4o-mini (~$0.15/1M input, ~$0.60/1M output)
 * - Conversa média: ~2.500 tokens (input + output + tools)
 * - Limite seguro: 100.000 tokens/dia/usuário (~40 agendamentos completos)
 * - Custo máximo garantido: $0.075/usuário/dia (proteção financeira)
 * 
 * Estratégia de Rollout:
 * - Valor padrão: 100.000 (generoso para não impactar operação atual)
 * - Retrocompatibilidade: Todos os usuários existentes recebem limite padrão
 * - Enforcement: Será implementado na Fase 2 (WhatsappWorker)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Adicionar coluna com valor padrão seguro
  await knex.schema.alterTable('usuarios', function(table) {
    // max_tokens_daily: Limite diário de tokens que o usuário pode consumir
    // - Integer (suficiente até 2.1 bilhões de tokens)
    // - NotNull (obrigatório para enforcement)
    // - Default: 100.000 (protege usuários existentes, ~40 conversas completas/dia)
    table.integer('max_tokens_daily').notNullable().defaultTo(100000);
    
    // Criar índice para performance (Worker consulta frequentemente)
    // Quando o RateLimitService verificar limite, precisa ser rápido
    table.index('max_tokens_daily', 'idx_usuarios_max_tokens_daily');
  });

  // 2. Verificação de integridade: Confirmar que valores padrão foram aplicados
  const count = await knex('usuarios')
    .where('max_tokens_daily', 100000)
    .count('id as total')
    .first();

  console.log(`[Migration] ✅ max_tokens_daily adicionado. ${count.total} usuário(s) com valor padrão aplicado.`);
};

/**
 * Reverter migration: Remover coluna e índice
 * 
 * ATENÇÃO: Ao fazer rollback, o controle de budget será desativado!
 * Sistema voltará ao estado vulnerável (sem limite de consumo).
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('usuarios', function(table) {
    // Remover índice primeiro (ordem inversa do up)
    table.dropIndex('max_tokens_daily', 'idx_usuarios_max_tokens_daily');
    
    // Remover coluna
    table.dropColumn('max_tokens_daily');
  });
};

/**
 * Migration: Corrigir constraint unique do código de cupom
 * 
 * PROBLEMA:
 * A constraint original (cupons_codigo_unique) era GLOBAL, impedindo que
 * dois usuários diferentes criassem cupons com o mesmo código.
 * 
 * SOLUÇÃO:
 * A constraint deve ser por usuário (usuario_id + codigo), permitindo que
 * cada usuário tenha seu próprio namespace de códigos de cupom.
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Verificar se a constraint antiga existe antes de tentar remover
  const hasOldConstraint = await knex.raw(`
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cupons_codigo_unique' 
    AND conrelid = 'cupons'::regclass
  `);
  
  if (hasOldConstraint.rows.length > 0) {
    // Remover constraint global antiga
    await knex.raw('ALTER TABLE cupons DROP CONSTRAINT cupons_codigo_unique');
  }
  
  // Verificar se o índice antigo existe antes de tentar remover
  const hasOldIndex = await knex.raw(`
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'cupons_codigo_unique' 
    AND tablename = 'cupons'
  `);
  
  if (hasOldIndex.rows.length > 0) {
    await knex.raw('DROP INDEX cupons_codigo_unique');
  }
  
  // Verificar se a nova constraint já existe
  const hasNewConstraint = await knex.raw(`
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cupons_codigo_usuario_unique' 
    AND conrelid = 'cupons'::regclass
  `);
  
  if (hasNewConstraint.rows.length === 0) {
    // Criar nova constraint única por usuário (usuario_id + codigo)
    await knex.raw(`
      ALTER TABLE cupons 
      ADD CONSTRAINT cupons_codigo_usuario_unique 
      UNIQUE (usuario_id, codigo)
    `);
  }
};

/**
 * Reverter migration - Restaurar constraint global
 * 
 * NOTA: Esta reversão só funciona se não houver códigos duplicados entre usuários
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Remover constraint por usuário
  const hasNewConstraint = await knex.raw(`
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cupons_codigo_usuario_unique' 
    AND conrelid = 'cupons'::regclass
  `);
  
  if (hasNewConstraint.rows.length > 0) {
    await knex.raw('ALTER TABLE cupons DROP CONSTRAINT cupons_codigo_usuario_unique');
  }
  
  // Tentar restaurar constraint global (pode falhar se houver duplicatas)
  const hasOldConstraint = await knex.raw(`
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cupons_codigo_unique' 
    AND conrelid = 'cupons'::regclass
  `);
  
  if (hasOldConstraint.rows.length === 0) {
    await knex.raw(`
      ALTER TABLE cupons 
      ADD CONSTRAINT cupons_codigo_unique 
      UNIQUE (codigo)
    `);
  }
};


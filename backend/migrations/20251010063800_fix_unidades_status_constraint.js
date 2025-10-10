/**
 * Migration: Fix unidades status constraint to allow 'Excluido'
 * 
 * This migration fixes the CHECK constraint on the unidades table
 * to allow the 'Excluido' status for soft delete functionality.
 * 
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = function(knex) {
  return knex.raw(`
    -- Remove the existing constraint
    ALTER TABLE unidades DROP CONSTRAINT IF EXISTS unidades_status_check;
    
    -- Add new constraint that includes 'Excluido'
    ALTER TABLE unidades ADD CONSTRAINT unidades_status_check 
    CHECK (status = ANY (ARRAY['Ativo'::text, 'Bloqueado'::text, 'Excluido'::text]));
  `);
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = function(knex) {
  return knex.raw(`
    -- Remove the constraint with 'Excluido'
    ALTER TABLE unidades DROP CONSTRAINT IF EXISTS unidades_status_check;
    
    -- Restore original constraint (only Ativo and Bloqueado)
    ALTER TABLE unidades ADD CONSTRAINT unidades_status_check 
    CHECK (status = ANY (ARRAY['Ativo'::text, 'Bloqueado'::text]));
  `);
};

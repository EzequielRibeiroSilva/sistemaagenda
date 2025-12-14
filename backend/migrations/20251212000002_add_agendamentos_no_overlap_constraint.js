/**
 * Migration: Impedir sobreposição de agendamentos por agente (concorrência)
 * 
 * Estratégia:
 * - Habilitar extensão btree_gist (necessária para '=' em colunas btree dentro de índices GIST)
 * - Remover duplicatas existentes (mesmo agente/data/hora_inicio/hora_fim) mantendo o menor id
 * - Criar exclusion constraint para evitar sobreposição de intervalos (date+time) por agente
 */

exports.up = async function(knex) {
  // Extensão necessária para usar '=' em coluna integer dentro do GIST
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');

  // Limpar duplicatas exatas (defesa para ambientes que já sofreram race condition)
  await knex.raw(`
    DELETE FROM agendamentos a
    USING agendamentos b
    WHERE a.id > b.id
      AND a.agente_id = b.agente_id
      AND a.data_agendamento = b.data_agendamento
      AND a.hora_inicio = b.hora_inicio
      AND a.hora_fim = b.hora_fim
      AND a.status <> 'Cancelado'
      AND b.status <> 'Cancelado';
  `);

  // Impedir sobreposição: mesmo agente não pode ter intervalos que se interceptam
  // Considera apenas agendamentos não cancelados.
  await knex.raw(`
    ALTER TABLE agendamentos
    ADD CONSTRAINT agendamentos_no_overlap
    EXCLUDE USING GIST (
      agente_id WITH =,
      tsrange((data_agendamento + hora_inicio), (data_agendamento + hora_fim), '[)') WITH &&
    )
    WHERE (status <> 'Cancelado');
  `);
};

exports.down = async function(knex) {
  await knex.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_no_overlap');
};

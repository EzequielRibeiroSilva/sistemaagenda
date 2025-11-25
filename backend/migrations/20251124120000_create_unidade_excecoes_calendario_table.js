/**
 * Migration: Criar tabela unidade_excecoes_calendario
 * 
 * Esta tabela armazena exceções de calendário (feriados, férias, eventos especiais)
 * para unidades/locais, permitindo bloquear datas específicas sem editar horários semanais.
 * 
 * Casos de uso:
 * - Feriados nacionais/municipais (ex: Natal, Ano Novo)
 * - Períodos de férias (ex: 15-22/07/2026)
 * - Eventos especiais (ex: Treinamento interno, Manutenção)
 * - Fechamentos temporários
 */

exports.up = function(knex) {
  return knex.schema.createTable('unidade_excecoes_calendario', function(table) {
    // Chave primária
    table.increments('id').primary();
    
    // Chave estrangeira para unidades
    table.integer('unidade_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('unidades')
      .onDelete('CASCADE')
      .onUpdate('CASCADE')
      .comment('ID da unidade/local afetado pela exceção');
    
    // Data de início da exceção
    table.date('data_inicio')
      .notNullable()
      .comment('Data de início do bloqueio (inclusivo)');
    
    // Data de fim da exceção
    table.date('data_fim')
      .notNullable()
      .comment('Data de fim do bloqueio (inclusivo)');
    
    // Tipo/motivo da exceção
    table.enum('tipo', ['Feriado', 'Férias', 'Evento Especial', 'Manutenção', 'Outro'])
      .notNullable()
      .defaultTo('Outro')
      .comment('Categoria da exceção para organização');
    
    // Descrição detalhada
    table.text('descricao')
      .nullable()
      .comment('Descrição opcional (ex: "Natal", "Férias Coletivas", "Reforma do Espaço")');
    
    // Timestamps
    table.timestamps(true, true);
    
    // Índices para performance
    table.index(['unidade_id']);
    table.index(['unidade_id', 'data_inicio', 'data_fim']);
    table.index(['data_inicio', 'data_fim']);
    
    // Constraint: data_fim deve ser >= data_inicio
    table.check('data_fim >= data_inicio', [], 'check_data_fim_maior_igual_inicio');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('unidade_excecoes_calendario');
};

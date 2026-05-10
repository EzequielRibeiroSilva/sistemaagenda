/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.transaction(async (trx) => {
    // agendamento_produtos.agendamento_id -> agendamentos.id
    await trx.raw('ALTER TABLE agendamento_produtos DROP CONSTRAINT IF EXISTS agendamento_produtos_agendamento_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamento_produtos ADD CONSTRAINT agendamento_produtos_agendamento_id_foreign FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE RESTRICT'
    );

    // agendamento_servicos.agendamento_id -> agendamentos.id
    await trx.raw('ALTER TABLE agendamento_servicos DROP CONSTRAINT IF EXISTS agendamento_servicos_agendamento_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamento_servicos ADD CONSTRAINT agendamento_servicos_agendamento_id_foreign FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE RESTRICT'
    );

    // agendamento_servicos_extras.agendamento_id -> agendamentos.id
    await trx.raw('ALTER TABLE agendamento_servicos_extras DROP CONSTRAINT IF EXISTS agendamento_servicos_extras_agendamento_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamento_servicos_extras ADD CONSTRAINT agendamento_servicos_extras_agendamento_id_foreign FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE RESTRICT'
    );

    // lembretes_enviados.agendamento_id -> agendamentos.id
    await trx.raw('ALTER TABLE lembretes_enviados DROP CONSTRAINT IF EXISTS lembretes_enviados_agendamento_id_foreign');
    await trx.raw(
      'ALTER TABLE lembretes_enviados ADD CONSTRAINT lembretes_enviados_agendamento_id_foreign FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE RESTRICT'
    );

    // agendamentos.agente_id -> agentes.id
    await trx.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_agente_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_agente_id_foreign FOREIGN KEY (agente_id) REFERENCES agentes(id) ON DELETE RESTRICT'
    );

    // agendamentos.cliente_id -> clientes.id
    await trx.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_cliente_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_cliente_id_foreign FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT'
    );

    // agendamentos.unidade_id -> unidades.id
    await trx.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_unidade_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_unidade_id_foreign FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE RESTRICT'
    );

    // agendamentos.usuario_id -> usuarios.id
    await trx.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_usuario_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_usuario_id_foreign FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT'
    );

    // estoque_movimentacoes.produto_id -> produtos.id
    await trx.raw('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_produto_id_foreign');
    await trx.raw(
      'ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_produto_id_foreign FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT'
    );

    // estoque_movimentacoes.unidade_id -> unidades.id
    await trx.raw('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_unidade_id_foreign');
    await trx.raw(
      'ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_unidade_id_foreign FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE RESTRICT'
    );

    // estoque_movimentacoes.usuario_id -> usuarios.id
    await trx.raw('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_usuario_id_foreign');
    await trx.raw(
      'ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_usuario_id_foreign FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT'
    );

    // venda_itens.venda_id -> vendas.id
    await trx.raw('ALTER TABLE venda_itens DROP CONSTRAINT IF EXISTS venda_itens_venda_id_foreign');
    await trx.raw(
      'ALTER TABLE venda_itens ADD CONSTRAINT venda_itens_venda_id_foreign FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE RESTRICT'
    );

    // venda_pagamentos.venda_id -> vendas.id
    await trx.raw('ALTER TABLE venda_pagamentos DROP CONSTRAINT IF EXISTS venda_pagamentos_venda_id_foreign');
    await trx.raw(
      'ALTER TABLE venda_pagamentos ADD CONSTRAINT venda_pagamentos_venda_id_foreign FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE RESTRICT'
    );

    // vendas.unidade_id -> unidades.id
    await trx.raw('ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_unidade_id_foreign');
    await trx.raw(
      'ALTER TABLE vendas ADD CONSTRAINT vendas_unidade_id_foreign FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE RESTRICT'
    );

    // vendas.usuario_id -> usuarios.id
    await trx.raw('ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_usuario_id_foreign');
    await trx.raw(
      'ALTER TABLE vendas ADD CONSTRAINT vendas_usuario_id_foreign FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT'
    );
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.transaction(async (trx) => {
    await trx.raw('ALTER TABLE agendamento_produtos DROP CONSTRAINT IF EXISTS agendamento_produtos_agendamento_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamento_produtos ADD CONSTRAINT agendamento_produtos_agendamento_id_foreign FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE agendamento_servicos DROP CONSTRAINT IF EXISTS agendamento_servicos_agendamento_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamento_servicos ADD CONSTRAINT agendamento_servicos_agendamento_id_foreign FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE agendamento_servicos_extras DROP CONSTRAINT IF EXISTS agendamento_servicos_extras_agendamento_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamento_servicos_extras ADD CONSTRAINT agendamento_servicos_extras_agendamento_id_foreign FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE lembretes_enviados DROP CONSTRAINT IF EXISTS lembretes_enviados_agendamento_id_foreign');
    await trx.raw(
      'ALTER TABLE lembretes_enviados ADD CONSTRAINT lembretes_enviados_agendamento_id_foreign FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_agente_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_agente_id_foreign FOREIGN KEY (agente_id) REFERENCES agentes(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_cliente_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_cliente_id_foreign FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_unidade_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_unidade_id_foreign FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_usuario_id_foreign');
    await trx.raw(
      'ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_usuario_id_foreign FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_produto_id_foreign');
    await trx.raw(
      'ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_produto_id_foreign FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_unidade_id_foreign');
    await trx.raw(
      'ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_unidade_id_foreign FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_usuario_id_foreign');
    await trx.raw(
      'ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_usuario_id_foreign FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE venda_itens DROP CONSTRAINT IF EXISTS venda_itens_venda_id_foreign');
    await trx.raw(
      'ALTER TABLE venda_itens ADD CONSTRAINT venda_itens_venda_id_foreign FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE venda_pagamentos DROP CONSTRAINT IF EXISTS venda_pagamentos_venda_id_foreign');
    await trx.raw(
      'ALTER TABLE venda_pagamentos ADD CONSTRAINT venda_pagamentos_venda_id_foreign FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_unidade_id_foreign');
    await trx.raw(
      'ALTER TABLE vendas ADD CONSTRAINT vendas_unidade_id_foreign FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE CASCADE'
    );

    await trx.raw('ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_usuario_id_foreign');
    await trx.raw(
      'ALTER TABLE vendas ADD CONSTRAINT vendas_usuario_id_foreign FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE'
    );
  });
};

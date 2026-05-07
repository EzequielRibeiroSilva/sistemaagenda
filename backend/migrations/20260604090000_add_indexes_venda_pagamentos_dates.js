/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('venda_pagamentos', function (table) {
    table.index(['paid_at'], 'idx_venda_pagamentos_paid_at');
    table.index(['created_at'], 'idx_venda_pagamentos_created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('venda_pagamentos', function (table) {
    table.dropIndex(['paid_at'], 'idx_venda_pagamentos_paid_at');
    table.dropIndex(['created_at'], 'idx_venda_pagamentos_created_at');
  });
};

-- Migration manual: Criar tabelas de cupons

-- Tabela principal de cupons
CREATE TABLE IF NOT EXISTS cupons (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  descricao TEXT,
  tipo_desconto VARCHAR(20) NOT NULL DEFAULT 'percentual' CHECK (tipo_desconto IN ('percentual', 'valor_fixo')),
  valor_desconto DECIMAL(10, 2) NOT NULL,
  valor_minimo_pedido DECIMAL(10, 2),
  desconto_maximo DECIMAL(10, 2),
  data_inicio TIMESTAMP,
  data_fim TIMESTAMP,
  limite_uso_total INTEGER,
  limite_uso_por_cliente INTEGER,
  uso_atual INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo', 'Expirado')),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS cupons_codigo_idx ON cupons(codigo);
CREATE INDEX IF NOT EXISTS cupons_status_idx ON cupons(status);
CREATE INDEX IF NOT EXISTS cupons_usuario_id_idx ON cupons(usuario_id);
CREATE INDEX IF NOT EXISTS cupons_data_inicio_data_fim_idx ON cupons(data_inicio, data_fim);

-- Tabela de rastreamento de uso de cupons
CREATE TABLE IF NOT EXISTS cupons_uso (
  id SERIAL PRIMARY KEY,
  cupom_id INTEGER NOT NULL REFERENCES cupons(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  agendamento_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL,
  valor_original DECIMAL(10, 2) NOT NULL,
  valor_desconto DECIMAL(10, 2) NOT NULL,
  valor_final DECIMAL(10, 2) NOT NULL,
  usado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS cupons_uso_cupom_id_idx ON cupons_uso(cupom_id);
CREATE INDEX IF NOT EXISTS cupons_uso_cliente_id_idx ON cupons_uso(cliente_id);
CREATE INDEX IF NOT EXISTS cupons_uso_agendamento_id_idx ON cupons_uso(agendamento_id);
CREATE INDEX IF NOT EXISTS cupons_uso_usado_em_idx ON cupons_uso(usado_em);
CREATE INDEX IF NOT EXISTS cupons_uso_cupom_cliente_idx ON cupons_uso(cupom_id, cliente_id);

-- Registrar migration no knex_migrations
INSERT INTO knex_migrations (name, batch, migration_time)
VALUES ('20251123000000_create_cupons_tables.js', 
        (SELECT COALESCE(MAX(batch), 0) + 1 FROM knex_migrations), 
        CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

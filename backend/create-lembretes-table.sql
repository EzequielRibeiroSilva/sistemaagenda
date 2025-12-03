-- Criar tabela lembretes_enviados no banco Docker
CREATE TABLE IF NOT EXISTS lembretes_enviados (
    id SERIAL PRIMARY KEY,
    agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    unidade_id INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    tipo_lembrete VARCHAR(10) NOT NULL CHECK (tipo_lembrete IN ('24h', '2h')),
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falha', 'falha_permanente')),
    tentativas INTEGER NOT NULL DEFAULT 0,
    telefone_destino VARCHAR(20) NOT NULL,
    mensagem_enviada TEXT,
    whatsapp_message_id VARCHAR(100),
    erro_detalhes TEXT,
    ultima_tentativa TIMESTAMP,
    enviado_em TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (agendamento_id, tipo_lembrete)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_lembretes_agendamento ON lembretes_enviados(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_unidade ON lembretes_enviados(unidade_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_status ON lembretes_enviados(status);
CREATE INDEX IF NOT EXISTS idx_lembretes_tipo ON lembretes_enviados(tipo_lembrete);
CREATE INDEX IF NOT EXISTS idx_lembretes_agendamento_tipo ON lembretes_enviados(agendamento_id, tipo_lembrete);
CREATE INDEX IF NOT EXISTS idx_lembretes_created ON lembretes_enviados(created_at);

-- Comentários
COMMENT ON TABLE lembretes_enviados IS 'Tabela para rastrear lembretes enviados e prevenir duplicatas';
COMMENT ON COLUMN lembretes_enviados.agendamento_id IS 'ID do agendamento relacionado';
COMMENT ON COLUMN lembretes_enviados.unidade_id IS 'ID da unidade (multi-tenancy)';
COMMENT ON COLUMN lembretes_enviados.tipo_lembrete IS 'Tipo do lembrete: 24h ou 2h antes do agendamento';
COMMENT ON COLUMN lembretes_enviados.status IS 'Status do envio do lembrete';
COMMENT ON COLUMN lembretes_enviados.tentativas IS 'Número de tentativas de envio';
COMMENT ON COLUMN lembretes_enviados.telefone_destino IS 'Telefone do cliente que recebeu o lembrete';
COMMENT ON COLUMN lembretes_enviados.mensagem_enviada IS 'Conteúdo da mensagem enviada';
COMMENT ON COLUMN lembretes_enviados.whatsapp_message_id IS 'ID da mensagem retornado pela Evolution API';
COMMENT ON COLUMN lembretes_enviados.erro_detalhes IS 'Detalhes do erro em caso de falha';
COMMENT ON COLUMN lembretes_enviados.ultima_tentativa IS 'Data/hora da última tentativa de envio';
COMMENT ON COLUMN lembretes_enviados.enviado_em IS 'Data/hora do envio bem-sucedido';

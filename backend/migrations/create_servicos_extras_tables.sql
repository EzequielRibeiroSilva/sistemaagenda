-- Migration: Criar tabelas para serviços extras
-- Data: 2025-10-13
-- Descrição: Adiciona suporte a serviços extras no sistema de agendamentos

-- 1. Tabela de serviços extras
CREATE TABLE IF NOT EXISTS servicos_extras (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    duracao_minutos INTEGER NOT NULL DEFAULT 0,
    categoria VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
    unidade_id INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Índices para performance
    INDEX idx_servicos_extras_unidade_id (unidade_id),
    INDEX idx_servicos_extras_status (status),
    INDEX idx_servicos_extras_categoria (categoria)
);

-- 2. Tabela de relacionamento agendamento-serviços extras
CREATE TABLE IF NOT EXISTS agendamento_servicos_extras (
    id SERIAL PRIMARY KEY,
    agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    servico_extra_id INTEGER NOT NULL REFERENCES servicos_extras(id) ON DELETE CASCADE,
    preco_aplicado DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Evitar duplicatas
    UNIQUE(agendamento_id, servico_extra_id),
    
    -- Índices para performance
    INDEX idx_agendamento_servicos_extras_agendamento (agendamento_id),
    INDEX idx_agendamento_servicos_extras_servico (servico_extra_id)
);

-- 3. Inserir alguns serviços extras de exemplo para a unidade 40
INSERT INTO servicos_extras (nome, descricao, preco, duracao_minutos, categoria, unidade_id) VALUES
('Lavagem de Cabelo', 'Lavagem completa com shampoo e condicionador', 15.00, 15, 'Cuidados', 40),
('Massagem no Couro Cabeludo', 'Massagem relaxante durante a lavagem', 10.00, 10, 'Relaxamento', 40),
('Finalização com Pomada', 'Aplicação de pomada modeladora', 8.00, 5, 'Finalização', 40),
('Sobrancelha', 'Design e aparação das sobrancelhas', 12.00, 15, 'Design', 40),
('Limpeza de Pele', 'Limpeza facial básica', 25.00, 20, 'Cuidados', 40),
('Hidratação Capilar', 'Tratamento hidratante para cabelos', 20.00, 25, 'Tratamento', 40);

-- 4. Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_servicos_extras_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_servicos_extras_updated_at
    BEFORE UPDATE ON servicos_extras
    FOR EACH ROW
    EXECUTE FUNCTION update_servicos_extras_updated_at();

-- 5. Comentários para documentação
COMMENT ON TABLE servicos_extras IS 'Tabela de serviços extras disponíveis por unidade';
COMMENT ON TABLE agendamento_servicos_extras IS 'Relacionamento entre agendamentos e serviços extras selecionados';
COMMENT ON COLUMN servicos_extras.duracao_minutos IS 'Duração adicional em minutos que o serviço extra adiciona ao agendamento';
COMMENT ON COLUMN agendamento_servicos_extras.preco_aplicado IS 'Preço do serviço extra no momento do agendamento (histórico)';

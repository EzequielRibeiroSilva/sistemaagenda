-- Script para verificar e criar a tabela unidade_excecoes_calendario
-- Execute este script no banco de dados

-- 1. Verificar se a tabela existe
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'unidade_excecoes_calendario'
) AS table_exists;

-- 2. Criar a tabela se não existir
CREATE TABLE IF NOT EXISTS unidade_excecoes_calendario (
    id SERIAL PRIMARY KEY,
    unidade_id INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE ON UPDATE CASCADE,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'Outro' CHECK (tipo IN ('Feriado', 'Férias', 'Evento Especial', 'Manutenção', 'Outro')),
    descricao TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_data_fim_maior_igual_inicio CHECK (data_fim >= data_inicio)
);

-- 3. Criar índices
CREATE INDEX IF NOT EXISTS idx_unidade_excecoes_unidade_id ON unidade_excecoes_calendario(unidade_id);
CREATE INDEX IF NOT EXISTS idx_unidade_excecoes_datas ON unidade_excecoes_calendario(unidade_id, data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_unidade_excecoes_periodo ON unidade_excecoes_calendario(data_inicio, data_fim);

-- 4. Adicionar comentários
COMMENT ON TABLE unidade_excecoes_calendario IS 'Exceções de calendário (feriados, férias, manutenções) para unidades';
COMMENT ON COLUMN unidade_excecoes_calendario.unidade_id IS 'ID da unidade/local afetado pela exceção';
COMMENT ON COLUMN unidade_excecoes_calendario.data_inicio IS 'Data de início do bloqueio (inclusivo)';
COMMENT ON COLUMN unidade_excecoes_calendario.data_fim IS 'Data de fim do bloqueio (inclusivo)';
COMMENT ON COLUMN unidade_excecoes_calendario.tipo IS 'Categoria da exceção para organização';
COMMENT ON COLUMN unidade_excecoes_calendario.descricao IS 'Descrição opcional (ex: "Natal", "Férias Coletivas")';

-- 5. Verificar novamente
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'unidade_excecoes_calendario'
ORDER BY ordinal_position;

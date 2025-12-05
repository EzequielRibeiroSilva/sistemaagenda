-- ========================================
-- VERIFICAÇÃO: Horários do Agente Ezequiel Ribeiro
-- ========================================

-- 1. IDENTIFICAR O AGENTE EZEQUIEL RIBEIRO
SELECT 
    a.id as agente_id,
    a.nome,
    a.sobrenome,
    a.nome_exibicao,
    a.unidade_id,
    u.nome as unidade_nome
FROM agentes a
LEFT JOIN unidades u ON a.unidade_id = u.id
WHERE LOWER(a.nome) LIKE '%ezequiel%'
   OR LOWER(a.sobrenome) LIKE '%ribeiro%'
   OR LOWER(a.nome_exibicao) LIKE '%ezequiel%';

-- 2. VERIFICAR HORÁRIOS DO AGENTE EZEQUIEL (TODOS OS DIAS)
-- Substitua <ID_EZEQUIEL> pelo ID encontrado na query acima
SELECT 
    hf.id,
    hf.agente_id,
    hf.dia_semana,
    CASE hf.dia_semana
        WHEN 0 THEN 'Domingo'
        WHEN 1 THEN 'Segunda-feira'
        WHEN 2 THEN 'Terça-feira'
        WHEN 3 THEN 'Quarta-feira'
        WHEN 4 THEN 'Quinta-feira'
        WHEN 5 THEN 'Sexta-feira'
        WHEN 6 THEN 'Sábado'
    END as dia_nome,
    hf.ativo,
    hf.periodos,
    hf.unidade_id,
    u.nome as unidade_nome
FROM horarios_funcionamento hf
LEFT JOIN unidades u ON hf.unidade_id = u.id
WHERE hf.agente_id = 23  -- ✅ ID do Ezequiel Ribeiro (ajuste se necessário)
ORDER BY hf.unidade_id, hf.dia_semana;

-- 3. VERIFICAR ESPECIFICAMENTE SEXTA (5) E SÁBADO (6)
SELECT 
    hf.dia_semana,
    CASE hf.dia_semana
        WHEN 5 THEN 'Sexta-feira'
        WHEN 6 THEN 'Sábado'
    END as dia_nome,
    hf.ativo,
    hf.periodos,
    hf.unidade_id,
    u.nome as unidade_nome
FROM horarios_funcionamento hf
LEFT JOIN unidades u ON hf.unidade_id = u.id
WHERE hf.agente_id = 23
AND hf.dia_semana IN (5, 6);

-- 4. VERIFICAR HORÁRIOS DA UNIDADE 1 (ID 40)
SELECT 
    hfu.dia_semana,
    CASE hfu.dia_semana
        WHEN 0 THEN 'Domingo'
        WHEN 1 THEN 'Segunda-feira'
        WHEN 2 THEN 'Terça-feira'
        WHEN 3 THEN 'Quarta-feira'
        WHEN 4 THEN 'Quinta-feira'
        WHEN 5 THEN 'Sexta-feira'
        WHEN 6 THEN 'Sábado'
    END as dia_nome,
    hfu.is_aberto,
    hfu.horarios_json,
    u.nome as unidade_nome
FROM horarios_funcionamento_unidade hfu
JOIN unidades u ON hfu.unidade_id = u.id
WHERE hfu.unidade_id = 40  -- Unidade 1
ORDER BY hfu.dia_semana;

-- 5. COMPARAR: Agente vs Unidade (SÁBADO)
SELECT 
    'AGENTE' as tipo,
    hf.dia_semana,
    hf.ativo as agente_ativo,
    hf.periodos as agente_periodos,
    NULL as unidade_aberta,
    NULL as unidade_periodos
FROM horarios_funcionamento hf
WHERE hf.agente_id = 23
AND hf.dia_semana = 6

UNION ALL

SELECT 
    'UNIDADE' as tipo,
    hfu.dia_semana,
    NULL as agente_ativo,
    NULL as agente_periodos,
    hfu.is_aberto as unidade_aberta,
    hfu.horarios_json as unidade_periodos
FROM horarios_funcionamento_unidade hfu
WHERE hfu.unidade_id = 40
AND hfu.dia_semana = 6;

-- 6. VERIFICAR SE AGENTE TRABALHA EM MÚLTIPLAS UNIDADES
SELECT 
    au.agente_id,
    au.unidade_id,
    u.nome as unidade_nome,
    a.nome_exibicao as agente_nome
FROM agente_unidades au
JOIN unidades u ON au.unidade_id = u.id
JOIN agentes a ON au.agente_id = a.id
WHERE au.agente_id = 23;

-- 7. CONTAR REGISTROS POR DIA DA SEMANA (AGENTE)
SELECT 
    dia_semana,
    CASE dia_semana
        WHEN 0 THEN 'Domingo'
        WHEN 1 THEN 'Segunda'
        WHEN 2 THEN 'Terça'
        WHEN 3 THEN 'Quarta'
        WHEN 4 THEN 'Quinta'
        WHEN 5 THEN 'Sexta'
        WHEN 6 THEN 'Sábado'
    END as dia_nome,
    COUNT(*) as total_registros,
    SUM(CASE WHEN ativo = true THEN 1 ELSE 0 END) as registros_ativos
FROM horarios_funcionamento
WHERE agente_id = 23
GROUP BY dia_semana
ORDER BY dia_semana;

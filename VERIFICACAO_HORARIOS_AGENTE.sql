-- ============================================
-- SCRIPT DE VERIFICAÇÃO - HORÁRIOS DO AGENTE
-- ============================================

-- 1. VERIFICAR QUAL AGENTE É "LUCAS" NA UNIDADE 1
SELECT 
    a.id as agente_id,
    a.nome,
    a.sobrenome,
    a.nome_exibicao,
    au.unidade_id,
    u.nome as unidade_nome
FROM agentes a
LEFT JOIN agente_unidades au ON a.id = au.agente_id
LEFT JOIN unidades u ON au.unidade_id = u.id
WHERE u.id = 40  -- Unidade 1
ORDER BY a.nome;

-- 2. VERIFICAR HORÁRIOS DO AGENTE "LUCAS" (assumindo que é o agente exibido na imagem)
-- Substitua <AGENTE_ID> pelo ID do agente Lucas encontrado na query acima
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
    hf.unidade_id
FROM horarios_funcionamento hf
WHERE hf.agente_id IN (
    SELECT a.id 
    FROM agentes a
    LEFT JOIN agente_unidades au ON a.id = au.agente_id
    WHERE au.unidade_id = 40
)
AND hf.unidade_id = 40  -- Filtrar apenas horários da Unidade 1
ORDER BY hf.agente_id, hf.dia_semana;

-- 3. VERIFICAR HORÁRIOS DA UNIDADE 1
SELECT 
    hfu.id,
    hfu.unidade_id,
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
    hfu.horarios_json
FROM horarios_funcionamento_unidade hfu
WHERE hfu.unidade_id = 40  -- Unidade 1
ORDER BY hfu.dia_semana;

-- 4. COMPARAÇÃO: Horários do Agente vs Horários da Unidade
-- Esta query mostra se há inconsistências
SELECT 
    CASE hfu.dia_semana
        WHEN 0 THEN 'Domingo'
        WHEN 1 THEN 'Segunda-feira'
        WHEN 2 THEN 'Terça-feira'
        WHEN 3 THEN 'Quarta-feira'
        WHEN 4 THEN 'Quinta-feira'
        WHEN 5 THEN 'Sexta-feira'
        WHEN 6 THEN 'Sábado'
    END as dia_nome,
    hfu.dia_semana,
    hfu.is_aberto as unidade_aberta,
    hfu.horarios_json as horarios_unidade,
    hf.ativo as agente_ativo,
    hf.periodos as horarios_agente,
    CASE 
        WHEN hfu.is_aberto = true AND (hf.ativo IS NULL OR hf.ativo = false) THEN '⚠️ INCONSISTÊNCIA: Unidade aberta mas agente inativo'
        WHEN hfu.is_aberto = false AND hf.ativo = true THEN '⚠️ INCONSISTÊNCIA: Unidade fechada mas agente ativo'
        WHEN hfu.is_aberto = true AND hf.ativo = true THEN '✅ OK'
        WHEN hfu.is_aberto = false AND (hf.ativo IS NULL OR hf.ativo = false) THEN '✅ OK (ambos fechados)'
        ELSE '❓ Verificar'
    END as status_consistencia
FROM horarios_funcionamento_unidade hfu
LEFT JOIN horarios_funcionamento hf ON hfu.dia_semana = hf.dia_semana 
    AND hf.unidade_id = 40
    AND hf.agente_id = (
        SELECT a.id 
        FROM agentes a
        LEFT JOIN agente_unidades au ON a.id = au.agente_id
        WHERE au.unidade_id = 40
        AND a.nome_exibicao = 'Lucas'  -- Ajuste conforme necessário
        LIMIT 1
    )
WHERE hfu.unidade_id = 40
ORDER BY hfu.dia_semana;

-- 5. VERIFICAR SE HÁ REGISTROS DUPLICADOS (PROBLEMA COMUM)
SELECT 
    agente_id,
    dia_semana,
    unidade_id,
    COUNT(*) as total_registros,
    CASE 
        WHEN COUNT(*) > 1 THEN '⚠️ DUPLICADO!'
        ELSE '✅ OK'
    END as status
FROM horarios_funcionamento
WHERE unidade_id = 40
GROUP BY agente_id, dia_semana, unidade_id
HAVING COUNT(*) > 1;

-- 6. VERIFICAR AGENDAMENTOS EXISTENTES PARA O DIA 8 DE DEZEMBRO
SELECT 
    ag.id,
    ag.data_agendamento,
    ag.hora_inicio,
    ag.hora_fim,
    ag.status,
    a.nome as agente_nome,
    c.nome as cliente_nome
FROM agendamentos ag
LEFT JOIN agentes a ON ag.agente_id = a.id
LEFT JOIN clientes c ON ag.cliente_id = c.id
WHERE ag.data_agendamento = '2025-12-08'  -- Domingo
AND ag.unidade_id = 40
ORDER BY ag.hora_inicio;

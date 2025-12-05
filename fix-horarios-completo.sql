-- ========================================
-- SCRIPT DE CORREÇÃO COMPLETA DE HORÁRIOS
-- ========================================
-- Data: 5 de Dezembro de 2025
-- Objetivo: Criar horários faltantes para todos os agentes em todas as unidades
-- ========================================

-- 1. LUCAS ANDRADE (ID: 25) - Tem horários SEM unidade_id (NULL)
-- Problema: unidade_id = NULL causa erro no backend ao filtrar por unidade
-- Solução: Deletar horários antigos e criar novos para Unidades 1 e 2

-- 1.1. Deletar horários antigos (com unidade_id NULL)
DELETE FROM horarios_funcionamento WHERE agente_id = 25 AND unidade_id IS NULL;

-- 1.2. Criar horários para Unidade 1 (ID: 40)
INSERT INTO horarios_funcionamento (agente_id, unidade_id, dia_semana, ativo, periodos, created_at, updated_at)
VALUES
  (25, 40, 0, false, '[]', NOW(), NOW()),
  (25, 40, 1, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 40, 2, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 40, 3, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 40, 4, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 40, 5, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 40, 6, false, '[]', NOW(), NOW());

-- 1.3. Criar horários para Unidade 2 (ID: 43)
INSERT INTO horarios_funcionamento (agente_id, unidade_id, dia_semana, ativo, periodos, created_at, updated_at)
VALUES
  (25, 43, 0, false, '[]', NOW(), NOW()),
  (25, 43, 1, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 43, 2, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 43, 3, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 43, 4, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 43, 5, true, '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]', NOW(), NOW()),
  (25, 43, 6, false, '[]', NOW(), NOW());

-- 2. MARCELO MARTINS (ID: 27) - Tem horários MAS todos com periodos = []
-- Problema: Apenas sexta-feira tem período, outros dias estão vazios
-- Solução: Atualizar horários para Segunda-Sexta (manter Sábado/Domingo como folga)

UPDATE horarios_funcionamento 
SET periodos = '[{"start":"09:00","end":"17:00"}]', updated_at = NOW()
WHERE agente_id = 27 AND unidade_id = 40 AND dia_semana IN (1, 2, 3, 4) AND periodos = '[]';

-- Manter sexta como está (já tem período)
-- Domingo e Sábado permanecem como folga (periodos = [])

-- 3. EZEQUIEL RIBEIRO (ID: 23) - Faltam horários para Unidades 2 e 4
-- Solução: Criar horários para Unidades 2 e 4

-- 3.1. Criar horários para Unidade 2 (ID: 43)
INSERT INTO horarios_funcionamento (agente_id, unidade_id, dia_semana, ativo, periodos, created_at, updated_at)
VALUES
  (23, 43, 0, false, '[]', NOW(), NOW()),
  (23, 43, 1, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 43, 2, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 43, 3, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 43, 4, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 43, 5, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 43, 6, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW());

-- 3.2. Criar horários para Unidade 4 (ID: 45)
INSERT INTO horarios_funcionamento (agente_id, unidade_id, dia_semana, ativo, periodos, created_at, updated_at)
VALUES
  (23, 45, 0, false, '[]', NOW(), NOW()),
  (23, 45, 1, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 45, 2, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 45, 3, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 45, 4, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 45, 5, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (23, 45, 6, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW());

-- 4. VALNIRA RIBEIRO (ID: 32) - Faltam horários para Unidade 4
-- Solução: Criar horários para Unidade 4

INSERT INTO horarios_funcionamento (agente_id, unidade_id, dia_semana, ativo, periodos, created_at, updated_at)
VALUES
  (32, 45, 0, false, '[]', NOW(), NOW()),
  (32, 45, 1, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (32, 45, 2, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (32, 45, 3, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (32, 45, 4, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (32, 45, 5, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW()),
  (32, 45, 6, true, '[{"start":"09:00","end":"17:00"}]', NOW(), NOW());

-- 5. CORRIGIR NOMES DE EXIBIÇÃO
UPDATE agentes SET nome_exibicao = 'Lucas Andrade', updated_at = NOW() WHERE id = 25;
UPDATE agentes SET nome_exibicao = 'Marcelo Martins', updated_at = NOW() WHERE id = 27;
UPDATE agentes SET nome_exibicao = 'Valnira Ribeiro', updated_at = NOW() WHERE id = 32;

-- ========================================
-- VERIFICAÇÃO PÓS-CORREÇÃO
-- ========================================

-- Verificar horários de todos os agentes
SELECT 
  a.id as agente_id,
  a.nome as agente_nome,
  u.id as unidade_id,
  u.nome as unidade_nome,
  COUNT(hf.id) as total_dias_cadastrados,
  SUM(CASE WHEN hf.ativo AND jsonb_array_length(hf.periodos::jsonb) > 0 THEN 1 ELSE 0 END) as dias_com_horarios
FROM agentes a
JOIN agente_unidades au ON a.id = au.agente_id
JOIN unidades u ON au.unidade_id = u.id
LEFT JOIN horarios_funcionamento hf ON a.id = hf.agente_id AND u.id = hf.unidade_id
WHERE u.usuario_id = 124
GROUP BY a.id, a.nome, u.id, u.nome
ORDER BY a.nome, u.nome;

-- Resultado esperado:
-- Cada agente deve ter 7 dias cadastrados para cada unidade onde trabalha
-- dias_com_horarios deve ser >= 1 (pelo menos 1 dia com horário)

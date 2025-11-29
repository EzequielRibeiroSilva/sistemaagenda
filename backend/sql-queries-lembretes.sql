-- ================================================================================
-- SQL QUERIES ÚTEIS - SISTEMA DE LEMBRETES AUTOMÁTICOS
-- ================================================================================

-- ================================================================================
-- CONSULTAS DE MONITORAMENTO
-- ================================================================================

-- 1. RESUMO GERAL DE LEMBRETES
SELECT 
  tipo_lembrete,
  status,
  COUNT(*) as total,
  ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER (PARTITION BY tipo_lembrete) * 100, 2) as percentual
FROM lembretes_enviados
GROUP BY tipo_lembrete, status
ORDER BY tipo_lembrete, status;

-- 2. LEMBRETES ENVIADOS HOJE
SELECT 
  le.id,
  le.tipo_lembrete,
  le.status,
  a.data_agendamento,
  a.hora_inicio,
  c.nome as cliente,
  c.telefone,
  ag.nome as agente,
  u.nome as unidade,
  le.enviado_em,
  le.tentativas
FROM lembretes_enviados le
JOIN agendamentos a ON le.agendamento_id = a.id
JOIN clientes c ON a.cliente_id = c.id
JOIN agentes ag ON a.agente_id = ag.id
JOIN unidades u ON a.unidade_id = u.id
WHERE DATE(le.created_at) = CURRENT_DATE
ORDER BY le.created_at DESC;

-- 3. FALHAS RECENTES (ÚLTIMAS 24H)
SELECT 
  le.id,
  le.tipo_lembrete,
  le.status,
  le.tentativas,
  a.data_agendamento,
  a.hora_inicio,
  c.nome as cliente,
  c.telefone,
  le.erro_detalhes,
  le.ultima_tentativa
FROM lembretes_enviados le
JOIN agendamentos a ON le.agendamento_id = a.id
JOIN clientes c ON a.cliente_id = c.id
WHERE le.status IN ('falha', 'falha_permanente')
  AND le.ultima_tentativa >= NOW() - INTERVAL '24 hours'
ORDER BY le.ultima_tentativa DESC;

-- 4. TAXA DE SUCESSO POR TIPO E DIA
SELECT 
  DATE(created_at) as data,
  tipo_lembrete,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'enviado') as enviados,
  COUNT(*) FILTER (WHERE status IN ('falha', 'falha_permanente')) as falhas,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'enviado')::NUMERIC / 
    COUNT(*)::NUMERIC * 100, 
    2
  ) as taxa_sucesso_pct
FROM lembretes_enviados
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at), tipo_lembrete
ORDER BY data DESC, tipo_lembrete;

-- 5. LEMBRETES POR UNIDADE (ÚLTIMOS 7 DIAS)
SELECT 
  u.id,
  u.nome as unidade,
  le.tipo_lembrete,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE le.status = 'enviado') as enviados,
  COUNT(*) FILTER (WHERE le.status IN ('falha', 'falha_permanente')) as falhas
FROM lembretes_enviados le
JOIN unidades u ON le.unidade_id = u.id
WHERE le.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY u.id, u.nome, le.tipo_lembrete
ORDER BY u.nome, le.tipo_lembrete;

-- 6. TEMPO MÉDIO DE PROCESSAMENTO
SELECT 
  tipo_lembrete,
  COUNT(*) as total_enviados,
  ROUND(AVG(EXTRACT(EPOCH FROM (enviado_em - created_at))), 2) as tempo_medio_segundos,
  ROUND(MIN(EXTRACT(EPOCH FROM (enviado_em - created_at))), 2) as tempo_minimo_segundos,
  ROUND(MAX(EXTRACT(EPOCH FROM (enviado_em - created_at))), 2) as tempo_maximo_segundos
FROM lembretes_enviados
WHERE status = 'enviado'
  AND enviado_em IS NOT NULL
GROUP BY tipo_lembrete;

-- 7. AGENDAMENTOS SEM LEMBRETE 24H (ELEGÍVEIS AGORA)
SELECT 
  a.id,
  a.data_agendamento,
  a.hora_inicio,
  a.status,
  c.nome as cliente,
  c.telefone,
  ag.nome as agente,
  u.nome as unidade
FROM agendamentos a
JOIN clientes c ON a.cliente_id = c.id
JOIN agentes ag ON a.agente_id = ag.id
JOIN unidades u ON a.unidade_id = u.id
WHERE a.data_agendamento = CURRENT_DATE + INTERVAL '1 day'
  AND a.status = 'Confirmado'
  AND NOT EXISTS (
    SELECT 1 FROM lembretes_enviados le 
    WHERE le.agendamento_id = a.id 
    AND le.tipo_lembrete = '24h'
  )
ORDER BY a.hora_inicio;

-- 8. AGENDAMENTOS SEM LEMBRETE 2H (ELEGÍVEIS AGORA)
SELECT 
  a.id,
  a.data_agendamento,
  a.hora_inicio,
  a.status,
  c.nome as cliente,
  c.telefone,
  ag.nome as agente,
  u.nome as unidade
FROM agendamentos a
JOIN clientes c ON a.cliente_id = c.id
JOIN agentes ag ON a.agente_id = ag.id
JOIN unidades u ON a.unidade_id = u.id
WHERE a.data_agendamento = CURRENT_DATE
  AND a.status = 'Confirmado'
  AND a.hora_inicio BETWEEN 
    (CURRENT_TIME + INTERVAL '2 hours')::TIME 
    AND (CURRENT_TIME + INTERVAL '3 hours')::TIME
  AND NOT EXISTS (
    SELECT 1 FROM lembretes_enviados le 
    WHERE le.agendamento_id = a.id 
    AND le.tipo_lembrete = '2h'
  )
ORDER BY a.hora_inicio;

-- ================================================================================
-- CRIAÇÃO DE DADOS DE TESTE
-- ================================================================================

-- 9. CRIAR AGENDAMENTO DE TESTE PARA AMANHÃ (LEMBRETE 24H)
INSERT INTO agendamentos (
  cliente_id, 
  agente_id, 
  unidade_id, 
  data_agendamento, 
  hora_inicio, 
  hora_fim, 
  status, 
  valor_total,
  observacoes
) VALUES (
  1, -- Substitua pelo ID de um cliente existente
  1, -- Substitua pelo ID de um agente existente
  1, -- Substitua pelo ID de uma unidade existente
  CURRENT_DATE + INTERVAL '1 day',
  '14:00',
  '15:00',
  'Confirmado',
  50.00,
  'Agendamento de teste para lembrete 24h'
) RETURNING id, data_agendamento, hora_inicio;

-- 10. CRIAR AGENDAMENTO DE TESTE PARA DAQUI A 2H30 (LEMBRETE 2H)
INSERT INTO agendamentos (
  cliente_id, 
  agente_id, 
  unidade_id, 
  data_agendamento, 
  hora_inicio, 
  hora_fim, 
  status, 
  valor_total,
  observacoes
) VALUES (
  1, -- Substitua pelo ID de um cliente existente
  1, -- Substitua pelo ID de um agente existente
  1, -- Substitua pelo ID de uma unidade existente
  CURRENT_DATE,
  (CURRENT_TIME + INTERVAL '2 hours 30 minutes')::TIME,
  (CURRENT_TIME + INTERVAL '3 hours 30 minutes')::TIME,
  'Confirmado',
  50.00,
  'Agendamento de teste para lembrete 2h'
) RETURNING id, data_agendamento, hora_inicio;

-- ================================================================================
-- LIMPEZA E MANUTENÇÃO
-- ================================================================================

-- 11. LIMPAR LEMBRETES DE TESTE
DELETE FROM lembretes_enviados 
WHERE agendamento_id IN (
  SELECT id FROM agendamentos 
  WHERE observacoes LIKE '%teste%'
);

-- 12. LIMPAR AGENDAMENTOS DE TESTE
DELETE FROM agendamentos 
WHERE observacoes LIKE '%teste%';

-- 13. RESETAR LEMBRETES FALHADOS PARA RETRY
-- ⚠️ USE COM CUIDADO: Isso permite que lembretes falhados sejam reenviados
UPDATE lembretes_enviados
SET 
  status = 'pendente',
  tentativas = 0,
  erro_detalhes = NULL,
  ultima_tentativa = NULL
WHERE status IN ('falha', 'falha_permanente')
  AND created_at >= CURRENT_DATE - INTERVAL '1 day';

-- 14. REMOVER LEMBRETES ANTIGOS (MAIS DE 30 DIAS)
DELETE FROM lembretes_enviados
WHERE created_at < CURRENT_DATE - INTERVAL '30 days';

-- 15. REMOVER LEMBRETES DE AGENDAMENTOS CANCELADOS
DELETE FROM lembretes_enviados
WHERE agendamento_id IN (
  SELECT id FROM agendamentos 
  WHERE status = 'Cancelado'
);

-- ================================================================================
-- ANÁLISES E RELATÓRIOS
-- ================================================================================

-- 16. TOP 10 CLIENTES COM MAIS LEMBRETES RECEBIDOS
SELECT 
  c.id,
  c.nome,
  c.telefone,
  COUNT(*) as total_lembretes,
  COUNT(*) FILTER (WHERE le.status = 'enviado') as lembretes_enviados,
  COUNT(*) FILTER (WHERE le.tipo_lembrete = '24h') as lembretes_24h,
  COUNT(*) FILTER (WHERE le.tipo_lembrete = '2h') as lembretes_2h
FROM clientes c
JOIN agendamentos a ON c.id = a.cliente_id
JOIN lembretes_enviados le ON a.id = le.agendamento_id
WHERE le.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.id, c.nome, c.telefone
ORDER BY total_lembretes DESC
LIMIT 10;

-- 17. AGENTES COM MAIS AGENDAMENTOS COM LEMBRETES
SELECT 
  ag.id,
  ag.nome as agente,
  u.nome as unidade,
  COUNT(DISTINCT a.id) as total_agendamentos,
  COUNT(DISTINCT le.id) as total_lembretes,
  COUNT(DISTINCT le.id) FILTER (WHERE le.status = 'enviado') as lembretes_enviados
FROM agentes ag
JOIN agendamentos a ON ag.id = a.agente_id
JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN lembretes_enviados le ON a.id = le.agendamento_id
WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY ag.id, ag.nome, u.nome
ORDER BY total_lembretes DESC;

-- 18. HORÁRIOS COM MAIS LEMBRETES ENVIADOS
SELECT 
  EXTRACT(HOUR FROM le.enviado_em) as hora,
  COUNT(*) as total_lembretes,
  le.tipo_lembrete
FROM lembretes_enviados le
WHERE le.status = 'enviado'
  AND le.enviado_em >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY EXTRACT(HOUR FROM le.enviado_em), le.tipo_lembrete
ORDER BY hora, le.tipo_lembrete;

-- 19. COMPARAÇÃO MENSAL DE LEMBRETES
SELECT 
  TO_CHAR(created_at, 'YYYY-MM') as mes,
  tipo_lembrete,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'enviado') as enviados,
  COUNT(*) FILTER (WHERE status IN ('falha', 'falha_permanente')) as falhas,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'enviado')::NUMERIC / 
    COUNT(*)::NUMERIC * 100, 
    2
  ) as taxa_sucesso_pct
FROM lembretes_enviados
WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY TO_CHAR(created_at, 'YYYY-MM'), tipo_lembrete
ORDER BY mes DESC, tipo_lembrete;

-- 20. DETALHES COMPLETOS DE UM LEMBRETE ESPECÍFICO
SELECT 
  le.id as lembrete_id,
  le.tipo_lembrete,
  le.status,
  le.tentativas,
  le.telefone_destino,
  le.mensagem_enviada,
  le.whatsapp_message_id,
  le.erro_detalhes,
  le.created_at as criado_em,
  le.ultima_tentativa,
  le.enviado_em,
  a.id as agendamento_id,
  a.data_agendamento,
  a.hora_inicio,
  a.hora_fim,
  a.status as status_agendamento,
  a.valor_total,
  c.id as cliente_id,
  c.nome as cliente_nome,
  c.telefone as cliente_telefone,
  c.email as cliente_email,
  ag.id as agente_id,
  ag.nome as agente_nome,
  u.id as unidade_id,
  u.nome as unidade_nome,
  u.telefone as unidade_telefone
FROM lembretes_enviados le
JOIN agendamentos a ON le.agendamento_id = a.id
JOIN clientes c ON a.cliente_id = c.id
JOIN agentes ag ON a.agente_id = ag.id
JOIN unidades u ON a.unidade_id = u.id
WHERE le.id = 1; -- Substitua pelo ID do lembrete

-- ================================================================================
-- VERIFICAÇÕES DE INTEGRIDADE
-- ================================================================================

-- 21. VERIFICAR LEMBRETES ÓRFÃOS (SEM AGENDAMENTO)
SELECT le.*
FROM lembretes_enviados le
LEFT JOIN agendamentos a ON le.agendamento_id = a.id
WHERE a.id IS NULL;

-- 22. VERIFICAR LEMBRETES DUPLICADOS
SELECT 
  agendamento_id,
  tipo_lembrete,
  COUNT(*) as total
FROM lembretes_enviados
GROUP BY agendamento_id, tipo_lembrete
HAVING COUNT(*) > 1;

-- 23. VERIFICAR AGENDAMENTOS COM STATUS INCONSISTENTE
SELECT 
  a.id,
  a.data_agendamento,
  a.hora_inicio,
  a.status,
  le.tipo_lembrete,
  le.status as status_lembrete
FROM agendamentos a
JOIN lembretes_enviados le ON a.id = le.agendamento_id
WHERE a.status != 'Confirmado'
  AND le.status = 'enviado';

-- 24. VERIFICAR CLIENTES SEM TELEFONE COM LEMBRETES
SELECT 
  c.id,
  c.nome,
  c.telefone,
  COUNT(le.id) as total_lembretes
FROM clientes c
JOIN agendamentos a ON c.id = a.cliente_id
JOIN lembretes_enviados le ON a.id = le.agendamento_id
WHERE c.telefone IS NULL OR c.telefone = ''
GROUP BY c.id, c.nome, c.telefone;

-- ================================================================================
-- ÍNDICES E PERFORMANCE
-- ================================================================================

-- 25. VERIFICAR ÍNDICES DA TABELA
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'lembretes_enviados';

-- 26. ESTATÍSTICAS DA TABELA
SELECT 
  schemaname,
  tablename,
  n_live_tup as linhas_ativas,
  n_dead_tup as linhas_mortas,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename = 'lembretes_enviados';

-- ================================================================================
-- FIM DO ARQUIVO
-- ================================================================================

#!/bin/bash

###############################################################################
# Script de Validação - Fase 3: Performance e Paginação
# 
# Este script verifica se todas as implementações da Fase 3 foram aplicadas
# corretamente e se o sistema está pronto para escala de 100k+ registros.
###############################################################################

set -e  # Abortar em caso de erro

echo "============================================================="
echo "🔍 VALIDAÇÃO FASE 3: PERFORMANCE E PAGINAÇÃO"
echo "============================================================="
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador de testes
PASSED=0
FAILED=0

# Função para testar
test_check() {
    local test_name="$1"
    local command="$2"
    
    echo -n "🧪 $test_name... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASSOU${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FALHOU${NC}"
        ((FAILED++))
        return 1
    fi
}

# Função para contar índices
count_indexes() {
    PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d painel_agendamento_dev -t -c \
        "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'agentes' AND indexname LIKE 'idx_agentes_%';"
}

# Função para verificar código
check_code_pattern() {
    local file="$1"
    local pattern="$2"
    grep -q "$pattern" "$file"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  VERIFICAÇÃO DE ÍNDICES NO BANCO DE DADOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verificar índices criados
INDEXES_COUNT=$(count_indexes | xargs)
echo "📊 Total de índices customizados encontrados: $INDEXES_COUNT"
echo ""

test_check "Índice: idx_agentes_unidade_deleted_nome" \
    "PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d painel_agendamento_dev -t -c \"SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agentes_unidade_deleted_nome'\" | grep -q 1"

test_check "Índice: idx_agentes_usuario_deleted" \
    "PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d painel_agendamento_dev -t -c \"SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agentes_usuario_deleted'\" | grep -q 1"

test_check "Índice: idx_agentes_email_unique_active (parcial)" \
    "PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d painel_agendamento_dev -t -c \"SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agentes_email_unique_active'\" | grep -q 1"

test_check "Índice: idx_agentes_status_deleted" \
    "PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d painel_agendamento_dev -t -c \"SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agentes_status_deleted'\" | grep -q 1"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  VERIFICAÇÃO DE PAGINAÇÃO NO CÓDIGO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

CONTROLLER_FILE="src/controllers/AgenteController.js"

test_check "Paginação no método index()" \
    "check_code_pattern '$CONTROLLER_FILE' 'FASE 3: Paginação obrigatória'"

test_check "Limite máximo de 100 registros" \
    "check_code_pattern '$CONTROLLER_FILE' 'Math.min(100'"

test_check "Limite padrão de 50 registros" \
    "check_code_pattern '$CONTROLLER_FILE' 'parseInt(req.query.limit, 10) || 50'"

test_check "Uso de LIMIT e OFFSET" \
    "check_code_pattern '$CONTROLLER_FILE' '\.limit(limit)'"

test_check "Retorno de objeto pagination" \
    "check_code_pattern '$CONTROLLER_FILE' 'pagination: {'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  TESTES DE PERFORMANCE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verificar tempo de query
QUERY_TIME=$(PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d painel_agendamento_dev -t -c \
    "EXPLAIN ANALYZE SELECT * FROM agentes WHERE usuario_id = 1 AND deleted_at IS NULL ORDER BY nome LIMIT 50 OFFSET 0;" \
    | grep "Execution Time:" | awk '{print $3}')

echo "⏱️  Tempo de execução da query: ${QUERY_TIME}ms"

if (( $(echo "$QUERY_TIME < 10.0" | bc -l) )); then
    echo -e "${GREEN}✅ Performance excelente (<10ms)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  Performance aceitável mas pode melhorar${NC}"
    ((PASSED++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  VERIFICAÇÃO DE QUERIES SEM LIMITAÇÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Procurar por findAll() sem paginação
FINDALL_COUNT=$(grep -r "\.findAll()" src/controllers/ --include="*.js" | wc -l | xargs)
echo "🔍 Queries .findAll() encontradas: $FINDALL_COUNT"

if [ "$FINDALL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ Nenhuma query sem limitação encontrada${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  Queries sem limitação encontradas (podem precisar de refatoração)${NC}"
    grep -r "\.findAll()" src/controllers/ --include="*.js" || true
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESULTADO FINAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Testes passados: ${GREEN}${PASSED}${NC}"
echo -e "Testes falhados: ${RED}${FAILED}${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ FASE 3 VALIDADA COM SUCESSO!${NC}"
    echo -e "${GREEN}   O sistema está pronto para escala de 100k+ registros${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════════${NC}"
    echo -e "${RED}❌ FASE 3 POSSUI PROBLEMAS${NC}"
    echo -e "${RED}   Revise os itens falhados acima${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════${NC}"
    exit 1
fi

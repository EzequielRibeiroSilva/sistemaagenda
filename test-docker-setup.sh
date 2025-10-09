#!/bin/bash

# Script de Teste da Configuração Docker
# Valida arquivos e configurações sem executar containers

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Função para imprimir mensagens coloridas
print_message() {
    echo -e "${2}${1}${NC}"
}

# Banner
print_message "🧪 TESTE DA CONFIGURAÇÃO DOCKER" $CYAN
print_message "===============================" $CYAN
print_message "📦 Validação de Arquivos e Configurações" $BLUE
print_message "" $NC

# Contador de testes
TESTS_PASSED=0
TESTS_TOTAL=0

# Função para executar teste
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    print_message "🔍 Testando: $test_name" $YELLOW
    
    if eval "$test_command"; then
        print_message "✅ PASSOU: $test_name" $GREEN
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        print_message "❌ FALHOU: $test_name" $RED
    fi
    echo
}

# Teste 1: Verificar docker-compose.yml
run_test "docker-compose.yml existe" "[ -f 'docker-compose.yml' ]"

# Teste 2: Verificar Dockerfiles
run_test "Dockerfile backend existe" "[ -f 'backend/Dockerfile' ]"
run_test "Dockerfile frontend existe" "[ -f 'Dockerfile.frontend' ]"

# Teste 3: Verificar scripts
run_test "start.sh existe e é executável" "[ -x 'start.sh' ]"
run_test "stop.sh existe e é executável" "[ -x 'stop.sh' ]"
run_test "check-requirements.sh existe e é executável" "[ -x 'check-requirements.sh' ]"

# Teste 4: Verificar .dockerignore
run_test ".dockerignore existe" "[ -f '.dockerignore' ]"
run_test "backend/.dockerignore existe" "[ -f 'backend/.dockerignore' ]"

# Teste 5: Validar sintaxe do docker-compose.yml
if command -v python3 > /dev/null 2>&1; then
    run_test "docker-compose.yml tem sintaxe YAML válida" "python3 -c 'import yaml; yaml.safe_load(open(\"docker-compose.yml\"))'"
else
    print_message "⚠️  Python3 não encontrado - pulando validação YAML" $YELLOW
fi

# Teste 6: Verificar estrutura do docker-compose.yml
run_test "docker-compose.yml contém serviço 'db'" "grep -q 'db:' docker-compose.yml"
run_test "docker-compose.yml contém serviço 'backend'" "grep -q 'backend:' docker-compose.yml"
run_test "docker-compose.yml contém serviço 'frontend'" "grep -q 'frontend:' docker-compose.yml"

# Teste 7: Verificar portas no docker-compose.yml
run_test "docker-compose.yml mapeia porta 5432 (PostgreSQL)" "grep -q '5432:5432' docker-compose.yml"
run_test "docker-compose.yml mapeia porta 3000 (Backend)" "grep -q '3000:3000' docker-compose.yml"
run_test "docker-compose.yml mapeia porta 5173 (Frontend)" "grep -q '5173:5173' docker-compose.yml"

# Teste 8: Verificar volumes
run_test "docker-compose.yml define volume postgres_data" "grep -q 'postgres_data:' docker-compose.yml"

# Teste 9: Verificar rede
run_test "docker-compose.yml define rede painel_network" "grep -q 'painel_network:' docker-compose.yml"

# Teste 10: Verificar dependências nos Dockerfiles
run_test "Dockerfile backend usa imagem Node.js" "grep -q 'FROM node:' backend/Dockerfile"
run_test "Dockerfile frontend usa imagem Node.js" "grep -q 'FROM node:' Dockerfile.frontend"

# Teste 11: Verificar comandos nos Dockerfiles
run_test "Dockerfile backend instala curl" "grep -q 'curl' backend/Dockerfile"
run_test "Dockerfile frontend instala curl" "grep -q 'curl' Dockerfile.frontend"

# Teste 12: Verificar estrutura de pastas necessárias
run_test "Pasta backend/src existe" "[ -d 'backend/src' ]"
run_test "Arquivo backend/package.json existe" "[ -f 'backend/package.json' ]"
run_test "Arquivo package.json (frontend) existe" "[ -f 'package.json' ]"

# Teste 13: Verificar configurações de ambiente
run_test "docker-compose.yml define PG_HOST=db" "grep -q 'PG_HOST: db' docker-compose.yml"
run_test "docker-compose.yml define NODE_ENV=development" "grep -q 'NODE_ENV: development' docker-compose.yml"

# Teste 14: Verificar healthchecks
run_test "docker-compose.yml define healthcheck para db" "grep -A5 'healthcheck:' docker-compose.yml | grep -q 'pg_isready'"
run_test "docker-compose.yml define healthcheck para backend" "grep -A5 'healthcheck:' docker-compose.yml | grep -q 'curl.*health'"

# Teste 15: Verificar scripts têm shebang correto
run_test "start.sh tem shebang bash" "head -1 start.sh | grep -q '#!/bin/bash'"
run_test "stop.sh tem shebang bash" "head -1 stop.sh | grep -q '#!/bin/bash'"

# Teste 16: Verificar se scripts têm funções essenciais
run_test "start.sh verifica Docker" "grep -q 'check_docker' start.sh"
run_test "stop.sh verifica Docker" "grep -q 'check_docker' stop.sh"

# Teste 17: Verificar documentação
run_test "DOCKER_README.md existe" "[ -f 'DOCKER_README.md' ]"

# Resultados finais
print_message "📊 RESULTADOS DOS TESTES:" $CYAN
print_message "========================" $CYAN
print_message "✅ Testes Passaram: $TESTS_PASSED" $GREEN
print_message "📊 Total de Testes: $TESTS_TOTAL" $BLUE

if [ $TESTS_PASSED -eq $TESTS_TOTAL ]; then
    print_message "" $NC
    print_message "🎉 TODOS OS TESTES PASSARAM!" $GREEN
    print_message "✨ Configuração Docker está correta" $GREEN
    print_message "" $NC
    print_message "📋 Próximos passos:" $CYAN
    print_message "   1. Instale o Docker Desktop" $BLUE
    print_message "   2. Execute: ./check-requirements.sh" $BLUE
    print_message "   3. Execute: ./start.sh" $BLUE
    print_message "" $NC
    exit 0
else
    TESTS_FAILED=$((TESTS_TOTAL - TESTS_PASSED))
    print_message "❌ Testes Falharam: $TESTS_FAILED" $RED
    print_message "" $NC
    print_message "🔧 Corrija os problemas identificados antes de prosseguir" $YELLOW
    exit 1
fi

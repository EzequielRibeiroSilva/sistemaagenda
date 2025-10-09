#!/bin/bash

# Script para validar docker-compose.yml sem dependências Python

set -e

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_message() {
    echo -e "${2}${1}${NC}"
}

print_message "🔍 Validando docker-compose.yml..." $YELLOW

# Verificar se arquivo existe
if [ ! -f "docker-compose.yml" ]; then
    print_message "❌ docker-compose.yml não encontrado!" $RED
    exit 1
fi

# Validação básica de sintaxe YAML (sem Python)
# Verificar se não há tabs (YAML não permite)
if grep -q $'\t' docker-compose.yml; then
    print_message "❌ docker-compose.yml contém tabs (use espaços)" $RED
    exit 1
fi

# Verificar estrutura básica
REQUIRED_SECTIONS=("version:" "services:" "volumes:" "networks:")
for section in "${REQUIRED_SECTIONS[@]}"; do
    if ! grep -q "^$section" docker-compose.yml; then
        print_message "❌ Seção '$section' não encontrada" $RED
        exit 1
    fi
done

# Verificar serviços obrigatórios
REQUIRED_SERVICES=("db:" "backend:" "frontend:")
for service in "${REQUIRED_SERVICES[@]}"; do
    if ! grep -q "^  $service" docker-compose.yml; then
        print_message "❌ Serviço '$service' não encontrado" $RED
        exit 1
    fi
done

print_message "✅ docker-compose.yml parece válido!" $GREEN

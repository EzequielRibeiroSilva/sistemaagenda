#!/bin/bash

# Script de Verificação de Pré-requisitos
# Painel de Agendamento - Ambiente Docker

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
print_message "🔍 VERIFICAÇÃO DE PRÉ-REQUISITOS" $CYAN
print_message "================================" $CYAN
print_message "📦 Painel de Agendamento - Docker Environment" $BLUE
print_message "" $NC

# Verificar Docker
print_message "🐳 Verificando Docker..." $YELLOW
if command -v docker > /dev/null 2>&1; then
    DOCKER_VERSION=$(docker --version)
    print_message "✅ Docker encontrado: $DOCKER_VERSION" $GREEN
    
    # Verificar se Docker está rodando
    if docker info > /dev/null 2>&1; then
        print_message "✅ Docker está rodando" $GREEN
    else
        print_message "⚠️  Docker está instalado mas não está rodando" $YELLOW
        print_message "   💡 Inicie o Docker Desktop" $BLUE
    fi
else
    print_message "❌ Docker não encontrado" $RED
    print_message "" $NC
    print_message "📥 INSTALAÇÃO DO DOCKER:" $CYAN
    print_message "   🍎 macOS: https://docs.docker.com/desktop/mac/install/" $BLUE
    print_message "   🐧 Linux: https://docs.docker.com/engine/install/" $BLUE
    print_message "   🪟 Windows: https://docs.docker.com/desktop/windows/install/" $BLUE
    print_message "" $NC
fi

# Verificar Docker Compose
print_message "🔧 Verificando Docker Compose..." $YELLOW
if command -v docker-compose > /dev/null 2>&1; then
    COMPOSE_VERSION=$(docker-compose --version)
    print_message "✅ Docker Compose encontrado: $COMPOSE_VERSION" $GREEN
elif docker compose version > /dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version)
    print_message "✅ Docker Compose (plugin) encontrado: $COMPOSE_VERSION" $GREEN
else
    print_message "❌ Docker Compose não encontrado" $RED
    print_message "   💡 Docker Compose geralmente vem com Docker Desktop" $BLUE
fi

# Verificar Node.js
print_message "📦 Verificando Node.js..." $YELLOW
if command -v node > /dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    print_message "✅ Node.js encontrado: $NODE_VERSION" $GREEN
    
    # Verificar versão mínima (18+)
    NODE_MAJOR=$(node --version | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -ge 18 ]; then
        print_message "✅ Versão do Node.js é compatível (>=18)" $GREEN
    else
        print_message "⚠️  Versão do Node.js pode ser incompatível (recomendado >=18)" $YELLOW
    fi
else
    print_message "❌ Node.js não encontrado" $RED
    print_message "   📥 Instale em: https://nodejs.org/" $BLUE
fi

# Verificar npm
print_message "📦 Verificando npm..." $YELLOW
if command -v npm > /dev/null 2>&1; then
    NPM_VERSION=$(npm --version)
    print_message "✅ npm encontrado: v$NPM_VERSION" $GREEN
else
    print_message "❌ npm não encontrado" $RED
fi

# Verificar Git
print_message "📝 Verificando Git..." $YELLOW
if command -v git > /dev/null 2>&1; then
    GIT_VERSION=$(git --version)
    print_message "✅ Git encontrado: $GIT_VERSION" $GREEN
else
    print_message "❌ Git não encontrado" $RED
    print_message "   📥 Instale em: https://git-scm.com/" $BLUE
fi

# Verificar curl
print_message "🌐 Verificando curl..." $YELLOW
if command -v curl > /dev/null 2>&1; then
    print_message "✅ curl encontrado" $GREEN
else
    print_message "❌ curl não encontrado" $RED
    print_message "   💡 Necessário para health checks" $BLUE
fi

# Verificar portas disponíveis
print_message "🔌 Verificando portas..." $YELLOW
check_port() {
    local port=$1
    local service=$2
    if lsof -i :$port > /dev/null 2>&1; then
        print_message "⚠️  Porta $port ($service) está em uso" $YELLOW
    else
        print_message "✅ Porta $port ($service) está disponível" $GREEN
    fi
}

check_port 3000 "Backend"
check_port 5173 "Frontend"
check_port 5432 "PostgreSQL"

# Resumo
print_message "" $NC
print_message "📊 RESUMO:" $CYAN
print_message "=========" $CYAN

# Verificar se todos os requisitos estão atendidos
ALL_OK=true

if ! command -v docker > /dev/null 2>&1; then
    print_message "❌ Docker: Não instalado" $RED
    ALL_OK=false
else
    if docker info > /dev/null 2>&1; then
        print_message "✅ Docker: Instalado e rodando" $GREEN
    else
        print_message "⚠️  Docker: Instalado mas não está rodando" $YELLOW
        ALL_OK=false
    fi
fi

if command -v docker-compose > /dev/null 2>&1 || docker compose version > /dev/null 2>&1; then
    print_message "✅ Docker Compose: Disponível" $GREEN
else
    print_message "❌ Docker Compose: Não disponível" $RED
    ALL_OK=false
fi

if command -v node > /dev/null 2>&1; then
    print_message "✅ Node.js: Instalado" $GREEN
else
    print_message "❌ Node.js: Não instalado" $RED
    ALL_OK=false
fi

print_message "" $NC

if [ "$ALL_OK" = true ]; then
    print_message "🎉 TODOS OS PRÉ-REQUISITOS ATENDIDOS!" $GREEN
    print_message "✨ Você pode executar: ./start.sh" $CYAN
else
    print_message "⚠️  ALGUNS PRÉ-REQUISITOS NÃO ATENDIDOS" $YELLOW
    print_message "🔧 Instale os componentes faltantes antes de continuar" $BLUE
fi

print_message "" $NC

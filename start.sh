#!/bin/bash

# Script de Inicialização do Ambiente de Desenvolvimento
# Painel de Agendamento - Frontend + Backend + PostgreSQL

set -e  # Parar execução em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Função para imprimir mensagens coloridas
print_message() {
    echo -e "${2}${1}${NC}"
}

# Função para verificar se Docker está rodando
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_message "❌ Docker não está rodando. Por favor, inicie o Docker Desktop." $RED
        exit 1
    fi
}

# Função para verificar se docker-compose está disponível
check_docker_compose() {
    if ! command -v docker-compose > /dev/null 2>&1 && ! docker compose version > /dev/null 2>&1; then
        print_message "❌ Docker Compose não está disponível." $RED
        exit 1
    fi
}

# Banner de inicialização
print_message "🚀 INICIANDO AMBIENTE DE DESENVOLVIMENTO" $CYAN
print_message "=========================================" $CYAN
print_message "📦 Painel de Agendamento - Full Stack" $BLUE
print_message "🔧 Frontend (React/Vite) + Backend (Node.js) + PostgreSQL" $BLUE
print_message "" $NC

# Verificações pré-requisitos
print_message "🔍 Verificando pré-requisitos..." $YELLOW
check_docker
check_docker_compose
print_message "✅ Docker está rodando" $GREEN
print_message "✅ Docker Compose está disponível" $GREEN

# Verificar se arquivo docker-compose.yml existe
if [ ! -f "docker-compose.yml" ]; then
    print_message "❌ Arquivo docker-compose.yml não encontrado!" $RED
    exit 1
fi

print_message "✅ Arquivo docker-compose.yml encontrado" $GREEN
print_message "" $NC

# Parar containers existentes (se houver)
print_message "🛑 Parando containers existentes (se houver)..." $YELLOW
docker-compose down > /dev/null 2>&1 || docker compose down > /dev/null 2>&1 || true

# Construir e iniciar os serviços
print_message "🏗️  Construindo e iniciando os serviços..." $YELLOW
print_message "   📊 PostgreSQL Database" $PURPLE
print_message "   🔧 Backend Node.js API" $PURPLE  
print_message "   🎨 Frontend React/Vite" $PURPLE
print_message "" $NC

# Usar docker-compose ou docker compose dependendo da versão
if command -v docker-compose > /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

# Executar docker compose up
$COMPOSE_CMD up --build -d

# Verificar se os containers subiram
print_message "⏳ Aguardando containers iniciarem..." $YELLOW
sleep 5

# Verificar status dos containers
print_message "📋 Status dos containers:" $BLUE
$COMPOSE_CMD ps

# Aguardar serviços ficarem saudáveis
print_message "" $NC
print_message "🏥 Verificando saúde dos serviços..." $YELLOW

# Aguardar PostgreSQL
print_message "   📊 Aguardando PostgreSQL..." $PURPLE
timeout=60
counter=0
while [ $counter -lt $timeout ]; do
    if docker exec painel_agendamento_db pg_isready -U postgres -d painel_agendamento_dev > /dev/null 2>&1; then
        print_message "   ✅ PostgreSQL está pronto!" $GREEN
        break
    fi
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    print_message "   ❌ Timeout aguardando PostgreSQL" $RED
fi

# Aguardar Backend
print_message "   🔧 Aguardando Backend..." $PURPLE
timeout=60
counter=0
while [ $counter -lt $timeout ]; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_message "   ✅ Backend está pronto!" $GREEN
        break
    fi
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    print_message "   ❌ Timeout aguardando Backend" $RED
fi

# Aguardar Frontend
print_message "   🎨 Aguardando Frontend..." $PURPLE
timeout=60
counter=0
while [ $counter -lt $timeout ]; do
    if curl -f http://localhost:5173 > /dev/null 2>&1; then
        print_message "   ✅ Frontend está pronto!" $GREEN
        break
    fi
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    print_message "   ❌ Timeout aguardando Frontend" $RED
fi

# Mensagem de sucesso
print_message "" $NC
print_message "🎉 AMBIENTE INICIADO COM SUCESSO!" $GREEN
print_message "=================================" $GREEN
print_message "" $NC
print_message "📱 URLs de Acesso:" $CYAN
print_message "   🎨 Frontend:  http://localhost:5173" $BLUE
print_message "   🔧 Backend:   http://localhost:3000" $BLUE
print_message "   📊 Database:  localhost:5432" $BLUE
print_message "   🏥 Health:    http://localhost:3000/health" $BLUE
print_message "" $NC
print_message "📋 Comandos Úteis:" $CYAN
print_message "   📊 Ver logs:           $COMPOSE_CMD logs -f" $YELLOW
print_message "   📊 Ver logs backend:   $COMPOSE_CMD logs -f backend" $YELLOW
print_message "   📊 Ver logs frontend:  $COMPOSE_CMD logs -f frontend" $YELLOW
print_message "   📊 Ver logs database:  $COMPOSE_CMD logs -f db" $YELLOW
print_message "   🛑 Parar ambiente:     ./stop.sh" $YELLOW
print_message "" $NC
print_message "✨ Ambiente pronto para desenvolvimento!" $GREEN

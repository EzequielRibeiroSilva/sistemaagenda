#!/bin/bash

# Script de Parada do Ambiente de Desenvolvimento
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

# Banner de parada
print_message "🛑 PARANDO AMBIENTE DE DESENVOLVIMENTO" $CYAN
print_message "======================================" $CYAN
print_message "📦 Painel de Agendamento - Full Stack" $BLUE
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

# Usar docker-compose ou docker compose dependendo da versão
if command -v docker-compose > /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

# Verificar containers em execução
print_message "📋 Containers atualmente em execução:" $BLUE
RUNNING_CONTAINERS=$($COMPOSE_CMD ps --services --filter "status=running" 2>/dev/null || echo "")

if [ -z "$RUNNING_CONTAINERS" ]; then
    print_message "ℹ️  Nenhum container do projeto está em execução." $YELLOW
    print_message "" $NC
    print_message "✅ Ambiente já está parado!" $GREEN
    exit 0
fi

print_message "🔍 Containers encontrados:" $PURPLE
echo "$RUNNING_CONTAINERS" | while read -r service; do
    if [ -n "$service" ]; then
        print_message "   📦 $service" $BLUE
    fi
done

print_message "" $NC

# Parar e remover containers
print_message "🛑 Parando containers..." $YELLOW
print_message "   📊 Parando PostgreSQL Database..." $PURPLE
print_message "   🔧 Parando Backend Node.js API..." $PURPLE  
print_message "   🎨 Parando Frontend React/Vite..." $PURPLE
print_message "" $NC

# Executar docker compose down
$COMPOSE_CMD down

# Verificar se containers foram removidos
print_message "🔍 Verificando se containers foram removidos..." $YELLOW
REMAINING_CONTAINERS=$($COMPOSE_CMD ps --services --filter "status=running" 2>/dev/null || echo "")

if [ -z "$REMAINING_CONTAINERS" ]; then
    print_message "✅ Todos os containers foram parados com sucesso!" $GREEN
else
    print_message "⚠️  Alguns containers ainda estão em execução:" $YELLOW
    echo "$REMAINING_CONTAINERS" | while read -r service; do
        if [ -n "$service" ]; then
            print_message "   📦 $service" $BLUE
        fi
    done
fi

# Informações sobre volumes (dados persistem)
print_message "" $NC
print_message "💾 INFORMAÇÕES IMPORTANTES:" $CYAN
print_message "   ✅ Os dados do PostgreSQL foram preservados" $GREEN
print_message "   ✅ Volume 'postgres_data' mantido para próxima inicialização" $GREEN
print_message "   ⚠️  Para remover TODOS os dados: $COMPOSE_CMD down -v" $YELLOW
print_message "" $NC

# Comandos úteis
print_message "📋 Comandos Úteis:" $CYAN
print_message "   🚀 Iniciar ambiente:        ./start.sh" $BLUE
print_message "   🗑️  Remover tudo + volumes:  $COMPOSE_CMD down -v" $YELLOW
print_message "   🧹 Limpar imagens:          docker system prune" $YELLOW
print_message "   📊 Ver volumes:             docker volume ls" $BLUE
print_message "" $NC

# Mensagem de confirmação
print_message "🎉 AMBIENTE PARADO COM SUCESSO!" $GREEN
print_message "===============================" $GREEN
print_message "" $NC
print_message "💡 Para iniciar novamente, execute: ./start.sh" $CYAN

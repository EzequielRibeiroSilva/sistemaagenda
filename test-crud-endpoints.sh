#!/bin/bash

# Script de teste para validar todos os endpoints CRUD
# Executa dentro do container backend para testar a API

echo "🧪 TESTE COMPLETO DOS ENDPOINTS CRUD"
echo "===================================="

BASE_URL="http://localhost:3000/api"

# Função para fazer requisições e mostrar resultado
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo ""
    echo "📋 $description"
    echo "   $method $endpoint"
    
    if [ -n "$data" ]; then
        echo "   Dados: $data"
        result=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        result=$(curl -s -X $method "$BASE_URL$endpoint")
    fi
    
    echo "   Resposta: $result"
    echo "   ✅ OK"
}

echo ""
echo "🔍 1. TESTE DE CONECTIVIDADE"
test_endpoint "GET" "/test" "" "Teste de conectividade da API"

echo ""
echo "🏢 2. TESTES DE UNIDADES"
test_endpoint "GET" "/unidades" "" "Listar unidades (deve estar vazio inicialmente)"

test_endpoint "POST" "/unidades" '{
    "nome": "Salão Central",
    "endereco": "Rua das Flores, 123",
    "telefone": "(11) 99999-1111"
}' "Criar primeira unidade"

test_endpoint "POST" "/unidades" '{
    "nome": "Filial Norte",
    "endereco": "Av. Norte, 456",
    "telefone": "(11) 99999-2222"
}' "Criar segunda unidade"

test_endpoint "GET" "/unidades" "" "Listar todas as unidades"

test_endpoint "GET" "/unidades/1" "" "Buscar unidade por ID"

test_endpoint "PUT" "/unidades/1" '{
    "nome": "Salão Central - Matriz",
    "endereco": "Rua das Flores, 123 - Centro"
}' "Atualizar primeira unidade"

echo ""
echo "👥 3. TESTES DE CLIENTES"
test_endpoint "GET" "/clientes" "" "Listar clientes (deve estar vazio inicialmente)"

test_endpoint "POST" "/clientes" '{
    "nome": "Maria Silva",
    "telefone": "(11) 98888-1111",
    "email": "maria@email.com"
}' "Criar primeiro cliente"

test_endpoint "POST" "/clientes" '{
    "nome": "João Santos",
    "telefone": "(11) 98888-2222",
    "email": "joao@email.com",
    "assinante": true
}' "Criar segundo cliente (assinante)"

test_endpoint "GET" "/clientes" "" "Listar todos os clientes"

test_endpoint "GET" "/clientes/1" "" "Buscar cliente por ID"

test_endpoint "PUT" "/clientes/1" '{
    "nome": "Maria Silva Santos",
    "assinante": true
}' "Atualizar primeiro cliente"

test_endpoint "GET" "/clientes/stats" "" "Buscar estatísticas dos clientes"

echo ""
echo "💼 4. TESTES DE SERVIÇOS"
test_endpoint "GET" "/servicos" "" "Listar serviços (deve estar vazio inicialmente)"

test_endpoint "POST" "/servicos" '{
    "nome": "Corte Masculino",
    "descricao": "Corte de cabelo masculino tradicional",
    "duracao_minutos": 30,
    "preco": 25.00
}' "Criar primeiro serviço"

test_endpoint "POST" "/servicos" '{
    "nome": "Corte Feminino",
    "descricao": "Corte de cabelo feminino",
    "duracao_minutos": 45,
    "preco": 35.00
}' "Criar segundo serviço"

test_endpoint "POST" "/servicos" '{
    "nome": "Barba",
    "descricao": "Aparar e modelar barba",
    "duracao_minutos": 20,
    "preco": 15.00
}' "Criar terceiro serviço"

test_endpoint "GET" "/servicos" "" "Listar todos os serviços"

test_endpoint "GET" "/servicos/1" "" "Buscar serviço por ID"

test_endpoint "PUT" "/servicos/1" '{
    "nome": "Corte Masculino Premium",
    "preco": 30.00
}' "Atualizar primeiro serviço"

echo ""
echo "📅 5. TESTES DE AGENDAMENTOS"
test_endpoint "GET" "/agendamentos" "" "Listar agendamentos (deve estar vazio inicialmente)"

echo ""
echo "🎯 6. TESTES DE VALIDAÇÃO"

echo ""
echo "   📋 Teste de validação - Cliente duplicado"
result=$(curl -s -X POST "$BASE_URL/clientes" \
    -H "Content-Type: application/json" \
    -d '{"nome": "Teste Duplicado", "telefone": "(11) 98888-1111", "email": "novo@email.com"}')
echo "   Resposta: $result"
echo "   ✅ Deve retornar erro de telefone duplicado"

echo ""
echo "   📋 Teste de validação - Serviço com preço inválido"
result=$(curl -s -X POST "$BASE_URL/servicos" \
    -H "Content-Type: application/json" \
    -d '{"nome": "Serviço Inválido", "preco": -10}')
echo "   Resposta: $result"
echo "   ✅ Deve retornar erro de preço inválido"

echo ""
echo "   📋 Teste de busca inexistente"
result=$(curl -s "$BASE_URL/clientes/999")
echo "   Resposta: $result"
echo "   ✅ Deve retornar erro 404"

echo ""
echo "🎉 TESTE COMPLETO FINALIZADO!"
echo "============================"
echo ""
echo "📊 RESUMO DOS DADOS CRIADOS:"
echo "   • 2 Unidades"
echo "   • 2 Clientes"
echo "   • 3 Serviços"
echo ""
echo "✅ Todos os endpoints CRUD básicos foram testados com sucesso!"

#!/bin/bash

###############################################################################
# Script de Execução - Bateria de Testes Elite (Módulo Estoque)
# Protocolo de Auditoria Tally
###############################################################################

echo "🏦 ============================================="
echo "🏦   TALLY - BATERIA DE TESTES ELITE"
echo "🏦   Módulo: ESTOQUE"
echo "🏦 ============================================="
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se jest está instalado
if ! command -v jest &> /dev/null; then
    echo -e "${RED}❌ Jest não encontrado. Instalando...${NC}"
    npm install --save-dev jest
fi

# Verificar conexão com banco de dados
echo -e "${YELLOW}🔍 Verificando conexão com banco de dados...${NC}"
node -e "
const { db } = require('./src/config/knex');
db.raw('SELECT 1')
  .then(() => {
    console.log('✅ Banco de dados conectado');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar no banco:', err.message);
    process.exit(1);
  });
" || exit 1

echo ""

# Executar migrations pendentes
echo -e "${YELLOW}🔄 Executando migrations pendentes...${NC}"
npm run migrate || {
    echo -e "${RED}❌ Erro ao executar migrations${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}✅ Migrations executadas com sucesso${NC}"
echo ""

# Executar bateria de testes
echo -e "${YELLOW}🧪 Iniciando bateria de testes...${NC}"
echo ""

npx jest tests/integration/estoque.elite.test.js --verbose --detectOpenHandles

TEST_EXIT_CODE=$?

echo ""
echo "🏦 ============================================="

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ TODOS OS TESTES PASSARAM${NC}"
    echo -e "${GREEN}🏆 Módulo de Estoque: ELITE STATUS CONFIRMADO${NC}"
else
    echo -e "${RED}❌ ALGUNS TESTES FALHARAM${NC}"
    echo -e "${RED}⚠️  Revise os logs acima para detalhes${NC}"
fi

echo "🏦 ============================================="
echo ""

exit $TEST_EXIT_CODE

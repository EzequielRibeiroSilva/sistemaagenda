#!/bin/bash
# Script de Backup Automático do Banco de Dados - Tally
# Uso: ./backup-db.sh [--full]

set -e

BACKUP_DIR="/var/www/tally/backups/database"
RETENTION_DAYS=7
RETENTION_WEEKS=4
CONTAINER_NAME="painel_db_prod"
DB_USER="painel_prod_user"
DB_NAME="painel_agendamento_prod"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${DATE}.sql"

# Criar diretório se não existir
mkdir -p "$BACKUP_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  BACKUP DO BANCO DE DADOS - TALLY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Data/Hora: $(date '+%d/%m/%Y %H:%M:%S')"
echo "Banco: $DB_NAME"
echo ""

# Verificar se container está rodando
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ ERRO: Container $CONTAINER_NAME não está rodando!"
    exit 1
fi

# Fazer backup
echo "📦 Criando backup..."
if docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Backup criado com sucesso!"
    echo "   Arquivo: $BACKUP_FILE"
    echo "   Tamanho: $BACKUP_SIZE"
else
    echo "❌ ERRO ao criar backup!"
    exit 1
fi

# Comprimir backup
echo ""
echo "🗜️  Comprimindo backup..."
if gzip "$BACKUP_FILE"; then
    COMPRESSED_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    echo "✅ Backup comprimido!"
    echo "   Arquivo: ${BACKUP_FILE}.gz"
    echo "   Tamanho: $COMPRESSED_SIZE"
else
    echo "⚠️  Aviso: Não foi possível comprimir o backup"
fi

# Limpeza de backups antigos (diários)
echo ""
echo "🧹 Limpando backups antigos..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo "   Removidos: $DELETED_COUNT backups com mais de $RETENTION_DAYS dias"

# Estatísticas
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 ESTATÍSTICAS DE BACKUPS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL_BACKUPS=$(ls -1 "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "Total de backups: $TOTAL_BACKUPS"
echo "Espaço utilizado: $TOTAL_SIZE"
echo ""
echo "✅ Backup concluído com sucesso!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

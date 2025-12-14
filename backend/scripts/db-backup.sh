#!/bin/bash

# ============================================
# Script de Backup do PostgreSQL
# Painel de Agendamento
# ============================================
#
# USO:
#   ./scripts/db-backup.sh [--full] [--upload-s3]
#
# CONFIGURAÇÃO:
#   Definir variáveis de ambiente ou editar este arquivo
#
# AGENDAMENTO (cron):
#   # Backup diário às 3:00 AM
#   0 3 * * * /app/scripts/db-backup.sh >> /var/log/backup.log 2>&1
#
#   # Backup completo semanal (domingo 2:00 AM)
#   0 2 * * 0 /app/scripts/db-backup.sh --full >> /var/log/backup.log 2>&1
# ============================================

set -e

# Configurações
BACKUP_DIR="${BACKUP_DIR:-/backups}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_DATABASE="${PG_DATABASE:-painel_agendamento_prod}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${PG_DATABASE}_${DATE}.sql.gz"

# Flags
FULL_BACKUP=false
UPLOAD_S3=false

for arg in "$@"; do
  case $arg in
    --full) FULL_BACKUP=true ;;
    --upload-s3) UPLOAD_S3=true ;;
  esac
done

echo "============================================"
echo "🗄️ Backup PostgreSQL - $(date)"
echo "============================================"
echo "Host: $PG_HOST"
echo "Database: $PG_DATABASE"
echo "Backup Dir: $BACKUP_DIR"
echo "Full Backup: $FULL_BACKUP"
echo "--------------------------------------------"

# Criar diretório se não existir
mkdir -p "$BACKUP_DIR"

# Verificar conexão
echo "📡 Verificando conexão..."
PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -c "SELECT 1" > /dev/null 2>&1 || {
  echo "❌ Erro: Não foi possível conectar ao banco de dados"
  exit 1
}
echo "✅ Conexão OK"

# Executar backup
echo "📦 Iniciando backup..."
START_TIME=$(date +%s)

if [ "$FULL_BACKUP" = true ]; then
  # Backup completo com blobs
  PGPASSWORD="$PG_PASSWORD" pg_dump \
    -h "$PG_HOST" \
    -p "$PG_PORT" \
    -U "$PG_USER" \
    -d "$PG_DATABASE" \
    --format=custom \
    --compress=9 \
    --verbose \
    --file="${BACKUP_DIR}/${PG_DATABASE}_${DATE}_full.dump" 2>&1 | grep -v "^pg_dump:"
    
  BACKUP_FILE="${BACKUP_DIR}/${PG_DATABASE}_${DATE}_full.dump"
else
  # Backup SQL comprimido (mais rápido)
  PGPASSWORD="$PG_PASSWORD" pg_dump \
    -h "$PG_HOST" \
    -p "$PG_PORT" \
    -U "$PG_USER" \
    -d "$PG_DATABASE" \
    --no-owner \
    --no-acl \
    | gzip > "$BACKUP_FILE"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "✅ Backup concluído!"
echo "📁 Arquivo: $BACKUP_FILE"
echo "📊 Tamanho: $BACKUP_SIZE"
echo "⏱️ Duração: ${DURATION}s"

# Upload para S3 (se configurado)
if [ "$UPLOAD_S3" = true ] && [ -n "$AWS_S3_BUCKET" ]; then
  echo "☁️ Enviando para S3..."
  aws s3 cp "$BACKUP_FILE" "s3://$AWS_S3_BUCKET/backups/$(basename $BACKUP_FILE)" \
    --storage-class STANDARD_IA
  echo "✅ Upload S3 concluído"
fi

# Limpar backups antigos
echo "🧹 Limpando backups com mais de $RETENTION_DAYS dias..."
find "$BACKUP_DIR" -name "${PG_DATABASE}_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "${PG_DATABASE}_*_full.dump" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

REMAINING=$(ls -1 "$BACKUP_DIR"/${PG_DATABASE}_* 2>/dev/null | wc -l)
echo "📂 Backups restantes: $REMAINING"

echo "--------------------------------------------"
echo "✅ Processo de backup finalizado com sucesso!"
echo "============================================"


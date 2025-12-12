#!/bin/bash

###############################################################################
# SCRIPT DE BACKUP AUTOMÁTICO DO BANCO DE DADOS
# FASE PRÉ-PRODUÇÃO - Item 1/7
#
# Descrição: Backup diário do PostgreSQL com compressão e rotação automática
# Autor: Sistema de Pré-Produção Tally
# Data: 11 de dezembro de 2025
###############################################################################

# ===========================
# CONFIGURAÇÕES
# ===========================

# Diretório de backups (AJUSTAR CONFORME SEU SERVIDOR)
BACKUP_DIR="/var/backups/tally/postgres"

# Nome do banco de dados
DB_NAME="${PG_DATABASE:-painel_agendamento_prod}"

# Usuário do PostgreSQL
DB_USER="${PG_USER:-postgres}"

# Host do PostgreSQL
DB_HOST="${PG_HOST:-localhost}"

# Porta do PostgreSQL
DB_PORT="${PG_PORT:-5432}"

# Dias de retenção (manter backups dos últimos N dias)
RETENTION_DAYS=30

# Timestamp para nome do arquivo
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_ONLY=$(date +%Y%m%d)

# Nome do arquivo de backup
BACKUP_FILE="tally_backup_${TIMESTAMP}.sql"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"

# ===========================
# CORES PARA OUTPUT
# ===========================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ===========================
# FUNÇÕES
# ===========================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Verificar se comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Criar diretório de backup se não existir
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log_info "Criando diretório de backup: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
        
        if [ $? -ne 0 ]; then
            log_error "Falha ao criar diretório de backup"
            exit 1
        fi
    fi
}

# Verificar espaço em disco
check_disk_space() {
    local available_space=$(df -BG "$BACKUP_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
    local min_space=5 # GB mínimo necessário
    
    if [ "$available_space" -lt "$min_space" ]; then
        log_error "Espaço em disco insuficiente. Disponível: ${available_space}GB, Necessário: ${min_space}GB"
        exit 1
    fi
    
    log_info "Espaço em disco disponível: ${available_space}GB"
}

# Executar backup
perform_backup() {
    log_info "Iniciando backup do banco de dados: $DB_NAME"
    log_info "Arquivo de destino: $BACKUP_DIR/$BACKUP_FILE_GZ"
    
    # Executar pg_dump e compactar diretamente
    PGPASSWORD="$PG_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=plain \
        --no-owner \
        --no-acl \
        --verbose \
        2>&1 | tee /tmp/backup_log_${TIMESTAMP}.log | gzip > "$BACKUP_DIR/$BACKUP_FILE_GZ"
    
    local exit_code=${PIPESTATUS[0]}
    
    if [ $exit_code -eq 0 ]; then
        log_info "Backup concluído com sucesso!"
        
        # Verificar tamanho do arquivo
        local file_size=$(du -h "$BACKUP_DIR/$BACKUP_FILE_GZ" | cut -f1)
        log_info "Tamanho do backup: $file_size"
        
        # Verificar integridade do arquivo compactado
        if gzip -t "$BACKUP_DIR/$BACKUP_FILE_GZ" 2>/dev/null; then
            log_info "Integridade do arquivo verificada: OK"
        else
            log_error "Arquivo de backup corrompido!"
            return 1
        fi
        
        return 0
    else
        log_error "Falha ao executar backup (código de saída: $exit_code)"
        cat /tmp/backup_log_${TIMESTAMP}.log
        return 1
    fi
}

# Rotação de backups antigos
rotate_backups() {
    log_info "Iniciando rotação de backups (mantendo últimos $RETENTION_DAYS dias)"
    
    # Encontrar e deletar backups mais antigos que RETENTION_DAYS
    local deleted_count=$(find "$BACKUP_DIR" -name "tally_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete -print | wc -l)
    
    if [ "$deleted_count" -gt 0 ]; then
        log_info "Removidos $deleted_count backup(s) antigo(s)"
    else
        log_info "Nenhum backup antigo para remover"
    fi
    
    # Listar backups restantes
    local total_backups=$(find "$BACKUP_DIR" -name "tally_backup_*.sql.gz" -type f | wc -l)
    log_info "Total de backups armazenados: $total_backups"
}

# Upload para S3 (OPCIONAL - descomente se usar AWS S3)
upload_to_s3() {
    if command_exists aws; then
        local s3_bucket="${S3_BACKUP_BUCKET:-tally-backups}"
        local s3_path="s3://$s3_bucket/postgres/$DATE_ONLY/$BACKUP_FILE_GZ"
        
        log_info "Fazendo upload para S3: $s3_path"
        
        aws s3 cp "$BACKUP_DIR/$BACKUP_FILE_GZ" "$s3_path" --storage-class STANDARD_IA
        
        if [ $? -eq 0 ]; then
            log_info "Upload para S3 concluído com sucesso"
        else
            log_warn "Falha no upload para S3 (backup local mantido)"
        fi
    else
        log_warn "AWS CLI não instalado - pulando upload para S3"
    fi
}

# Enviar email com resultado do backup
send_email_notification() {
    local status=$1
    local message=$2
    local backup_file=$3
    
    # Email de destino
    local email_to="ribeirosilvaquiel@gmail.com"
    local email_subject="[Tally Backup] $status - $(date '+%d/%m/%Y %H:%M')"
    
    # Corpo do email
    local email_body="
========================================
RELATÓRIO DE BACKUP - TALLY
========================================

Status: $status
Data/Hora: $(date '+%d/%m/%Y %H:%M:%S')
Servidor: $(hostname)

$message

Detalhes do Backup:
- Banco de Dados: $DB_NAME
- Arquivo: $backup_file
- Tamanho: $(du -h "$BACKUP_DIR/$backup_file" 2>/dev/null | cut -f1 || echo 'N/A')
- Localização: $BACKUP_DIR

Backups Armazenados:
$(find "$BACKUP_DIR" -name "tally_backup_*.sql.gz" -type f -printf '%TY-%Tm-%Td %TH:%TM - %f (%s bytes)\n' 2>/dev/null | sort -r | head -10 || echo 'Nenhum backup encontrado')

========================================
Sistema de Backup Automático Tally
========================================
"
    
    # OPÇÃO 1: Usar sendmail (mais simples, mas precisa estar configurado)
    if command_exists sendmail; then
        log_info "Enviando email via sendmail para $email_to"
        
        echo "To: $email_to" > /tmp/backup_email_${TIMESTAMP}.txt
        echo "Subject: $email_subject" >> /tmp/backup_email_${TIMESTAMP}.txt
        echo "Content-Type: text/plain; charset=UTF-8" >> /tmp/backup_email_${TIMESTAMP}.txt
        echo "" >> /tmp/backup_email_${TIMESTAMP}.txt
        echo "$email_body" >> /tmp/backup_email_${TIMESTAMP}.txt
        
        sendmail "$email_to" < /tmp/backup_email_${TIMESTAMP}.txt
        
        if [ $? -eq 0 ]; then
            log_info "Email enviado com sucesso via sendmail"
        else
            log_warn "Falha ao enviar email via sendmail"
        fi
        
        rm -f /tmp/backup_email_${TIMESTAMP}.txt
    
    # OPÇÃO 2: Usar curl com SMTP (Gmail, SendGrid, etc.)
    elif command_exists curl && [ -n "$SMTP_SERVER" ]; then
        log_info "Enviando email via SMTP para $email_to"
        
        # Criar arquivo temporário com o email
        cat > /tmp/backup_email_${TIMESTAMP}.txt <<EOF
From: ${SMTP_FROM:-backup@tally.com}
To: $email_to
Subject: $email_subject
Content-Type: text/plain; charset=UTF-8

$email_body
EOF
        
        # Enviar via SMTP usando curl
        curl --url "smtp://${SMTP_SERVER}:${SMTP_PORT:-587}" \
            --ssl-reqd \
            --mail-from "${SMTP_FROM:-backup@tally.com}" \
            --mail-rcpt "$email_to" \
            --user "${SMTP_USER}:${SMTP_PASSWORD}" \
            --upload-file /tmp/backup_email_${TIMESTAMP}.txt \
            --silent
        
        if [ $? -eq 0 ]; then
            log_info "Email enviado com sucesso via SMTP"
        else
            log_warn "Falha ao enviar email via SMTP"
        fi
        
        rm -f /tmp/backup_email_${TIMESTAMP}.txt
    
    # OPÇÃO 3: Usar Python (se disponível)
    elif command_exists python3; then
        log_info "Enviando email via Python para $email_to"
        
        python3 - <<PYTHON_SCRIPT
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

try:
    msg = MIMEMultipart()
    msg['From'] = os.getenv('SMTP_FROM', 'backup@tally.com')
    msg['To'] = '$email_to'
    msg['Subject'] = '$email_subject'
    
    body = '''$email_body'''
    msg.attach(MIMEText(body, 'plain'))
    
    # Configuração SMTP
    smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_user = os.getenv('SMTP_USER', '')
    smtp_password = os.getenv('SMTP_PASSWORD', '')
    
    if smtp_user and smtp_password:
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)
        server.quit()
        print('Email enviado com sucesso')
    else:
        print('Credenciais SMTP não configuradas')
except Exception as e:
    print(f'Erro ao enviar email: {e}')
PYTHON_SCRIPT
        
    else
        log_warn "Nenhum método de envio de email disponível"
        log_warn "Instale sendmail, configure SMTP ou instale Python3"
    fi
}

# Enviar notificação (webhook - OPCIONAL)
send_webhook_notification() {
    local status=$1
    local message=$2
    
    # Exemplo com webhook (Discord, Slack, etc.)
    if [ -n "$WEBHOOK_URL" ]; then
        curl -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"[Tally Backup] $status: $message\"}" \
            >/dev/null 2>&1
    fi
}

# ===========================
# MAIN
# ===========================

main() {
    log_info "========================================="
    log_info "INICIANDO BACKUP DO BANCO DE DADOS TALLY"
    log_info "========================================="
    
    # Verificar dependências
    if ! command_exists pg_dump; then
        log_error "pg_dump não encontrado. Instale o PostgreSQL client."
        exit 1
    fi
    
    if ! command_exists gzip; then
        log_error "gzip não encontrado. Instale gzip."
        exit 1
    fi
    
    # Verificar variáveis de ambiente obrigatórias
    if [ -z "$PG_PASSWORD" ]; then
        log_error "Variável de ambiente PG_PASSWORD não definida"
        exit 1
    fi
    
    # Executar etapas do backup
    create_backup_dir
    check_disk_space
    
    if perform_backup; then
        rotate_backups
        
        # Upload para S3 (descomente se usar)
        # upload_to_s3
        
        # ✅ Enviar email de sucesso
        send_email_notification "✅ SUCESSO" "Backup concluído com sucesso!" "$BACKUP_FILE_GZ"
        
        # Webhook (opcional)
        send_webhook_notification "✅ SUCESSO" "Backup concluído: $BACKUP_FILE_GZ"
        
        log_info "========================================="
        log_info "BACKUP CONCLUÍDO COM SUCESSO!"
        log_info "========================================="
        exit 0
    else
        # ❌ Enviar email de falha
        send_email_notification "❌ FALHA" "Erro ao executar backup. Verifique os logs do servidor." "$BACKUP_FILE_GZ"
        
        # Webhook (opcional)
        send_webhook_notification "❌ FALHA" "Erro ao executar backup"
        
        log_error "========================================="
        log_error "BACKUP FALHOU!"
        log_error "========================================="
        exit 1
    fi
}

# Executar script
main "$@"

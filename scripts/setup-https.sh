#!/bin/bash

###############################################################################
# SCRIPT DE CONFIGURAÇÃO HTTPS
# FASE PRÉ-PRODUÇÃO - Item 2/7
#
# Descrição: Automatiza configuração de HTTPS com Nginx + Let's Encrypt
# Autor: Sistema de Pré-Produção Tally
# Data: 11 de dezembro de 2025
###############################################################################

# ===========================
# CORES PARA OUTPUT
# ===========================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ===========================
# FUNÇÕES
# ===========================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BLUE}===================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================${NC}\n"
}

# Verificar se comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verificar se está rodando como root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Este script precisa ser executado como root (sudo)"
        exit 1
    fi
}

# Detectar sistema operacional
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        log_error "Sistema operacional não suportado"
        exit 1
    fi
    
    log_info "Sistema detectado: $OS $VERSION"
}

# Instalar Nginx
install_nginx() {
    log_step "INSTALANDO NGINX"
    
    if command_exists nginx; then
        log_info "Nginx já está instalado"
        nginx -v
        return 0
    fi
    
    case $OS in
        ubuntu|debian)
            apt update
            apt install nginx -y
            ;;
        centos|rhel|fedora)
            yum install nginx -y
            ;;
        *)
            log_error "Sistema operacional não suportado: $OS"
            exit 1
            ;;
    esac
    
    # Iniciar e habilitar Nginx
    systemctl start nginx
    systemctl enable nginx
    
    log_info "Nginx instalado com sucesso"
}

# Instalar Certbot
install_certbot() {
    log_step "INSTALANDO CERTBOT"
    
    if command_exists certbot; then
        log_info "Certbot já está instalado"
        certbot --version
        return 0
    fi
    
    case $OS in
        ubuntu|debian)
            apt update
            apt install certbot python3-certbot-nginx -y
            ;;
        centos|rhel|fedora)
            yum install certbot python3-certbot-nginx -y
            ;;
        *)
            log_error "Sistema operacional não suportado: $OS"
            exit 1
            ;;
    esac
    
    log_info "Certbot instalado com sucesso"
}

# Configurar Nginx
configure_nginx() {
    log_step "CONFIGURANDO NGINX"
    
    # Solicitar informações
    read -p "Digite seu domínio (ex: tally.com.br): " DOMAIN
    read -p "Digite o email para notificações SSL (ex: ribeirosilvaquiel@gmail.com): " EMAIL
    read -p "Porta do backend (padrão: 3000): " BACKEND_PORT
    BACKEND_PORT=${BACKEND_PORT:-3000}
    read -p "Porta do frontend (padrão: 5173): " FRONTEND_PORT
    FRONTEND_PORT=${FRONTEND_PORT:-5173}
    
    # Criar arquivo de configuração
    NGINX_CONF="/etc/nginx/sites-available/tally"
    
    log_info "Criando configuração Nginx em: $NGINX_CONF"
    
    cat > $NGINX_CONF <<EOF
# Redirecionar HTTP para HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Permitir Certbot
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirecionar tudo para HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# Servidor HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # Certificados SSL (serão criados pelo Certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # Configurações SSL recomendadas
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS (força HTTPS por 1 ano)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Headers de segurança
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Tamanho máximo de upload (para avatares)
    client_max_body_size 10M;

    # Backend API
    location /api {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:$BACKEND_PORT/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Uploads (avatares, etc.)
    location /uploads {
        proxy_pass http://localhost:$BACKEND_PORT/uploads;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Frontend (React/Vite)
    location / {
        proxy_pass http://localhost:$FRONTEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF
    
    # Ativar configuração
    if [ -d "/etc/nginx/sites-enabled" ]; then
        ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
    fi
    
    # Testar configuração
    log_info "Testando configuração Nginx..."
    if nginx -t; then
        log_info "Configuração Nginx válida!"
    else
        log_error "Erro na configuração Nginx"
        exit 1
    fi
    
    # Recarregar Nginx
    systemctl reload nginx
    
    log_info "Nginx configurado com sucesso"
    
    # Salvar variáveis para próximo passo
    export DOMAIN
    export EMAIL
}

# Obter certificado SSL
obtain_ssl() {
    log_step "OBTENDO CERTIFICADO SSL"
    
    log_info "Domínio: $DOMAIN"
    log_info "Email: $EMAIL"
    
    # Executar Certbot
    certbot --nginx -d $DOMAIN -d www.$DOMAIN \
        --non-interactive \
        --agree-tos \
        --email $EMAIL \
        --redirect
    
    if [ $? -eq 0 ]; then
        log_info "Certificado SSL obtido com sucesso!"
    else
        log_error "Falha ao obter certificado SSL"
        exit 1
    fi
    
    # Testar renovação automática
    log_info "Testando renovação automática..."
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        log_info "Renovação automática configurada com sucesso!"
    else
        log_warn "Renovação automática pode ter problemas"
    fi
}

# Configurar firewall
configure_firewall() {
    log_step "CONFIGURANDO FIREWALL"
    
    if command_exists ufw; then
        log_info "Configurando UFW..."
        ufw allow 'Nginx Full'
        ufw delete allow 'Nginx HTTP'
        log_info "Firewall configurado"
    elif command_exists firewall-cmd; then
        log_info "Configurando firewalld..."
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --reload
        log_info "Firewall configurado"
    else
        log_warn "Firewall não detectado - configure manualmente"
    fi
}

# Exibir resumo
show_summary() {
    log_step "RESUMO DA INSTALAÇÃO"
    
    echo -e "${GREEN}✅ HTTPS configurado com sucesso!${NC}\n"
    echo -e "📋 Informações:"
    echo -e "   Domínio: ${BLUE}$DOMAIN${NC}"
    echo -e "   Email: ${BLUE}$EMAIL${NC}"
    echo -e "   Certificado: ${GREEN}Válido${NC}"
    echo -e "   Renovação: ${GREEN}Automática${NC}\n"
    
    echo -e "🔗 URLs:"
    echo -e "   Site: ${BLUE}https://$DOMAIN${NC}"
    echo -e "   API: ${BLUE}https://$DOMAIN/api${NC}"
    echo -e "   Health: ${BLUE}https://$DOMAIN/health${NC}\n"
    
    echo -e "📝 Próximos passos:"
    echo -e "   1. Atualizar variáveis de ambiente:"
    echo -e "      ${YELLOW}VITE_API_BASE_URL=https://$DOMAIN/api${NC}"
    echo -e "      ${YELLOW}CORS_PRODUCTION_ORIGINS=https://$DOMAIN,https://www.$DOMAIN${NC}"
    echo -e "   2. Testar acesso: ${BLUE}https://$DOMAIN${NC}"
    echo -e "   3. Verificar SSL Labs: ${BLUE}https://www.ssllabs.com/ssltest/${NC}\n"
    
    echo -e "🔧 Comandos úteis:"
    echo -e "   Ver certificados: ${YELLOW}sudo certbot certificates${NC}"
    echo -e "   Renovar manualmente: ${YELLOW}sudo certbot renew${NC}"
    echo -e "   Testar Nginx: ${YELLOW}sudo nginx -t${NC}"
    echo -e "   Recarregar Nginx: ${YELLOW}sudo systemctl reload nginx${NC}\n"
}

# ===========================
# MAIN
# ===========================

main() {
    log_step "CONFIGURAÇÃO HTTPS - TALLY"
    
    # Verificações
    check_root
    detect_os
    
    # Instalações
    install_nginx
    install_certbot
    
    # Configurações
    configure_nginx
    obtain_ssl
    configure_firewall
    
    # Resumo
    show_summary
    
    log_info "========================================="
    log_info "HTTPS CONFIGURADO COM SUCESSO!"
    log_info "========================================="
}

# Executar script
main "$@"

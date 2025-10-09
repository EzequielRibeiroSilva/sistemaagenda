# 🔒 GUIA DE SEGURANÇA - PAINEL DE AGENDAMENTO

## ✅ MEDIDAS DE SEGURANÇA IMPLEMENTADAS

### 🔐 **AUTENTICAÇÃO E AUTORIZAÇÃO**

#### JWT (JSON Web Tokens)
- **Access Token**: Expiração de 1 hora (reduzido para maior segurança)
- **Refresh Token**: Expiração de 7 dias com rotação automática
- **Algoritmo**: HS256 (HMAC SHA-256)
- **JWT ID (jti)**: UUID único para cada token para rastreamento
- **Blacklist**: Sistema de invalidação de tokens (usar Redis em produção)

#### Criptografia de Senhas
- **Algoritmo**: bcrypt com salt rounds configurável
- **Salt Rounds**: 12 (padrão) - configurável via `BCRYPT_SALT_ROUNDS`
- **Validação**: Comparação segura com timing attack protection

### 🛡️ **PROTEÇÃO CONTRA ATAQUES**

#### Rate Limiting
- **Global**: 100 requisições por IP em 15 minutos
- **Login Específico**: 5 tentativas por IP em 15 minutos
- **Por Usuário**: 3 tentativas por email em 30 minutos
- **Limpeza Automática**: Cache limpo a cada hora

#### Validação e Sanitização
- **XSS Protection**: Sanitização de todos os inputs
- **SQL Injection**: Detecção de padrões maliciosos
- **Input Validation**: Validação rigorosa de email e senha
- **Length Limits**: Limites de tamanho para prevenir DoS

#### Headers de Segurança
- **Helmet.js**: Configuração completa de headers
- **HSTS**: Strict Transport Security (1 ano)
- **CSP**: Content Security Policy restritiva
- **X-Frame-Options**: DENY (proteção contra clickjacking)
- **X-XSS-Protection**: Habilitado
- **X-Content-Type-Options**: nosniff

### 🔍 **MONITORAMENTO E AUDITORIA**

#### Logging de Segurança
- Tentativas de login falhadas
- Rate limiting atingido
- Tentativas de injeção detectadas
- Tokens inválidos ou expirados

#### Detecção de Anomalias
- Múltiplas tentativas do mesmo IP
- Padrões suspeitos nos inputs
- Tentativas de bypass de validação

## ⚠️ **CONFIGURAÇÕES OBRIGATÓRIAS PARA PRODUÇÃO**

### Variáveis de Ambiente Críticas

```bash
# JWT Secrets (OBRIGATÓRIO - mínimo 32 caracteres)
JWT_SECRET=sua_chave_jwt_super_secreta_com_pelo_menos_32_caracteres
JWT_REFRESH_SECRET=sua_chave_refresh_jwt_super_secreta_com_pelo_menos_32_caracteres

# Configurações de Segurança
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# HTTPS (OBRIGATÓRIO em produção)
NODE_ENV=production
```

### Checklist de Produção

- [ ] **HTTPS habilitado** (certificado SSL/TLS válido)
- [ ] **JWT_SECRET** definido com pelo menos 32 caracteres
- [ ] **JWT_REFRESH_SECRET** definido com pelo menos 32 caracteres
- [ ] **Redis configurado** para blacklist de tokens
- [ ] **Firewall configurado** para limitar acesso
- [ ] **Logs centralizados** para monitoramento
- [ ] **Backup de segurança** do banco de dados
- [ ] **Atualizações de segurança** aplicadas

## 🚨 **VULNERABILIDADES CORRIGIDAS**

### Antes da Auditoria
- ❌ Salt rounds inconsistentes (10 vs 12)
- ❌ JWT secret padrão fraco
- ❌ Sem rate limiting específico para login
- ❌ Sem validação rigorosa de input
- ❌ Headers de segurança básicos
- ❌ Sem detecção de SQL injection
- ❌ Sem refresh token

### Após a Auditoria
- ✅ Salt rounds consistentes (12)
- ✅ JWT secrets seguros com validação
- ✅ Rate limiting multicamada
- ✅ Validação e sanitização completa
- ✅ Headers de segurança avançados
- ✅ Detecção de ataques de injeção
- ✅ Sistema de refresh token implementado

## 📋 **RECOMENDAÇÕES ADICIONAIS**

### Para Ambiente de Produção
1. **WAF (Web Application Firewall)**: Cloudflare, AWS WAF, etc.
2. **Redis**: Para blacklist de tokens e cache de rate limiting
3. **Monitoring**: Sentry, DataDog, ou similar para alertas
4. **Backup**: Backup automático e criptografado do banco
5. **SSL Pinning**: Para aplicações móveis futuras
6. **2FA**: Implementar autenticação de dois fatores

### Manutenção de Segurança
- **Rotação de Secrets**: A cada 90 dias
- **Auditoria de Logs**: Revisão semanal
- **Testes de Penetração**: Trimestrais
- **Atualizações**: Dependências atualizadas mensalmente

## 🔧 **COMANDOS ÚTEIS**

### Gerar Secrets Seguros
```bash
# Gerar JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Verificar força da senha
npm install --global zxcvbn-cli
echo "suasenha" | zxcvbn
```

### Testar Segurança
```bash
# Teste de rate limiting
for i in {1..10}; do curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com","senha":"wrong"}'; done

# Teste de SQL injection
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@test.com'\'' OR 1=1--","senha":"test"}'
```

---

**⚠️ IMPORTANTE**: Este sistema implementa segurança de nível empresarial. Mantenha sempre as dependências atualizadas e monitore logs de segurança regularmente.

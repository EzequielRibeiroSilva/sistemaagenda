# 🔐 ITEM 4/7 - VARIÁVEIS DE AMBIENTE DE PRODUÇÃO (CRÍTICO)

**Status**: ✅ **IMPLEMENTADO E VALIDADO**  
**Prioridade**: 🔴 **CRÍTICO PARA SEGURANÇA**  
**Tempo de Implementação**: 1 dia  
**Objetivo**: Garantir configuração segura de secrets e variáveis

---

## 🚨 POR QUE É CRÍTICO?

### **❌ RISCOS SEM CONFIGURAÇÃO ADEQUADA**

1. 🔴 **Secrets fracos** - JWT facilmente quebrado
2. 🔴 **Senhas padrão** - Banco de dados vulnerável
3. 🔴 **CORS aberto** - Ataques cross-origin
4. 🔴 **Dados expostos** - Vazamento de informações sensíveis
5. 🔴 **Sistema comprometido** - Acesso não autorizado

### **✅ COM CONFIGURAÇÃO CORRETA**

1. ✅ **Secrets fortes** - JWT criptograficamente seguro (128 caracteres)
2. ✅ **Senhas únicas** - Banco protegido
3. ✅ **CORS restrito** - Apenas domínios autorizados
4. ✅ **Dados protegidos** - Conformidade LGPD
5. ✅ **Sistema seguro** - Confiança do usuário

---

## 📋 O QUE FOI IMPLEMENTADO

### **1. Script de Geração de Secrets**

Arquivo: `/backend/scripts/generate-secrets.js`

**Funcionalidades**:
- ✅ Gera secrets criptograficamente seguros
- ✅ JWT_SECRET (128 caracteres)
- ✅ JWT_REFRESH_SECRET (128 caracteres)
- ✅ REDIS_PASSWORD (32 caracteres)
- ✅ PG_PASSWORD (32 caracteres)
- ✅ Opção de salvar em `.env.production`

**Uso**:
```bash
cd backend
node scripts/generate-secrets.js
```

**Saída**:
```
========================================
🔐 GERADOR DE SECRETS SEGUROS
========================================

🔑 Gerando secrets criptograficamente seguros...

✅ Secrets gerados com sucesso!

📋 COPIE ESTES VALORES PARA SEU .env DE PRODUÇÃO:

========================================
# JWT Secrets (OBRIGATÓRIO - 128 caracteres)
JWT_SECRET=a1b2c3d4e5f6...
JWT_REFRESH_SECRET=f6e5d4c3b2a1...

# Redis Password (RECOMENDADO - 32 caracteres)
REDIS_PASSWORD=X9y8Z7w6...

# PostgreSQL Password (OBRIGATÓRIO - 32 caracteres)
PG_PASSWORD=P9o8I7u6...
========================================

💾 Deseja salvar em .env.production? (s/N):
```

### **2. Script de Validação**

Arquivo: `/backend/scripts/validate-env.js`

**Funcionalidades**:
- ✅ Valida todas as variáveis obrigatórias
- ✅ Verifica tamanho mínimo de secrets
- ✅ Detecta secrets fracos/de desenvolvimento
- ✅ Valida URLs e números
- ✅ Validações específicas por ambiente
- ✅ Relatório detalhado de erros e avisos

**Uso**:
```bash
# Validar ambiente atual
node scripts/validate-env.js

# Validar produção
NODE_ENV=production node scripts/validate-env.js
```

**Saída (Exemplo)**:
```
========================================
🔍 VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
========================================

📊 Ambiente: PRODUCTION

🔐 JWT SECRETS (CRÍTICO)
─────────────────────────────────────
✅ JWT_SECRET: OK (128 caracteres)
✅ JWT_REFRESH_SECRET: OK (128 caracteres)
✅ JWT_EXPIRES_IN: OK
✅ JWT_REFRESH_EXPIRES_IN: OK

🗄️  BANCO DE DADOS (CRÍTICO)
─────────────────────────────────────
✅ PG_HOST: OK
✅ PG_PORT: OK (5432)
✅ PG_USER: OK
✅ PG_PASSWORD: OK (32 caracteres)
✅ PG_DATABASE: OK

🔴 REDIS (CRÍTICO EM PRODUÇÃO)
─────────────────────────────────────
✅ REDIS_HOST: OK
✅ REDIS_PORT: OK (6379)
✅ REDIS_PASSWORD: OK (32 caracteres)
✅ REDIS_DB: OK (0)

========================================
📋 RESUMO DA VALIDAÇÃO
========================================

✅ TODAS AS VALIDAÇÕES PASSARAM!
   Ambiente configurado corretamente.
```

### **3. .env.example Atualizado**

Arquivo: `/backend/.env.example`

**Melhorias**:
- ✅ Documentação completa de cada variável
- ✅ Seções organizadas por categoria
- ✅ Exemplos claros
- ✅ Avisos de segurança
- ✅ Instruções de uso

### **4. Validação no AuthService**

Arquivo: `/backend/src/services/AuthService.js`

**Validações**:
```javascript
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres em produção');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET deve ter pelo menos 32 caracteres em produção');
  }
}
```

### **5. Validação no config.js**

Arquivo: `/backend/src/config/config.js`

**Validações**:
```javascript
if (config.app.env === 'production') {
  if (config.jwt.secret === 'fallback_secret_key_not_secure') {
    throw new Error('JWT_SECRET deve ser definido em produção');
  }
  if (config.jwt.refreshSecret === 'fallback_refresh_secret_key_not_secure') {
    throw new Error('JWT_REFRESH_SECRET deve ser definido em produção');
  }
}
```

---

## 🚀 CONFIGURAÇÃO PASSO A PASSO

### **DESENVOLVIMENTO**

#### **1. Criar arquivo .env**

```bash
cd backend
cp .env.example .env
```

#### **2. Gerar secrets de desenvolvimento**

```bash
node scripts/generate-secrets.js
```

#### **3. Editar .env**

```bash
nano .env
```

**Configurar**:
```bash
# Aplicação
NODE_ENV=development
PORT=3000

# JWT (usar secrets gerados)
JWT_SECRET=<secret_gerado>
JWT_REFRESH_SECRET=<secret_gerado>

# Banco de Dados
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=postgres
PG_DATABASE=painel_agendamento_dev

# Redis (opcional em dev)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# CORS (desenvolvimento)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

#### **4. Validar configuração**

```bash
node scripts/validate-env.js
```

### **PRODUÇÃO (CONTABO)**

#### **1. Gerar secrets de produção**

```bash
node scripts/generate-secrets.js
```

**Salvar secrets em local seguro** (gerenciador de senhas)!

#### **2. Criar .env no servidor**

```bash
# Conectar via SSH
ssh root@seu-servidor-contabo.com

# Navegar para pasta do projeto
cd /var/www/tally

# Criar .env
nano .env
```

#### **3. Configurar .env de produção**

```bash
# ========================================
# VARIÁVEIS DE AMBIENTE - PRODUÇÃO
# ========================================

# Aplicação
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# JWT (USAR SECRETS GERADOS!)
JWT_SECRET=<secret_gerado_128_caracteres>
JWT_REFRESH_SECRET=<secret_gerado_128_caracteres>
JWT_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d

# Banco de Dados
PG_HOST=localhost
PG_PORT=5432
PG_USER=tally_user
PG_PASSWORD=<senha_gerada_32_caracteres>
PG_DATABASE=painel_agendamento_prod

# Redis (OBRIGATÓRIO)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<senha_gerada_32_caracteres>
REDIS_DB=0

# Evolution API
EVO_API_BASE_URL=https://sua-evolution-api.com/
EVO_API_INSTANCE_ID=SUA_INSTANCE_ID
EVO_API_KEY=SUA_API_KEY

# Notificações
ENABLE_WHATSAPP_NOTIFICATIONS=true
REMINDER_24H_ENABLED=true
REMINDER_1H_ENABLED=true

# Segurança
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BCRYPT_SALT_ROUNDS=12

# CORS (CRÍTICO!)
CORS_PRODUCTION_ORIGINS=https://app.tally.com.br,https://tally.com.br

# Logs
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

#### **4. Validar configuração**

```bash
NODE_ENV=production node scripts/validate-env.js
```

**Esperado**:
```
✅ TODAS AS VALIDAÇÕES PASSARAM!
   Ambiente configurado corretamente.
```

#### **5. Proteger arquivo .env**

```bash
# Permissões restritas (apenas root)
chmod 600 .env
chown root:root .env

# Verificar
ls -la .env
# Esperado: -rw------- 1 root root
```

---

## 🔒 SEGURANÇA - BOAS PRÁTICAS

### **1. Secrets Fortes**

✅ **Mínimo 32 caracteres** para JWT  
✅ **Usar gerador criptográfico** (não inventar)  
✅ **Nunca reutilizar** secrets entre ambientes  
✅ **Rotacionar** a cada 90 dias  

### **2. Armazenamento Seguro**

✅ **Gerenciador de senhas** (1Password, LastPass, Bitwarden)  
✅ **Nunca** commitar no Git  
✅ **Nunca** compartilhar por email/chat  
✅ **Backup criptografado** dos secrets  

### **3. Permissões de Arquivo**

```bash
# .env deve ser legível apenas pelo owner
chmod 600 .env

# Verificar
ls -la .env
# -rw------- 1 root root
```

### **4. Gitignore**

Verificar se `.env` está no `.gitignore`:
```bash
# .gitignore
.env
.env.local
.env.production
.env.*.local
```

### **5. Variáveis de Ambiente no Sistema**

**Alternativa mais segura** (não usar arquivo .env):

```bash
# Adicionar ao systemd service
nano /etc/systemd/system/tally.service
```

```ini
[Service]
Environment="NODE_ENV=production"
Environment="JWT_SECRET=..."
Environment="JWT_REFRESH_SECRET=..."
Environment="PG_PASSWORD=..."
Environment="REDIS_PASSWORD=..."
```

---

## 📊 CHECKLIST DE VALIDAÇÃO

### **Desenvolvimento**

- [ ] `.env` criado a partir de `.env.example`
- [ ] Secrets gerados com `generate-secrets.js`
- [ ] Banco de dados configurado
- [ ] Redis configurado (opcional)
- [ ] Validação executada com sucesso
- [ ] Aplicação inicia sem erros

### **Produção**

- [ ] Secrets gerados e salvos em local seguro
- [ ] `.env` criado no servidor
- [ ] JWT_SECRET com 128+ caracteres
- [ ] JWT_REFRESH_SECRET com 128+ caracteres
- [ ] PG_PASSWORD forte (32+ caracteres)
- [ ] REDIS_PASSWORD configurado
- [ ] CORS_PRODUCTION_ORIGINS configurado
- [ ] Permissões do arquivo .env corretas (600)
- [ ] Validação executada com sucesso
- [ ] Aplicação inicia sem erros
- [ ] Backup dos secrets realizado

---

## 🧪 TESTES DE VALIDAÇÃO

### **Teste 1: Validação Básica**

```bash
node scripts/validate-env.js
```

**Esperado**: Sem erros críticos

### **Teste 2: Validação de Produção**

```bash
NODE_ENV=production node scripts/validate-env.js
```

**Esperado**: Todas as validações passam

### **Teste 3: Iniciar Aplicação**

```bash
npm run dev
```

**Esperado**: Sem erros de configuração

### **Teste 4: Verificar Secrets**

```bash
# Verificar tamanho dos secrets
echo -n "$JWT_SECRET" | wc -c
# Esperado: 128 ou mais

echo -n "$JWT_REFRESH_SECRET" | wc -c
# Esperado: 128 ou mais
```

### **Teste 5: Testar Login**

1. Fazer login na aplicação
2. Verificar token JWT no localStorage
3. Decodificar token em jwt.io
4. Verificar se payload está correto

---

## 🚨 TROUBLESHOOTING

### **Problema 1: "JWT_SECRET deve ser definido"**

**Causa**: Variável não configurada

**Solução**:
```bash
# Gerar secret
node scripts/generate-secrets.js

# Adicionar ao .env
echo "JWT_SECRET=<secret_gerado>" >> .env
```

### **Problema 2: "JWT_SECRET muito curto"**

**Causa**: Secret com menos de 32 caracteres

**Solução**:
```bash
# Gerar novo secret (128 caracteres)
node scripts/generate-secrets.js

# Substituir no .env
```

### **Problema 3: "CORS_PRODUCTION_ORIGINS não definida"**

**Causa**: CORS não configurado para produção

**Solução**:
```bash
# Adicionar ao .env
echo "CORS_PRODUCTION_ORIGINS=https://app.tally.com.br,https://tally.com.br" >> .env
```

### **Problema 4: "Redis não disponível"**

**Causa**: REDIS_HOST não configurado

**Solução**:
```bash
# Adicionar ao .env
echo "REDIS_HOST=localhost" >> .env
echo "REDIS_PORT=6379" >> .env
```

---

## 📈 VARIÁVEIS POR CATEGORIA

### **🔴 OBRIGATÓRIAS (CRÍTICAS)**

| Variável | Descrição | Mínimo | Exemplo |
|----------|-----------|--------|---------|
| `NODE_ENV` | Ambiente | - | `production` |
| `JWT_SECRET` | Secret JWT | 32 chars | `a1b2c3...` (128) |
| `JWT_REFRESH_SECRET` | Secret Refresh | 32 chars | `f6e5d4...` (128) |
| `PG_HOST` | Host PostgreSQL | - | `localhost` |
| `PG_PORT` | Porta PostgreSQL | - | `5432` |
| `PG_USER` | Usuário PostgreSQL | - | `tally_user` |
| `PG_PASSWORD` | Senha PostgreSQL | 8 chars | `X9y8Z7...` (32) |
| `PG_DATABASE` | Banco PostgreSQL | - | `painel_agendamento_prod` |
| `REDIS_HOST` | Host Redis | - | `localhost` |
| `REDIS_PORT` | Porta Redis | - | `6379` |
| `CORS_PRODUCTION_ORIGINS` | Domínios CORS | - | `https://app.tally.com.br` |

### **🟡 RECOMENDADAS**

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `REDIS_PASSWORD` | Senha Redis | (vazio) |
| `JWT_EXPIRES_IN` | Expiração JWT | `2h` |
| `JWT_REFRESH_EXPIRES_IN` | Expiração Refresh | `7d` |
| `BCRYPT_SALT_ROUNDS` | Salt Bcrypt | `12` |
| `RATE_LIMIT_MAX_REQUESTS` | Rate Limit | `100` |

### **🟢 OPCIONAIS**

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta HTTP | `3000` |
| `HOST` | Host HTTP | `0.0.0.0` |
| `LOG_LEVEL` | Nível de log | `info` |
| `LOG_FILE` | Arquivo de log | `logs/app.log` |

---

## 📝 TEMPLATE .env.production

```bash
# ========================================
# PRODUÇÃO - TALLY
# ========================================
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# JWT (128 caracteres cada)
JWT_SECRET=<GERAR_COM_SCRIPT>
JWT_REFRESH_SECRET=<GERAR_COM_SCRIPT>
JWT_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_USER=tally_user
PG_PASSWORD=<GERAR_COM_SCRIPT>
PG_DATABASE=painel_agendamento_prod

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<GERAR_COM_SCRIPT>
REDIS_DB=0

# Evolution API
EVO_API_BASE_URL=https://sua-api.com/
EVO_API_INSTANCE_ID=SUA_INSTANCE
EVO_API_KEY=SUA_KEY

# Notificações
ENABLE_WHATSAPP_NOTIFICATIONS=true
REMINDER_24H_ENABLED=true
REMINDER_1H_ENABLED=true

# Segurança
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BCRYPT_SALT_ROUNDS=12

# CORS
CORS_PRODUCTION_ORIGINS=https://app.tally.com.br,https://tally.com.br

# Logs
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

---

## 🎯 PRÓXIMOS PASSOS

Após validar variáveis de ambiente:

1. ✅ **Gerar secrets** com `generate-secrets.js`
2. ✅ **Configurar .env** (dev e prod)
3. ✅ **Validar** com `validate-env.js`
4. ✅ **Testar aplicação** localmente
5. ✅ **Fazer backup** dos secrets
6. ➡️ **Prosseguir para ITEM 5** - Compressão de Imagens

---

**Implementado em**: 12 de dezembro de 2025  
**Status**: ✅ **PRONTO PARA PRODUÇÃO**  
**Segurança**: 🔴 **CRÍTICO - OBRIGATÓRIO**

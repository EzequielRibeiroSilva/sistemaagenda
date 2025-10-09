# 🐳 Docker Environment - Painel de Agendamento

Este documento contém instruções para executar o **Painel de Agendamento** usando Docker Compose, orquestrando Frontend (React/Vite), Backend (Node.js) e PostgreSQL.

## 📋 Pré-requisitos

### 1. Docker Desktop
- **macOS**: [Download Docker Desktop for Mac](https://docs.docker.com/desktop/mac/install/)
- **Windows**: [Download Docker Desktop for Windows](https://docs.docker.com/desktop/windows/install/)
- **Linux**: [Install Docker Engine](https://docs.docker.com/engine/install/)

### 2. Verificação de Pré-requisitos
Execute o script de verificação:
```bash
./check-requirements.sh
```

## 🚀 Inicialização Rápida

### 1. Iniciar Ambiente Completo
```bash
./start.sh
```

Este comando irá:
- ✅ Verificar pré-requisitos
- 🏗️ Construir as imagens Docker
- 🚀 Iniciar todos os serviços
- 🏥 Verificar saúde dos containers
- 📊 Exibir URLs de acesso

### 2. Parar Ambiente
```bash
./stop.sh
```

## 🏗️ Arquitetura dos Containers

### 📊 PostgreSQL Database (`db`)
- **Imagem**: `postgres:15-alpine`
- **Porta**: `5432`
- **Volume**: `postgres_data` (dados persistem)
- **Banco**: `painel_agendamento_dev`
- **Usuário**: `postgres` / `postgres`

### 🔧 Backend Node.js (`backend`)
- **Build**: `./backend/Dockerfile`
- **Porta**: `3000`
- **Comando**: `npm run dev`
- **Health Check**: `http://localhost:3000/health`
- **Hot Reload**: ✅ Habilitado

### 🎨 Frontend React/Vite (`frontend`)
- **Build**: `./Dockerfile.frontend`
- **Porta**: `5173`
- **Comando**: `npm run dev -- --host 0.0.0.0`
- **Health Check**: `http://localhost:5173`
- **Hot Reload**: ✅ Habilitado

## 🌐 URLs de Acesso

Após inicialização bem-sucedida:

| Serviço | URL | Descrição |
|---------|-----|-----------|
| 🎨 **Frontend** | http://localhost:5173 | Interface React/Vite |
| 🔧 **Backend** | http://localhost:3000 | API Node.js |
| 🏥 **Health Check** | http://localhost:3000/health | Status da API |
| 📊 **Database** | localhost:5432 | PostgreSQL |

## 📋 Comandos Úteis

### Logs dos Containers
```bash
# Todos os logs
docker-compose logs -f

# Logs específicos
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db
```

### Status dos Containers
```bash
docker-compose ps
```

### Executar Comandos nos Containers
```bash
# Backend
docker-compose exec backend npm install
docker-compose exec backend npm run test

# Database
docker-compose exec db psql -U postgres -d painel_agendamento_dev

# Frontend
docker-compose exec frontend npm install
```

### Reconstruir Containers
```bash
# Reconstruir tudo
docker-compose up --build

# Reconstruir serviço específico
docker-compose up --build backend
```

## 🗄️ Gerenciamento de Dados

### Persistência
- ✅ **Dados PostgreSQL**: Persistem no volume `postgres_data`
- ✅ **Código fonte**: Mapeado via volumes (hot reload)

### Backup do Banco
```bash
# Criar backup
docker-compose exec db pg_dump -U postgres painel_agendamento_dev > backup.sql

# Restaurar backup
docker-compose exec -T db psql -U postgres painel_agendamento_dev < backup.sql
```

### Limpar Dados
```bash
# Parar e remover containers + volumes (CUIDADO: apaga dados!)
docker-compose down -v

# Limpar imagens não utilizadas
docker system prune
```

## 🔧 Configuração de Desenvolvimento

### Variáveis de Ambiente
As configurações estão no `docker-compose.yml`:

```yaml
environment:
  NODE_ENV: development
  PG_HOST: db  # Nome do serviço PostgreSQL
  PG_PORT: 5432
  PG_DATABASE: painel_agendamento_dev
  # ... outras variáveis
```

### Hot Reload
- ✅ **Backend**: Nodemon detecta mudanças automaticamente
- ✅ **Frontend**: Vite HMR (Hot Module Replacement)
- ✅ **Volumes**: Código local mapeado para containers

## 🚨 Troubleshooting

### Problemas Comuns

#### 1. Porta em Uso
```bash
# Verificar o que está usando a porta
lsof -i :3000
lsof -i :5173
lsof -i :5432

# Parar processo específico
kill -9 <PID>
```

#### 2. Container não Inicia
```bash
# Ver logs detalhados
docker-compose logs backend
docker-compose logs frontend
docker-compose logs db

# Reconstruir do zero
docker-compose down
docker-compose up --build
```

#### 3. Banco de Dados não Conecta
```bash
# Verificar se PostgreSQL está saudável
docker-compose exec db pg_isready -U postgres

# Conectar manualmente
docker-compose exec db psql -U postgres -d painel_agendamento_dev
```

#### 4. Dependências Desatualizadas
```bash
# Reinstalar dependências backend
docker-compose exec backend rm -rf node_modules package-lock.json
docker-compose exec backend npm install

# Reinstalar dependências frontend
docker-compose exec frontend rm -rf node_modules package-lock.json
docker-compose exec frontend npm install
```

### Logs de Debug
```bash
# Logs em tempo real com timestamps
docker-compose logs -f --timestamps

# Logs apenas de erros
docker-compose logs --tail=50 | grep -i error
```

## 🔒 Segurança

### Configurações de Produção
Para produção, ajuste:
- ✅ Senhas fortes no PostgreSQL
- ✅ JWT secrets seguros
- ✅ Remover volumes de desenvolvimento
- ✅ Usar imagens otimizadas (multi-stage builds)

### Rede Isolada
Os containers se comunicam via rede `painel_network`, isolada do host.

## 📚 Referências

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Vite Docker Configuration](https://vitejs.dev/guide/static-deploy.html)

---

**Criado por**: Painel de Agendamento Team  
**Versão**: 1.0.0  
**Data**: Janeiro 2025

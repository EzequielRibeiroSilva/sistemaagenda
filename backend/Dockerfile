# Dockerfile para Backend Node.js
FROM node:18-alpine

# Instalar curl para healthcheck e tzdata para suporte a fusos horários
RUN apk add --no-cache curl tzdata

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (incluindo devDependencies para desenvolvimento)
RUN npm ci && npm cache clean --force

# Copiar código fonte
COPY . .

# Criar diretório de logs
RUN mkdir -p logs

# Expor porta
EXPOSE 3001

# Definir usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

# Comando padrão
CMD ["npm", "start"]

# ✅ CHECKLIST DE DEPLOY - TALLY PRODUÇÃO

## 📋 PRÉ-DEPLOY

- [ ] Código commitado e testado localmente
- [ ] Commit enviado para GitHub (`git push origin master`)
- [ ] Changelog/Release notes atualizados
- [ ] Verificar se há migrations de banco de dados
- [ ] Revisar variáveis de ambiente necessárias

## 🔒 BACKUP (OBRIGATÓRIO)

```bash
cd /var/www/tally

# Backup do código
tar -czf backups/code_backup_$(date +%Y%m%d_%H%M%S).tar.gz \
  components/ hooks/ utils/ App.tsx package.json

# Backup do banco de dados
./backup-db.sh

# Verificar espaço em disco
df -h /
```

## 🚀 DEPLOY

```bash
cd /var/www/tally

# 1. Pull do código
git pull origin master

# 2. Verificar mudanças
git log -1 --stat

# 3. Build do frontend (se houver mudanças no frontend)
docker compose -f docker-compose.prod.yml --env-file .env.prod build \
  --build-arg VITE_API_BASE_URL=https://app.tally.com.br/api \
  frontend_app

# 4. Build do backend (se houver mudanças no backend)
docker compose -f docker-compose.prod.yml --env-file .env.prod build backend

# 5. Restart dos containers
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 6. Aguardar containers ficarem healthy (30-60 segundos)
sleep 30
docker ps
```

## ✅ VALIDAÇÃO PÓS-DEPLOY

```bash
# 1. Verificar status dos containers
docker ps

# 2. Verificar logs do backend
docker logs painel_backend_prod --tail 50

# 3. Verificar logs do frontend
docker logs painel_frontend_app_prod --tail 20

# 4. Testar aplicação
# - Acessar https://app.tally.com.br
# - Fazer login
# - Testar funcionalidade principal alterada
```

## 📊 MONITORAMENTO (10 minutos)

- [ ] Aplicação acessível
- [ ] Login funcionando
- [ ] Sem erros nos logs
- [ ] Performance normal
- [ ] Funcionalidades críticas OK

## 🆘 ROLLBACK (Se necessário)

```bash
cd /var/www/tally

# 1. Voltar para commit anterior
git log --oneline -5  # Ver commits
git reset --hard <COMMIT_ANTERIOR>

# 2. Rebuild e restart
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 3. Restaurar banco (se necessário)
# Listar backups disponíveis
ls -lh backups/database/

# Restaurar
gunzip -c backups/database/backup_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i painel_db_prod psql -U painel_prod_user painel_agendamento_prod
```

## 📝 PÓS-DEPLOY

- [ ] Atualizar documentação se necessário
- [ ] Comunicar equipe sobre mudanças
- [ ] Marcar release no GitHub (opcional)
- [ ] Atualizar este checklist se processo mudou

---

**IMPORTANTE:** Nunca pule o backup! É sua rede de segurança.

# 🏦 Bateria de Testes Elite - Módulo Estoque

## **Protocolo de Auditoria Tally**

Este documento detalha a bateria de testes de integração que valida todas as travas de segurança implementadas no módulo de estoque após o Protocolo de Auditoria Tally.

---

## **📋 Sumário de Tarefas Implementadas**

| Task | Descrição | Status |
|------|-----------|--------|
| 1.1 | Guard Clause - Custo Médio Ponderado | ✅ Implementado |
| 1.2 | Paginação de Snapshot de Estoque | ✅ Implementado |
| 2.1 | Índice de Idempotência | ✅ Implementado |
| 2.2 | Ledger Append-Only (sem UPDATE) | ✅ Implementado |
| 3.1 | Validação de Rastreabilidade em Estornos | ✅ Implementado |
| 3.2 | VIEW de Saldo Consolidado | ✅ Implementado |

---

## **🧪 Cenários de Teste**

### **Cenário 1: Rastreabilidade de Estorno (Task 3.1)**

**Objetivo:** Garantir que TODOS os estornos tenham `origem_id` válido para rastreabilidade total.

**Ação:**
- Tentar processar estorno de venda sem `origem_id` válido
- Simular cenários de `origem_id` nulo ou string vazia

**Expectativa:**
- Sistema deve bloquear requisição imediatamente
- Retornar HTTP 422 (Unprocessable Entity)
- Não criar registros órfãos na tabela `estoque_movimentacoes`

**Validação SQL:**
```sql
-- Verificar ausência de estornos sem origem_id
SELECT COUNT(*) FROM estoque_movimentacoes
WHERE tipo = 'ESTORNO' AND origem_id IS NULL;
-- Resultado esperado: 0
```

**Critério de Sucesso:** ✅ Zero registros órfãos

---

### **Cenário 2: Idempotência do Ledger (Task 2.1 e 2.2)**

**Objetivo:** Garantir que retries não criem duplicatas no ledger.

**Ação:**
- Disparar mesma operação de ENTRADA 5 vezes seguidas
- Usar mesmo `origem_id` em todas as tentativas
- Medir tempo de execução das queries de idempotência

**Expectativa:**
- Sistema deve criar apenas 1 movimentação
- As 4 tentativas seguintes devem ser ignoradas (idempotência)
- Não criar ajustes compensatórios desnecessários
- Query de verificação deve executar em < 50ms (com índice)

**Validação SQL:**
```sql
-- Contar movimentações para o origem_id testado
SELECT COUNT(*) FROM estoque_movimentacoes
WHERE origem_id = 'TEST:IDEMPOTENCY:X';
-- Resultado esperado: 1

-- Verificar ausência de ajustes compensatórios
SELECT COUNT(*) FROM estoque_movimentacoes
WHERE tipo = 'AJUSTE' AND origem_id LIKE 'AJUSTE:%:ENTRADA';
-- Resultado esperado: 0 (não deve haver ajustes para operação idêntica)
```

**Critério de Sucesso:** 
- ✅ 1 registro criado (4 ignorados)
- ✅ Query < 50ms (performance com índice)

---

### **Cenário 3: Integridade do Custo Médio (Task 1.1)**

**Objetivo:** Impedir que produtos fiquem com custo médio zero ou negativo.

**Ação:**
- Tentar criar ENTRADA com `preco_custo_entrada = 0`
- Tentar criar ENTRADA com `preco_custo_entrada = -50`

**Expectativa:**
- Sistema deve disparar exceção com código `INVALID_CMP`
- Retornar HTTP 422
- Campo `preco_custo_medio` deve permanecer inalterado (rollback atômico)

**Validação SQL:**
```sql
-- Verificar que custo médio não foi alterado
SELECT preco_custo_medio FROM produtos WHERE id = ?;
-- Resultado: valor anterior preservado

-- Verificar que não foi criada movimentação inválida
SELECT COUNT(*) FROM estoque_movimentacoes
WHERE tipo = 'ENTRADA' AND preco_unitario_entrada <= 0;
-- Resultado esperado: 0
```

**Critério de Sucesso:** 
- ✅ Exceção lançada
- ✅ Rollback atômico (custo preservado)

---

### **Cenário 4: Consistência de Saldo via VIEW (Task 3.2)**

**Objetivo:** Garantir que `saldo_total` da VIEW seja sempre igual a `saldo_venda + saldo_consumo`.

**Ação:**
- Executar sequência de movimentações:
  1. ENTRADA de 100 unidades
  2. SAIDA de 30 unidades
  3. AJUSTE de 5 unidades
- Consultar VIEW após cada operação

**Expectativa:**
- `saldo_total` (VIEW) = `saldo_venda + saldo_consumo` (tabela)
- Consistência matemática em todas as etapas
- Alertas de estoque calculados corretamente

**Validação SQL:**
```sql
-- Verificar consistência matemática
SELECT 
  saldo_venda,
  saldo_consumo,
  (saldo_venda + saldo_consumo) AS calc_manual,
  saldo_total AS calc_view
FROM estoque_saldo_consolidado
WHERE produto_id = ? AND unidade_id = ?;
-- Resultado: calc_manual = calc_view

-- Verificar alertas
SELECT 
  alerta_estoque_baixo,
  alerta_estoque_excesso,
  saldo_total,
  estoque_minimo,
  estoque_maximo
FROM estoque_saldo_consolidado
WHERE produto_id = ? AND unidade_id = ?;
```

**Critério de Sucesso:** 
- ✅ Saldo sempre consistente (3/3 operações)
- ✅ Alertas corretos (baixo/excesso)

---

### **Cenário 5: Performance de Paginação (Task 1.2)**

**Objetivo:** Garantir que snapshot paginado retorna em tempo aceitável.

**Ação:**
- Consultar snapshot com `LIMIT 100 OFFSET 0`
- Medir tempo de execução da query

**Expectativa:**
- Query deve executar em < 500ms
- Retornar no máximo 100 registros por página

**Validação SQL:**
```sql
EXPLAIN ANALYZE
SELECT p.id, p.nome, 
  COALESCE(eu.saldo_venda, 0) as saldo_venda,
  COALESCE(eu.saldo_consumo, 0) as saldo_consumo
FROM produtos p
LEFT JOIN estoque_unidades eu ON eu.produto_id = p.id AND eu.unidade_id = ?
WHERE p.usuario_id = ? AND p.deleted_at IS NULL
ORDER BY p.nome ASC
LIMIT 100 OFFSET 0;
-- Resultado: Execution Time < 500ms
```

**Critério de Sucesso:** 
- ✅ Query < 500ms
- ✅ Máximo 100 registros retornados

---

## **📊 Relatório de Execução**

### **Como Executar os Testes:**

```bash
# Tornar script executável
chmod +x backend/scripts/run-estoque-tests.sh

# Executar bateria de testes
./backend/scripts/run-estoque-tests.sh
```

### **Ou manualmente:**

```bash
cd backend
npm run migrate  # Executar migrations pendentes
npx jest tests/integration/estoque.elite.test.js --verbose
```

---

## **✅ Critérios de Aceite Global**

Para que o módulo de estoque seja considerado **ELITE STATUS**, todos os cenários devem:

1. ✅ **Passar sem erros** (100% de sucesso)
2. ✅ **Garantir integridade** (zero inconsistências de saldo)
3. ✅ **Manter performance** (queries < 500ms)
4. ✅ **Preservar rastreabilidade** (zero registros órfãos)
5. ✅ **Respeitar idempotência** (zero duplicatas)

---

## **🏆 Status Esperado**

```
🏦 =============================================
✅ TODOS OS TESTES PASSARAM
🏆 Módulo de Estoque: ELITE STATUS CONFIRMADO
🏦 =============================================

Cenário 1: ✅ PASSOU - Rastreabilidade garantida
Cenário 2: ✅ PASSOU - Idempotência (5 retries → 1 registro)
Cenário 3: ✅ PASSOU - Custo médio protegido
Cenário 4: ✅ PASSOU - Consistência matemática
Cenário 5: ✅ PASSOU - Performance aceitável

⏱️  Tempo total: ~2-5 segundos
📊 Performance média: EXCELENTE
🔒 Integridade: 100%
```

---

## **🚨 O Que Fazer Se Algum Teste Falhar**

### **Cenário 1 Falhou (Estornos Órfãos):**
- Verificar se Guard Clause está implementada em `VendaController.js`
- Revisar tratamento de erro no catch (deve retornar 422)

### **Cenário 2 Falhou (Duplicatas):**
- Verificar se migration do índice foi executada (`20260624131000`)
- Revisar lógica de idempotência em `InventoryService.js` (linhas ~457-470)

### **Cenário 3 Falhou (Custo Inválido):**
- Verificar Guard Clause em `InventoryService.js` (linhas ~252-259)
- Garantir que transação está revertendo (rollback atômico)

### **Cenário 4 Falhou (Inconsistência de Saldo):**
- Verificar se VIEW foi criada (`20260624140000`)
- Revisar cálculo de `saldo_total` na VIEW (COALESCE correto?)

### **Cenário 5 Falhou (Performance Ruim):**
- Verificar se índices existem em `estoque_unidades` e `produtos`
- Analisar plano de execução com `EXPLAIN ANALYZE`

---

## **📝 Notas Técnicas**

### **Ambiente de Teste:**
- Database: PostgreSQL
- ORM: Knex.js
- Test Framework: Jest
- Timeout: 30 segundos por teste

### **Dados de Teste:**
- Criados dinamicamente no `beforeAll`
- Limpos no `afterAll` (sem poluição do banco)
- Isolados por `usuario_id` único

### **Isolamento:**
- Cada cenário é independente
- Não há dependência entre testes
- Rollback automático em caso de falha

---

## **🔗 Referências**

- [Migration - Índice de Idempotência](./migrations/20260624131000_add_idx_est_mov_idempotency.js)
- [Migration - VIEW Saldo Consolidado](./migrations/20260624140000_create_view_estoque_saldo_consolidado.js)
- [InventoryService.js](./src/services/InventoryService.js)
- [VendaController.js](./src/controllers/VendaController.js)
- [EstoqueController.js](./src/controllers/EstoqueController.js)

---

**Última atualização:** 24/06/2026  
**Versão:** 1.0.0  
**Status:** 🏆 Elite

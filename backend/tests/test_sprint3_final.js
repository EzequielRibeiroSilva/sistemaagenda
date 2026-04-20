/* eslint-disable no-console */

const { execFileSync } = require('child_process');

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3001';
const EMAIL = 'testando@gmail.com';
const SENHA = 'Teste@123';

const DB_CONTAINER = process.env.TEST_DB_CONTAINER || 'painel_agendamento_db';
const DB_NAME = process.env.TEST_PG_DATABASE || 'painel_agendamento_dev';
const DB_USER = process.env.TEST_PG_USER || 'postgres';

function psqlRows(sql) {
  const out = execFileSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-F', '\t', '-c', sql],
    { encoding: 'utf8' }
  );

  const text = String(out).trim();
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.split('\t'));
}

function psqlScalar(sql) {
  const rows = psqlRows(sql);
  if (!rows.length) return '';
  return (rows[0]?.[0] ?? '').trim();
}

async function httpJson(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // 0) Garantir API online
  const health = await httpJson('/health');
  if (health.status !== 200) {
    throw new Error(`API não respondeu em ${BASE_URL} (health status=${health.status})`);
  }

  // 1) Login
  const login = await httpJson('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, senha: SENHA }
  });

  if (login.status !== 200 || !login.json?.data?.token) {
    throw new Error(`Login falhou: status=${login.status} body=${JSON.stringify(login.json)}`);
  }

  const token = login.json.data.token;

  // Parametrização do teste conforme roteiro
  const servicoId = 17; // Corte de Cabelo
  const agendamentoId = 250; // Aprovado

  // 2) Resolver produto_id da Pomada Matte Elite (do mesmo tenant do agendamento)
  // Buscar tenant via agendamento -> unidade -> usuario
  const unidadeId = Number(psqlScalar(`select unidade_id from agendamentos where id=${agendamentoId};`));
  if (!Number.isFinite(unidadeId) || unidadeId <= 0) {
    throw new Error(`Não encontrei unidade_id para agendamento ${agendamentoId}`);
  }

  const usuarioId = Number(psqlScalar(`select usuario_id from unidades where id=${unidadeId};`));
  if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
    throw new Error(`Não encontrei usuario_id para unidade_id ${unidadeId}`);
  }

  const produtoId = Number(psqlScalar(
    `select id from produtos where usuario_id=${usuarioId} and lower(nome)=lower('Pomada Matte Elite') order by id desc limit 1;`
  ));

  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    throw new Error(`Não encontrei produto Pomada Matte Elite para usuario_id ${usuarioId}`);
  }

  // 3) Vincular insumo ao serviço (PUT /servicos/:id/insumos)
  const putInsumos = await httpJson(`/api/servicos/${servicoId}/insumos`, {
    method: 'PUT',
    token,
    body: {
      insumos: [{ produto_id: produtoId, quantidade: 0.05 }]
    }
  });

  if (putInsumos.status !== 200) {
    throw new Error(`PUT insumos falhou: status=${putInsumos.status} body=${JSON.stringify(putInsumos.json)}`);
  }

  // 4) Garantir saldo suficiente (se não tiver snapshot/saldo, faz ENTRADA 1)
  const saldoAntesRaw = psqlScalar(
    `select saldo_atual from estoque_unidades where produto_id=${produtoId} and unidade_id=${unidadeId} limit 1;`
  );
  const saldoAntes = saldoAntesRaw ? Number(saldoAntesRaw) : null;

  if (saldoAntes === null || Number.isNaN(saldoAntes) || saldoAntes < 0.05) {
    const entrada = await httpJson(`/api/produtos/${produtoId}/ajuste`, {
      method: 'POST',
      token,
      body: {
        unidade_id: unidadeId,
        tipo: 'ENTRADA',
        quantidade: 1,
        motivo: 'Preparação baixa automática Sprint 3'
      }
    });

    if (entrada.status !== 201) {
      throw new Error(`ENTRADA preparação falhou: status=${entrada.status} body=${JSON.stringify(entrada.json)}`);
    }
  }

  const saldoAntesEfetivo = Number(psqlScalar(
    `select saldo_atual from estoque_unidades where produto_id=${produtoId} and unidade_id=${unidadeId} limit 1;`
  ));

  // 5) Finalizar agendamento (dispara hook)
  const finalize = await httpJson(`/api/agendamentos/${agendamentoId}/finalize`, {
    method: 'PATCH',
    token,
    body: { paymentMethod: 'PIX' }
  });

  if (finalize.status !== 200) {
    throw new Error(`FINALIZE falhou: status=${finalize.status} body=${JSON.stringify(finalize.json)}`);
  }

  // aguardar hook async
  await sleep(1200);

  // 6) Validar DB: saldo baixou 0.050 e ledger tem CONSUMO com origem_id do agendamento
  const saldoDepois = Number(psqlScalar(
    `select saldo_atual from estoque_unidades where produto_id=${produtoId} and unidade_id=${unidadeId} limit 1;`
  ));

  const delta = Number((saldoAntesEfetivo - saldoDepois).toFixed(3));

  const ledgerRows = psqlRows(
    `select id,tipo,quantidade,origem_id,produto_id,unidade_id,usuario_id,created_at from estoque_movimentacoes where tipo='CONSUMO' and origem_id='${agendamentoId}' and produto_id=${produtoId} order by id asc;`
  ).map((r) => ({
    id: Number(r[0]),
    tipo: r[1],
    quantidade: Number(r[2]),
    origem_id: r[3],
    produto_id: Number(r[4]),
    unidade_id: Number(r[5]),
    usuario_id: Number(r[6]),
    created_at: r[7]
  }));

  const out = {
    baseUrl: BASE_URL,
    contexto: {
      usuario_id: usuarioId,
      unidade_id: unidadeId,
      produto_id: produtoId,
      servico_id: servicoId,
      agendamento_id: agendamentoId
    },
    api: {
      putInsumos: { status: putInsumos.status },
      finalize: { status: finalize.status, data: finalize.json?.data }
    },
    estoque: {
      saldo_antes: saldoAntesEfetivo,
      saldo_depois: saldoDepois,
      delta_consumo_esperado: 0.05,
      delta_consumo_real: delta
    },
    ledger_consumo: {
      count: ledgerRows.length,
      rows: ledgerRows
    }
  };

  console.log(JSON.stringify(out, null, 2));

  if (delta !== 0.05) {
    throw new Error(`Delta de consumo incorreto: esperado 0.050, obtido ${delta}`);
  }

  if (ledgerRows.length !== 1) {
    throw new Error(`Ledger CONSUMO incorreto: esperado 1 row, obtido ${ledgerRows.length}`);
  }

  if (Number(ledgerRows[0].quantidade) !== 0.05) {
    throw new Error(`Quantidade no ledger incorreta: esperado 0.050, obtido ${ledgerRows[0].quantidade}`);
  }

  console.log('\n✅ TESTE SPRINT 3 OK: baixa automática 0.050 e ledger CONSUMO com origem_id do agendamento');
}

main().catch((e) => {
  console.error(`\n❌ TESTE SPRINT 3 FALHOU: ${e.message}`);
  process.exit(1);
});

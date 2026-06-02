#!/usr/bin/env node
/**
 * tunnel.js — Script de túnel ngrok para desenvolvimento
 *
 * O que faz:
 *  1. Inicia o ngrok apontando para a porta 3001
 *  2. Aguarda a URL pública ficar disponível via API local do ngrok
 *  3. Atualiza WEBHOOK_BASE_URL no .env de desenvolvimento automaticamente
 *  4. Imprime no terminal a URL e o endpoint exato para colar na Evolution API
 *
 * Uso: npm run tunnel  (dentro de backend/)
 *
 * SEGURANÇA: Este script só roda em NODE_ENV=development.
 * A variável WEBHOOK_BASE_URL é exclusiva do .env local e está no .gitignore.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ─── Configuração ────────────────────────────────────────────────────────────
const TARGET_PORT = 3001;
const NGROK_API_PORT = 4040;          // porta da API local do ngrok
const ENV_FILE = path.resolve(__dirname, '../.env');
const WEBHOOK_PATH = '/api/webhooks/whatsapp';
const MAX_RETRIES = 20;
const RETRY_INTERVAL_MS = 1000;

// ─── Guarda de ambiente ───────────────────────────────────────────────────────
const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production') {
  console.error('❌  Este script NÃO deve ser executado em produção.');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Faz uma requisição GET simples e retorna o body como string */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/** Consulta a API local do ngrok e retorna a URL pública HTTPS */
async function getNgrokUrl(retries = 0) {
  try {
    const body = await httpGet(`http://127.0.0.1:${NGROK_API_PORT}/api/tunnels`);
    const json = JSON.parse(body);
    const tunnels = json?.tunnels || [];
    const https = tunnels.find(
      (t) => t.proto === 'https' && String(t.config?.addr || '').includes(String(TARGET_PORT))
    );
    if (https?.public_url) return https.public_url;
    throw new Error('Túnel HTTPS ainda não disponível');
  } catch (err) {
    if (retries >= MAX_RETRIES) {
      throw new Error(`Não foi possível obter a URL do ngrok após ${MAX_RETRIES} tentativas: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    return getNgrokUrl(retries + 1);
  }
}

/**
 * Atualiza (ou insere) uma variável no arquivo .env.
 * Preserva todos os outros valores e comentários.
 */
function updateEnvVar(filePath, key, value) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^(${escapedKey}\\s*=.*)$`, 'm');

  const newLine = `${key}=${value}`;

  if (regex.test(content)) {
    content = content.replace(regex, newLine);
  } else {
    // Adiciona ao final com separador visual
    const separator = '\n# ── Tunnel (gerado automaticamente por npm run tunnel) ──\n';
    content = content.trimEnd() + separator + newLine + '\n';
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚇  Iniciando túnel ngrok → porta', TARGET_PORT, '...\n');

  // Inicia o processo ngrok em background
  const ngrokProcess = spawn('ngrok', ['http', String(TARGET_PORT), '--log=stdout'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  ngrokProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    // Filtra apenas linhas relevantes para não poluir o terminal
    if (line.includes('started tunnel') || line.includes('error') || line.includes('ERR')) {
      console.log('[ngrok]', line);
    }
  });

  ngrokProcess.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error('[ngrok stderr]', line);
  });

  ngrokProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n❌  ngrok encerrou com código ${code}`);
    }
    process.exit(code ?? 0);
  });

  // Propaga Ctrl+C para o processo filho
  process.on('SIGINT', () => {
    console.log('\n\n🛑  Encerrando túnel...');
    ngrokProcess.kill('SIGINT');
  });
  process.on('SIGTERM', () => {
    ngrokProcess.kill('SIGTERM');
  });

  // Aguarda o ngrok subir e obtém a URL
  console.log('⏳  Aguardando URL pública do ngrok...');
  let publicUrl;
  try {
    publicUrl = await getNgrokUrl();
  } catch (err) {
    console.error('\n❌ ', err.message);
    ngrokProcess.kill();
    process.exit(1);
  }

  const webhookFullUrl = `${publicUrl}${WEBHOOK_PATH}`;

  // Atualiza o .env de desenvolvimento
  updateEnvVar(ENV_FILE, 'WEBHOOK_BASE_URL', publicUrl);
  console.log(`✅  .env atualizado: WEBHOOK_BASE_URL=${publicUrl}\n`);

  // Imprime as instruções para o Ezequiel
  console.log('═'.repeat(65));
  console.log('  🌐  TÚNEL ATIVO');
  console.log('═'.repeat(65));
  console.log(`  URL base pública : ${publicUrl}`);
  console.log(`  Webhook WhatsApp : ${webhookFullUrl}`);
  console.log('─'.repeat(65));
  console.log('  📋  Cole na Evolution API:');
  console.log(`\n      URL do Webhook : ${webhookFullUrl}\n`);
  console.log('  ⚙️   Configurações recomendadas na Evolution API:');
  console.log('      • Webhook URL  →  (acima)');
  console.log('      • Events       →  messages.upsert, connection.update');
  console.log('      • Enabled      →  true');
  console.log('─'.repeat(65));
  console.log('  ⚠️   Esta URL muda a cada reinício do túnel.');
  console.log('  🔒  WEBHOOK_BASE_URL é apenas para development.');
  console.log('═'.repeat(65));
  console.log('\n  Pressione Ctrl+C para encerrar o túnel.\n');
}

main().catch((err) => {
  console.error('❌  Erro fatal:', err.message);
  process.exit(1);
});

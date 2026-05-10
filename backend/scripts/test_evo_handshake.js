const axios = require('axios');

// Carrega .env via config (config.js já dá require('dotenv').config())
const config = require('../src/config/config');

async function main() {
  const baseUrlRaw = config?.evolutionApi?.baseUrl || process.env.EVOLUTION_API_URL;
  const apiKeyRaw = config?.evolutionApi?.apiKey || process.env.EVOLUTION_API_KEY;

  const baseUrl = (baseUrlRaw || '').toString().replace(/\/+$/g, '');
  const apiKey = (apiKeyRaw || '').toString();

  console.log('[evo-handshake] runtime config');
  console.log({
    baseUrl,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 8) : null,
    apiKeyLen: apiKey ? apiKey.length : 0,
    nodeEnv: process.env.NODE_ENV || null
  });

  if (!baseUrl || !apiKey) {
    console.error('[evo-handshake] missing EVOLUTION_API_URL or EVOLUTION_API_KEY');
    process.exit(2);
  }

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey
    }
  });

  try {
    const resp = await client.get('/instance/fetchInstances');
    const data = resp?.data;
    console.log('[evo-handshake] OK');
    console.log({ status: resp.status, isArray: Array.isArray(data), sample: Array.isArray(data) ? data.slice(0, 1) : data });
    process.exit(0);
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error('[evo-handshake] FAIL');
    console.error({ status, data });
    process.exit(status === 401 || status === 403 ? 10 : 1);
  }
}

main();

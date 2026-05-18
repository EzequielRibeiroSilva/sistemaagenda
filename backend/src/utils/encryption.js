const crypto = require('crypto');

function getEncryptionKey() {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'INTEGRATIONS_ENCRYPTION_KEY ausente. Defina uma chave de 32 bytes (hex com 64 chars ou base64) para criptografia de integrações.'
    );
  }

  const keyStr = String(raw).trim();

  // Preferir hex (64 chars) por simplicidade operacional; aceitar base64 como fallback.
  if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
    return Buffer.from(keyStr, 'hex');
  }

  // Base64: ao decodificar deve resultar em 32 bytes.
  let buf;
  try {
    buf = Buffer.from(keyStr, 'base64');
  } catch {
    buf = null;
  }

  if (!buf || buf.length !== 32) {
    throw new Error(
      'INTEGRATIONS_ENCRYPTION_KEY inválida. Use 32 bytes: hex (64 chars) ou base64 que decode para 32 bytes.'
    );
  }

  return buf;
}

// Validar no load do módulo (requisito inegociável)
const ENCRYPTION_KEY = getEncryptionKey();

/**
 * Criptografar texto usando AES-256-GCM.
 *
 * @param {string} plaintext
 * @returns {{ ciphertext: string, iv: string, authTag: string }}
 */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decriptografar payload usando AES-256-GCM.
 *
 * @param {{ ciphertext: string, iv: string, authTag: string }} payload
 * @returns {string}
 */
function decrypt(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload inválido para decrypt');
  }

  const { ciphertext, iv, authTag } = payload;

  if (!ciphertext || !iv || !authTag) {
    throw new Error('Payload inválido para decrypt: ciphertext, iv e authTag são obrigatórios');
  }

  const ivBuf = Buffer.from(String(iv), 'hex');
  const tagBuf = Buffer.from(String(authTag), 'hex');
  const dataBuf = Buffer.from(String(ciphertext), 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, ivBuf);
  decipher.setAuthTag(tagBuf);

  const plaintext = Buffer.concat([decipher.update(dataBuf), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = {
  encrypt,
  decrypt
};

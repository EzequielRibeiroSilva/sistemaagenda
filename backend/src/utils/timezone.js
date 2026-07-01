const { fromZonedTime } = require('date-fns-tz');

/**
 * SINGLE SOURCE OF TRUTH: Manipulação de Timezones
 * 
 * Este utilitário garante que todas as conversões de data no sistema
 * respeitem o timezone configurado no ambiente, eliminando offsets hardcoded.
 * 
 * Configuração:
 * - Timezone padrão: process.env.TZ || 'America/Sao_Paulo'
 * - Formato de entrada: 'YYYY-MM-DD' (enviado pelo frontend)
 * - Formato de saída: Date object (UTC timestamp para PostgreSQL)
 */

const APP_TIMEZONE = process.env.TZ || 'America/Sao_Paulo';

/**
 * Converte uma data (YYYY-MM-DD) para o início do dia (00:00:00) no fuso configurado
 * 
 * @param {string} dateString - Data no formato 'YYYY-MM-DD'
 * @returns {Date} Date object representando 00:00:00 no timezone configurado
 * 
 * @example
 * startOfDay('2026-06-17')
 * // Retorna: Date object equivalente a '2026-06-17T00:00:00-03:00' (UTC: '2026-06-17T03:00:00.000Z')
 */
const startOfDay = (dateString) => {
  return fromZonedTime(`${dateString} 00:00:00`, APP_TIMEZONE);
};

/**
 * Converte uma data (YYYY-MM-DD) para o fim do dia (23:59:59) no fuso configurado
 * 
 * @param {string} dateString - Data no formato 'YYYY-MM-DD'
 * @returns {Date} Date object representando 23:59:59 no timezone configurado
 * 
 * @example
 * endOfDay('2026-06-17')
 * // Retorna: Date object equivalente a '2026-06-17T23:59:59-03:00' (UTC: '2026-06-18T02:59:59.000Z')
 */
const endOfDay = (dateString) => {
  return fromZonedTime(`${dateString} 23:59:59`, APP_TIMEZONE);
};

module.exports = {
  startOfDay,
  endOfDay,
  APP_TIMEZONE
};

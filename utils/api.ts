/**
 * Utilitários para URLs da API
 * Centraliza a configuração de URLs para evitar hardcoding
 */

// URL base da API (backend)
const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (import.meta.env.PROD && (!envApiBaseUrl || envApiBaseUrl.trim() === '')) {
  throw new Error('VITE_API_BASE_URL deve ser definido em produção');
}

export const API_BASE_URL = envApiBaseUrl || 'http://localhost:3001/api';

// URL base para assets (uploads, avatares, etc.)
// NOTA: Se VITE_API_BASE_URL é '/api', o replace retorna '' (string vazia)
// que é o comportamento correto para usar URLs relativas em produção.
// Usamos !== undefined para não confundir string vazia com ausência de valor.
const assetsBaseFromEnv = envApiBaseUrl !== undefined ? envApiBaseUrl.replace('/api', '') : undefined;
export const ASSETS_BASE_URL = assetsBaseFromEnv !== undefined ? assetsBaseFromEnv : 'http://localhost:3001';

/**
 * Constrói URL completa para assets (avatares, logos, etc.)
 * @param assetPath - Caminho do asset (ex: "/uploads/avatars/123.jpg")
 * @returns URL completa do asset
 */
export const getAssetUrl = (assetPath: string | null | undefined): string => {
  if (!assetPath) return '';
  
  // Se já é uma URL completa, retorna como está
  if (assetPath.startsWith('http')) {
    return assetPath;
  }
  
  // Constrói URL completa
  return `${ASSETS_BASE_URL}${assetPath}`;
};

/**
 * Constrói URL da API
 * @param endpoint - Endpoint da API (ex: "/auth/login")
 * @returns URL completa da API
 */
export const getApiUrl = (endpoint: string): string => {
  return `${API_BASE_URL}${endpoint}`;
};

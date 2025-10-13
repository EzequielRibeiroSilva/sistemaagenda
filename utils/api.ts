/**
 * Utilitários para URLs da API
 * Centraliza a configuração de URLs para evitar hardcoding
 */

// URL base da API (backend)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// URL base para assets (uploads, avatares, etc.)
export const ASSETS_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3000';

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

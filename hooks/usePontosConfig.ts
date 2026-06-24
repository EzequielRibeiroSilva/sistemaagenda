/**
 * Hook: usePontosConfig
 * Descrição: Gerencia configurações do Sistema de Pontos
 * Endpoints: GET /api/pontos/configuracoes, PUT /api/pontos/configuracoes
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

interface PontosConfig {
  pontos_ativo: boolean;
  pontos_por_real: number;
  reais_por_pontos: number;
  pontos_validade_meses: number;
  limite_desconto_percentual: number;
}

interface UsePontosConfigReturn {
  config: PontosConfig | null;
  loading: boolean;
  error: string | null;
  loadConfig: () => Promise<void>;
  updateConfig: (dados: Partial<PontosConfig>) => Promise<PontosConfig | null>;
  clearError: () => void;
}

export const usePontosConfig = (): UsePontosConfigReturn => {
  const { token } = useAuth();
  const [config, setConfig] = useState<PontosConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadConfig = useCallback(async () => {
    if (!token) {
      setError('Token de autenticação não encontrado');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/pontos/configuracoes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Erro ao carregar configurações de pontos');
      }

      if (data.success && data.data) {
        setConfig(data.data);
      } else {
        throw new Error('Resposta inválida do servidor');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao carregar configurações';
      setError(errorMessage);
      console.error('[usePontosConfig] Erro ao carregar configurações:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const updateConfig = useCallback(async (dados: Partial<PontosConfig>): Promise<PontosConfig | null> => {
    if (!token) {
      setError('Token de autenticação não encontrado');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/pontos/configuracoes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(dados)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Erro ao atualizar configurações de pontos');
      }

      if (data.success && data.data) {
        setConfig(data.data);
        return data.data;
      } else {
        throw new Error('Resposta inválida do servidor');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao atualizar configurações';
      setError(errorMessage);
      console.error('[usePontosConfig] Erro ao atualizar configurações:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  return {
    config,
    loading,
    error,
    loadConfig,
    updateConfig,
    clearError
  };
};

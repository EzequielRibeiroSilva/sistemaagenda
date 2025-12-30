import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export type PlanoAssinaturaStatus = 'Ativo' | 'Bloqueado';
export type PlanoAssinaturaItemTipo = 'SERVICO' | 'EXTRA';

export interface PlanoAssinaturaItemInput {
  tipo: PlanoAssinaturaItemTipo;
  servico_id?: number | null;
  servico_extra_id?: number | null;
  quantidade_por_ciclo?: number | null;
}

export interface PlanoAssinaturaListItem {
  id: number;
  unidade_id?: number | null;
  usuario_id?: number;
  nome: string;
  validade_dias: number;
  valor: number;
  renovacao_automatica: boolean;
  status: PlanoAssinaturaStatus;
  client_count?: number;
  created_at: string;
  updated_at: string;
}

export interface PlanoAssinaturaDetalhe extends PlanoAssinaturaListItem {
  itens: Array<{
    id: number;
    plano_id: number;
    tipo: PlanoAssinaturaItemTipo;
    servico_id: number | null;
    servico_extra_id: number | null;
    quantidade_por_ciclo: number | null;
    created_at: string;
    updated_at: string;
  }>;
}

export interface CreatePlanoAssinaturaData {
  nome: string;
  validade_dias: number;
  valor: number;
  renovacao_automatica: boolean;
  status: PlanoAssinaturaStatus;
  itens: PlanoAssinaturaItemInput[];
}

export const useSubscriptionPlanManagement = () => {
  const { token, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!token || !isAuthenticated) {
      throw new Error('Token de autenticação não encontrado');
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || `Erro HTTP: ${response.status}`);
    }

    return data;
  }, [token, isAuthenticated]);

  const fetchPlans = useCallback(async (): Promise<PlanoAssinaturaListItem[]> => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedFetch(`/planos-assinatura`);
      if (data.success) return Array.isArray(data.data) ? data.data : [];
      throw new Error(data.message || 'Erro ao carregar planos de assinatura');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar planos de assinatura';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  const fetchPlan = useCallback(async (planoId: number): Promise<PlanoAssinaturaDetalhe | null> => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedFetch(`/planos-assinatura/${planoId}`);
      if (data.success) return data.data || null;
      throw new Error(data.message || 'Erro ao carregar plano de assinatura');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar plano de assinatura';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  const createPlan = useCallback(async (payload: CreatePlanoAssinaturaData) => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedFetch(`/planos-assinatura`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (data.success) return { success: true, data: data.data };
      throw new Error(data.message || 'Erro ao criar plano de assinatura');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao criar plano de assinatura';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  const updatePlan = useCallback(async (planoId: number, payload: Partial<CreatePlanoAssinaturaData>) => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedFetch(`/planos-assinatura/${planoId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (data.success) return { success: true, data: data.data };
      throw new Error(data.message || 'Erro ao atualizar plano de assinatura');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao atualizar plano de assinatura';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  const deletePlan = useCallback(async (planoId: number): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedFetch(`/planos-assinatura/${planoId}`, {
        method: 'DELETE'
      });

      return Boolean(data.success);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao deletar plano de assinatura';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  const clearError = useCallback(() => setError(null), []);

  return {
    loading,
    error,
    clearError,
    fetchPlans,
    fetchPlan,
    createPlan,
    updatePlan,
    deletePlan
  };
};

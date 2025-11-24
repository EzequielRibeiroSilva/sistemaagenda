import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

export interface Cupom {
  id: number;
  codigo: string;
  descricao?: string;
  tipo_desconto: 'percentual' | 'valor_fixo';
  valor_desconto: number;
  valor_minimo_pedido?: number;
  desconto_maximo?: number;
  data_inicio?: string;
  data_fim?: string;
  limite_uso_total?: number;
  limite_uso_por_cliente?: number;
  uso_atual: number;
  status: 'Ativo' | 'Inativo' | 'Expirado';
  servico_ids?: number[];
  unidade_ids?: number[];
  created_at: string;
  updated_at: string;
}

export interface CupomFilters {
  status?: string;
  tipo_desconto?: string;
  search?: string;
}

export interface CupomPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export const useCupomManagement = () => {
  const { token, isAuthenticated } = useAuth();
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<CupomPagination>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });

  /**
   * Buscar cupons com paginação e filtros
   */
  const fetchCupons = useCallback(async (
    page: number = 1,
    limit: number = 20,
    filters: CupomFilters = {}
  ) => {
    if (!isAuthenticated || !token) {
      setCupons([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.status && { status: filters.status }),
        ...(filters.tipo_desconto && { tipo_desconto: filters.tipo_desconto }),
        ...(filters.search && { search: filters.search })
      });

      const response = await fetch(`${API_BASE_URL}/cupons?${queryParams}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        setCupons(data.data);
        setPagination(data.pagination);
      } else {
        throw new Error(data.message || 'Erro ao buscar cupons');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao buscar cupons';
      setError(errorMessage);
      console.error('[useCupomManagement] Erro ao buscar cupons:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  /**
   * Buscar cupom específico por ID
   */
  const fetchCupomById = useCallback(async (id: number): Promise<Cupom | null> => {
    if (!isAuthenticated || !token) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/cupons/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message || 'Cupom não encontrado');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao buscar cupom';
      setError(errorMessage);
      console.error('[useCupomManagement] Erro ao buscar cupom:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  /**
   * Criar novo cupom
   */
  const createCupom = useCallback(async (cupomData: Partial<Cupom>): Promise<boolean> => {
    if (!isAuthenticated || !token) {
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/cupons`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cupomData)
      });

      const data = await response.json();

      if (data.success) {
        return true;
      } else {
        throw new Error(data.message || 'Erro ao criar cupom');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao criar cupom';
      setError(errorMessage);
      console.error('[useCupomManagement] Erro ao criar cupom:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  /**
   * Atualizar cupom existente
   */
  const updateCupom = useCallback(async (id: number, cupomData: Partial<Cupom>): Promise<boolean> => {
    if (!isAuthenticated || !token) {
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/cupons/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cupomData)
      });

      const data = await response.json();

      if (data.success) {
        return true;
      } else {
        throw new Error(data.message || 'Erro ao atualizar cupom');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao atualizar cupom';
      setError(errorMessage);
      console.error('[useCupomManagement] Erro ao atualizar cupom:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  /**
   * Deletar cupom
   */
  const deleteCupom = useCallback(async (id: number): Promise<boolean> => {
    if (!isAuthenticated || !token) {
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/cupons/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        // Remover cupom da lista local
        setCupons(prev => prev.filter(c => c.id !== id));
        return true;
      } else {
        throw new Error(data.message || 'Erro ao deletar cupom');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao deletar cupom';
      setError(errorMessage);
      console.error('[useCupomManagement] Erro ao deletar cupom:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  /**
   * Validar cupom (público)
   */
  const validarCupom = useCallback(async (
    codigo: string,
    clienteId: number,
    valorPedido: number
  ): Promise<{ valido: boolean; desconto?: any; erro?: string }> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/public/cupons/validar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          codigo,
          cliente_id: clienteId,
          valor_pedido: valorPedido
        })
      });

      const data = await response.json();

      if (data.success && data.valido) {
        return {
          valido: true,
          desconto: data.desconto
        };
      } else {
        return {
          valido: false,
          erro: data.error || 'Cupom inválido'
        };
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao validar cupom';
      return {
        valido: false,
        erro: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    cupons,
    loading,
    error,
    pagination,
    fetchCupons,
    fetchCupomById,
    createCupom,
    updateCupom,
    deleteCupom,
    validarCupom
  };
};

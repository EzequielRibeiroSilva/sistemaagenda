import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Tipos para o módulo de clientes
export interface Client {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  isSubscriber: boolean;
  subscriptionStartDate?: string;
  status: 'Ativo' | 'Bloqueado';
  whatsappId?: number;
  createdAt: string;
  updatedAt: string;
  pontosDisponiveis?: number; // Pontos disponíveis do cliente (sistema de pontos)
  // Campos calculados para compatibilidade
  totalApps: number;
  nextAppStatus: string;
  timeToNext: string;
  socialAlert: boolean;
}

// Interface para filtros de clientes
export interface ClientFilters {
  nome?: string;
  telefone?: string;
  id?: number;
  is_assinante?: boolean;
  status?: 'Ativo' | 'Bloqueado';
  page?: number; // ✅ NOVO: Página atual
  limit?: number; // ✅ NOVO: Itens por página
}

// ✅ NOVO: Interface para paginação
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ClientStats {
  total: number;
  subscribers: number;
  nonSubscribers: number;
}

export interface CreateClientData {
  primeiro_nome: string;
  ultimo_nome?: string;
  telefone: string;
  is_assinante?: boolean;
  data_inicio_assinatura?: string;
  status?: 'Ativo' | 'Bloqueado';
}

export interface UpdateClientData extends Partial<CreateClientData> {
  id: number;
}

/**
 * Hook personalizado para gerenciamento de clientes
 * Integra com a API backend e gerencia estado local
 * 
 * Funcionalidades:
 * - CRUD completo de clientes
 * - Filtros server-side
 * - Contagem de assinantes
 * - Loading states
 * - Error handling
 * - Cache local
 */
export const useClientManagement = () => {
  // Estados
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<ClientStats>({ total: 0, subscribers: 0, nonSubscribers: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ClientFilters>({});
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0
  }); // ✅ NOVO: Estado de paginação

  // Hook de autenticação
  const { token, isAuthenticated } = useAuth();

  // Função para fazer requisições autenticadas
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!token || !isAuthenticated) {
      throw new Error('Token de autenticação não encontrado');
    }

    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
    }

    return response.json();
  }, [token, isAuthenticated]);

  /**
   * Limpar erro
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Buscar lista de clientes com filtros
   */
  const fetchClients = useCallback(async (newFilters?: ClientFilters) => {
    try {
      setLoading(true);
      setError(null);

      // ✅ CORREÇÃO: Usar filtros fornecidos (não depender do estado)
      const currentFilters = newFilters !== undefined ? newFilters : filters;

      // Construir query string
      const queryParams = new URLSearchParams();

      // ✅ NOVO: Adicionar parâmetros de paginação
      queryParams.append('page', (currentFilters.page || 1).toString());
      queryParams.append('limit', (currentFilters.limit || 12).toString());

      if (currentFilters.nome) {
        queryParams.append('nome', currentFilters.nome);
      }

      if (currentFilters.telefone) {
        queryParams.append('telefone', currentFilters.telefone);
      }

      if (currentFilters.id) {
        queryParams.append('id', currentFilters.id.toString());
      }

      if (typeof currentFilters.is_assinante === 'boolean') {
        queryParams.append('is_assinante', currentFilters.is_assinante.toString());
      }

      if (currentFilters.status) {
        queryParams.append('status', currentFilters.status);
      }

      const queryString = queryParams.toString();
      const url = `/clientes${queryString ? `?${queryString}` : ''}`;

      const response = await authenticatedFetch(url);

      // 🔍 DEBUG: Verificar resposta do backend
      console.log('🔍 [useClientManagement] Resposta do backend:', {
        url,
        clientsCount: response.data?.length,
        hasPagination: !!response.pagination,
        pagination: response.pagination,
        meta: response.meta
      });

      if (response.success) {
        setClients(response.data || []);

        // Atualizar estatísticas se fornecidas
        if (response.meta) {
          setStats({
            total: response.meta.total || 0,
            subscribers: response.meta.subscribers || 0,
            nonSubscribers: response.meta.nonSubscribers || 0
          });
        }

        // ✅ NOVO: Atualizar paginação se fornecida
        if (response.pagination) {
          console.log('✅ [useClientManagement] Paginação recebida:', response.pagination);
          setPagination(response.pagination);
        } else {
          console.warn('⚠️ [useClientManagement] Backend NÃO retornou paginação!');
        }

        // ✅ CORREÇÃO: Atualizar filtros APENAS se novos foram fornecidos
        // e são diferentes dos atuais (evita loop)
        if (newFilters && JSON.stringify(newFilters) !== JSON.stringify(filters)) {
          setFilters(newFilters);
        }
      } else {
        throw new Error(response.message || 'Erro ao buscar clientes');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar clientes';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  /**
   * Buscar cliente específico por ID
   */
  const fetchClient = useCallback(async (id: number): Promise<Client | null> => {
    try {
      setError(null);

      const response = await authenticatedFetch(`/clientes/${id}`);

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.message || 'Cliente não encontrado');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar cliente';
      setError(errorMessage);
      return null;
    }
  }, [authenticatedFetch]);

  /**
   * Criar novo cliente
   */
  const createClient = useCallback(async (clientData: CreateClientData): Promise<boolean> => {
    try {
      setError(null);

      const response = await authenticatedFetch('/clientes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientData),
      });

      if (response.success) {
        // Recarregar lista após criação
        await fetchClients();
        return true;
      } else {
        throw new Error(response.message || 'Erro ao criar cliente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar cliente';
      setError(errorMessage);
      return false;
    }
  }, [authenticatedFetch, fetchClients]);

  /**
   * Atualizar cliente existente
   */
  const updateClient = useCallback(async (id: number, clientData: Partial<CreateClientData>): Promise<boolean> => {
    try {
      setError(null);

      const response = await authenticatedFetch(`/clientes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientData),
      });

      if (response.success) {
        // Recarregar lista após atualização
        await fetchClients();
        return true;
      } else {
        throw new Error(response.message || 'Erro ao atualizar cliente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar cliente';
      setError(errorMessage);
      return false;
    }
  }, [authenticatedFetch, fetchClients]);

  /**
   * Excluir cliente (soft delete)
   */
  const deleteClient = useCallback(async (id: number): Promise<boolean> => {
    try {
      setError(null);

      const response = await authenticatedFetch(`/clientes/${id}`, {
        method: 'DELETE',
      });

      if (response.success) {
        // Recarregar lista após exclusão
        await fetchClients();
        return true;
      } else {
        throw new Error(response.message || 'Erro ao excluir cliente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir cliente';
      setError(errorMessage);
      return false;
    }
  }, [authenticatedFetch, fetchClients]);

  /**
   * Aplicar filtros (server-side)
   */
  const applyFilters = useCallback(async (newFilters: ClientFilters) => {
    await fetchClients(newFilters);
  }, [fetchClients]);

  /**
   * Limpar filtros
   */
  const clearFilters = useCallback(async () => {
    const emptyFilters: ClientFilters = {};
    await fetchClients(emptyFilters);
  }, [fetchClients]);

  /**
   * Buscar apenas assinantes
   */
  const fetchSubscribers = useCallback(async () => {
    await fetchClients({ is_assinante: true });
  }, [fetchClients]);

  /**
   * Buscar apenas não assinantes
   */
  const fetchNonSubscribers = useCallback(async () => {
    await fetchClients({ is_assinante: false });
  }, [fetchClients]);

  /**
   * Criar cliente rápido para agendamento
   */
  const createClientForBooking = useCallback(async (telefone: string, nome: string): Promise<Client | null> => {
    try {
      setError(null);

      const response = await authenticatedFetch('/clientes/agendamento', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ telefone, nome }),
      });

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.message || 'Erro ao criar cliente para agendamento');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar cliente para agendamento';
      setError(errorMessage);
      return null;
    }
  }, [authenticatedFetch]);

  // ✅ CORREÇÃO DEFINITIVA: Removido useEffect inicial
  // O componente deve chamar fetchClients() explicitamente quando necessário

  // Retornar interface do hook
  return {
    // Estados
    clients,
    stats,
    loading,
    error,
    filters,
    pagination, // ✅ NOVO: Exportar paginação

    // Ações
    fetchClients,
    fetchClient,
    createClient,
    updateClient,
    deleteClient,
    applyFilters,
    clearFilters,
    fetchSubscribers,
    fetchNonSubscribers,
    createClientForBooking,
    clearError,

    // Computed values
    subscriberCount: stats.subscribers,
    totalCount: stats.total,
    nonSubscriberCount: stats.nonSubscribers,
    hasClients: clients.length > 0,
    hasFilters: Object.keys(filters).length > 0
  };
};

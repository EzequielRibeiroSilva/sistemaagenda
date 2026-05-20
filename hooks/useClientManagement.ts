import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

// Tipos para o módulo de clientes
export interface Client {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  mpCustomerEmail?: string | null;
  birthDate?: string;
  isSubscriber: boolean;
  exigeSinalExcecao?: boolean;
  assinaturaStatus?: 'Ativo' | 'Pagamento Pendente' | 'Cancelado' | null;
  subscriptionStartDate?: string;
  subscriptionPlanId?: number | null;
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
  mp_customer_email?: string | null;
  data_nascimento?: string;
  is_assinante?: boolean;
  exige_sinal_excecao?: boolean;
  assinatura_status?: 'Ativo' | 'Pagamento Pendente' | 'Cancelado' | null;
  data_inicio_assinatura?: string;
  assinatura_plano_id?: number | null;
  status?: 'Ativo' | 'Bloqueado';
}

export interface UpdateClientData extends Partial<CreateClientData> {
  id: number;
}

export type AssinaturaSaldoItem = {
  plano_item_id: number;
  tipo: 'SERVICO' | 'EXTRA';
  servico_id: number | null;
  servico_extra_id: number | null;
  nome: string | null;
  quantidade_por_ciclo: number | null;
  usados: number;
  restantes: number | null;
};

export type AssinaturaSaldoResponse = {
  cliente: {
    id: number;
    nome: string;
    telefone?: string;
    is_assinante: boolean;
    data_inicio_assinatura?: string;
    assinatura_plano_id?: number | null;
  } | null;
  assinatura_ativa: boolean;
  plano: {
    id: number;
    nome: string;
    validade_dias: number;
  } | null;
  ciclo: {
    referencia: string;
    inicio: string;
    fim: string;
    indice: number;
  } | null;
  saldos: AssinaturaSaldoItem[];
};

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

  const inFlightKeyRef = useRef<string | null>(null);

  // Hook de autenticação
  const { token, isAuthenticated, user } = useAuth();

  // Função para fazer requisições autenticadas
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!token || !isAuthenticated) {
      throw new Error('Token de autenticação não encontrado');
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
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

      const requestKey = JSON.stringify({
        page: currentFilters.page || 1,
        limit: currentFilters.limit || 12,
        nome: currentFilters.nome || '',
        telefone: currentFilters.telefone || '',
        id: currentFilters.id || '',
        is_assinante: typeof currentFilters.is_assinante === 'boolean' ? currentFilters.is_assinante : null,
        status: currentFilters.status || ''
      });

      if (inFlightKeyRef.current === requestKey) {
        return;
      }
      inFlightKeyRef.current = requestKey;

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
          setPagination(response.pagination);
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
      if (inFlightKeyRef.current) {
        inFlightKeyRef.current = null;
      }
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

  const fetchClientAssinaturaSaldo = useCallback(async (clientId: number): Promise<AssinaturaSaldoResponse | null> => {
    try {
      const unidadeId = user?.unidade_id;
      if (!unidadeId) return null;

      const params = new URLSearchParams();
      params.append('unidade_id', String(unidadeId));

      const response = await authenticatedFetch(`/clientes/${clientId}/assinatura-saldo?${params.toString()}`);
      if (response?.success) {
        return (response.data || null) as AssinaturaSaldoResponse | null;
      }
      return null;
    } catch {
      return null;
    }
  }, [authenticatedFetch, user?.unidade_id]);

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
        const updatedClient = response?.data;
        if (updatedClient && typeof updatedClient === 'object') {
          setClients(prev => prev.map(client => (client.id === id ? { ...client, ...updatedClient } : client)));
        } else {
          // Fallback mínimo: aplicar apenas os campos que conseguimos mapear com segurança
          setClients(prev => prev.map(client => {
            if (client.id !== id) return client;
            return {
              ...client,
              status: clientData.status ?? client.status,
              ...(Object.prototype.hasOwnProperty.call(clientData, 'assinatura_status')
                ? { assinaturaStatus: (clientData as any).assinatura_status as any }
                : {})
            };
          }));
        }
        return true;
      } else {
        throw new Error(response.message || 'Erro ao atualizar cliente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar cliente';
      setError(errorMessage);
      return false;
    }
  }, [authenticatedFetch]);

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
    fetchClientAssinaturaSaldo,
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

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Tipos para o hook
interface MasterUser {
  id: number;
  name: string;
  email: string;
  contact: string;
  status: 'Ativo' | 'Bloqueado';
  plan: 'Single' | 'Multi';
  unitLimit: number;
  iaEnabled: boolean; // ✅ Feature Flag IA
  activeUnits: number;
  clientCount: number;
  tokens_30d?: number; // 🎯 TASK 3.3 - Tokens dos últimos 30 dias
  custo_est_usd?: number; // 🎯 TASK 3.3 - Custo estimado em USD
  created_at?: string;
  updated_at?: string;
}

interface Unit {
  id: number;
  name: string;
  status: 'Ativo' | 'Bloqueado';
}

interface CreateUserData {
  nome: string;
  email: string;
  senha: string;
  telefone: string;
  plano: 'Single' | 'Multi';
  limite_unidades?: number;
  ia_enabled?: boolean; // ✅ Feature Flag IA
}

interface UpdateUserData {
  nome?: string;
  email?: string;
  senha?: string;
  telefone?: string;
  plano?: 'Single' | 'Multi';
  limite_unidades?: number;
  ia_enabled?: boolean; // ✅ Feature Flag IA
}

interface UseMasterUsersReturn {
  users: MasterUser[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: string; // ✅ Filtro de status
  setStatusFilter: (status: string) => void; // ✅ Setter do filtro
  refreshUsers: () => Promise<void>;
  createUser: (userData: CreateUserData) => Promise<MasterUser>;
  updateUser: (id: number, userData: UpdateUserData) => Promise<MasterUser>;
  updateUserStatus: (id: number, status: 'Ativo' | 'Bloqueado') => Promise<MasterUser>;
  toggleUserIA: (id: number, iaEnabled?: boolean) => Promise<MasterUser>; // ✅ Nova função toggle IA
  getUserUnits: (userId: number) => Promise<Unit[]>;
  updateUnitStatus: (unitId: number, status: 'Ativo' | 'Bloqueado') => Promise<Unit>;
  logout: () => Promise<void>;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export const useMasterUsers = (): UseMasterUsersReturn => {
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('todos'); // ✅ Filtro de status

  // Usar AuthContext em vez de localStorage diretamente
  const { token, isAuthenticated, user, logout: authLogout } = useAuth();

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

  // Função para buscar usuários
  const fetchUsers = useCallback(async (search: string = '', status: string = 'todos') => {
    try {
      setLoading(true);
      setError(null);

      let queryParams = [];
      if (search) queryParams.push(`search=${encodeURIComponent(search)}`);
      if (status && status !== 'todos') queryParams.push(`status=${encodeURIComponent(status)}`);
      
      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const data = await authenticatedFetch(`/usuarios${queryString}`);

      if (data.success) {
        // 🔍 DEBUG: Log dos dados recebidos da API
        console.log('🔍 [DEBUG useMasterUsers] Total usuários recebidos:', data.data.length);
        if (data.data.length > 0) {
          console.log('🔍 [DEBUG useMasterUsers] Primeiro usuário:', data.data[0]);
          const user468 = data.data.find((u: any) => u.id === 468);
          if (user468) {
            console.log('🔍 [DEBUG useMasterUsers] Usuário 468:', user468);
            console.log('🔍 [DEBUG useMasterUsers] tokens_30d:', user468.tokens_30d, 'tipo:', typeof user468.tokens_30d);
            console.log('🔍 [DEBUG useMasterUsers] custo_est_usd:', user468.custo_est_usd, 'tipo:', typeof user468.custo_est_usd);
          }
        }
        setUsers(data.data);
      } else {
        throw new Error(data.message || 'Erro ao buscar usuários');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Função para atualizar a lista de usuários
  const refreshUsers = useCallback(async () => {
    await fetchUsers(searchQuery, statusFilter);
  }, [fetchUsers, searchQuery, statusFilter]);

  // Função para criar usuário
  const createUser = useCallback(async (userData: CreateUserData): Promise<MasterUser> => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedFetch('/usuarios', {
        method: 'POST',
        body: JSON.stringify(userData),
      });

      if (data.success) {
        // Atualizar lista local
        await refreshUsers();
        return data.data;
      } else {
        throw new Error(data.message || 'Erro ao criar usuário');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, refreshUsers]);

  // Função para atualizar usuário
  const updateUser = useCallback(async (id: number, userData: UpdateUserData): Promise<MasterUser> => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedFetch(`/usuarios/${id}`, {
        method: 'PUT',
        body: JSON.stringify(userData),
      });

      if (data.success) {
        // Atualizar lista local
        await refreshUsers();
        return data.data;
      } else {
        throw new Error(data.message || 'Erro ao atualizar usuário');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, refreshUsers]);

  // Função para alterar status do usuário
  const updateUserStatus = useCallback(async (id: number, status: 'Ativo' | 'Bloqueado'): Promise<MasterUser> => {
    try {
      setError(null);

      const data = await authenticatedFetch(`/usuarios/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      if (data.success) {
        // Atualizar usuário na lista local
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === id ? { ...user, status } : user
          )
        );
        return data.data;
      } else {
        throw new Error(data.message || 'Erro ao alterar status');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    }
  }, [authenticatedFetch]);

  // ✅ Função para alternar status da IA (toggle ou valor explícito)
  const toggleUserIA = useCallback(async (id: number, iaEnabled?: boolean): Promise<MasterUser> => {
    try {
      setError(null);

      const body = iaEnabled !== undefined ? { ia_enabled: iaEnabled } : {};

      const data = await authenticatedFetch(`/usuarios/${id}/ia-toggle`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      if (data.success) {
        // Atualizar usuário na lista local
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === id ? { ...user, iaEnabled: data.data.iaEnabled } : user
          )
        );
        return data.data;
      } else {
        throw new Error(data.message || 'Erro ao alternar IA');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    }
  }, [authenticatedFetch]);

  // Função para buscar unidades de um usuário
  const getUserUnits = useCallback(async (userId: number): Promise<Unit[]> => {
    try {
      setError(null);

      const data = await authenticatedFetch(`/usuarios/${userId}/unidades`);

      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message || 'Erro ao buscar unidades');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    }
  }, [authenticatedFetch]);

  // Função para alterar status de uma unidade
  const updateUnitStatus = useCallback(async (unitId: number, status: 'Ativo' | 'Bloqueado'): Promise<Unit> => {
    try {
      setError(null);

      const data = await authenticatedFetch(`/usuarios/unidades/${unitId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message || 'Erro ao alterar status da unidade');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    }
  }, [authenticatedFetch]);

  // Função para logout
  const logout = useCallback(async (): Promise<void> => {
    try {
      await authenticatedFetch('/auth/logout', {
        method: 'POST',
      });
    } catch (err) {
      // Erro no logout
    } finally {
      // Usar logout do AuthContext
      authLogout();

      // Redirecionar para login
      window.location.href = '/';
    }
  }, [authenticatedFetch]);

  // Effect para buscar usuários quando searchQuery ou statusFilter mudam - só executa se autenticado
  useEffect(() => {
    if (!isAuthenticated || !token || user.role !== 'MASTER') {
      return;
    }

    const timeoutId = setTimeout(() => {
      fetchUsers(searchQuery, statusFilter);
    }, 300); // Debounce de 300ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery, statusFilter, isAuthenticated, token, user.role]); // ✅ Adicionado statusFilter

  // Effect inicial para carregar usuários - só executa se autenticado
  useEffect(() => {
    if (!isAuthenticated || !token || user.role !== 'MASTER') {
      return;
    }

    fetchUsers();
  }, [isAuthenticated, token, user.role]); // Removido fetchUsers das dependências

  return {
    users,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter, // ✅ Exportar filtro de status
    setStatusFilter, // ✅ Exportar setter
    refreshUsers,
    createUser,
    updateUser,
    updateUserStatus,
    toggleUserIA, // ✅ Exportar função toggle IA
    getUserUnits,
    updateUnitStatus,
    logout,
  };
};

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
  activeUnits: number;
  clientCount: number;
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
}

interface UpdateUserData {
  nome?: string;
  email?: string;
  senha?: string;
  telefone?: string;
  plano?: 'Single' | 'Multi';
  limite_unidades?: number;
}

interface UseMasterUsersReturn {
  users: MasterUser[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  refreshUsers: () => Promise<void>;
  createUser: (userData: CreateUserData) => Promise<MasterUser>;
  updateUser: (id: number, userData: UpdateUserData) => Promise<MasterUser>;
  updateUserStatus: (id: number, status: 'Ativo' | 'Bloqueado') => Promise<MasterUser>;
  getUserUnits: (userId: number) => Promise<Unit[]>;
  updateUnitStatus: (unitId: number, status: 'Ativo' | 'Bloqueado') => Promise<Unit>;
  logout: () => Promise<void>;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const useMasterUsers = (): UseMasterUsersReturn => {
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

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
  const fetchUsers = useCallback(async (search: string = '') => {
    try {
      setLoading(true);
      setError(null);

      const queryParam = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await authenticatedFetch(`/usuarios${queryParam}`);

      if (data.success) {
        setUsers(data.data);
      } else {
        throw new Error(data.message || 'Erro ao buscar usuários');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      console.error('Erro ao buscar usuários:', err);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Função para atualizar a lista de usuários
  const refreshUsers = useCallback(async () => {
    await fetchUsers(searchQuery);
  }, [fetchUsers, searchQuery]);

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
      console.error('Erro no logout:', err);
    } finally {
      // Usar logout do AuthContext
      authLogout();

      // Redirecionar para login
      window.location.href = '/';
    }
  }, [authenticatedFetch]);

  // Effect para buscar usuários quando searchQuery muda - só executa se autenticado
  useEffect(() => {
    if (!isAuthenticated || !token || user.role !== 'MASTER') {
      return;
    }

    const timeoutId = setTimeout(() => {
      fetchUsers(searchQuery);
    }, 300); // Debounce de 300ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery, fetchUsers, isAuthenticated, token, user.role]);

  // Effect inicial para carregar usuários - só executa se autenticado
  useEffect(() => {
    if (!isAuthenticated || !token || user.role !== 'MASTER') {
      return;
    }

    fetchUsers();
  }, [fetchUsers, isAuthenticated, token, user.role]);

  return {
    users,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    refreshUsers,
    createUser,
    updateUser,
    updateUserStatus,
    getUserUnits,
    updateUnitStatus,
    logout,
  };
};

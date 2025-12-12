import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export interface Unit {
  id: number;
  nome: string;
  endereco: string;
  telefone: string;
  status: 'Ativo' | 'Bloqueado';
  usuario_id: number;
  created_at: string;
  updated_at: string;
  horarios_funcionamento?: HorarioFuncionamento[];
  agentes_ids?: number[];
  servicos_ids?: number[];
}

export interface HorarioFuncionamento {
  id: number;
  unidade_id: number;
  dia_semana: number;
  horarios_json: { inicio: string; fim: string }[];
  is_aberto: boolean;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: number;
  nome: string;
  avatar_url?: string | null;
}

export interface Service {
  id: number;
  nome: string;
}

export interface CalendarException {
  id?: number;
  unidade_id?: number;
  data_inicio: string;
  data_fim: string;
  tipo: 'Feriado' | 'Férias' | 'Evento Especial' | 'Manutenção' | 'Outro';
  descricao: string;
  created_at?: string;
  updated_at?: string;
}

export interface LimitInfo {
  currentCount: number;
  limit: number | null;
  canCreateMore: boolean;
  plano: string;
}

export interface CreateUnitData {
  nome: string;
  endereco?: string;
  telefone?: string;
  status?: 'Ativo' | 'Bloqueado';
  agentes_ids?: number[];
  servicos_ids?: number[];
  horarios_funcionamento?: {
    is_aberto: boolean;
    periodos: { inicio: string; fim: string }[];
  }[];
  excecoes_calendario?: Omit<CalendarException, 'id' | 'unidade_id' | 'created_at' | 'updated_at'>[];
}

export interface UpdateUnitData {
  nome?: string;
  endereco?: string;
  telefone?: string;
  agentes_ids?: number[];
  servicos_ids?: number[];
  horarios_funcionamento?: {
    is_aberto: boolean;
    periodos: { inicio: string; fim: string }[];
  }[];
  excecoes_calendario?: Omit<CalendarException, 'id' | 'unidade_id' | 'created_at' | 'updated_at'>[];
}

export interface UseUnitManagementReturn {
  // Estado
  units: Unit[];
  limitInfo: LimitInfo | null;
  loading: boolean;
  error: string | null;
  agents: Agent[];
  services: Service[];

  // Ações
  fetchUnits: () => Promise<void>;
  fetchUnitById: (id: number) => Promise<Unit | null>;
  fetchAgentsList: () => Promise<void>;
  fetchServicesList: () => Promise<void>;
  createUnit: (unitData: CreateUnitData) => Promise<boolean>;
  updateUnit: (id: number, unitData: UpdateUnitData) => Promise<boolean>;
  updateUnitStatus: (id: number, status: 'Ativo' | 'Bloqueado') => Promise<boolean>;
  deleteUnit: (id: number) => Promise<boolean>;

  // Exceções de Calendário
  fetchUnitExceptions: (unitId: number) => Promise<CalendarException[]>;
  createUnitException: (unitId: number, exception: Omit<CalendarException, 'id' | 'unidade_id' | 'created_at' | 'updated_at'>) => Promise<boolean>;
  updateUnitException: (unitId: number, exceptionId: number, exception: Partial<Omit<CalendarException, 'id' | 'unidade_id' | 'created_at' | 'updated_at'>>) => Promise<boolean>;
  deleteUnitException: (unitId: number, exceptionId: number) => Promise<boolean>;

  // Utilitários
  clearError: () => void;
  canCreateNewUnit: () => boolean;
}

export const useUnitManagement = (): UseUnitManagementReturn => {
  const { token, isAuthenticated } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [limitInfo, setLimitInfo] = useState<LimitInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  // Função para fazer requisições autenticadas
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!token || !isAuthenticated) {
      throw new Error('Token de autenticação não encontrado');
    }

    const fullUrl = `${API_BASE_URL}${url}`;

    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.message || errorData.error || `Erro HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const jsonData = await response.json();
    return jsonData;
  }, [token, isAuthenticated]);

  // Buscar todas as unidades
  const fetchUnits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch('/unidades');

      setUnits(response.data || []);
      setLimitInfo(response.limitInfo || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar unidades';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Buscar unidade por ID
  const fetchUnitById = useCallback(async (id: number): Promise<Unit | null> => {
    try {
      setError(null);

      const response = await authenticatedFetch(`/unidades/${id}`);

      return response.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar unidade';
      setError(errorMessage);
      return null;
    }
  }, [authenticatedFetch]);

  // Buscar lista leve de agentes
  const fetchAgentsList = useCallback(async () => {
    try {
      setError(null);

      const response = await authenticatedFetch('/agentes/list');

      if (response.success) {
        setAgents(response.data || []);
      } else {
        throw new Error(response.message || 'Erro ao buscar agentes');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar agentes';
      setError(errorMessage);
    }
  }, [authenticatedFetch]);

  // Buscar lista leve de serviços
  const fetchServicesList = useCallback(async () => {
    try {
      setError(null);

      const response = await authenticatedFetch('/servicos/list');

      if (response.success) {
        setServices(response.data || []);
      } else {
        throw new Error(response.message || 'Erro ao buscar serviços');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar serviços';
      setError(errorMessage);
    }
  }, [authenticatedFetch]);

  // Criar nova unidade
  const createUnit = useCallback(async (unitData: CreateUnitData): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch('/unidades', {
        method: 'POST',
        body: JSON.stringify(unitData),
      });

      // ✅ REMOVIDO fetchUnits() para evitar loops - a lista será atualizada quando necessário

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar unidade';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Atualizar unidade
  const updateUnit = useCallback(async (id: number, unitData: UpdateUnitData): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch(`/unidades/${id}`, {
        method: 'PUT',
        body: JSON.stringify(unitData),
      });

      // ✅ REMOVIDO fetchUnits() para evitar loops - a lista será atualizada quando necessário

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar unidade';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Atualizar status da unidade
  const updateUnitStatus = useCallback(async (id: number, status: 'Ativo' | 'Bloqueado'): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch(`/unidades/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      // ✅ Recarregar lista para refletir mudança na UI
      await fetchUnits();

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao alterar status da unidade';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, fetchUnits]);

  // Deletar unidade (apenas MASTER)
  const deleteUnit = useCallback(async (id: number): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch(`/unidades/${id}`, {
        method: 'DELETE',
      });

      await fetchUnits();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao deletar unidade';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, fetchUnits]);

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Verificar se pode criar nova unidade
  const canCreateNewUnit = useCallback((): boolean => {
    if (!limitInfo) return false;
    return limitInfo.canCreateMore;
  }, [limitInfo]);

  // ========================================
  // MÉTODOS PARA EXCEÇÕES DE CALENDÁRIO
  // ========================================

  // Buscar exceções de calendário de uma unidade
  const fetchUnitExceptions = useCallback(async (unitId: number): Promise<CalendarException[]> => {
    try {
      setError(null);

      const response = await authenticatedFetch(`/unidades/${unitId}/excecoes`);

      if (response.success) {
        return response.data || [];
      } else {
        throw new Error(response.message || 'Erro ao buscar exceções');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar exceções';
      setError(errorMessage);
      return [];
    }
  }, [authenticatedFetch]);

  // Criar nova exceção de calendário
  const createUnitException = useCallback(async (
    unitId: number,
    exception: Omit<CalendarException, 'id' | 'unidade_id' | 'created_at' | 'updated_at'>
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch(`/unidades/${unitId}/excecoes`, {
        method: 'POST',
        body: JSON.stringify(exception),
      });

      if (response.success) {
        return true;
      } else {
        throw new Error(response.message || 'Erro ao criar exceção');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar exceção';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Atualizar exceção de calendário
  const updateUnitException = useCallback(async (
    unitId: number,
    exceptionId: number,
    exception: Partial<Omit<CalendarException, 'id' | 'unidade_id' | 'created_at' | 'updated_at'>>
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch(`/unidades/${unitId}/excecoes/${exceptionId}`, {
        method: 'PUT',
        body: JSON.stringify(exception),
      });

      if (response.success) {
        return true;
      } else {
        throw new Error(response.message || 'Erro ao atualizar exceção');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar exceção';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Deletar exceção de calendário
  const deleteUnitException = useCallback(async (unitId: number, exceptionId: number): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch(`/unidades/${unitId}/excecoes/${exceptionId}`, {
        method: 'DELETE',
      });

      if (response.success) {
        return true;
      } else {
        throw new Error(response.message || 'Erro ao deletar exceção');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao deletar exceção';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Carregar dados automaticamente quando o hook é inicializado
  useEffect(() => {
    if (isAuthenticated && token) {
      const loadData = async () => {
        await Promise.all([
          fetchUnits(),
          fetchAgentsList(),
          fetchServicesList()
        ]);
      };
      loadData();
    }
  }, [isAuthenticated, token, fetchUnits, fetchAgentsList, fetchServicesList]);

  return {
    // Estado
    units,
    limitInfo,
    loading,
    error,
    agents,
    services,

    // Ações
    fetchUnits,
    fetchUnitById,
    fetchAgentsList,
    fetchServicesList,
    createUnit,
    updateUnit,
    updateUnitStatus,
    deleteUnit,

    // Exceções de Calendário
    fetchUnitExceptions,
    createUnitException,
    updateUnitException,
    deleteUnitException,

    // Utilitários
    clearError,
    canCreateNewUnit,
  };
};

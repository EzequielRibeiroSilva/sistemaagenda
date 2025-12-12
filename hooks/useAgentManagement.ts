import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export interface Agent {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  status: 'Ativo' | 'Bloqueado';
  reservations: number;
  todayHours: string;
  availability: Array<{
    day: string;
    available: boolean;
  }>;
  unidade_nome: string;
  biografia?: string;
  nome_exibicao?: string;
  data_admissao?: string;
  comissao_percentual?: string;
}

export interface AgentDetails extends Agent {
  nome: string;
  sobrenome: string;
  telefone: string;
  avatar_url?: string;
  unidade_id: number;
  agenda_personalizada: boolean;
  observacoes?: string;
  // Novos campos para pré-seleção
  servicos_disponiveis: Array<{
    id: number;
    nome: string;
    preco: string;
    duracao_minutos: number;
  }>;
  servicos_atuais_ids: number[];
  horarios_funcionamento: Array<{
    dia_semana: number;
    periodos: Array<{
      start: string;
      end: string;
    }>;
  }>;
}

export interface Service {
  id: number;
  nome: string;
  descricao?: string;
  preco: string;
  duracao_minutos: number;
}

// ✅ ETAPA 1: Interfaces para suporte multi-unidade
export interface UnitSchedulePeriod {
  inicio: string;
  fim: string;
}

export interface UnitSchedule {
  dia_semana: number; // 0=Dom a 6=Sáb
  is_aberto: boolean;
  periodos: UnitSchedulePeriod[];
}

export interface UnitData {
  id: number;
  nome: string;
  horarios_funcionamento: UnitSchedule[]; // Limites de horário da unidade
}

export interface CreateAgentData {
  nome: string;
  sobrenome: string;
  email: string;
  telefone: string;
  senha?: string;
  avatar_url?: string;
  avatar?: File;
  biografia?: string;
  nome_exibicao?: string;
  unidade_id?: number;
  status?: 'Ativo' | 'Bloqueado';
  agenda_personalizada?: boolean;
  observacoes?: string;
  data_admissao?: string;
  comissao_percentual?: number;
  servicos_oferecidos: number[];
  // ✅ ETAPA 3: Suporte para agendas multi-unidade (novo formato)
  agendas_multi_unidade?: Array<{
    dia_semana: number;
    unidade_id: number;
    periodos: Array<{
      inicio: string;
      fim: string;
    }>;
  }>;
  // Formato legado (para compatibilidade)
  horarios_funcionamento?: Array<{
    dia_semana: number;
    periodos: Array<{
      start: string;
      end: string;
    }>;
  }>;
}

export interface UseAgentManagementReturn {
  // Estado
  agents: Agent[];
  services: Service[];
  loading: boolean;
  error: string | null;
  
  // ✅ ETAPA 1: Novos campos para suporte multi-unidade
  adminPlan: 'Single' | 'Multi';
  availableUnits: UnitData[];
  
  // Ações
  fetchAgents: () => Promise<void>;
  fetchServices: () => Promise<void>;
  fetchAgentById: (id: number) => Promise<AgentDetails | null>;
  createAgent: (agentData: CreateAgentData) => Promise<boolean>;
  updateAgent: (id: number, agentData: CreateAgentData) => Promise<any>;
  deleteAgent: (id: number) => Promise<boolean>;
  
  // Utilitários
  clearError: () => void;
}

export const useAgentManagement = (): UseAgentManagementReturn => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // ✅ ETAPA 1: Estados para suporte multi-unidade
  const [availableUnits, setAvailableUnits] = useState<UnitData[]>([]);

  // Usar AuthContext
  const { token, isAuthenticated, user, logout: authLogout } = useAuth();
  
  // ✅ ETAPA 1: Extrair adminPlan do contexto de autenticação
  const adminPlan: 'Single' | 'Multi' = user?.plano || 'Single';

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
      const errorMessage = errorData.message || `Erro HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }, [token, isAuthenticated]);

  // Buscar agentes
  const fetchAgents = useCallback(async () => {
    if (!isAuthenticated || !token) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch('/agentes');
      
      if (response.success) {
        setAgents(response.data);
      } else {
        throw new Error(response.message || 'Erro ao buscar agentes');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, isAuthenticated, token]);

  // Buscar serviços
  const fetchServices = useCallback(async () => {
    if (!isAuthenticated || !token) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch('/servicos');

      // Aceita tanto { data: [...] } quanto { success: true, data: [...] }
      if (response.success !== false) {
        const servicesData = response.data || response;
        setServices(Array.isArray(servicesData) ? servicesData : []);
      } else {
        throw new Error(response.message || 'Erro ao buscar serviços');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(`Erro ao buscar serviços: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, isAuthenticated, token]);

  // ✅ ETAPA 1: Buscar unidades disponíveis (com horários de funcionamento)
  const fetchAvailableUnits = useCallback(async () => {
    if (!isAuthenticated || !token) {
      return;
    }

    try {
      setError(null);

      const response = await authenticatedFetch('/unidades');

      if (response.success !== false && response.data) {
        // Mapear unidades para o formato esperado
        const unitsData: UnitData[] = response.data.map((unit: any) => ({
          id: unit.id,
          nome: unit.nome,
          horarios_funcionamento: unit.horarios_funcionamento || []
        }));
        
        setAvailableUnits(unitsData);
      } else {
        throw new Error(response.message || 'Erro ao buscar unidades');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      // Não definir erro global para não bloquear outras operações
    }
  }, [authenticatedFetch, isAuthenticated, token]);

  // Buscar agente por ID
  const fetchAgentById = useCallback(async (id: number): Promise<AgentDetails | null> => {
    if (!isAuthenticated || !token) {
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`/agentes/${id}`);
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.message || 'Erro ao buscar agente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, isAuthenticated, token]);

  // Criar agente
  const createAgent = useCallback(async (agentData: CreateAgentData): Promise<boolean> => {
    if (!isAuthenticated || !token) {
      return false;
    }

    try {
      setLoading(true);
      setError(null);

      // Criar FormData para suportar upload de arquivos
      const formData = new FormData();

      // Adicionar dados do agente
      Object.entries(agentData).forEach(([key, value]) => {
        if (key === 'servicos_oferecidos' || key === 'horarios_funcionamento' || key === 'agendas_multi_unidade') {
          formData.append(key, JSON.stringify(value));
        } else if (key === 'avatar' && value instanceof File) {
          // ✅ CORREÇÃO: Adicionar arquivo sem converter para string
          formData.append(key, value);
        } else if (value !== null && value !== undefined && !(value instanceof File)) {
          formData.append(key, value.toString());
        }
      });

      const response = await fetch(`${API_BASE_URL}/agentes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Não definir Content-Type para FormData (browser define automaticamente)
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        // Recarregar lista de agentes
        await fetchAgents();
        return true;
      } else {
        throw new Error(result.message || 'Erro ao criar agente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, fetchAgents]);

  // Atualizar agente
  const updateAgent = useCallback(async (id: number, agentData: CreateAgentData): Promise<any> => {
    if (!isAuthenticated || !token) {
      return false;
    }

    try {
      setLoading(true);
      setError(null);

      // Criar FormData para suportar upload de arquivos
      const formData = new FormData();

      // Adicionar dados do agente ao FormData
      Object.entries(agentData).forEach(([key, value]) => {
        if (key === 'servicos_oferecidos' || key === 'horarios_funcionamento' || key === 'agendas_multi_unidade') {
          formData.append(key, JSON.stringify(value));
        } else if (key === 'avatar' && value instanceof File) {
          formData.append(key, value);
        } else if (value !== null && value !== undefined) {
          formData.append(key, value.toString());
        }
      });

      const response = await fetch(`${API_BASE_URL}/agentes/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Não definir Content-Type para FormData (browser define automaticamente)
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.message || 'Erro ao atualizar agente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, fetchAgents]);

  // Excluir agente
  const deleteAgent = useCallback(async (id: number): Promise<boolean> => {
    if (!isAuthenticated || !token) {
      return false;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`/agentes/${id}`, {
        method: 'DELETE',
      });
      
      if (response.success) {
        // Recarregar lista de agentes
        await fetchAgents();
        return true;
      } else {
        throw new Error(response.message || 'Erro ao excluir agente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, isAuthenticated, token, fetchAgents]);

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Effect inicial para carregar dados - SEM dependências circulares
  useEffect(() => {
    let isMounted = true; // Flag para evitar updates em componente desmontado

    if (isAuthenticated && token) {
      // Executar as funções diretamente para evitar dependências circulares
      const loadData = async () => {
        try {
          // ✅ ETAPA 1: Buscar unidades primeiro (necessário para validação de agendas)
          if (isMounted) await fetchAvailableUnits();
          // Buscar serviços (necessário para criar agentes)
          if (isMounted) await fetchServices();
          // Depois buscar agentes
          if (isMounted) await fetchAgents();
        } catch (error) {
          // Erro silencioso - não expor detalhes no console
        }
      };

      loadData();
    } else {
      // Limpar dados se não autenticado
      if (isMounted) {
        setAgents([]);
        setServices([]);
        setAvailableUnits([]);
        setError(null);
      }
    }

    return () => {
      isMounted = false; // Cleanup para evitar memory leaks
    };
  }, [isAuthenticated, token]); // APENAS isAuthenticated e token como dependências

  return {
    agents,
    services,
    loading,
    error,
    // ✅ ETAPA 1: Expor adminPlan e availableUnits
    adminPlan,
    availableUnits,
    fetchAgents,
    fetchServices,
    fetchAgentById,
    createAgent,
    updateAgent,
    deleteAgent,
    clearError,
  };
};

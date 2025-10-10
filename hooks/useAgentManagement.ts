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
  unidade_id: number;
  agenda_personalizada: boolean;
  observacoes?: string;
  data_admissao?: string;
  comissao_percentual?: number;
  servicos_oferecidos: number[];
  horarios_funcionamento: Array<{
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

  // Usar AuthContext
  const { token, isAuthenticated, logout: authLogout } = useAuth();

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
      console.error('Erro ao buscar agentes:', err);
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
      console.error('Erro ao buscar serviços:', err);
    } finally {
      setLoading(false);
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
      console.error('Erro ao buscar agente:', err);
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
        if (key === 'servicos_oferecidos' || key === 'horarios_funcionamento') {
          formData.append(key, JSON.stringify(value));
        } else if (value !== null && value !== undefined) {
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
      console.error('Erro ao criar agente:', err);
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

      // Adicionar dados do agente
      Object.entries(agentData).forEach(([key, value]) => {
        if (key === 'servicos_oferecidos' || key === 'horarios_funcionamento') {
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
        // Recarregar lista de agentes
        await fetchAgents();
        return result.data; // Retornar os dados da resposta
      } else {
        throw new Error(result.message || 'Erro ao atualizar agente');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      console.error('Erro ao atualizar agente:', err);
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
      console.error('Erro ao excluir agente:', err);
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
    if (isAuthenticated && token) {
      // Executar as funções diretamente para evitar dependências circulares
      const loadData = async () => {
        try {
          // Buscar serviços primeiro (necessário para criar agentes)
          await fetchServices();
          // Depois buscar agentes
          await fetchAgents();
        } catch (error) {
          console.error('Erro ao carregar dados iniciais:', error);
        }
      };

      loadData();
    } else {
      // Limpar dados se não autenticado
      setAgents([]);
      setServices([]);
      setError(null);
    }
  }, [isAuthenticated, token]); // APENAS isAuthenticated e token como dependências

  return {
    agents,
    services,
    loading,
    error,
    fetchAgents,
    fetchServices,
    fetchAgentById,
    createAgent,
    updateAgent,
    deleteAgent,
    clearError,
  };
};

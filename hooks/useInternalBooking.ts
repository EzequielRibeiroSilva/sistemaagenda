import { useState, useCallback } from 'react';

const API_BASE_URL = 'http://localhost:3001/api';

// Interfaces para dados internos
export interface InternalServico {
  id: number;
  nome: string;
  preco: number;
  duracao_minutos: number;
  categoria?: string;
  status: string;
}

export interface InternalServicoExtra {
  id: number;
  nome: string;
  preco: number;
  duracao_minutos: number;
  categoria?: string;
  status: string;
}

export interface InternalAgente {
  id: number;
  nome: string;
  avatar_url?: string;
}

export interface InternalCliente {
  id: number;
  nome_completo: string;
  primeiro_nome: string;
  ultimo_nome: string;
  telefone: string;
  is_assinante: boolean;
}

export interface AgendamentoDetalhes {
  id: number;
  cliente_id: number;
  agente_id: number;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  status: string;
  valor_total: number;
  observacoes?: string;
  payment_method?: string;
  cliente: {
    nome_completo: string;
    telefone: string;
  };
  agente: {
    nome: string;
  };
  servicos: Array<{
    id: number;
    nome: string;
    preco: number;
    duracao_minutos: number;
  }>;
  extras: Array<{
    id: number;
    nome: string;
    preco: number;
    duracao_minutos: number;
  }>;
}

export interface CreateAgendamentoData {
  cliente_id?: number;
  cliente_nome?: string;
  cliente_telefone?: string;
  agente_id: number;
  servico_ids: number[];
  servico_extra_ids?: number[];
  data_agendamento: string;
  hora_inicio: string;
  observacoes?: string;
}

export interface UpdateAgendamentoData extends CreateAgendamentoData {
  status?: string;
  payment_method?: string;
}

export const useInternalBooking = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Função auxiliar para fazer requisições autenticadas
  const makeAuthenticatedRequest = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('token');
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }, []);

  // Buscar serviços
  const fetchServicos = useCallback(async (): Promise<InternalServico[]> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await makeAuthenticatedRequest(`${API_BASE_URL}/servicos`);
      return data.success ? data.data : [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar serviços';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao buscar serviços:', errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Buscar serviços extras
  const fetchServicosExtras = useCallback(async (): Promise<InternalServicoExtra[]> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await makeAuthenticatedRequest(`${API_BASE_URL}/servicos/extras/list`);
      return data.success ? data.data : [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar serviços extras';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao buscar serviços extras:', errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Buscar agentes (com RBAC)
  const fetchAgentes = useCallback(async (): Promise<InternalAgente[]> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await makeAuthenticatedRequest(`${API_BASE_URL}/agentes/list`);
      return data.success ? data.data : [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar agentes';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao buscar agentes:', errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Buscar clientes
  const searchClientes = useCallback(async (query: string): Promise<InternalCliente[]> => {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      setError(null);
      
      const data = await makeAuthenticatedRequest(`${API_BASE_URL}/clientes/search?q=${encodeURIComponent(query.trim())}`);
      return data.success ? data.data : [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar clientes';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao buscar clientes:', errorMessage);
      return [];
    }
  }, [makeAuthenticatedRequest]);

  // Criar cliente
  const createCliente = useCallback(async (nome: string, telefone: string): Promise<InternalCliente | null> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await makeAuthenticatedRequest(`${API_BASE_URL}/clientes`, {
        method: 'POST',
        body: JSON.stringify({
          primeiro_nome: nome.split(' ')[0] || '',
          ultimo_nome: nome.split(' ').slice(1).join(' ') || '',
          telefone: telefone,
        }),
      });

      return data.success ? data.data : null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar cliente';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao criar cliente:', errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Buscar detalhes de um agendamento
  const fetchAgendamentoDetalhes = useCallback(async (id: number): Promise<AgendamentoDetalhes | null> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const data = await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos/${id}`);
      return data.success ? data.data : null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar detalhes do agendamento';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao buscar detalhes do agendamento:', errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Criar agendamento
  const createAgendamento = useCallback(async (data: CreateAgendamentoData): Promise<any> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos`, {
        method: 'POST',
        body: JSON.stringify(data),
      });

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar agendamento';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao criar agendamento:', errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Atualizar agendamento
  const updateAgendamento = useCallback(async (id: number, data: UpdateAgendamentoData): Promise<any> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar agendamento';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao atualizar agendamento:', errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Finalizar agendamento
  const finalizeAgendamento = useCallback(async (id: number, paymentMethod?: string): Promise<any> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos/${id}/finalize`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentMethod }),
      });

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao finalizar agendamento';
      setError(errorMessage);
      console.error('[useInternalBooking] Erro ao finalizar agendamento:', errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  return {
    isLoading,
    error,
    fetchServicos,
    fetchServicosExtras,
    fetchAgentes,
    searchClientes,
    createCliente,
    fetchAgendamentoDetalhes,
    createAgendamento,
    updateAgendamento,
    finalizeAgendamento,
  };
};

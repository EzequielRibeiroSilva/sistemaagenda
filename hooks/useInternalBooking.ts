import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../utils/api';

// Usar a URL centralizada do utils/api.ts

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
  unidade_id: number; // ✅ NOVO: ID da unidade
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
  unidade_id: number; // ✅ CAMPO OBRIGATÓRIO ADICIONADO
  servico_ids: number[];
  servico_extra_ids?: number[];
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string; // ✅ CAMPO OBRIGATÓRIO ADICIONADO
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
    const token = localStorage.getItem('authToken');



    if (!token) {
      console.error('❌ [makeAuthenticatedRequest] Token não encontrado');
      throw new Error('Token de autenticação não encontrado. Faça login novamente.');
    }

    const requestOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    };



    try {
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('userEmail');
          throw new Error('Token inválido ou expirado. Faça login novamente.');
        }

        let errorData;
        try {
          errorData = await response.json();
          console.error('❌ [makeAuthenticatedRequest] Erro do servidor:', errorData);
        } catch (parseError) {
          console.error('❌ [makeAuthenticatedRequest] Erro ao parsear resposta de erro:', parseError);
          errorData = {};
        }

        const errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        console.error('❌ [makeAuthenticatedRequest] Erro final:', errorMessage);
        throw new Error(errorMessage);
      }

      const jsonData = await response.json();

      return jsonData;
    } catch (fetchError) {
      console.error('💥 [makeAuthenticatedRequest] Erro no fetch:', fetchError);
      throw fetchError;
    }
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
      console.error('❌ [useInternalBooking] Erro ao buscar serviços:', errorMessage);
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
      console.error('❌ [useInternalBooking] Erro ao buscar serviços extras:', errorMessage);
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
      console.error('❌ [useInternalBooking] Erro ao buscar agentes:', errorMessage);
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
      console.error('❌ [useInternalBooking] Erro ao buscar clientes:', errorMessage);
      return [];
    }
  }, [makeAuthenticatedRequest]);

  // Criar cliente
  const createCliente = useCallback(async (clienteData: {
    primeiro_nome: string;
    ultimo_nome: string;
    telefone: string;
  }): Promise<InternalCliente | null> => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await makeAuthenticatedRequest(`${API_BASE_URL}/clientes`, {
        method: 'POST',
        body: JSON.stringify(clienteData),
      });

      if (data.success) {
        // Mapear resposta do backend para InternalCliente
        return {
          id: data.data.id,
          nome_completo: data.data.name,
          primeiro_nome: data.data.firstName,
          ultimo_nome: data.data.lastName,
          telefone: data.data.phone,
          is_assinante: data.data.isSubscriber || false
        };
      }

      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar cliente';
      setError(errorMessage);
      console.error('❌ [useInternalBooking] Erro ao criar cliente:', errorMessage);
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
      
      if (!data || !data.success) {
        return null;
      }
      
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar detalhes do agendamento';
      setError(errorMessage);
      console.error('❌ [useInternalBooking] Erro ao buscar detalhes do agendamento:', errorMessage);
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
      console.error('❌ [useInternalBooking] Erro ao criar agendamento:', errorMessage);
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

      const url = `${API_BASE_URL}/agendamentos/${id}`;

      const response = await makeAuthenticatedRequest(url, {
        method: 'PUT',
        body: JSON.stringify(data),
      });


      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar agendamento';
      setError(errorMessage);
      console.error('❌ [useInternalBooking.updateAgendamento] Erro capturado:', {
        error: err,
        errorMessage,
        errorType: typeof err,
        errorConstructor: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined
      });
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
      console.error('❌ [useInternalBooking] Erro ao finalizar agendamento:', errorMessage);
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

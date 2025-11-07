import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';
import type { AppointmentDetail, AppointmentStatus } from '../types';

// Interface para dados do backend
export interface BackendAgendamento {
  id: number;
  cliente_id: number;
  agente_id: number;
  unidade_id: number;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  status: AppointmentStatus;
  status_pagamento?: 'Pago' | 'Não Pago';
  metodo_pagamento?: string;
  valor_total: number;
  observacoes?: string;
  created_at: string;
  updated_at: string;
  cliente_nome: string;
  cliente_telefone: string;
  agente_nome: string;
  agente_avatar_url?: string;
  unidade_nome: string;
}

// Interface para filtros
export interface AppointmentFilters {
  page?: number;
  limit?: number;
  status?: AppointmentStatus | 'all';
  data_agendamento?: string;
  agente_id?: number;
  cliente_id?: number;
  unidade_id?: number; // ✅ NOVO: Filtro por local/unidade
  search?: string;
}

// Interface para paginação
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Interface para resposta da API
export interface AppointmentResponse {
  data: BackendAgendamento[];
  pagination?: PaginationInfo;
}

export const useAppointmentManagement = () => {
  const { token, isAuthenticated } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  });
  const [agentOptions, setAgentOptions] = useState<string[]>([]);

  // Função para fazer requisições autenticadas
  const makeAuthenticatedRequest = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!isAuthenticated || !token) {
      throw new Error('Usuário não autenticado');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
    }

    return response.json();
  }, [isAuthenticated, token]);

  // Função para converter dados do backend para o formato do frontend
  const transformBackendToFrontend = useCallback((backendData: BackendAgendamento): AppointmentDetail => {
    // Calcular tempo restante - com correção de parsing de data
    const now = new Date();

    // CORREÇÃO CRÍTICA: Converter data do backend para string ISO
    // Backend sempre retorna string no formato YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss
    const dataAgendamento = backendData.data_agendamento;
    
    if (!dataAgendamento) {
      // Se data é null ou undefined
      return {
        id: backendData.id,
        service: 'ERRO',
        dateTime: 'Data Ausente',
        timeRemaining: 'Erro de Data',
        timeRemainingStatus: 'overdue' as const,
        agent: { name: 'Erro', avatar: '' },
        client: { name: 'Erro', avatar: '' },
        status: backendData.status,
        paymentStatus: 'Não Pago',
        createdAt: 'Erro',
        paymentMethod: 'Não definido'
      };
    }
    
    // Extrair apenas a parte da data (YYYY-MM-DD)
    const dateString = dataAgendamento.split('T')[0];

    // Construir string de data/hora válida
    const appointmentDateTimeString = `${dateString}T${backendData.hora_inicio}`;
    const appointmentDate = new Date(appointmentDateTimeString);
    const appointmentEndDate = new Date(`${dateString}T${backendData.hora_fim}`);

    // Verificar se as datas são válidas
    if (isNaN(appointmentDate.getTime()) || isNaN(appointmentEndDate.getTime())) {
      return {
        id: backendData.id,
        service: 'ERRO',
        dateTime: 'Data Inválida',
        timeRemaining: 'Erro de Data',
        timeRemainingStatus: 'overdue' as const,
        agent: { name: 'Erro', avatar: '' },
        client: { name: 'Erro', avatar: '' },
        status: backendData.status,
        paymentStatus: 'Não Pago',
        createdAt: 'Erro',
        paymentMethod: 'Não definido'
      };
    }

    const diffMs = appointmentDate.getTime() - now.getTime();
    const diffEndMs = appointmentEndDate.getTime() - now.getTime();

    let timeRemaining: string;
    let timeRemainingStatus: 'happening_now' | 'soon' | 'overdue' | 'pending';

    // Se está acontecendo AGORA (entre início e fim)
    if (diffMs <= 0 && diffEndMs > 0) {
      timeRemaining = 'Agora';
      timeRemainingStatus = 'happening_now';
    }
    // Se já passou (terminou)
    else if (diffEndMs <= 0) {
      timeRemaining = 'Passado';
      timeRemainingStatus = 'overdue';
    }
    // Se ainda não começou
    else {
      const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));

      // Menos de 24 horas: mostrar em horas
      if (totalHours < 24) {
        timeRemaining = `${totalHours} hora${totalHours !== 1 ? 's' : ''}`;
        timeRemainingStatus = 'soon';
      }
      // 24 horas ou mais: mostrar em dias
      else {
        const totalDays = Math.ceil(totalHours / 24);
        timeRemaining = `${totalDays} dia${totalDays !== 1 ? 's' : ''}`;
        timeRemainingStatus = 'pending';
      }
    }

    // Formatar data e hora - Formato: "21 Outubro, 2025 - 10:00"
    // Usar a variável appointmentDate já declarada na linha 120
    const day = appointmentDate.getDate();
    const month = appointmentDate.toLocaleDateString('pt-BR', { month: 'long' });
    const year = appointmentDate.getFullYear();

    // Formatar hora removendo segundos se existir
    const formattedTime = backendData.hora_inicio.substring(0, 5); // Remove segundos (:00)
    const dateTime = `${day} ${month}, ${year} - ${formattedTime}`;

    // Formatar data de criação - Mesmo formato que dateTime: "22 outubro, 2025 - 10:00"
    const createdDate = new Date(backendData.created_at);
    const createdDay = createdDate.getDate();
    const createdMonth = createdDate.toLocaleDateString('pt-BR', { month: 'long' });
    const createdYear = createdDate.getFullYear();
    const createdTime = createdDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const createdAt = `${createdDay} ${createdMonth}, ${createdYear} - ${createdTime}`;

    // Determinar serviço baseado na duração (placeholder logic)
    const duration = new Date(`1970-01-01T${backendData.hora_fim}:00`).getTime() -
                    new Date(`1970-01-01T${backendData.hora_inicio}:00`).getTime();
    const durationMinutes = duration / (1000 * 60);

    let service = 'CORTE';
    if (durationMinutes > 60) {
      service = 'CORTE + BARBA';
    }


    return {
      id: backendData.id,
      service,
      dateTime,
      timeRemaining,
      timeRemainingStatus,
      agent: {
        name: backendData.agente_nome,
        avatar: backendData.agente_avatar_url || `https://i.pravatar.cc/150?u=${backendData.agente_id}` // ✅ CORREÇÃO: Usar avatar real do agente
      },
      client: {
        name: backendData.cliente_nome,
        avatar: `https://i.pravatar.cc/150?u=${backendData.cliente_id}` // Avatar placeholder
      },
      status: backendData.status,
      paymentStatus: backendData.status_pagamento || 'Não Pago', // ✅ CORREÇÃO: Mapear status_pagamento do backend
      createdAt,
      paymentMethod: backendData.metodo_pagamento || 'Não definido' // ✅ CORREÇÃO: Mapear metodo_pagamento do backend
    };
  }, []);

  // Buscar agendamentos com filtros e paginação
  const fetchAppointments = useCallback(async (filters: AppointmentFilters = {}) => {
    if (!isAuthenticated || !token) {
      setAppointments([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Construir URL com parâmetros
      const url = new URL(`${API_BASE_URL}/agendamentos`);
      
      // Adicionar parâmetros de paginação
      url.searchParams.set('page', (filters.page || 1).toString());
      url.searchParams.set('limit', (filters.limit || 10).toString());

      // Adicionar filtros
      if (filters.status && filters.status !== 'all') {
        url.searchParams.set('status', filters.status);
      }
      if (filters.data_agendamento) {
        url.searchParams.set('data_agendamento', filters.data_agendamento);
      }
      if (filters.agente_id) {
        url.searchParams.set('agente_id', filters.agente_id.toString());
      }
      if (filters.cliente_id) {
        url.searchParams.set('cliente_id', filters.cliente_id.toString());
      }
      // ✅ NOVO: Adicionar filtro de unidade_id
      if (filters.unidade_id) {
        url.searchParams.set('unidade_id', filters.unidade_id.toString());
      }

      const response: AppointmentResponse = await makeAuthenticatedRequest(url.toString());
      
      // Transformar dados do backend para o formato do frontend
      const transformedAppointments = response.data.map(transformBackendToFrontend);
      
      setAppointments(transformedAppointments);
      
      if (response.pagination) {
        setPagination(response.pagination);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar agendamentos';
      setError(errorMessage);
      setAppointments([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, token, makeAuthenticatedRequest, transformBackendToFrontend]);

  // Atualizar status de um agendamento
  const updateAppointmentStatus = useCallback(async (id: number, status: AppointmentStatus) => {
    try {
      setIsLoading(true);
      setError(null);

      await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });

      // Atualizar o agendamento na lista local
      setAppointments(prev => prev.map(app => 
        app.id === id ? { ...app, status } : app
      ));

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar status';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Deletar agendamento
  const deleteAppointment = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);

      await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos/${id}`, {
        method: 'DELETE'
      });

      // Remover o agendamento da lista local
      setAppointments(prev => prev.filter(app => app.id !== id));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao deletar agendamento';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Carregar agendamentos na inicialização
  useEffect(() => {
    if (isAuthenticated) {
      fetchAppointments();
    }
  }, [isAuthenticated, fetchAppointments]);

  // Função para buscar lista de agentes
  const fetchAgents = useCallback(async () => {
    try {
      // ✅ CORREÇÃO CRÍTICA: makeAuthenticatedRequest já retorna JSON
      const data = await makeAuthenticatedRequest(`${API_BASE_URL}/agentes/list`);

      if (data.success && data.data) {
        const agentNames = data.data.map((agent: any) => `${agent.nome} ${agent.sobrenome || ''}`.trim());
        setAgentOptions(agentNames);
      }
    } catch (error) {
      // Não definir erro aqui pois é uma funcionalidade secundária
    }
  }, [makeAuthenticatedRequest]);

  // Carregar agentes quando o hook for inicializado
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchAgents();
    }
  }, [fetchAgents, isAuthenticated, token]);

  return {
    appointments,
    isLoading,
    error,
    pagination,
    agentOptions,
    fetchAppointments,
    updateAppointmentStatus,
    deleteAppointment,
    setError
  };
};

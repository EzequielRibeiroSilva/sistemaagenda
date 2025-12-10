import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

// Tipos de notificação
export type TipoNotificacao = 'confirmacao' | 'cancelamento' | 'reagendamento' | 'lembrete_24h' | 'lembrete_1h';
export type StatusNotificacao = 'programado' | 'pendente' | 'enviado' | 'falha' | 'falha_permanente'; // ✅ NOVO: 'programado'

// Interface para dados do backend
export interface BackendNotificacao {
  id: number;
  agendamento_id: number;
  unidade_id: number;
  tipo_notificacao: TipoNotificacao;
  status: StatusNotificacao;
  tentativas: number;
  telefone_destino: string;
  mensagem_enviada?: string;
  whatsapp_message_id?: string;
  erro_detalhes?: string;
  ultima_tentativa?: string;
  enviado_em?: string;
  enviar_em?: string; // ✅ NOVO: Horário programado para envio
  created_at: string;
  updated_at: string;
  // Dados do agendamento relacionado
  data_agendamento?: string;
  hora_inicio?: string;
  agendamento_status?: string;
  cliente_nome?: string;
  cliente_telefone?: string;
  agente_nome?: string;
  agente_telefone?: string;
  unidade_nome?: string;
  destinatario_nome?: string; // Nome do destinatário real (cliente ou agente)
}

// Interface para notificação no frontend
export interface NotificationDetail {
  id: string;
  agendamentoId: string;
  unidadeId: string;
  tipo: TipoNotificacao;
  tipoLabel: string; // Label formatado para exibição
  status: StatusNotificacao;
  statusLabel: string; // Label formatado para exibição
  tentativas: number;
  telefone: string;
  mensagem?: string;
  whatsappMessageId?: string;
  erro?: string;
  ultimaTentativa?: Date;
  enviadoEm?: Date;
  enviarEm?: Date; // ✅ NOVO: Horário programado para envio
  criadoEm: Date;
  atualizadoEm: Date;
  // Dados do agendamento
  dataAgendamento?: string;
  horaInicio?: string;
  clienteNome?: string;
  agentNome?: string;
  unidadeNome?: string;
  destinatarioNome?: string; // Nome do destinatário real (cliente ou agente)
}

// Interface para filtros
export interface NotificationFilters {
  page?: number;
  limit?: number;
  tipo_notificacao?: TipoNotificacao | 'all';
  status?: StatusNotificacao | 'all';
  agendamento_id?: number;
  data_inicio?: string;
  data_fim?: string;
  unidade_id?: number;
}

// Interface para paginação
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Interface para resposta da API
export interface NotificationResponse {
  data: BackendNotificacao[];
  pagination: PaginationInfo;
}

// Interface para estatísticas
export interface NotificationStats {
  por_tipo: Array<{
    tipo: TipoNotificacao;
    total: number;
    enviados: number;
    falhas: number;
    pendentes: number;
  }>;
  totais: {
    total: number;
    enviados: number;
    falhas: number;
    pendentes: number;
  };
}

export const useNotificationManagement = () => {
  const { token, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  });
  const [stats, setStats] = useState<NotificationStats | null>(null);

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

  // Função para formatar label do tipo de notificação
  const formatTipoLabel = (tipo: TipoNotificacao): string => {
    const labels: Record<TipoNotificacao, string> = {
      'confirmacao': 'Agendamento',
      'cancelamento': 'Cancelamento',
      'reagendamento': 'Reagendamento',
      'lembrete_24h': 'Lembrete 24h',
      'lembrete_1h': 'Lembrete 1h'
    };
    return labels[tipo] || tipo;
  };

  // Função para formatar label do status
  const formatStatusLabel = (status: StatusNotificacao): string => {
    const labels: Record<StatusNotificacao, string> = {
      'programado': 'Programado', // ✅ NOVO
      'pendente': 'Pendente',
      'enviado': 'Enviado',
      'falha': 'Falhou',
      'falha_permanente': 'Falha Permanente'
    };
    return labels[status] || status;
  };

  // Função para converter dados do backend para o formato do frontend
  const transformBackendToFrontend = useCallback((backendData: BackendNotificacao): NotificationDetail => {
    return {
      id: backendData.id.toString(),
      agendamentoId: backendData.agendamento_id.toString(),
      unidadeId: backendData.unidade_id.toString(),
      tipo: backendData.tipo_notificacao,
      tipoLabel: formatTipoLabel(backendData.tipo_notificacao),
      status: backendData.status,
      statusLabel: formatStatusLabel(backendData.status),
      tentativas: backendData.tentativas,
      telefone: backendData.telefone_destino,
      mensagem: backendData.mensagem_enviada,
      whatsappMessageId: backendData.whatsapp_message_id,
      erro: backendData.erro_detalhes,
      ultimaTentativa: backendData.ultima_tentativa ? new Date(backendData.ultima_tentativa) : undefined,
      enviadoEm: backendData.enviado_em ? new Date(backendData.enviado_em) : undefined,
      enviarEm: backendData.enviar_em ? new Date(backendData.enviar_em) : undefined, // ✅ NOVO: Horário programado
      criadoEm: new Date(backendData.created_at),
      atualizadoEm: new Date(backendData.updated_at),
      dataAgendamento: backendData.data_agendamento,
      horaInicio: backendData.hora_inicio,
      clienteNome: backendData.cliente_nome,
      agentNome: backendData.agente_nome,
      unidadeNome: backendData.unidade_nome,
      destinatarioNome: backendData.destinatario_nome // ✅ Nome do destinatário real
    };
  }, []);

  // Função para buscar notificações
  const fetchNotifications = useCallback(async (filters: NotificationFilters = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      // Construir query string
      const queryParams = new URLSearchParams();
      
      if (filters.page) queryParams.append('page', filters.page.toString());
      if (filters.limit) queryParams.append('limit', filters.limit.toString());
      if (filters.tipo_notificacao && filters.tipo_notificacao !== 'all') {
        queryParams.append('tipo_notificacao', filters.tipo_notificacao);
      }
      if (filters.status && filters.status !== 'all') {
        queryParams.append('status', filters.status);
      }
      if (filters.agendamento_id) {
        queryParams.append('agendamento_id', filters.agendamento_id.toString());
      }
      if (filters.data_inicio) queryParams.append('data_inicio', filters.data_inicio);
      if (filters.data_fim) queryParams.append('data_fim', filters.data_fim);
      if (filters.unidade_id) queryParams.append('unidade_id', filters.unidade_id.toString());

      const url = `${API_BASE_URL}/notificacoes?${queryParams.toString()}`;
      console.log('🌐 [useNotificationManagement] URL da requisição:', url);
      
      const response: NotificationResponse = await makeAuthenticatedRequest(url);
      console.log('✅ [useNotificationManagement] Resposta do backend:', {
        total: response.data.length,
        pagination: response.pagination
      });

      // Transformar dados do backend para o formato do frontend
      const transformedNotifications = response.data.map(transformBackendToFrontend);
      
      setNotifications(transformedNotifications);
      setPagination(response.pagination);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar notificações';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest, transformBackendToFrontend]);

  // Função para buscar estatísticas
  const fetchStats = useCallback(async (filters: { data_inicio?: string; data_fim?: string } = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (filters.data_inicio) queryParams.append('data_inicio', filters.data_inicio);
      if (filters.data_fim) queryParams.append('data_fim', filters.data_fim);

      const url = `${API_BASE_URL}/notificacoes/stats?${queryParams.toString()}`;
      const response: NotificationStats = await makeAuthenticatedRequest(url);
      
      setStats(response);
    } catch (err) {
      // Erro silencioso - não expor detalhes no console
    }
  }, [makeAuthenticatedRequest]);

  // Função para buscar notificação por ID
  const fetchNotificationById = useCallback(async (id: number): Promise<NotificationDetail | null> => {
    try {
      const url = `${API_BASE_URL}/notificacoes/${id}`;
      const response: BackendNotificacao = await makeAuthenticatedRequest(url);
      
      return transformBackendToFrontend(response);
    } catch (err) {
      return null;
    }
  }, [makeAuthenticatedRequest, transformBackendToFrontend]);

  return {
    notifications,
    isLoading,
    error,
    pagination,
    stats,
    fetchNotifications,
    fetchStats,
    fetchNotificationById
  };
};

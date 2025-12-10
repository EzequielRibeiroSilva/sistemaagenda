import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL, getAssetUrl } from '../utils/api';

// Interfaces para dados do backend
export interface BackendAgente {
  id: number;
  name: string;  // Backend já retorna 'name' (nome completo)
  email: string;
  phone: string;  // Backend já retorna 'phone'
  avatar: string;  // Backend já retorna 'avatar' (caminho completo)
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
  unidades?: string[]; // ✅ Array de IDs das unidades onde o agente trabalha
  unidade_id?: number; // ✅ CORREÇÃO CRÍTICA: ID da unidade principal do agente
}

export interface BackendServico {
  id: number;
  nome: string;
  descricao?: string;
  preco: string;
  duracao_minutos: number;
  cor?: string;
}

export interface BackendUnidade {
  id: number;
  nome: string;
  endereco?: string;
  usuario_id: number;
}

export interface BackendAgendamento {
  id: number;
  cliente_id: number;
  agente_id: number;
  unidade_id: number;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  status: 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO' | 'CONCLUIDO';
  valor_total: number;
  observacoes?: string;
  cliente_nome: string;
  cliente_telefone: string;
  agente_nome: string;
  agente_avatar_url?: string;
  unidade_nome: string;
  servicos?: Array<{
    id: number;
    nome: string;
    preco: string;
  }>;
}

// Interfaces para dados transformados (frontend)
export interface CalendarAgent {
  id: string;
  name: string;
  avatar: string;
  unidades?: string[]; // ✅ Array de IDs das unidades onde o agente trabalha
  unidade_id?: number; // ✅ CORREÇÃO CRÍTICA: ID da unidade principal do agente
}

export interface CalendarService {
  id: string;
  name: string;
  color: string;
  textColor: string;
}

export interface CalendarLocation {
  id: string;
  name: string;
}

export interface CalendarAppointment {
  id: string;
  agentId: string;
  serviceId: string;
  locationId: string;
  startTime: string;
  endTime: string;
  date: string;
  clientName?: string;
  clientPhone?: string;
  status?: string;
}

export interface CalendarUnavailableBlock {
  id: string;
  agentId: string;
  startTime: string;
  endTime: string;
  date?: string;
}

export interface UnitSchedule {
  dia_semana: number;
  is_aberto: boolean;
  horarios_json: { inicio: string; fim: string }[];
}

// Mapeamento de cores para serviços
const SERVICE_COLORS = [
  { color: 'bg-blue-600', textColor: 'text-white' },
  { color: 'bg-cyan-500', textColor: 'text-white' },
  { color: 'bg-fuchsia-500', textColor: 'text-white' },
  { color: 'bg-purple-600', textColor: 'text-white' },
  { color: 'bg-green-600', textColor: 'text-white' },
  { color: 'bg-orange-600', textColor: 'text-white' },
  { color: 'bg-pink-600', textColor: 'text-white' },
  { color: 'bg-indigo-600', textColor: 'text-white' },
];

// ✅ NOVO: Interface para exceções de calendário
interface CalendarException {
  id: number;
  unidade_id: number;
  data_inicio: string;
  data_fim: string;
  tipo: 'Feriado' | 'Férias' | 'Evento Especial' | 'Manutenção' | 'Outro';
  descricao: string;
  created_at: string;
  updated_at: string;
}

export const useCalendarData = () => {
  const { token, isAuthenticated, user } = useAuth();

  const [agents, setAgents] = useState<CalendarAgent[]>([]);
  const [services, setServices] = useState<CalendarService[]>([]);
  const [locations, setLocations] = useState<CalendarLocation[]>([]);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [unavailableBlocks, setUnavailableBlocks] = useState<CalendarUnavailableBlock[]>([]);
  const [unitSchedules, setUnitSchedules] = useState<Record<string, UnitSchedule[]>>({});
  const [calendarExceptions, setCalendarExceptions] = useState<Record<string, CalendarException[]>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Transformar agente do backend para formato do calendário
  const transformAgent = useCallback((backendAgent: BackendAgente): CalendarAgent => {
    // Backend já retorna 'name' formatado (igual useAgentManagement)
    const displayName = backendAgent.nome_exibicao || backendAgent.name;
    
    // Backend já retorna 'avatar' com caminho, usar getAssetUrl
    const avatarUrl = backendAgent.avatar 
      ? getAssetUrl(backendAgent.avatar)
      : `https://i.pravatar.cc/150?u=${backendAgent.id}`;
    
    return {
      id: backendAgent.id.toString(),
      name: displayName,
      avatar: avatarUrl,
      unidades: backendAgent.unidades, // ✅ CRÍTICO: Passar array de unidades do backend
      unidade_id: backendAgent.unidade_id // ✅ CORREÇÃO CRÍTICA: Incluir unidade_id principal
    };
  }, []);

  // Transformar serviço do backend para formato do calendário
  const transformService = useCallback((backendService: BackendServico, index: number): CalendarService => {
    const colorScheme = SERVICE_COLORS[index % SERVICE_COLORS.length];
    return {
      id: backendService.id.toString(),
      name: backendService.nome.toUpperCase(),
      color: colorScheme.color,
      textColor: colorScheme.textColor
    };
  }, []);

  // Transformar unidade do backend para formato do calendário
  const transformLocation = useCallback((backendUnidade: BackendUnidade): CalendarLocation => {
    return {
      id: backendUnidade.id.toString(),
      name: backendUnidade.nome
    };
  }, []);

  // Transformar agendamento do backend para formato do calendário
  const transformAppointment = useCallback((backendAgendamento: BackendAgendamento): CalendarAppointment => {
    // Extrair apenas a data (YYYY-MM-DD)
    const dateString = backendAgendamento.data_agendamento.split('T')[0];
    
    // Determinar serviceId baseado nos serviços do agendamento
    // IMPORTANTE: Não usar services aqui para evitar loop infinito de re-renders
    // O backend DEVE retornar os serviços associados ao agendamento
    const serviceId = backendAgendamento.servicos && backendAgendamento.servicos.length > 0
      ? backendAgendamento.servicos[0].id.toString()
      : '1'; // Fallback temporário - o backend deve sempre retornar serviços

    return {
      id: backendAgendamento.id.toString(),
      agentId: backendAgendamento.agente_id.toString(),
      serviceId: serviceId,
      locationId: backendAgendamento.unidade_id.toString(),
      startTime: backendAgendamento.hora_inicio.substring(0, 5), // Remove segundos
      endTime: backendAgendamento.hora_fim.substring(0, 5), // Remove segundos
      date: dateString,
      clientName: backendAgendamento.cliente_nome,
      clientPhone: backendAgendamento.cliente_telefone,
      status: backendAgendamento.status
    };
  }, []); // ← SEM DEPENDÊNCIAS para evitar loop infinito

  // Buscar agentes
  const fetchAgents = useCallback(async () => {
    try {
      
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agentes`);
      
      
      if (response.data && response.data.length > 0) {
        response.data.forEach((agent: any, index: number) => {
        });
      }
      
      if (response.success && response.data) {
        const transformedAgents = response.data.map(transformAgent);
        setAgents(transformedAgents);
        return transformedAgents;
      }
      
      return [];
    } catch (err) {
      throw err;
    }
  }, [makeAuthenticatedRequest, transformAgent, user]);

  // Buscar serviços
  const fetchServices = useCallback(async () => {
    try {
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/servicos`);
      
      
      const servicesData = response.data || response;
      
      if (Array.isArray(servicesData)) {
        const transformedServices = servicesData.map(transformService);
        setServices(transformedServices);
        return transformedServices;
      }
      
      return [];
    } catch (err) {
      throw err;
    }
  }, [makeAuthenticatedRequest, transformService]);

  // Buscar unidades (locais)
  const fetchLocations = useCallback(async () => {
    try {
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/unidades`);
      
      // ✅ CORREÇÃO: API pode retornar { success, data } OU array direto
      const locationsData = response.data || response;
      
      if (Array.isArray(locationsData)) {
        const transformedLocations = locationsData.map(transformLocation);
        setLocations(transformedLocations);
        
        // Buscar horários de funcionamento para cada unidade
        const schedulesMap: Record<string, UnitSchedule[]> = {};
        const exceptionsMap: Record<string, CalendarException[]> = {};

        for (const location of locationsData) {
          try {
            const scheduleResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/unidades/${location.id}`);

            if (scheduleResponse.success && scheduleResponse.data?.horarios_funcionamento) {
              schedulesMap[location.id.toString()] = scheduleResponse.data.horarios_funcionamento;
            }

            // ✅ NOVO: Buscar exceções de calendário para cada unidade
            try {
              // 🎯 CORREÇÃO: Adicionar cache-busting para evitar cache 304
              const cacheBuster = Date.now();
              const exceptionsResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/unidades/${location.id}/excecoes?_t=${cacheBuster}`);

              if (exceptionsResponse.success && Array.isArray(exceptionsResponse.data)) {
                exceptionsMap[location.id.toString()] = exceptionsResponse.data;
              } else {
                exceptionsMap[location.id.toString()] = [];
              }
            } catch (excErr) {
              exceptionsMap[location.id.toString()] = [];
            }
          } catch (err) {
            // Erro ao buscar horários da unidade
          }
        }
        setUnitSchedules(schedulesMap);
        setCalendarExceptions(exceptionsMap);

        return transformedLocations;
      }
      
      return [];
    } catch (err) {
      // Erro ao buscar unidades
      throw err;
    }
  }, [makeAuthenticatedRequest, transformLocation]);

  // Buscar agendamentos com filtros
  const fetchAppointments = useCallback(async (filters?: {
    startDate?: string;
    endDate?: string;
    agente_id?: number;
    unidade_id?: number;
    status?: string;
  }) => {
    try {

      // 🛡️ CORREÇÃO DEFENSIVA: Se os filtros não existirem, criar filtro padrão para hoje
      const today = new Date();
      const pad = (num: number) => num.toString().padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

      const safeFilters = filters || {
        startDate: todayStr,
        endDate: todayStr
      };

      const url = new URL(`${API_BASE_URL}/agendamentos`);
      
      // ✅ OTIMIZAÇÃO: Usar filtros do backend para melhor performance
      // O backend suporta filtro data_agendamento para buscar agendamentos de uma data específica

      if (safeFilters.startDate && safeFilters.endDate && safeFilters.startDate === safeFilters.endDate) {
        // Se startDate === endDate, usar filtro específico de data do backend
        url.searchParams.set('data_agendamento', safeFilters.startDate);
      } else if (safeFilters.startDate && safeFilters.endDate) {
        // ✅ CORREÇÃO CRÍTICA: Para períodos (startDate !== endDate), usar data_inicio e data_fim
        // Isso garante que o backend use a query avançada que INCLUI os serviços
        url.searchParams.set('data_inicio', safeFilters.startDate);
        url.searchParams.set('data_fim', safeFilters.endDate);

      }

      if (safeFilters.agente_id) {
        url.searchParams.set('agente_id', safeFilters.agente_id.toString());
      }
      if (safeFilters.unidade_id) {
        url.searchParams.set('unidade_id', safeFilters.unidade_id.toString());
      }
      if (safeFilters.status) {
        url.searchParams.set('status', safeFilters.status);
      }

      // Adicionar paginação para buscar todos os registros
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', '1000'); // Buscar muitos registros

      const response = await makeAuthenticatedRequest(url.toString());
      
      
      const appointmentsData = response.data || [];
      if (Array.isArray(appointmentsData)) {
        let transformedAppointments = appointmentsData.map(transformAppointment);
        
        
        // 🔎 DEBUG SÊNIOR: Inspecionar estrutura de datas ANTES do filtro
        if (transformedAppointments.length > 0) {
          transformedAppointments.slice(0, 10).forEach((appt: CalendarAppointment, index) => {
          });
        }
        
        // Filtrar por data no frontend apenas se necessário (quando não usamos filtro específico do backend)
        if ((filters?.startDate || filters?.endDate) && !(filters?.startDate === filters?.endDate)) {

          transformedAppointments = transformedAppointments.filter((app: CalendarAppointment) => {
            const passesStartDate = !filters.startDate || app.date >= filters.startDate;
            const passesEndDate = !filters.endDate || app.date <= filters.endDate;
            const passes = passesStartDate && passesEndDate;

            // Log detalhado para cada agendamento que FALHA no filtro
            if (!passes) {
            }

            return passes;
          });


          // 🔎 DEBUG: Mostrar quais agendamentos PASSARAM no filtro
          if (transformedAppointments.length > 0) {
            transformedAppointments.slice(0, 10).forEach((appt: CalendarAppointment, index) => {
            });
          }
        } else if (filters?.startDate === filters?.endDate) {
        }

        setAppointments(transformedAppointments);

        // 🔍 DEBUG CRÍTICO: Mostrar amostra dos agendamentos salvos
        if (transformedAppointments.length > 0) {
          transformedAppointments.slice(0, 5).forEach((appt: CalendarAppointment, index) => {
          });
        } else {
        }

        return transformedAppointments;
      }
      return [];
    } catch (err) {
      throw err;
    }
  }, [makeAuthenticatedRequest, transformAppointment]);

  // Buscar horários indisponíveis dos agentes
  const fetchUnavailableBlocks = useCallback(async (filters?: {
    startDate?: string;
    endDate?: string;
    agente_id?: number;
  }) => {
    try {
      // TODO: Implementar endpoint no backend para buscar horários bloqueados
      // Por enquanto, retornar array vazio
      setUnavailableBlocks([]);
      return [];
    } catch (err) {
      throw err;
    }
  }, []);

  // ✅ NOVO: Função para verificar se uma data está bloqueada por exceção
  const isDateBlockedByException = useCallback((date: Date, locationId: string): CalendarException | null => {
    const locationExceptions = calendarExceptions[locationId] || [];
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    const foundException = locationExceptions.find(exception => {
      // 🎯 CORREÇÃO CRÍTICA: Converter datas ISO para formato YYYY-MM-DD para comparação
      const startDate = exception.data_inicio.split('T')[0]; // Remove timezone e hora
      const endDate = exception.data_fim.split('T')[0]; // Remove timezone e hora
      const isInRange = dateStr >= startDate && dateStr <= endDate;
      return isInRange;
    }) || null;

    return foundException;
  }, [calendarExceptions]);

  // Carregar todos os dados iniciais (APENAS dados estáticos)
  // ✅ CORREÇÃO: CalendarPage é responsável por buscar agendamentos com filtros corretos
  const loadAllData = useCallback(async () => {

    if (!isAuthenticated) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // ✅ CORREÇÃO: Carregar APENAS dados estáticos (agentes, serviços, locais)
      // CalendarPage buscará agendamentos com filtros corretos (agentId para AGENTE)
      await Promise.all([
        fetchAgents(),
        fetchServices(),
        fetchLocations()
      ]);


    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados do calendário';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, fetchAgents, fetchServices, fetchLocations]);

  // Criar novo agendamento
  const createAppointment = useCallback(async (appointmentData: {
    cliente_id: number;
    agente_id: number;
    unidade_id: number;
    data_agendamento: string;
    hora_inicio: string;
    hora_fim: string;
    servicos_ids: number[];
    observacoes?: string;
  }) => {
    try {
      setIsLoading(true);
      
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos`, {
        method: 'POST',
        body: JSON.stringify(appointmentData)
      });

      if (response.success) {
        // Recarregar agendamentos
        await fetchAppointments();
        return response.data;
      }
      
      throw new Error(response.message || 'Erro ao criar agendamento');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar agendamento';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest, fetchAppointments]);

  // Atualizar agendamento
  const updateAppointment = useCallback(async (id: number, appointmentData: Partial<{
    data_agendamento: string;
    hora_inicio: string;
    hora_fim: string;
    status: string;
    observacoes: string;
  }>) => {
    try {
      setIsLoading(true);
      
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(appointmentData)
      });

      if (response.success) {
        // Recarregar agendamentos
        await fetchAppointments();
        return response.data;
      }
      
      throw new Error(response.message || 'Erro ao atualizar agendamento');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar agendamento';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest, fetchAppointments]);

  // Deletar agendamento
  const deleteAppointment = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agendamentos/${id}`, {
        method: 'DELETE'
      });

      if (response.success) {
        // Recarregar agendamentos
        await fetchAppointments();
        return true;
      }
      
      throw new Error(response.message || 'Erro ao deletar agendamento');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao deletar agendamento';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [makeAuthenticatedRequest, fetchAppointments]);

  // Carregar dados iniciais quando autenticar
  useEffect(() => {
    if (isAuthenticated) {
      // ✅ CORREÇÃO: loadAllData agora não recebe parâmetros (apenas dados estáticos)
      loadAllData();
    } else {
      // Limpar dados quando desautenticar
      setAgents([]);
      setServices([]);
      setLocations([]);
      setAppointments([]);
      setUnavailableBlocks([]);
      setCalendarExceptions({});
    }
  }, [isAuthenticated, loadAllData]);

  return {
    // Dados
    agents,
    services,
    locations,
    appointments,
    unavailableBlocks,
    unitSchedules,
    calendarExceptions,

    // Estado
    isLoading,
    error,

    // Ações
    loadAllData,
    fetchAppointments,
    fetchUnavailableBlocks,
    createAppointment,
    updateAppointment,
    deleteAppointment,

    // Utilitários
    setError,
    isDateBlockedByException
  };
};

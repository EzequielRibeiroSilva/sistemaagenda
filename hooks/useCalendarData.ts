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

export const useCalendarData = () => {
  const { token, isAuthenticated, user } = useAuth();
  
  const [agents, setAgents] = useState<CalendarAgent[]>([]);
  const [services, setServices] = useState<CalendarService[]>([]);
  const [locations, setLocations] = useState<CalendarLocation[]>([]);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [unavailableBlocks, setUnavailableBlocks] = useState<CalendarUnavailableBlock[]>([]);
  const [unitSchedules, setUnitSchedules] = useState<Record<string, UnitSchedule[]>>({});
  
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
      avatar: avatarUrl
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
      console.log('🔍 [useCalendarData] Buscando agentes... (ESTÁVEL)');
      console.log('🔍 [useCalendarData] URL:', `${API_BASE_URL}/agentes`);
      console.log('🔍 [useCalendarData] User:', user);
      
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agentes`);
      
      console.log('🔍 [useCalendarData] Resposta RAW de agentes:', response);
      console.log('🔍 [useCalendarData] Agentes do backend:', response.data);
      console.log('🔍 [useCalendarData] Total de agentes retornados:', response.data?.length || 0);
      
      if (response.data && response.data.length > 0) {
        console.log('🔍 [useCalendarData] Detalhes dos agentes:');
        response.data.forEach((agent: any, index: number) => {
          console.log(`  ${index + 1}. Objeto completo:`, agent);
          console.log(`     - ID: ${agent.id}`);
          console.log(`     - name: ${agent.name}`);
          console.log(`     - email: ${agent.email}`);
          console.log(`     - phone: ${agent.phone}`);
          console.log(`     - avatar: ${agent.avatar}`);
          console.log(`     - nome_exibicao: ${agent.nome_exibicao}`);
          console.log(`     - Todos os campos:`, Object.keys(agent));
        });
      }
      
      if (response.success && response.data) {
        const transformedAgents = response.data.map(transformAgent);
        console.log('✅ [useCalendarData] Agentes transformados:', transformedAgents);
        setAgents(transformedAgents);
        return transformedAgents;
      }
      
      console.warn('⚠️ [useCalendarData] Resposta de agentes sem success ou data');
      return [];
    } catch (err) {
      console.error('❌ Erro ao buscar agentes:', err);
      throw err;
    }
  }, [makeAuthenticatedRequest, transformAgent, user]);

  // Buscar serviços
  const fetchServices = useCallback(async () => {
    try {
      console.log('🔍 [useCalendarData] Buscando serviços... (ESTÁVEL)');
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/servicos`);
      
      console.log('🔍 [useCalendarData] Resposta RAW de serviços:', response);
      
      const servicesData = response.data || response;
      console.log('🔍 [useCalendarData] servicesData:', servicesData);
      console.log('🔍 [useCalendarData] É array?', Array.isArray(servicesData));
      
      if (Array.isArray(servicesData)) {
        const transformedServices = servicesData.map(transformService);
        console.log('✅ [useCalendarData] Serviços transformados:', transformedServices);
        setServices(transformedServices);
        return transformedServices;
      }
      
      console.warn('⚠️ [useCalendarData] servicesData não é array!');
      return [];
    } catch (err) {
      console.error('❌ Erro ao buscar serviços:', err);
      throw err;
    }
  }, [makeAuthenticatedRequest, transformService]);

  // Buscar unidades (locais)
  const fetchLocations = useCallback(async () => {
    try {
      console.log('🔍 [useCalendarData] Buscando unidades... (ESTÁVEL)');
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/unidades`);
      
      console.log('🔍 [useCalendarData] Resposta RAW de unidades:', response);
      
      // ✅ CORREÇÃO: API pode retornar { success, data } OU array direto
      const locationsData = response.data || response;
      console.log('🔍 [useCalendarData] locationsData:', locationsData);
      console.log('🔍 [useCalendarData] É array?', Array.isArray(locationsData));
      
      if (Array.isArray(locationsData)) {
        const transformedLocations = locationsData.map(transformLocation);
        console.log('✅ [useCalendarData] Unidades transformadas:', transformedLocations);
        setLocations(transformedLocations);
        
        // Buscar horários de funcionamento para cada unidade
        const schedulesMap: Record<string, UnitSchedule[]> = {};
        for (const location of locationsData) {
          try {
            const scheduleResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/unidades/${location.id}`);
            if (scheduleResponse.success && scheduleResponse.data?.horarios_funcionamento) {
              schedulesMap[location.id.toString()] = scheduleResponse.data.horarios_funcionamento;
              console.log(`✅ [useCalendarData] Horários da unidade ${location.nome}:`, scheduleResponse.data.horarios_funcionamento);
            }
          } catch (err) {
            console.warn(`⚠️ Erro ao buscar horários da unidade ${location.id}:`, err);
          }
        }
        setUnitSchedules(schedulesMap);
        
        return transformedLocations;
      }
      
      console.warn('⚠️ [useCalendarData] locationsData não é array!');
      return [];
    } catch (err) {
      console.error('❌ Erro ao buscar unidades:', err);
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
      console.log('🔍 [useCalendarData] Buscando agendamentos... (ESTÁVEL)');

      // 🛡️ CORREÇÃO DEFENSIVA: Se os filtros não existirem, criar filtro padrão para hoje
      const today = new Date();
      const pad = (num: number) => num.toString().padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

      const safeFilters = filters || {
        startDate: todayStr,
        endDate: todayStr
      };

      console.log('🛡️ [useCalendarData] Filtros seguros:', safeFilters);
      const url = new URL(`${API_BASE_URL}/agendamentos`);
      
      // ✅ OTIMIZAÇÃO: Usar filtros do backend para melhor performance
      // O backend suporta filtro data_agendamento para buscar agendamentos de uma data específica

      if (safeFilters.startDate && safeFilters.endDate && safeFilters.startDate === safeFilters.endDate) {
        // Se startDate === endDate, usar filtro específico de data do backend
        url.searchParams.set('data_agendamento', safeFilters.startDate);
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
      
      console.log('🔍 [useCalendarData] fetchAppointments - Response:', {
        total: response.data?.length || 0,
        filters: safeFilters
      });
      
      const appointmentsData = response.data || [];
      if (Array.isArray(appointmentsData)) {
        let transformedAppointments = appointmentsData.map(transformAppointment);
        
        console.log('🔍 [useCalendarData] Transformed appointments:', transformedAppointments.length);
        console.log('   Sample:', transformedAppointments.slice(0, 3));
        
        // 🔎 DEBUG SÊNIOR: Inspecionar estrutura de datas ANTES do filtro
        if (transformedAppointments.length > 0) {
          console.log('🔎 [useCalendarData] Amostra de Datas ANTES do filtro:');
          transformedAppointments.slice(0, 10).forEach((appt: CalendarAppointment, index) => {
            console.log(`   ${index + 1}. ID=${appt.id}, date="${appt.date}", startTime="${appt.startTime}", agentId="${appt.agentId}"`);
          });
        }
        
        // Filtrar por data no frontend apenas se necessário (quando não usamos filtro específico do backend)
        if ((filters?.startDate || filters?.endDate) && !(filters?.startDate === filters?.endDate)) {
          console.log('🎯 [useCalendarData] Aplicando Filtros de Data no Frontend:', {
            startDate: filters.startDate,
            endDate: filters.endDate,
            startDateType: typeof filters.startDate,
            endDateType: typeof filters.endDate
          });

          transformedAppointments = transformedAppointments.filter((app: CalendarAppointment) => {
            const passesStartDate = !filters.startDate || app.date >= filters.startDate;
            const passesEndDate = !filters.endDate || app.date <= filters.endDate;
            const passes = passesStartDate && passesEndDate;

            // Log detalhado para cada agendamento que FALHA no filtro
            if (!passes) {
              console.log(`   ❌ Filtrado: ID=${app.id}, date="${app.date}", startDate="${filters.startDate}", endDate="${filters.endDate}", passesStart=${passesStartDate}, passesEnd=${passesEndDate}`);
            }

            return passes;
          });

          console.log('🔍 [useCalendarData] After frontend date filter:', transformedAppointments.length);

          // 🔎 DEBUG: Mostrar quais agendamentos PASSARAM no filtro
          if (transformedAppointments.length > 0) {
            console.log('✅ [useCalendarData] Agendamentos que PASSARAM no filtro:');
            transformedAppointments.slice(0, 10).forEach((appt: CalendarAppointment, index) => {
              console.log(`   ${index + 1}. ID=${appt.id}, date="${appt.date}"`);
            });
          }
        } else if (filters?.startDate === filters?.endDate) {
          console.log('🚀 [useCalendarData] Usando filtro otimizado do backend para data específica:', filters.startDate);
        }

        setAppointments(transformedAppointments);
        console.log('✅ [useCalendarData] Agendamentos salvos no estado:', transformedAppointments.length);

        // 🔍 DEBUG CRÍTICO: Mostrar amostra dos agendamentos salvos
        if (transformedAppointments.length > 0) {
          console.log('📋 [useCalendarData] AMOSTRA dos agendamentos salvos no estado:');
          transformedAppointments.slice(0, 5).forEach((appt: CalendarAppointment, index) => {
            console.log(`   ${index + 1}. ID=${appt.id}, date="${appt.date}", agentId="${appt.agentId}", startTime="${appt.startTime}"`);
          });
        } else {
          console.log('⚠️ [useCalendarData] NENHUM agendamento foi salvo no estado!');
        }

        return transformedAppointments;
      }
      return [];
    } catch (err) {
      console.error('❌ Erro ao buscar agendamentos:', err);
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
      console.error('❌ Erro ao buscar bloqueios:', err);
      throw err;
    }
  }, []);

  // Carregar todos os dados iniciais (APENAS dados estáticos)
  // ✅ CORREÇÃO: CalendarPage é responsável por buscar agendamentos com filtros corretos
  const loadAllData = useCallback(async () => {
    console.log('🚀 [useCalendarData] loadAllData chamado (apenas dados estáticos)');

    if (!isAuthenticated) {
      console.log('❌ [useCalendarData] loadAllData: usuário não autenticado');
      return;
    }

    try {
      console.log('⏳ [useCalendarData] loadAllData: iniciando carregamento...');
      setIsLoading(true);
      setError(null);

      // ✅ CORREÇÃO: Carregar APENAS dados estáticos (agentes, serviços, locais)
      // CalendarPage buscará agendamentos com filtros corretos (agentId para AGENTE)
      console.log('📡 [useCalendarData] loadAllData: carregando dados estáticos em paralelo...');
      await Promise.all([
        fetchAgents(),
        fetchServices(),
        fetchLocations()
      ]);

      console.log('✅ [useCalendarData] loadAllData: dados estáticos carregados com sucesso!');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados do calendário';
      setError(errorMessage);
      console.error('❌ [useCalendarData] loadAllData: erro ao carregar dados:', errorMessage);
    } finally {
      setIsLoading(false);
      console.log('🏁 [useCalendarData] loadAllData: carregamento finalizado');
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
    console.log('🔄 [useCalendarData] useEffect inicial - isAuthenticated:', isAuthenticated);
    if (isAuthenticated) {
      console.log('✅ [useCalendarData] Usuário autenticado, carregando dados estáticos...');
      // ✅ CORREÇÃO: loadAllData agora não recebe parâmetros (apenas dados estáticos)
      loadAllData();
    } else {
      console.log('❌ [useCalendarData] Usuário não autenticado, limpando dados...');
      // Limpar dados quando desautenticar
      setAgents([]);
      setServices([]);
      setLocations([]);
      setAppointments([]);
      setUnavailableBlocks([]);
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
    setError
  };
};

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

// Interfaces para dados do backend
interface BackendAgendamento {
  id: number;
  numero_agendamento?: number;
  cliente_id: number; // ✅ ADICIONADO: ID do cliente (necessário para cálculo de novos clientes)
  agente_id: number;
  servico_id?: number;
  unidade_id: number;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  coberto_clube?: boolean;
  status: 'Pendente' | 'Aprovado' | 'Cancelado' | 'Concluído' | 'Não Compareceu';
  valor_total: number;
  cliente_data_nascimento?: string;
  metodo_pagamento?: string;
  status_pagamento?: 'Pago' | 'Não Pago';
  servicos?: Array<{
    id: number;
    nome: string;
    preco: string;
    comissao_percentual?: number;
  }>;
}

interface BackendAgente {
  id: number;
  nome: string;
  sobrenome?: string;
  name?: string;              // ✅ CRÍTICO: Backend retorna 'name' já formatado (nome completo)
  email: string;
  telefone?: string;
  phone?: string;             // ✅ CORREÇÃO: Backend retorna 'phone' não 'telefone'
  avatar?: string | null;     // ✅ CORREÇÃO: Backend retorna 'avatar' não 'avatar_url'
  status: string;
  unidade_id?: number;        // ✅ CRÍTICO: ID da unidade principal do agente
  unidades?: string[];        // ✅ CRÍTICO: Array de IDs das unidades onde o agente trabalha
  nome_exibicao?: string;     // ✅ CORREÇÃO: Nome de exibição personalizado
  comissao_percentual?: number;
}

interface BackendServico {
  id: number;
  nome: string;
  preco: string;
  comissao_percentual?: number;
}

interface BackendUnidade {
  id: number;
  nome: string;
  endereco?: string;
  horarios_funcionamento?: UnitSchedule[];
}

// ✅ NOVO: Interface para horários de funcionamento da unidade
interface UnitSchedule {
  dia_semana: number;
  is_aberto: boolean;
  horarios_json: Array<{
    inicio: string;
    fim: string;
  }>;
}

interface DashboardFilters {
  unidade_id?: number;
  agente_id?: number;
  servico_id?: number;
  data_inicio: string;
  data_fim: string;
}

interface DashboardClubStats {
  assinaturas_ativas: number;
  assinaturas_pendentes: number;
  cotas_consumidas: number;
}

interface DashboardClubIntelligence {
  mrr: number;
  receita_avulsa: number;
  receita_total: number;
  percentual_clube: number;
  ticket_medio_assinante: number;
  ticket_medio_comum: number;
  churn_pct: number;
  canceladas_periodo: number;
  ativas_atuais: number;
}

interface DashboardKpis {
  reservas_totais: number;
  receita_bruta: number;
  receita_servicos: number;
  receita_balcao: number;
  receita_proprietario: number;
  comissoes_agentes: number;
  despesas_pagas_totais: number;
  lucro_liquido: number;
  ticket_medio: number;
  clientes_unicos: number;
  taxa_cancelamento_pct: number;
  agendamentos_pendentes: number;
  alerta_estoque: number;
}

export const useDashboardData = () => {
  // ✅ CORREÇÃO CRÍTICA: Pegar token do contexto de autenticação (igual useCalendarData)
  const { token, isAuthenticated, user } = useAuth();
  const [agendamentos, setAgendamentos] = useState<BackendAgendamento[]>([]);
  const [agentes, setAgentes] = useState<BackendAgente[]>([]);
  const [servicos, setServicos] = useState<BackendServico[]>([]);
  const [unidades, setUnidades] = useState<BackendUnidade[]>([]);
  const [unitSchedules, setUnitSchedules] = useState<Record<string, UnitSchedule[]>>({}); // Horários por unidade
  const [clubStats, setClubStats] = useState<DashboardClubStats | null>(null);
  const [clubIntelligence, setClubIntelligence] = useState<DashboardClubIntelligence | null>(null);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [isLoading, setIsLoading] = useState(true); // ✅ CORREÇÃO: Inicializar como true para evitar flash
  const [initialLoadComplete, setInitialLoadComplete] = useState(false); // ✅ NOVO: Flag para controle de carregamento inicial
  const [error, setError] = useState<string | null>(null);

  // Helper para fazer requisições autenticadas (IGUAL useCalendarData)
  const makeAuthenticatedRequest = useCallback(async (url: string, options: RequestInit = {}) => {
    // ✅ CORREÇÃO: Validar autenticação antes de fazer requisição
    if (!isAuthenticated || !token) {
      throw new Error('Usuário não autenticado');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`, // ✅ Token do contexto
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erro na requisição: ${response.status}`);
    }

    return response.json();
  }, [isAuthenticated, token]); // ✅ CORREÇÃO: Adicionar dependências

  // Buscar unidades
  const fetchUnidades = useCallback(async () => {
    try {
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/unidades?include=horarios_funcionamento`);
      
      let unidadesData: BackendUnidade[] = [];
      
      // ✅ CORREÇÃO CRÍTICA: Suportar múltiplos formatos de resposta
      if (response.success && response.data) {
        // Formato 1: { success: true, data: [...] }
        unidadesData = response.data;
      } else if (response.data && Array.isArray(response.data)) {
        // Formato 2: { data: [...], limitInfo: {...} } ← ESTE É O FORMATO REAL!
        unidadesData = response.data;
      } else if (Array.isArray(response)) {
        // Formato 3: [...] (array direto)
        unidadesData = response;
      } else {
        // Formato de resposta não reconhecido
      }
      
      setUnidades(unidadesData);

      const schedulesMap: Record<string, UnitSchedule[]> = {};
      for (const unidade of unidadesData) {
        schedulesMap[unidade.id.toString()] = unidade.horarios_funcionamento || [];
      }
      setUnitSchedules(schedulesMap);
      
    } catch (err) {
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  const fetchDashboardKpis = useCallback(async (filters: DashboardFilters, signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      params.append('data_inicio', filters.data_inicio);
      params.append('data_fim', filters.data_fim);

      if (!filters.unidade_id) {
        throw new Error('Informe a Unidade.');
      }

      params.append('unidade_id', filters.unidade_id.toString());

      if (filters.agente_id) {
        params.append('agente_id', filters.agente_id.toString());
      }

      if (filters.servico_id) {
        params.append('servico_id', filters.servico_id.toString());
      }

      const url = `${API_BASE_URL}/dashboard/kpis?${params.toString()}`;
      const response = await makeAuthenticatedRequest(url, { signal });
      const payload = response && response.success && response.data ? response.data : (response?.data || response);

      if (!payload) {
        setKpis(null);
        return;
      }

      setKpis({
        reservas_totais: Number(payload.reservas_totais) || 0,
        receita_bruta: Number(payload.receita_bruta) || 0,
        receita_servicos: Number(payload.receita_servicos) || 0,
        receita_balcao: Number(payload.receita_balcao) || 0,
        receita_proprietario: Number(payload.receita_proprietario) || 0,
        comissoes_agentes: Number(payload.comissoes_agentes) || 0,
        despesas_pagas_totais: Number(payload.despesas_pagas_totais) || 0,
        lucro_liquido: Number(payload.lucro_liquido) || 0,
        ticket_medio: Number(payload.ticket_medio) || 0,
        clientes_unicos: Number(payload.clientes_unicos) || 0,
        taxa_cancelamento_pct: Number(payload.taxa_cancelamento_pct) || 0,
        agendamentos_pendentes: Number(payload.agendamentos_pendentes) || 0,
        alerta_estoque: Number(payload.alerta_estoque) || 0
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  const fetchClubIntelligence = useCallback(async (filters: DashboardFilters, signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      params.append('data_inicio', filters.data_inicio);
      params.append('data_fim', filters.data_fim);
      if (filters.unidade_id) {
        params.append('unidade_id', filters.unidade_id.toString());
      }

      const url = `${API_BASE_URL}/dashboard/club-intelligence?${params.toString()}`;
      const response = await makeAuthenticatedRequest(url, { signal });

      const payload = response && response.success && response.data ? response.data : (response?.data || response);

      if (payload) {
        setClubIntelligence({
          mrr: Number(payload.mrr) || 0,
          receita_avulsa: Number(payload.receita_avulsa) || 0,
          receita_total: Number(payload.receita_total) || 0,
          percentual_clube: Number(payload.percentual_clube) || 0,
          ticket_medio_assinante: Number(payload.ticket_medio_assinante) || 0,
          ticket_medio_comum: Number(payload.ticket_medio_comum) || 0,
          churn_pct: Number(payload.churn_pct) || 0,
          canceladas_periodo: Number(payload.canceladas_periodo) || 0,
          ativas_atuais: Number(payload.ativas_atuais) || 0
        });
      } else {
        setClubIntelligence({
          mrr: 0,
          receita_avulsa: 0,
          receita_total: 0,
          percentual_clube: 0,
          ticket_medio_assinante: 0,
          ticket_medio_comum: 0,
          churn_pct: 0,
          canceladas_periodo: 0,
          ativas_atuais: 0
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      setClubIntelligence({
        mrr: 0,
        receita_avulsa: 0,
        receita_total: 0,
        percentual_clube: 0,
        ticket_medio_assinante: 0,
        ticket_medio_comum: 0,
        churn_pct: 0,
        canceladas_periodo: 0,
        ativas_atuais: 0
      });
    }
  }, [makeAuthenticatedRequest]);

  const fetchClubStats = useCallback(async (filters: DashboardFilters, signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      params.append('data_inicio', filters.data_inicio);
      params.append('data_fim', filters.data_fim);

      const url = `${API_BASE_URL}/dashboard/stats?${params.toString()}`;
      const response = await makeAuthenticatedRequest(url, { signal });

      if (response && response.success && response.data) {
        setClubStats({
          assinaturas_ativas: Number(response.data.assinaturas_ativas) || 0,
          assinaturas_pendentes: Number(response.data.assinaturas_pendentes) || 0,
          cotas_consumidas: Number(response.data.cotas_consumidas) || 0
        });
      } else if (response && response.data) {
        setClubStats({
          assinaturas_ativas: Number(response.data.assinaturas_ativas) || 0,
          assinaturas_pendentes: Number(response.data.assinaturas_pendentes) || 0,
          cotas_consumidas: Number(response.data.cotas_consumidas) || 0
        });
      } else {
        setClubStats({
          assinaturas_ativas: 0,
          assinaturas_pendentes: 0,
          cotas_consumidas: 0
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  // Buscar agentes
  const fetchAgentes = useCallback(async () => {
    try {
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agentes`);

      if (response.success && response.data) {
        setAgentes(response.data);
      } else if (Array.isArray(response)) {
        // ✅ CORREÇÃO: API pode retornar array direto
        setAgentes(response);
      }
    } catch (err) {
      // Erro ao buscar agentes
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  // Buscar serviços
  const fetchServicos = useCallback(async () => {
    try {
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/servicos`);

      if (response.success && response.data) {
        setServicos(response.data);
      } else if (Array.isArray(response)) {
        // ✅ CORREÇÃO: API pode retornar array direto
        setServicos(response);
      }
    } catch (err) {
      // Erro ao buscar serviços
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  // Buscar agendamentos com filtros (RETORNA os dados ao invés de salvar no estado)
  const fetchAgendamentosRaw = useCallback(async (filters: DashboardFilters, signal?: AbortSignal): Promise<BackendAgendamento[]> => {
    try {
      const params = new URLSearchParams();
      params.append('data_inicio', filters.data_inicio);
      params.append('data_fim', filters.data_fim);

      if (filters.unidade_id) {
        params.append('unidade_id', filters.unidade_id.toString());
      }

      if (filters.agente_id) {
        params.append('agente_id', filters.agente_id.toString());
      }

      if (filters.servico_id) {
        params.append('servico_id', filters.servico_id.toString());
      }

      const url = `${API_BASE_URL}/agendamentos?${params.toString()}`;
      const response = await makeAuthenticatedRequest(url, { signal });
      
      // ✅ CORREÇÃO CRÍTICA: Suportar múltiplos formatos de resposta
      if (response.success && response.data) {
        // Formato 1: { success: true, data: [...] }
        return response.data;
      } else if (response.data && Array.isArray(response.data)) {
        // Formato 2: { data: [...], limitInfo: {...} } ← FORMATO REAL DO BACKEND!
        return response.data;
      } else if (Array.isArray(response)) {
        // Formato 3: [...] (array direto)
        return response;
      } else {
        return [];
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return [];
      }
      // Erro ao buscar agendamentos
      throw err;
    }
  }, [makeAuthenticatedRequest]);
  
  // Buscar agendamentos e salvar no estado (wrapper para compatibilidade)
  const fetchAgendamentos = useCallback(async (filters: DashboardFilters, signal?: AbortSignal) => {
    try {
      const data = await fetchAgendamentosRaw(filters, signal);
      setAgendamentos(data);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      setAgendamentos([]);
      throw err;
    }
  }, [fetchAgendamentosRaw]);

  // ✅ CORREÇÃO: Loading state usando initialLoadComplete para evitar flash
  const loadInitialData = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      setInitialLoadComplete(true);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await Promise.all([
        fetchUnidades(),
        fetchAgentes(),
        fetchServicos()
      ]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setInitialLoadComplete(true); // ✅ NOVO: Marcar carregamento inicial como completo
    }
  }, [isAuthenticated, fetchUnidades, fetchAgentes, fetchServicos]);

  // Carregar dados iniciais ao montar
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return {
    // Dados
    agendamentos,
    agentes,
    servicos,
    unidades,
    unitSchedules, // Horários de funcionamento por unidade
    clubStats,
    clubIntelligence,
    kpis,

    // Estado
    isLoading,
    initialLoadComplete, // ✅ NOVO: Flag para controle de carregamento inicial
    error,

    // Funções
    fetchAgendamentos,
    fetchAgendamentosRaw, // Função que retorna dados sem salvar no estado
    fetchClubStats,
    fetchClubIntelligence,
    fetchDashboardKpis,
    loadInitialData
  };
};

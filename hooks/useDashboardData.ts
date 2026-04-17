import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';
import type { PerformanceMetric } from '../types';

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

// Função utilitária para formatar valores monetários no padrão brasileiro
const formatCurrency = (value: number): string => {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

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

  const fetchClubIntelligence = useCallback(async (filters: DashboardFilters) => {
    try {
      const params = new URLSearchParams();
      params.append('data_inicio', filters.data_inicio);
      params.append('data_fim', filters.data_fim);
      if (filters.unidade_id) {
        params.append('unidade_id', filters.unidade_id.toString());
      }

      const url = `${API_BASE_URL}/dashboard/club-intelligence?${params.toString()}`;
      const response = await makeAuthenticatedRequest(url);

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
    } catch (_) {
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

  const fetchClubStats = useCallback(async (filters: DashboardFilters) => {
    const params = new URLSearchParams();
    params.append('data_inicio', filters.data_inicio);
    params.append('data_fim', filters.data_fim);

    const url = `${API_BASE_URL}/dashboard/stats?${params.toString()}`;
    const response = await makeAuthenticatedRequest(url);

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
  const fetchAgendamentosRaw = useCallback(async (filters: DashboardFilters): Promise<BackendAgendamento[]> => {
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
      const response = await makeAuthenticatedRequest(url);
      
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
    } catch (err) {
      // Erro ao buscar agendamentos
      throw err;
    }
  }, [makeAuthenticatedRequest]);
  
  // Buscar agendamentos e salvar no estado (wrapper para compatibilidade)
  const fetchAgendamentos = useCallback(async (filters: DashboardFilters) => {
    try {
      const data = await fetchAgendamentosRaw(filters);
      setAgendamentos(data);
    } catch (err) {
      setAgendamentos([]);
      throw err;
    }
  }, [fetchAgendamentosRaw]);

  // Calcular métricas de desempenho
  const calculateMetrics = useCallback((
    agendamentos: BackendAgendamento[],
    previousPeriodAgendamentos?: BackendAgendamento[]
  ): PerformanceMetric[] => {

    // Filtrar por status (BACKEND RETORNA EM PORTUGUÊS COM PRIMEIRA LETRA MAIÚSCULA)
    const validAppointments = agendamentos.filter(a => a.status !== 'Cancelado');
    const completedAppointments = agendamentos.filter(a => a.status === 'Concluído');
    const confirmedAppointments = agendamentos.filter(a => a.status === 'Aprovado');
    // ✅ CORREÇÃO: "Pendentes" são agendamentos APROVADOS que ainda não foram finalizados
    const pendingAppointments = agendamentos.filter(a => a.status === 'Aprovado');
    const canceledAppointments = agendamentos.filter(a => a.status === 'Cancelado');



    // 1. RESERVAS TOTAIS
    const totalReservas = validAppointments.length;
    const breakdown = `Confirmadas: ${confirmedAppointments.length} | Concluídas: ${completedAppointments.length}`;

    // 2. RECEITA LÍQUIDA E COMISSÕES
    let receitaBruta = 0;
    let comissoesTotal = 0;

    completedAppointments.forEach((agendamento, index) => {
      const valorTotal = Number(agendamento.valor_total) || 0;
      receitaBruta += valorTotal;

      if (agendamento.servicos && agendamento.servicos.length > 0) {
        agendamento.servicos.forEach((servico, sIndex) => {
          const precoServico = parseFloat(servico.preco) || 0;

          // ✅ CORREÇÃO CRÍTICA: Converter string para número corretamente
          let comissaoPercentual = 0;
          if (servico.comissao_percentual !== null && servico.comissao_percentual !== undefined) {
            // Se for string, converter para número
            if (typeof servico.comissao_percentual === 'string') {
              comissaoPercentual = parseFloat(servico.comissao_percentual) || 0;
            } else {
              comissaoPercentual = Number(servico.comissao_percentual) || 0;
            }
          }

          const comissaoCalculada = precoServico * (comissaoPercentual / 100);



          comissoesTotal += comissaoCalculada;
        });
      } else {
        const comissaoFallback = valorTotal * 0.5;
        comissoesTotal += comissaoFallback;
      }
    });



    // ✅ CORREÇÃO CRÍTICA: Receita Líquida = o que sobra para o proprietário após pagar comissões
    const receitaLiquida = Number.isFinite(receitaBruta) && Number.isFinite(comissoesTotal)
      ? receitaBruta - comissoesTotal
      : 0;

    // Validação: Comissão nunca pode ser maior que receita bruta
    if (comissoesTotal > receitaBruta && receitaBruta > 0) {
      // Erro crítico detectado
    }



    // 3. TAXA DE OCUPAÇÃO
    const diasUnicos = new Set(validAppointments.map(a => a.data_agendamento)).size;
    const agentesUnicos = new Set(validAppointments.map(a => a.agente_id)).size;
    const slotsDisponiveis = diasUnicos * agentesUnicos * 12;
    const slotsOcupados = validAppointments.length;
    const taxaOcupacao = slotsDisponiveis > 0 ? (slotsOcupados / slotsDisponiveis) * 100 : 0;

    // 4. TICKET MÉDIO
    const ticketMedio = completedAppointments.length > 0 
      ? receitaBruta / completedAppointments.length 
      : 0;

    // 5. TAXA DE CONCLUSÃO
    const taxaConclusao = validAppointments.length > 0
      ? (completedAppointments.length / validAppointments.length) * 100
      : 0;

    // 6. CLIENTES ÚNICOS (não "novos" - seria necessário histórico para isso)
    const clientesUnicos = new Set(validAppointments.map(a => a.cliente_id));
    const totalClientesUnicos = clientesUnicos.size;



    // 7. RECEITA DO PROPRIETÁRIO (substituindo Média Diária)
    // Receita do Proprietário = Receita Bruta - Comissões dos Agentes
    const receitaDoProprietario = Number.isFinite(receitaBruta) && Number.isFinite(comissoesTotal)
      ? receitaBruta - comissoesTotal
      : 0;



    // 8. TAXA DE CANCELAMENTO
    const totalGeral = agendamentos.length;
    const taxaCancelamento = totalGeral > 0 ? (canceledAppointments.length / totalGeral) * 100 : 0;
    

    
    // 9. AGENDAMENTOS PENDENTES (Aprovados aguardando finalização)
    const now = new Date();
    const totalPendentes = pendingAppointments.filter(a => {
      const dateStr = String(a.data_agendamento || '').split('T')[0];
      if (!dateStr || !a.hora_fim) return false;
      const endTs = new Date(`${dateStr}T${a.hora_fim}-03:00`);
      if (Number.isNaN(endTs.getTime())) return false;
      return endTs < now;
    }).length;
    


    // Calcular variações
    let variacaoReservas = '+0%';
    let variacaoReceita = '+0%';
    let variacaoComissoes = '+0%';
    let variacaoTicket = '+0%';
    let variacaoNovosClientes = '+0%';
    let variacaoReceitaProprietario = '+0%';
    let variacaoCancelamento = '+0%';
    let variacaoPendentes = '+0%';

    if (previousPeriodAgendamentos && previousPeriodAgendamentos.length > 0) {
      const prevValid = previousPeriodAgendamentos.filter(a => a.status !== 'Cancelado');
      const prevCompleted = previousPeriodAgendamentos.filter(a => a.status === 'Concluído');

      const prevReservas = prevValid.length;
      const prevReceitaBruta = prevCompleted.reduce((sum, a) => sum + (a.valor_total || 0), 0);
      const prevTicket = prevCompleted.length > 0 ? prevReceitaBruta / prevCompleted.length : 0;
      const prevConclusao = prevValid.length > 0 ? (prevCompleted.length / prevValid.length) * 100 : 0;

      // ✅ CLIENTES ÚNICOS do período anterior
      const prevClientesUnicos = new Set(prevValid.map(a => a.cliente_id));
      const prevClientesUnicosCount = prevClientesUnicos.size;

      // ✅ RECEITA DO PROPRIETÁRIO do período anterior
      // Calcular comissões do período anterior (assumindo mesma lógica atual)
      let prevComissoesTotal = 0;
      // Para simplificar, usar a mesma proporção atual: comissões/receita
      if (receitaBruta > 0 && comissoesTotal > 0) {
        const proporcaoComissao = comissoesTotal / receitaBruta;
        prevComissoesTotal = prevReceitaBruta * proporcaoComissao;
      }
      const prevReceitaDoProprietario = prevReceitaBruta - prevComissoesTotal;
      
      if (prevReservas > 0) {
        const diff = ((totalReservas - prevReservas) / prevReservas) * 100;
        variacaoReservas = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }
      
      // ✅ CORREÇÃO CRÍTICA: Comparar receita BRUTA com receita BRUTA (não líquida)
      if (prevReceitaBruta > 0) {
        const diff = ((receitaBruta - prevReceitaBruta) / prevReceitaBruta) * 100;
        variacaoReceita = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      // ✅ COMISSÕES: Calcular variação
      if (prevComissoesTotal > 0) {
        const diff = ((comissoesTotal - prevComissoesTotal) / prevComissoesTotal) * 100;
        variacaoComissoes = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      if (prevTicket > 0) {
        const diff = ((ticketMedio - prevTicket) / prevTicket) * 100;
        variacaoTicket = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      // ✅ CLIENTES ÚNICOS: Calcular variação
      if (prevClientesUnicosCount > 0) {
        const diff = ((totalClientesUnicos - prevClientesUnicosCount) / prevClientesUnicosCount) * 100;
        variacaoNovosClientes = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      // ✅ RECEITA DO PROPRIETÁRIO: Calcular variação
      if (prevReceitaDoProprietario > 0) {
        const diff = ((receitaDoProprietario - prevReceitaDoProprietario) / prevReceitaDoProprietario) * 100;
        variacaoReceitaProprietario = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }
      
      // ✅ TAXA DE CANCELAMENTO: Calcular variação
      const prevCanceled = previousPeriodAgendamentos.filter(a => a.status === 'Cancelado');
      const prevTotalGeral = previousPeriodAgendamentos.length;
      const prevTaxaCancelamento = prevTotalGeral > 0 ? (prevCanceled.length / prevTotalGeral) * 100 : 0;
      
      if (prevTaxaCancelamento > 0) {
        const diff = ((taxaCancelamento - prevTaxaCancelamento) / prevTaxaCancelamento) * 100;
        variacaoCancelamento = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }
      
      // ✅ AGENDAMENTOS PENDENTES: Calcular variação
      // ✅ CORREÇÃO: Filtrar por 'Aprovado' (não 'Pendente')
      const prevPending = previousPeriodAgendamentos.filter(a => a.status === 'Aprovado');
      const prevTotalPendentes = prevPending.length;
      
      if (prevTotalPendentes > 0) {
        const diff = ((totalPendentes - prevTotalPendentes) / prevTotalPendentes) * 100;
        variacaoPendentes = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }
    }



    return [
      {
        title: 'Reservas Totais',
        value: totalReservas.toString(),
        isPositive: true,
        change: '', // ✅ Removido: Variação não é relevante para este card
        subtitle: breakdown
      },
      {
        title: 'Receita Bruta',
        value: `R$ ${formatCurrency(Number.isFinite(receitaBruta) ? receitaBruta : 0)}`,
        isPositive: receitaBruta >= 0,
        change: variacaoReceita,
        subtitle: `Total faturado (serviços concluídos)`
      },
      {
        title: 'Receita do Proprietário',
        value: `R$ ${formatCurrency(Number.isFinite(receitaDoProprietario) ? receitaDoProprietario : 0)}`,
        isPositive: true,
        change: variacaoReceitaProprietario,
        subtitle: `Após pagar comissões dos agentes`,
        adminOnly: true // ✅ Flag para indicar que apenas ADMIN pode ver
      },
      {
        title: 'Comissões de Agentes',
        value: `R$ ${formatCurrency(Number.isFinite(comissoesTotal) ? comissoesTotal : 0)}`,
        isPositive: false,
        change: variacaoComissoes,
        subtitle: `${completedAppointments.length} agendamentos concluídos`
      },
      {
        title: 'Ticket Médio',
        value: `R$ ${formatCurrency(ticketMedio)}`,
        isPositive: true,
        change: '', // ✅ Removido: Variação não é relevante para este card
        subtitle: `Por agendamento concluído`
      },
      {
        title: 'Clientes Únicos',
        value: totalClientesUnicos.toString(),
        isPositive: true,
        change: '', // ✅ Removido: Variação pode confundir ("Perdi clientes?")
        subtitle: `Clientes diferentes no período`
      },
      {
        title: 'Taxa de Cancelamento',
        value: `${taxaCancelamento.toFixed(1)}%`,
        isPositive: taxaCancelamento < 10, // Verde se < 10%, vermelho se >= 10%
        change: variacaoCancelamento,
        subtitle: `${canceledAppointments.length} de ${totalGeral} cancelados`
      },
      {
        title: 'Agendamentos Pendentes',
        value: totalPendentes.toString(),
        isPositive: totalPendentes < 5, // Verde se < 5, amarelo/vermelho se >= 5
        change: '', // ✅ Removido: Variação não é relevante para este card
        subtitle: 'Aprovados com término já passado'
      }
    ];
  }, []);

  // Carregar dados iniciais
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

    // Estado
    isLoading,
    initialLoadComplete, // ✅ NOVO: Flag para controle de carregamento inicial
    error,

    // Funções
    fetchAgendamentos,
    fetchAgendamentosRaw, // Função que retorna dados sem salvar no estado
    fetchClubStats,
    fetchClubIntelligence,
    calculateMetrics,
    loadInitialData
  };
};

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';
import type { PerformanceMetric } from '../types';

// Interfaces para dados do backend
interface BackendAgendamento {
  id: number;
  agente_id: number;
  servico_id?: number;
  unidade_id: number;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  status: 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO' | 'CONCLUIDO';
  valor_total: number;
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
  sobrenome: string;
  comissao_percentual?: number;
  unidades?: number[];
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
}

interface DashboardFilters {
  unidade_id?: number;
  agente_id?: number;
  servico_id?: number;
  data_inicio: string;
  data_fim: string;
}

export const useDashboardData = () => {
  // ✅ CORREÇÃO CRÍTICA: Pegar token do contexto de autenticação (igual useCalendarData)
  const { token, isAuthenticated, user } = useAuth();
  const [agendamentos, setAgendamentos] = useState<BackendAgendamento[]>([]);
  const [agentes, setAgentes] = useState<BackendAgente[]>([]);
  const [servicos, setServicos] = useState<BackendServico[]>([]);
  const [unidades, setUnidades] = useState<BackendUnidade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
      console.log('🏢 [useDashboardData] Buscando unidades...');
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/unidades`);
      
      if (response.success && response.data) {
        setUnidades(response.data);
        console.log('✅ [useDashboardData] Unidades carregadas:', response.data.length);
      }
    } catch (err) {
      console.error('❌ [useDashboardData] Erro ao buscar unidades:', err);
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  // Buscar agentes
  const fetchAgentes = useCallback(async () => {
    try {
      console.log('👥 [useDashboardData] Buscando agentes...');
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/agentes`);
      
      if (response.success && response.data) {
        setAgentes(response.data);
        console.log('✅ [useDashboardData] Agentes carregados:', response.data.length);
      }
    } catch (err) {
      console.error('❌ [useDashboardData] Erro ao buscar agentes:', err);
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  // Buscar serviços
  const fetchServicos = useCallback(async () => {
    try {
      console.log('🛠️ [useDashboardData] Buscando serviços...');
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/servicos`);
      
      if (response.success && response.data) {
        setServicos(response.data);
        console.log('✅ [useDashboardData] Serviços carregados:', response.data.length);
      }
    } catch (err) {
      console.error('❌ [useDashboardData] Erro ao buscar serviços:', err);
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  // Buscar agendamentos com filtros
  const fetchAgendamentos = useCallback(async (filters: DashboardFilters) => {
    try {
      console.log('📅 [useDashboardData] Buscando agendamentos com filtros:', filters);
      
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

      const response = await makeAuthenticatedRequest(
        `${API_BASE_URL}/agendamentos?${params.toString()}`
      );
      
      if (response.success && response.data) {
        setAgendamentos(response.data);
        console.log('✅ [useDashboardData] Agendamentos carregados:', response.data.length);
      }
    } catch (err) {
      console.error('❌ [useDashboardData] Erro ao buscar agendamentos:', err);
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  // Calcular métricas de desempenho
  const calculateMetrics = useCallback((
    agendamentos: BackendAgendamento[],
    previousPeriodAgendamentos?: BackendAgendamento[]
  ): PerformanceMetric[] => {
    console.log('📊 [useDashboardData] Calculando métricas para', agendamentos.length, 'agendamentos');

    // Filtrar apenas agendamentos válidos (não cancelados)
    const validAppointments = agendamentos.filter(
      a => a.status !== 'CANCELADO'
    );

    // Filtrar apenas agendamentos concluídos para cálculos financeiros
    const completedAppointments = agendamentos.filter(
      a => a.status === 'CONCLUIDO'
    );

    // 1. RESERVAS TOTAIS (todos os status exceto CANCELADO)
    const totalReservas = validAppointments.length;

    // 2. RECEITA LÍQUIDA (apenas CONCLUIDO)
    let receitaBruta = 0;
    let comissoesTotal = 0;

    completedAppointments.forEach(agendamento => {
      const valorTotal = agendamento.valor_total || 0;
      receitaBruta += valorTotal;

      // Calcular comissão
      if (agendamento.servicos && agendamento.servicos.length > 0) {
        // Se tem serviços detalhados, usar comissão específica
        agendamento.servicos.forEach(servico => {
          const precoServico = parseFloat(servico.preco) || 0;
          const comissaoPercentual = servico.comissao_percentual || 0;
          comissoesTotal += precoServico * (comissaoPercentual / 100);
        });
      } else {
        // Fallback: usar comissão padrão de 50%
        comissoesTotal += valorTotal * 0.5;
      }
    });

    const receitaLiquida = receitaBruta - comissoesTotal;

    // 3. TAXA DE OCUPAÇÃO
    // Calcular slots totais disponíveis vs slots ocupados
    // Assumindo 12 horas de trabalho por dia (8h-20h) = 12 slots de 1h
    const diasUnicos = new Set(
      validAppointments.map(a => a.data_agendamento)
    ).size;
    
    const agentesUnicos = new Set(
      validAppointments.map(a => a.agente_id)
    ).size;

    const slotsDisponiveis = diasUnicos * agentesUnicos * 12; // 12 horas por dia
    const slotsOcupados = validAppointments.length;
    const taxaOcupacao = slotsDisponiveis > 0 
      ? (slotsOcupados / slotsDisponiveis) * 100 
      : 0;

    // Calcular variações (comparar com período anterior se fornecido)
    let variacaoReservas = '+0%';
    let variacaoReceita = '+0%';
    let variacaoComissoes = '+0%';
    let variacaoOcupacao = '+0%';

    if (previousPeriodAgendamentos && previousPeriodAgendamentos.length > 0) {
      const prevValid = previousPeriodAgendamentos.filter(a => a.status !== 'CANCELADO');
      const prevCompleted = previousPeriodAgendamentos.filter(a => a.status === 'CONCLUIDO');
      
      const prevReservas = prevValid.length;
      const prevReceitaBruta = prevCompleted.reduce((sum, a) => sum + (a.valor_total || 0), 0);
      
      // Calcular variações percentuais
      if (prevReservas > 0) {
        const diffReservas = ((totalReservas - prevReservas) / prevReservas) * 100;
        variacaoReservas = `${diffReservas >= 0 ? '+' : ''}${diffReservas.toFixed(1)}%`;
      }
      
      if (prevReceitaBruta > 0) {
        const diffReceita = ((receitaLiquida - prevReceitaBruta) / prevReceitaBruta) * 100;
        variacaoReceita = `${diffReceita >= 0 ? '+' : ''}${diffReceita.toFixed(1)}%`;
      }
    }

    console.log('📊 [useDashboardData] Métricas calculadas:', {
      totalReservas,
      receitaBruta: receitaBruta.toFixed(2),
      comissoesTotal: comissoesTotal.toFixed(2),
      receitaLiquida: receitaLiquida.toFixed(2),
      taxaOcupacao: taxaOcupacao.toFixed(1),
      slotsDisponiveis,
      slotsOcupados
    });

    return [
      {
        title: 'Reservas Totais',
        value: totalReservas.toString(),
        isPositive: true,
        change: variacaoReservas
      },
      {
        title: 'Receita Líquida',
        value: `R$${receitaLiquida.toFixed(2)}`,
        isPositive: receitaLiquida >= 0,
        change: variacaoReceita
      },
      {
        title: 'Comissões de Agentes',
        value: `R$${comissoesTotal.toFixed(2)}`,
        isPositive: false, // Comissões são custo
        change: variacaoComissoes
      },
      {
        title: 'Taxa de Ocupação',
        value: `${taxaOcupacao.toFixed(0)}%`,
        isPositive: true,
        change: variacaoOcupacao
      }
    ];
  }, []);

  // Carregar dados iniciais
  const loadInitialData = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setIsLoading(true);
      setError(null);

      console.log('🚀 [useDashboardData] Carregando dados iniciais...');
      
      await Promise.all([
        fetchUnidades(),
        fetchAgentes(),
        fetchServicos()
      ]);

      console.log('✅ [useDashboardData] Dados iniciais carregados com sucesso');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(errorMessage);
      console.error('❌ [useDashboardData] Erro ao carregar dados iniciais:', errorMessage);
    } finally {
      setIsLoading(false);
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
    
    // Estado
    isLoading,
    error,
    
    // Funções
    fetchAgendamentos,
    calculateMetrics,
    loadInitialData
  };
};

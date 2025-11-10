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
  status: 'Pendente' | 'Aprovado' | 'Cancelado' | 'Concluído' | 'Não Compareceu';
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
  sobrenome?: string;
  name?: string;              // ✅ CRÍTICO: Backend retorna 'name' já formatado (nome completo)
  email: string;
  telefone?: string;
  avatar_url?: string;
  status: string;
  unidade_id?: number;        // ✅ CRÍTICO: ID da unidade principal do agente
  unidades?: string[];        // ✅ CRÍTICO: Array de IDs das unidades onde o agente trabalha
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
      
      console.log('🏢 [useDashboardData] Resposta bruta do backend:', response);
      
      // ✅ CORREÇÃO CRÍTICA: Suportar múltiplos formatos de resposta
      if (response.success && response.data) {
        // Formato 1: { success: true, data: [...] }
        console.log('✅ [useDashboardData] Unidades carregadas (formato success/data):', response.data.length, response.data);
        setUnidades(response.data);
      } else if (response.data && Array.isArray(response.data)) {
        // Formato 2: { data: [...], limitInfo: {...} } ← ESTE É O FORMATO REAL!
        console.log('✅ [useDashboardData] Unidades carregadas (formato data/limitInfo):', response.data.length, response.data);
        setUnidades(response.data);
      } else if (Array.isArray(response)) {
        // Formato 3: [...] (array direto)
        console.log('✅ [useDashboardData] Unidades carregadas (array direto):', response.length, response);
        setUnidades(response);
      } else {
        console.error('❌ [useDashboardData] Formato de resposta não reconhecido:', response);
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
      
      console.log('👥 [useDashboardData] Resposta bruta do backend:', response);
      
      if (response.success && response.data) {
        console.log('✅ [useDashboardData] Agentes carregados:', response.data.length, response.data);
        setAgentes(response.data);
      } else if (Array.isArray(response)) {
        // ✅ CORREÇÃO: API pode retornar array direto
        console.log('✅ [useDashboardData] Agentes carregados (array direto):', response.length, response);
        setAgentes(response);
      } else {
        console.warn('⚠️ [useDashboardData] Resposta inesperada do backend:', response);
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
      
      console.log('🛠️ [useDashboardData] Resposta bruta do backend:', response);
      
      if (response.success && response.data) {
        console.log('✅ [useDashboardData] Serviços carregados:', response.data.length, response.data);
        setServicos(response.data);
      } else if (Array.isArray(response)) {
        // ✅ CORREÇÃO: API pode retornar array direto
        console.log('✅ [useDashboardData] Serviços carregados (array direto):', response.length, response);
        setServicos(response);
      } else {
        console.warn('⚠️ [useDashboardData] Resposta inesperada do backend:', response);
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

      const url = `${API_BASE_URL}/agendamentos?${params.toString()}`;
      console.log('🌐 [useDashboardData] URL da requisição:', url);

      const response = await makeAuthenticatedRequest(url);
      
      console.log('📦 [useDashboardData] Resposta do backend:', {
        success: response.success,
        dataLength: response.data?.length,
        hasData: !!response.data,
        isArray: Array.isArray(response.data),
        data: response.data
      });
      
      // ✅ CORREÇÃO CRÍTICA: Suportar múltiplos formatos de resposta
      if (response.success && response.data) {
        // Formato 1: { success: true, data: [...] }
        setAgendamentos(response.data);
        console.log('✅ [useDashboardData] Agendamentos carregados (formato success/data):', response.data.length);
      } else if (response.data && Array.isArray(response.data)) {
        // Formato 2: { data: [...], limitInfo: {...} } ← FORMATO REAL DO BACKEND!
        setAgendamentos(response.data);
        console.log('✅ [useDashboardData] Agendamentos carregados (formato data/limitInfo):', response.data.length);
      } else if (Array.isArray(response)) {
        // Formato 3: [...] (array direto)
        setAgendamentos(response);
        console.log('✅ [useDashboardData] Agendamentos carregados (array direto):', response.length);
      } else {
        console.warn('⚠️ [useDashboardData] Resposta sem dados válidos:', response);
        setAgendamentos([]);
      }
    } catch (err) {
      console.error('❌ [useDashboardData] Erro ao buscar agendamentos:', err);
      setAgendamentos([]);
      throw err;
    }
  }, [makeAuthenticatedRequest]);

  // Calcular métricas de desempenho
  const calculateMetrics = useCallback((
    agendamentos: BackendAgendamento[],
    previousPeriodAgendamentos?: BackendAgendamento[]
  ): PerformanceMetric[] => {
    console.log('📊 [useDashboardData] Calculando métricas para', agendamentos.length, 'agendamentos');

    // Filtrar por status (BACKEND RETORNA EM PORTUGUÊS COM PRIMEIRA LETRA MAIÚSCULA)
    const validAppointments = agendamentos.filter(a => a.status !== 'Cancelado');
    const completedAppointments = agendamentos.filter(a => a.status === 'Concluído');
    const confirmedAppointments = agendamentos.filter(a => a.status === 'Aprovado');
    const pendingAppointments = agendamentos.filter(a => a.status === 'Pendente');
    const canceledAppointments = agendamentos.filter(a => a.status === 'Cancelado');

    // ✅ LOG DETALHADO: Breakdown por status
    console.log('🔍 [CARD: Reservas Totais] Breakdown por status:', {
      total: agendamentos.length,
      cancelados: canceledAppointments.length,
      validos: validAppointments.length,
      confirmados: confirmedAppointments.length,
      concluidos: completedAppointments.length,
      pendentes: pendingAppointments.length,
      statusList: agendamentos.map(a => a.status)
    });

    // 1. RESERVAS TOTAIS
    const totalReservas = validAppointments.length;
    const breakdown = `Confirmadas: ${confirmedAppointments.length} | Concluídas: ${completedAppointments.length}`;
    
    console.log('✅ [CARD: Reservas Totais] Valor calculado:', {
      totalReservas,
      breakdown,
      formula: `${agendamentos.length} total - ${canceledAppointments.length} cancelados = ${totalReservas} válidos`
    });

    // 2. RECEITA LÍQUIDA E COMISSÕES
    let receitaBruta = 0;
    let comissoesTotal = 0;

    console.log('💰 [CARD: Comissões de Agentes] Iniciando cálculo de comissões...');
    console.log('💰 [CARD: Comissões de Agentes] Total de agendamentos concluídos:', completedAppointments.length);

    completedAppointments.forEach((agendamento, index) => {
      const valorTotal = Number(agendamento.valor_total) || 0;
      receitaBruta += valorTotal;

      console.log(`\n💰 [Agendamento ${index + 1}/${completedAppointments.length}] ID: ${agendamento.id}`, {
        valorTotal,
        temServicos: !!agendamento.servicos,
        qtdServicos: agendamento.servicos?.length || 0,
        servicos: agendamento.servicos
      });

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

          console.log(`  📋 [Serviço ${sIndex + 1}] ${servico.nome}:`, {
            preco: precoServico,
            comissaoPercentualRaw: servico.comissao_percentual,
            comissaoPercentualTipo: typeof servico.comissao_percentual,
            comissaoPercentualConvertido: comissaoPercentual,
            comissaoPercentual: `${comissaoPercentual}%`,
            temComissao: comissaoPercentual > 0,
            valorComissao: comissaoCalculada.toFixed(2)
          });

          comissoesTotal += comissaoCalculada;
        });
      } else {
        const comissaoFallback = valorTotal * 0.5;
        console.log(`  ⚠️ [SEM SERVIÇOS] Usando fallback 50%:`, {
          valorTotal,
          comissaoFallback: comissaoFallback.toFixed(2)
        });
        comissoesTotal += comissaoFallback;
      }
    });

    console.log('\n💰 [CARD: Comissões de Agentes] RESUMO FINAL:', {
      receitaBruta: receitaBruta.toFixed(2),
      comissoesTotal: comissoesTotal.toFixed(2),
      agendamentosConcluidos: completedAppointments.length
    });

    const receitaLiquida = Number.isFinite(receitaBruta) && Number.isFinite(comissoesTotal) 
      ? receitaBruta - comissoesTotal 
      : 0;

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

    // 6. AGENDAMENTOS PENDENTES
    const totalPendentes = pendingAppointments.length;

    // 7. MÉDIA DIÁRIA
    const mediaDiaria = diasUnicos > 0 ? validAppointments.length / diasUnicos : 0;

    // 8. TAXA DE CANCELAMENTO
    const totalGeral = agendamentos.length;
    const taxaCancelamento = totalGeral > 0 ? (canceledAppointments.length / totalGeral) * 100 : 0;

    // Calcular variações
    let variacaoReservas = '+0%';
    let variacaoReceita = '+0%';
    let variacaoComissoes = '+0%';
    let variacaoOcupacao = '+0%';
    let variacaoTicket = '+0%';
    let variacaoConclusao = '+0%';
    let variacaoPendentes = '+0%';
    let variacaoMedia = '+0%';

    if (previousPeriodAgendamentos && previousPeriodAgendamentos.length > 0) {
      const prevValid = previousPeriodAgendamentos.filter(a => a.status !== 'Cancelado');
      const prevCompleted = previousPeriodAgendamentos.filter(a => a.status === 'Concluído');
      const prevPending = previousPeriodAgendamentos.filter(a => a.status === 'Pendente');
      
      const prevReservas = prevValid.length;
      const prevReceitaBruta = prevCompleted.reduce((sum, a) => sum + (a.valor_total || 0), 0);
      const prevTicket = prevCompleted.length > 0 ? prevReceitaBruta / prevCompleted.length : 0;
      const prevConclusao = prevValid.length > 0 ? (prevCompleted.length / prevValid.length) * 100 : 0;
      const prevPendentes = prevPending.length;
      const prevDias = new Set(prevValid.map(a => a.data_agendamento)).size;
      const prevMedia = prevDias > 0 ? prevValid.length / prevDias : 0;
      
      if (prevReservas > 0) {
        const diff = ((totalReservas - prevReservas) / prevReservas) * 100;
        variacaoReservas = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }
      
      if (prevReceitaBruta > 0) {
        const diff = ((receitaLiquida - prevReceitaBruta) / prevReceitaBruta) * 100;
        variacaoReceita = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      if (prevTicket > 0) {
        const diff = ((ticketMedio - prevTicket) / prevTicket) * 100;
        variacaoTicket = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      if (prevConclusao > 0) {
        const diff = ((taxaConclusao - prevConclusao) / prevConclusao) * 100;
        variacaoConclusao = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      if (prevPendentes > 0) {
        const diff = ((totalPendentes - prevPendentes) / prevPendentes) * 100;
        variacaoPendentes = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      if (prevMedia > 0) {
        const diff = ((mediaDiaria - prevMedia) / prevMedia) * 100;
        variacaoMedia = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }
    }

    console.log('📊 [useDashboardData] Métricas calculadas:', {
      totalReservas,
      receitaLiquida: receitaLiquida.toFixed(2),
      comissoesTotal: comissoesTotal.toFixed(2),
      taxaOcupacao: taxaOcupacao.toFixed(1),
      ticketMedio: ticketMedio.toFixed(2),
      taxaConclusao: taxaConclusao.toFixed(1),
      totalPendentes,
      mediaDiaria: mediaDiaria.toFixed(1)
    });

    return [
      {
        title: 'Reservas Totais',
        value: totalReservas.toString(),
        isPositive: true,
        change: variacaoReservas,
        subtitle: breakdown
      },
      {
        title: 'Receita Líquida',
        value: `R$${(Number.isFinite(receitaLiquida) ? receitaLiquida : 0).toFixed(2)}`,
        isPositive: receitaLiquida >= 0,
        change: variacaoReceita,
        subtitle: `Receita Bruta: R$${(Number.isFinite(receitaBruta) ? receitaBruta : 0).toFixed(2)}`
      },
      {
        title: 'Comissões de Agentes',
        value: `R$${(Number.isFinite(comissoesTotal) ? comissoesTotal : 0).toFixed(2)}`,
        isPositive: false,
        change: variacaoComissoes,
        subtitle: `${completedAppointments.length} agendamentos concluídos`
      },
      {
        title: 'Taxa de Ocupação',
        value: `${taxaOcupacao.toFixed(0)}%`,
        isPositive: true,
        change: variacaoOcupacao,
        subtitle: `${slotsOcupados} de ${slotsDisponiveis} slots`
      },
      {
        title: 'Ticket Médio',
        value: `R$${ticketMedio.toFixed(2)}`,
        isPositive: true,
        change: variacaoTicket,
        subtitle: `Por agendamento concluído`
      },
      {
        title: 'Taxa de Conclusão',
        value: `${taxaConclusao.toFixed(0)}%`,
        isPositive: true,
        change: variacaoConclusao,
        subtitle: `${completedAppointments.length} de ${validAppointments.length} concluídos`
      },
      {
        title: 'Agendamentos Pendentes',
        value: totalPendentes.toString(),
        isPositive: false,
        change: variacaoPendentes,
        subtitle: 'Aguardando confirmação'
      },
      {
        title: 'Média Diária',
        value: mediaDiaria.toFixed(1),
        isPositive: true,
        change: variacaoMedia,
        subtitle: `Em ${diasUnicos} dias`
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

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

  // Buscar agendamentos com filtros (RETORNA os dados ao invés de salvar no estado)
  const fetchAgendamentosRaw = useCallback(async (filters: DashboardFilters): Promise<BackendAgendamento[]> => {
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
        console.log('✅ [useDashboardData] Agendamentos carregados (formato success/data):', response.data.length);
        return response.data;
      } else if (response.data && Array.isArray(response.data)) {
        // Formato 2: { data: [...], limitInfo: {...} } ← FORMATO REAL DO BACKEND!
        console.log('✅ [useDashboardData] Agendamentos carregados (formato data/limitInfo):', response.data.length);
        return response.data;
      } else if (Array.isArray(response)) {
        // Formato 3: [...] (array direto)
        console.log('✅ [useDashboardData] Agendamentos carregados (array direto):', response.length);
        return response;
      } else {
        console.warn('⚠️ [useDashboardData] Resposta sem dados válidos:', response);
        return [];
      }
    } catch (err) {
      console.error('❌ [useDashboardData] Erro ao buscar agendamentos:', err);
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

    // ✅ CORREÇÃO CRÍTICA: Receita Líquida = o que sobra para o proprietário após pagar comissões
    const receitaLiquida = Number.isFinite(receitaBruta) && Number.isFinite(comissoesTotal)
      ? receitaBruta - comissoesTotal
      : 0;

    // 🔍 VALIDAÇÃO CRÍTICA: Comissão nunca pode ser maior que receita bruta
    if (comissoesTotal > receitaBruta && receitaBruta > 0) {
      console.error('🚨 ERRO CRÍTICO: Comissão maior que receita bruta!', {
        receitaBruta: receitaBruta.toFixed(2),
        comissoesTotal: comissoesTotal.toFixed(2),
        diferenca: (comissoesTotal - receitaBruta).toFixed(2)
      });
    }

    console.log('💰 [VALIDAÇÃO] Cálculo financeiro:', {
      receitaBruta: `R$${receitaBruta.toFixed(2)}`,
      comissoesTotal: `R$${comissoesTotal.toFixed(2)}`,
      receitaLiquida: `R$${receitaLiquida.toFixed(2)}`,
      percentualComissao: receitaBruta > 0 ? `${((comissoesTotal / receitaBruta) * 100).toFixed(1)}%` : '0%',
      matematicaCorreta: comissoesTotal <= receitaBruta
    });

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

    // 6. NOVOS CLIENTES (substituindo Agendamentos Pendentes)
    const clientesUnicos = new Set(validAppointments.map(a => a.cliente_id));
    const totalNovosClientes = clientesUnicos.size;

    console.log('👥 [CARD: Novos Clientes] Calculando novos clientes únicos:', {
      agendamentosValidos: validAppointments.length,
      clientesUnicos: Array.from(clientesUnicos),
      totalNovosClientes
    });

    // 7. RECEITA DO PROPRIETÁRIO (substituindo Média Diária)
    // Receita do Proprietário = Receita Bruta - Comissões dos Agentes
    const receitaDoProprietario = Number.isFinite(receitaBruta) && Number.isFinite(comissoesTotal)
      ? receitaBruta - comissoesTotal
      : 0;

    console.log('🏢 [CARD: Receita do Proprietário] Calculando receita do proprietário:', {
      receitaBruta: receitaBruta.toFixed(2),
      comissoesTotal: comissoesTotal.toFixed(2),
      receitaDoProprietario: receitaDoProprietario.toFixed(2),
      percentualProprietario: receitaBruta > 0 ? `${((receitaDoProprietario / receitaBruta) * 100).toFixed(1)}%` : '0%'
    });

    // 8. TAXA DE CANCELAMENTO
    const totalGeral = agendamentos.length;
    const taxaCancelamento = totalGeral > 0 ? (canceledAppointments.length / totalGeral) * 100 : 0;
    
    console.log('❌ [CARD: Taxa de Cancelamento] Calculando taxa de cancelamento:', {
      totalGeral,
      cancelados: canceledAppointments.length,
      taxaCancelamento: taxaCancelamento.toFixed(1) + '%'
    });
    
    // 9. AGENDAMENTOS PENDENTES
    const totalPendentes = pendingAppointments.length;
    
    console.log('⏳ [CARD: Agendamentos Pendentes] Total de pendentes:', {
      totalPendentes,
      statusPendente: 'Pendente'
    });

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

      // ✅ NOVOS CLIENTES do período anterior
      const prevClientesUnicos = new Set(prevValid.map(a => a.cliente_id));
      const prevNovosClientes = prevClientesUnicos.size;

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
      
      if (prevReceitaBruta > 0) {
        const diff = ((receitaLiquida - prevReceitaBruta) / prevReceitaBruta) * 100;
        variacaoReceita = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      if (prevTicket > 0) {
        const diff = ((ticketMedio - prevTicket) / prevTicket) * 100;
        variacaoTicket = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      // ✅ NOVOS CLIENTES: Calcular variação
      if (prevNovosClientes > 0) {
        const diff = ((totalNovosClientes - prevNovosClientes) / prevNovosClientes) * 100;
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
      const prevPending = previousPeriodAgendamentos.filter(a => a.status === 'Pendente');
      const prevTotalPendentes = prevPending.length;
      
      if (prevTotalPendentes > 0) {
        const diff = ((totalPendentes - prevTotalPendentes) / prevTotalPendentes) * 100;
        variacaoPendentes = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }
    }

    console.log('📊 [useDashboardData] Métricas calculadas:', {
      totalReservas,
      receitaBruta: receitaBruta.toFixed(2),
      comissoesTotal: comissoesTotal.toFixed(2),
      receitaDoProprietario: receitaDoProprietario.toFixed(2),
      ticketMedio: ticketMedio.toFixed(2),
      totalNovosClientes,
      taxaCancelamento: taxaCancelamento.toFixed(1),
      totalPendentes
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
        change: variacaoTicket,
        subtitle: `Por agendamento concluído`
      },
      {
        title: 'Novos Clientes',
        value: totalNovosClientes.toString(),
        isPositive: true,
        change: variacaoNovosClientes,
        subtitle: `Clientes únicos no período`
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
        change: variacaoPendentes,
        subtitle: 'Aguardando confirmação'
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
    fetchAgendamentosRaw, // ✅ NOVO: Função que retorna dados sem salvar no estado
    calculateMetrics,
    loadInitialData
  };
};

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { getAssetUrl } from '../utils/api'; // ✅ NOVO: Importar função para URLs de assets
import PerformanceSection from './PerformanceSection';
import NewAppointmentModal from './NewAppointmentModal';
import PendingAppointmentsDrawer from './PendingAppointmentsDrawer';
import type { PerformanceMetric, Agent, Service, Location } from '../types';

interface DashboardPageProps {
  loggedInAgentId: string | null;
  userRole: 'ADMIN' | 'AGENTE';
}

const DashboardPage: React.FC<DashboardPageProps> = ({ loggedInAgentId, userRole }) => {
    // Hook de autenticação
    const { user, token, isAuthenticated } = useAuth();
    
    // Hook de dados do dashboard
    const {
        agendamentos,
        agentes: backendAgentes,
        servicos: backendServicos,
        unidades: backendUnidades,
        unitSchedules, // Horários de funcionamento por unidade
        clubStats,
        clubIntelligence,
        kpis,
        isLoading,
        initialLoadComplete, // ✅ NOVO: Flag para controle de carregamento inicial
        error,
        fetchAgendamentos,
        fetchAgendamentosRaw, // Função que retorna dados sem sobrescrever estado
        fetchClubStats,
        fetchClubIntelligence,
        fetchDashboardKpis
    } = useDashboardData();

    const isMultiPlan = useMemo(() => {
        return (backendUnidades || []).filter(unidade => unidade.status !== 'Excluido').length > 1;
    }, [backendUnidades]);

    // ✅ ESTADOS DE FILTRO DA SEÇÃO DESEMPENHO (Independentes)
    const [performanceLocation, setPerformanceLocation] = useState('all');
    const [performanceAgent, setPerformanceAgent] = useState('all');
    const [performanceService, setPerformanceService] = useState('all');
    const [dateRange, setDateRange] = useState<{ startDate: Date | null; endDate: Date | null }>({ 
        startDate: null, 
        endDate: null 
    });
    
    // ✅ NOVO: Estado para agendamentos do período anterior (para cálculo de variações)
    const [previousPeriodAgendamentos, setPreviousPeriodAgendamentos] = useState<any[]>([]);
    
    const [isPendingOpen, setIsPendingOpen] = useState(false);
    const [isAppointmentModalOpen, setAppointmentModalOpen] = useState(false);
    const [modalData, setModalData] = useState<{ appointmentId?: number } | null>(null);
    const [isPendingStackFlow, setIsPendingStackFlow] = useState(false);

    const pendentesAtrasados = useMemo(() => {
        const now = new Date();
        return (agendamentos || []).filter((a: any) => {
            if (a.status !== 'Aprovado') return false;
            const dateStr = String(a.data_agendamento || '').split('T')[0];
            if (!dateStr || !a.hora_fim) return false;
            const endTs = new Date(`${dateStr}T${a.hora_fim}-03:00`);
            if (Number.isNaN(endTs.getTime())) return false;
            return endTs < now;
        });
    }, [agendamentos]);

    const handleOpenPendente = (agendamentoId: number) => {
        setIsPendingOpen(false);
        setIsPendingStackFlow(true);
        setModalData({ appointmentId: agendamentoId });
        setAppointmentModalOpen(true);
    };

    const handleCloseModal = () => {
        setAppointmentModalOpen(false);
        setModalData(null);

        if (isPendingStackFlow) {
            setIsPendingOpen(true);
            setIsPendingStackFlow(false);
        }
    };

    // ✅ Callback para recarregar dados após criar/editar agendamento (modal vindo dos pendentes)
    const handleAppointmentSuccess = () => {
        refreshAgendamentosPeriodoAtual();
    };

    const formatDateInSaoPaulo = (date: Date) => {
        return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    };

    const refreshAgendamentosPeriodoAtual = async (signal?: AbortSignal) => {
        if (!dateRange.startDate || !dateRange.endDate) return;

        const dataInicio = formatDateInSaoPaulo(dateRange.startDate);
        const dataFim = formatDateInSaoPaulo(dateRange.endDate);

        const filters: any = {
            data_inicio: dataInicio,
            data_fim: dataFim
        };

        if (performanceLocation !== 'all') {
            filters.unidade_id = parseInt(performanceLocation);
        } else {
            return;
        }

        if (performanceAgent !== 'all') {
            filters.agente_id = parseInt(performanceAgent);
        }

        if (performanceService !== 'all') {
            filters.servico_id = parseInt(performanceService);
        }

        await fetchAgendamentos(filters, signal);
        await fetchDashboardKpis(filters, signal);
        await fetchClubStats({ data_inicio: dataInicio, data_fim: dataFim }, signal);
        await fetchClubIntelligence({ data_inicio: dataInicio, data_fim: dataFim, ...(filters.unidade_id ? { unidade_id: filters.unidade_id } : {}) }, signal);
        
        // ✅ NOVO: Buscar agendamentos do período anterior para cálculo de variações
        const diffDays = Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
        const prevEndDate = new Date(dateRange.startDate);
        prevEndDate.setDate(prevEndDate.getDate() - 1); // Dia anterior ao início
        const prevStartDate = new Date(prevEndDate);
        prevStartDate.setDate(prevStartDate.getDate() - diffDays + 1);
        
        const prevFilters = {
            ...filters,
            data_inicio: formatDateInSaoPaulo(prevStartDate),
            data_fim: formatDateInSaoPaulo(prevEndDate)
        };
        

        
        // ✅ CORREÇÃO CRÍTICA: Usar fetchAgendamentosRaw para não sobrescrever agendamentos do período atual
        fetchAgendamentosRaw(prevFilters, signal).then((prevData) => {
            setPreviousPeriodAgendamentos(prevData);
        }).catch(_ => {
            setPreviousPeriodAgendamentos([]);
        });
    };

    useEffect(() => {
        if (performanceLocation !== 'all') return;
        const firstActive = (backendUnidades || []).find((u) => u.status !== 'Excluido');
        if (firstActive?.id) {
            setPerformanceLocation(String(firstActive.id));
        }
    }, [backendUnidades, performanceLocation]);

    useEffect(() => {
        if (!dateRange.startDate || !dateRange.endDate) return;

        const controller = new AbortController();
        refreshAgendamentosPeriodoAtual(controller.signal);

        return () => {
            controller.abort();
        };
    }, [
        dateRange.startDate,
        dateRange.endDate,
        performanceLocation,
        performanceAgent,
        performanceService
    ]);

    const clubStatsMetrics = useMemo(() => {
        if (!clubStats) {
            return [];
        }

        return [
            {
                title: 'Assinaturas Ativas',
                value: String(clubStats.assinaturas_ativas ?? 0),
                isPositive: true,
                change: '',
                subtitle: 'Clientes com assinatura ativa'
            },
            {
                title: 'Assinaturas Pendentes',
                value: String(clubStats.assinaturas_pendentes ?? 0),
                isPositive: (Number(clubStats.assinaturas_pendentes) || 0) === 0,
                change: '',
                subtitle: 'Pagamento pendente'
            },
            {
                title: 'Cotas Consumidas',
                value: String(clubStats.cotas_consumidas ?? 0),
                isPositive: true,
                change: '',
                subtitle: 'Consumos no período'
            }
        ];
    }, [clubStats]);

    // ✅ KPIs financeiros: única fonte de verdade = backend (/api/dashboard/kpis)
    const metrics = useMemo(() => {
        const emptyMetrics = [
            { title: 'Reservas Totais', value: '0', isPositive: true, change: '', subtitle: '0 no período' },
            { title: 'Receita Bruta', value: 'R$ 0,00', isPositive: true, change: '', subtitle: 'Serviços + Produtos' },
            { title: 'Despesas Pagas', value: 'R$ 0,00', isPositive: true, change: '', subtitle: 'Saídas confirmadas no período' },
            { title: 'Comissões de Agentes', value: 'R$ 0,00', isPositive: false, change: '', subtitle: 'Somente serviços com regra explícita' },
            { title: 'Lucro Líquido', value: 'R$ 0,00', isPositive: true, change: '', subtitle: 'Receita bruta - comissões - despesas pagas' },
            { title: 'Ticket Médio', value: 'R$ 0,00', isPositive: true, change: '', subtitle: 'Por agendamento pago e concluído' },
            { title: 'Clientes Únicos', value: '0', isPositive: true, change: '', subtitle: 'Clientes diferentes no período' },
            { title: 'Taxa de Cancelamento', value: '0%', isPositive: true, change: '', subtitle: '0 de 0 cancelados' },
            { title: 'Agendamentos Pendentes', value: '0', isPositive: true, change: '', subtitle: 'Aprovados com término já passado' },
            { title: 'Alerta de Estoque', value: '0', isPositive: true, change: '', subtitle: 'Abaixo do mínimo' }
        ];

        if (!kpis) {
            return userRole === 'AGENTE'
                ? emptyMetrics.filter(metric => !(metric as any).adminOnly)
                : emptyMetrics;
        }

        const allMetrics: any[] = [
            {
                title: 'Reservas Totais',
                value: String(kpis.reservas_totais ?? 0),
                isPositive: true,
                change: '',
                subtitle: 'Não cancelados no período'
            },
            {
                title: 'Receita Bruta',
                value: `R$ ${(Number(kpis.receita_bruta) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                isPositive: true,
                change: '',
                subtitle: 'Serviços + Produtos',
                breakdown: [
                    {
                        label: 'Serviços',
                        value: `R$ ${(Number(kpis.receita_servicos) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        colorClassName: 'text-gray-700'
                    },
                    {
                        label: 'Balcão',
                        value: `R$ ${(Number(kpis.receita_balcao) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        colorClassName: 'text-gray-700'
                    }
                ]
            },
            {
                title: 'Despesas Pagas',
                value: `R$ ${(Number(kpis.despesas_pagas_totais) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                isPositive: (Number(kpis.despesas_pagas_totais) || 0) === 0,
                change: '',
                subtitle: 'Saídas confirmadas no período'
            },
            {
                title: 'Alerta de Estoque',
                value: String(kpis.alerta_estoque ?? 0),
                isPositive: (Number(kpis.alerta_estoque) || 0) === 0,
                change: '',
                subtitle: 'Abaixo do mínimo',
                icon: '⚠️'
            },
            {
                title: 'Comissões de Agentes',
                value: `R$ ${(Number(kpis.comissoes_agentes) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                isPositive: false,
                change: '',
                subtitle: 'Somente serviços com regra explícita'
            },
            {
                title: 'Lucro Líquido',
                value: `R$ ${(Number(kpis.lucro_liquido) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                isPositive: (Number(kpis.lucro_liquido) || 0) > 0,
                change: '',
                subtitle: 'Receita bruta - comissões - despesas pagas'
            },
            {
                title: 'Ticket Médio',
                value: `R$ ${(Number(kpis.ticket_medio) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                isPositive: true,
                change: '',
                subtitle: 'Por agendamento pago e concluído'
            },
            {
                title: 'Clientes Únicos',
                value: String(kpis.clientes_unicos ?? 0),
                isPositive: true,
                change: '',
                subtitle: 'Clientes diferentes no período'
            },
            {
                title: 'Taxa de Cancelamento',
                value: `${(Number(kpis.taxa_cancelamento_pct) || 0).toFixed(1)}%`,
                isPositive: (Number(kpis.taxa_cancelamento_pct) || 0) < 10,
                change: '',
                subtitle: 'Cancelados no período'
            },
            {
                title: 'Agendamentos Pendentes',
                value: String(kpis.agendamentos_pendentes ?? 0),
                isPositive: (Number(kpis.agendamentos_pendentes) || 0) < 5,
                change: '',
                subtitle: 'Aprovados com término já passado'
            }
        ];

        return userRole === 'AGENTE'
            ? allMetrics.filter(metric => !metric.adminOnly)
            : allMetrics;
    }, [kpis, userRole]);

    const clubMetrics = useMemo(() => {
        return [...clubStatsMetrics];
    }, [clubStatsMetrics]);

    // ✅ TRANSFORMAR DADOS DO BACKEND PARA FORMATO DO COMPONENTE
    const agents: Agent[] = useMemo(() => {
        return backendAgentes.map(agente => {
            // ✅ CORREÇÃO CRÍTICA: Backend pode retornar 'name' já formatado (igual CalendarPage)
            // Priorizar 'nome_exibicao', depois 'name', senão concatenar 'nome' + 'sobrenome'
            const displayName = agente.nome_exibicao || (agente as any).name || `${agente.nome} ${agente.sobrenome || ''}`.trim();

            // ✅ NOVO: Usar avatar real do backend com getAssetUrl (igual CalendarPage)
            const avatarUrl = agente.avatar
                ? getAssetUrl(agente.avatar)
                : `https://i.pravatar.cc/150?u=${agente.id}`;

            return {
                id: agente.id.toString(),
                name: displayName,
                avatar: avatarUrl, // ✅ NOVO: Avatar real do backend
                unidades: agente.unidades // ✅ CRÍTICO: Incluir array de unidades
            };
        });
    }, [backendAgentes]);

    const services: Service[] = useMemo(() => {
        return backendServicos.map(servico => ({
            id: servico.id.toString(),
            name: servico.nome,
            color: '#2663EB',
            textColor: '#FFFFFF'
        }));
    }, [backendServicos]);

    // ✅ CORREÇÃO CRÍTICA: Filtrar apenas unidades ATIVAS para exibição no dropdown
    const locations: Location[] = useMemo(() => {
        return backendUnidades
            .filter(unidade => unidade.status !== 'Excluido')
            .map(unidade => ({
                id: unidade.id.toString(),
                name: unidade.nome
            }));
    }, [backendUnidades]);

    // ✅ FILTRAR AGENTES BASEADO NO LOCAL SELECIONADO DA SEÇÃO DESEMPENHO
    const performanceFilteredAgents = useMemo(() => {
        if (performanceLocation === 'all') {
            return agents;
        }
        
        // Filtrar agentes que trabalham no local selecionado
        // ✅ CRÍTICO: Converter para string para comparação (igual CalendarPage)
        const locationIdStr = performanceLocation.toString();
        const filtered = agents.filter(agent => {
            const backendAgent = backendAgentes.find(a => a.id.toString() === agent.id);
            
            // Verificar se o agente tem o array 'unidades' e se inclui o local selecionado
            const hasLocation = Array.isArray(backendAgent?.unidades) && 
                               backendAgent.unidades.includes(locationIdStr);
            

            
            return hasLocation;
        });



        return filtered;
    }, [agents, backendAgentes, performanceLocation]);

    // ✅ FILTRAR SERVIÇOS BASEADO NO AGENTE SELECIONADO
    // TODO: Implementar quando backend fornecer relação agente-serviço
    const filteredServices = useMemo(() => {
        return services;
    }, [services]);
    
    // ✅ CORREÇÃO: Loading state usando initialLoadComplete para evitar flash
    if (!initialLoadComplete || (isLoading && backendUnidades.length === 0)) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Carregando dados do dashboard...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">❌ Erro ao carregar dados: {error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ✅ Seção Desempenho - Agora ocupa toda a largura */}
            <PerformanceSection 
                metrics={metrics}
                clubMetrics={clubMetrics}
                clubIntelligence={clubIntelligence || undefined}
                locations={locations}
                agents={performanceFilteredAgents}
                services={filteredServices}
                selectedLocation={performanceLocation}
                setSelectedLocation={setPerformanceLocation}
                selectedAgent={performanceAgent}
                setSelectedAgent={setPerformanceAgent}
                selectedService={performanceService}
                setSelectedService={setPerformanceService}
                loggedInAgentId={loggedInAgentId}
                userRole={userRole}
                isMultiPlan={isMultiPlan}
                onDateRangeChange={setDateRange}
                onMetricClick={(metric) => {
                    if (metric.title === 'Agendamentos Pendentes') {
                        setIsPendingOpen(true);
                    }
                }}
            />

            <PendingAppointmentsDrawer
                isOpen={isPendingOpen}
                onClose={() => setIsPendingOpen(false)}
                pendentesAtrasados={pendentesAtrasados}
                onOpenPendente={handleOpenPendente}
            />
            
            <NewAppointmentModal
                isOpen={isAppointmentModalOpen}
                onClose={handleCloseModal}
                appointmentId={modalData?.appointmentId}
                selectedLocationId={performanceLocation} // ✅ CRÍTICO: Passar local selecionado para filtrar agentes
                onSuccess={handleAppointmentSuccess} // ✅ NOVO: Callback para atualizar dados após sucesso
            />
        </div>
    );
};

export default DashboardPage;
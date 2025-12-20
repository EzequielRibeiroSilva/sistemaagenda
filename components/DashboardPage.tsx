import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { useCalendarData } from '../hooks/useCalendarData'; // ✅ NOVO: Importar hook para exceções de calendário
import { getAssetUrl } from '../utils/api'; // ✅ NOVO: Importar função para URLs de assets
import PerformanceSection from './PerformanceSection';
import PreviewSection from './PreviewSection';
import NewAppointmentModal from './NewAppointmentModal';
import type { PerformanceMetric, AgentSchedule, Agent, Service, Location, ScheduleSlot } from '../types';

// --- Mock Data (PreviewSection - será migrado posteriormente) ---
const agentSchedules: AgentSchedule[] = [];

interface DashboardPageProps {
  loggedInAgentId: string | null;
  userRole: 'ADMIN' | 'AGENTE';
}

const DashboardPage: React.FC<DashboardPageProps> = ({ loggedInAgentId, userRole }) => {
    // Hook de autenticação
    const { user } = useAuth();
    
    // Hook de dados do dashboard
    const {
        agendamentos,
        agentes: backendAgentes,
        servicos: backendServicos,
        unidades: backendUnidades,
        unitSchedules, // Horários de funcionamento por unidade
        isLoading,
        initialLoadComplete, // ✅ NOVO: Flag para controle de carregamento inicial
        error,
        fetchAgendamentos,
        fetchAgendamentosRaw, // Função que retorna dados sem sobrescrever estado
        calculateMetrics
    } = useDashboardData();

    // ✅ NOVO: Hook para exceções de calendário
    const {
        calendarExceptions,
        isDateBlockedByException
    } = useCalendarData();

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
    
    // ✅ ESTADOS DE FILTRO DA SEÇÃO PRÉ-VISUALIZAÇÃO (Independentes)
    const [previewLocation, setPreviewLocation] = useState('all');
    const [previewService, setPreviewService] = useState('all');
    // ✅ CORREÇÃO CRÍTICA: Inicializar com data local (hoje) sem problemas de fuso horário
    // Usar setHours(0,0,0,0) garante que ao converter para ISO, sempre pegue o dia correto
    const [previewDate, setPreviewDate] = useState(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Zerar horário para evitar problemas de fuso
        return today;
    });
    const [previewAppointments, setPreviewAppointments] = useState<any[]>([]); // ✅ NOVO: Agendamentos do dia selecionado
    
    const [viewMode, setViewMode] = useState<'compromissos' | 'disponibilidade'>('compromissos');
    const [isAppointmentModalOpen, setAppointmentModalOpen] = useState(false);
    const [modalData, setModalData] = useState<{
        appointment?: ScheduleSlot['details'];
        newSlot?: { agent: Agent, start: number, date: Date };
    } | null>(null);

    // Determinar tipo de plano
    const isMultiPlan = user?.plano === 'Multi';
    const isSinglePlan = user?.plano === 'Single';



    // ✅ AUTO-SELEÇÃO DE LOCAL (Idêntico ao CalendarPage)
    useEffect(() => {
        // 1. Garante que temos dados básicos para filtrar
        if (backendUnidades.length === 0 || backendAgentes.length === 0) {
            return;
        }

        // ✅ CORREÇÃO CRÍTICA: Filtrar apenas unidades ATIVAS para auto-seleção
        const unidadesAtivas = backendUnidades.filter(u => u.status !== 'Excluido');
        console.log('[DashboardPage] Auto-seleção - unidadesAtivas:', unidadesAtivas.map(u => ({id: u.id, nome: u.nome, status: u.status})));

        let newLocationId: string | null = null;

        // 2. ✅ PRIORIDADE 1: Usuário AGENTE (CRÍTICO)
        if (userRole === 'AGENTE' && loggedInAgentId) {
            const agentData = backendAgentes.find(a => a.id.toString() === loggedInAgentId);

            // ✅ CORREÇÃO CRÍTICA: Priorizar unidade principal do agente (SE ATIVA)
            if (agentData && agentData.unidade_id !== undefined && agentData.unidade_id !== null) {
                const unidadePrincipal = unidadesAtivas.find(u => u.id.toString() === agentData.unidade_id.toString());
                if (unidadePrincipal) {
                    newLocationId = agentData.unidade_id.toString();
                }
            }
            // Se for AGENTE Multi-Local (que não tem unidade_id no agente, mas tem unidades no array 'unidades'):
            if (!newLocationId && agentData && Array.isArray(agentData.unidades) && agentData.unidades.length > 0) {
                // Caso 2: AGENTE sem unidade principal - usar primeira unidade ATIVA do array
                const primeiraUnidadeAtiva = agentData.unidades.find(uid =>
                    unidadesAtivas.some(u => u.id.toString() === uid)
                );
                if (primeiraUnidadeAtiva) {
                    newLocationId = primeiraUnidadeAtiva;
                }
            }
        }
        // 3. ✅ PRIORIDADE 2: Plano Single - usar primeira unidade ATIVA
        else if (isSinglePlan && unidadesAtivas.length > 0) {
            newLocationId = unidadesAtivas[0].id.toString();
        }
        // 4. ✅ PRIORIDADE 3: ADMIN com unidade padrão (SE ATIVA)
        else if (user?.unidade_id) {
            const unidadePadrao = unidadesAtivas.find(u => u.id.toString() === user.unidade_id.toString());
            if (unidadePadrao) {
                newLocationId = user.unidade_id.toString();
            }
        }
        // 5. ✅ PRIORIDADE 4: ADMIN Multi-Local sem padrão - usar primeira unidade ATIVA
        if (!newLocationId && userRole === 'ADMIN' && isMultiPlan && unidadesAtivas.length > 0) {
            newLocationId = unidadesAtivas[0].id.toString();
        }
        // 6. ✅ FALLBACK: Se nenhuma condição anterior foi atendida, usar primeira unidade ATIVA
        if (!newLocationId && unidadesAtivas.length > 0) {
            newLocationId = unidadesAtivas[0].id.toString();
            console.log('[DashboardPage] Auto-seleção FALLBACK (plano indefinido):', newLocationId);
        }

        // 7. Aplica a nova seleção se for diferente da atual E se for uma seleção válida
        // ✅ CORREÇÃO: Aplicar para AMBAS as seções (Desempenho e Pré-Visualização)
        if (newLocationId && newLocationId !== performanceLocation) {
            console.log('[DashboardPage] Aplicando auto-seleção:', { newLocationId, performanceLocation, previewLocation });
            setPerformanceLocation(newLocationId);
            setPreviewLocation(newLocationId);
        }

    }, [backendUnidades.length, backendAgentes.length, isSinglePlan, isMultiPlan, user?.unidade_id, userRole, loggedInAgentId]);
    // ✅ CORREÇÃO CRÍTICA: Remover selectedLocation das dependências para permitir mudança manual



    // ✅ AUTO-SELEÇÃO DE AGENTE (para usuário AGENTE) - Apenas na seção Desempenho
    useEffect(() => {
        if (loggedInAgentId) {
            setPerformanceAgent(loggedInAgentId);
        } else {
            setPerformanceAgent('all');
        }
    }, [loggedInAgentId]);

    // ✅ BUSCAR AGENDAMENTOS quando filtros ou período mudarem
    useEffect(() => {
        // Validar que temos período válido
        if (!dateRange.startDate || !dateRange.endDate) {
            return;
        }

        // Para Multi-Plan, exigir seleção de local na seção Desempenho
        if (isMultiPlan && performanceLocation === 'all') {
            return;
        }

        // Formatar datas para ISO
        const dataInicio = dateRange.startDate.toISOString().split('T')[0];
        const dataFim = dateRange.endDate.toISOString().split('T')[0];

        // Montar filtros
        const filters: any = {
            data_inicio: dataInicio,
            data_fim: dataFim
        };

        // Adicionar filtro de unidade se não for 'all'
        if (performanceLocation !== 'all') {
            filters.unidade_id = parseInt(performanceLocation);
        }

        // Adicionar filtro de agente se não for 'all'
        if (performanceAgent !== 'all') {
            filters.agente_id = parseInt(performanceAgent);
        }

        // Adicionar filtro de serviço se não for 'all'
        if (performanceService !== 'all') {
            filters.servico_id = parseInt(performanceService);
        }


        fetchAgendamentos(filters);
        
        // ✅ NOVO: Buscar agendamentos do período anterior para cálculo de variações
        const diffDays = Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
        const prevEndDate = new Date(dateRange.startDate);
        prevEndDate.setDate(prevEndDate.getDate() - 1); // Dia anterior ao início
        const prevStartDate = new Date(prevEndDate);
        prevStartDate.setDate(prevStartDate.getDate() - diffDays + 1);
        
        const prevFilters = {
            ...filters,
            data_inicio: prevStartDate.toISOString().split('T')[0],
            data_fim: prevEndDate.toISOString().split('T')[0]
        };
        

        
        // ✅ CORREÇÃO CRÍTICA: Usar fetchAgendamentosRaw para não sobrescrever agendamentos do período atual
        fetchAgendamentosRaw(prevFilters).then((prevData) => {
            setPreviousPeriodAgendamentos(prevData);
        }).catch(err => {
            setPreviousPeriodAgendamentos([]);
        });
    }, [performanceLocation, performanceAgent, performanceService, dateRange, isMultiPlan, fetchAgendamentos, fetchAgendamentosRaw]);

    // ✅ NOVO: Buscar agendamentos do dia selecionado na pré-visualização
    useEffect(() => {
        // Para Multi-Plan, exigir seleção de local
        if (isMultiPlan && (!previewLocation || previewLocation === 'all')) {
            setPreviewAppointments([]);
            return;
        }

        // Buscar agendamentos do dia selecionado
        const dateStr = previewDate.toISOString().split('T')[0];
        const filters: {
            data_inicio: string;
            data_fim: string;
            agente_id?: number;
            unidade_id?: number;
        } = {
            data_inicio: dateStr,
            data_fim: dateStr
        };

        // ✅ CORREÇÃO CRÍTICA: Aplicar filtro de agente para usuários AGENTE (igual CalendarPage)
        if (userRole === 'AGENTE' && loggedInAgentId) {
            // Para AGENTE, buscar apenas seus próprios agendamentos
            filters.agente_id = parseInt(loggedInAgentId);
        } else if (previewLocation !== 'all') {
            // Para ADMIN, filtrar por unidade
            filters.unidade_id = parseInt(previewLocation);
        }
        
        fetchAgendamentosRaw(filters).then((data) => {


            // ✅ CORREÇÃO CRÍTICA: Transformar BackendAgendamento para formato compatível com PreviewSection
            const transformedAppointments = data.map(apt => ({
                ...apt,
                // Manter campos originais do backend
                agente_id: apt.agente_id,
                data_agendamento: apt.data_agendamento,
                hora_inicio: apt.hora_inicio,
                hora_fim: apt.hora_fim,
                // Adicionar campos no formato CalendarAppointment para compatibilidade
                agentId: apt.agente_id.toString(),
                date: apt.data_agendamento.split('T')[0],
                startTime: apt.hora_inicio,
                endTime: apt.hora_fim,
                locationId: apt.unidade_id.toString(),
                serviceId: apt.servico_id?.toString() || '1'
            }));


            setPreviewAppointments(transformedAppointments);
        }).catch(err => {
            setPreviewAppointments([]);
        });
    }, [previewDate, previewLocation, isMultiPlan, fetchAgendamentosRaw]);

    const handleAppointmentClick = (details: ScheduleSlot['details']) => {
        setModalData({ appointment: details });
        setAppointmentModalOpen(true);
    };

    const handleSlotClick = (slotInfo: { agent: Agent, start: number, date: Date }) => {
        setModalData({ newSlot: slotInfo });
        setAppointmentModalOpen(true);
    };


    const handleCloseModal = () => {
        setAppointmentModalOpen(false);
        setModalData(null);
    };

    // ✅ NOVO: Callback para recarregar dados após criar/editar agendamento
    const handleAppointmentSuccess = () => {

        // Recarregar agendamentos da pré-visualização
        const filters: {
            data_inicio: string;
            data_fim: string;
            agente_id?: number;
            unidade_id?: number;
        } = {
            data_inicio: previewDate.toISOString().split('T')[0],
            data_fim: previewDate.toISOString().split('T')[0]
        };

        // ✅ CORREÇÃO CRÍTICA: Aplicar filtro de agente para usuários AGENTE (igual CalendarPage)
        if (userRole === 'AGENTE' && loggedInAgentId) {
            // Para AGENTE, buscar apenas seus próprios agendamentos
            filters.agente_id = parseInt(loggedInAgentId);
        } else if (previewLocation !== 'all') {
            // Para ADMIN, filtrar por unidade
            filters.unidade_id = parseInt(previewLocation);
        }

        fetchAgendamentosRaw(filters).then((data) => {
            // ✅ CORREÇÃO CRÍTICA: Transformar BackendAgendamento para formato compatível com PreviewSection
            const transformedAppointments = data.map(apt => ({
                ...apt,
                // Manter campos originais do backend
                agente_id: apt.agente_id,
                data_agendamento: apt.data_agendamento,
                hora_inicio: apt.hora_inicio,
                hora_fim: apt.hora_fim,
                // Adicionar campos no formato CalendarAppointment para compatibilidade
                agentId: apt.agente_id.toString(),
                date: apt.data_agendamento.split('T')[0],
                startTime: apt.hora_inicio,
                endTime: apt.hora_fim,
                locationId: apt.unidade_id.toString(),
                serviceId: apt.servico_id?.toString() || '1'
            }));

            setPreviewAppointments(transformedAppointments);
        }).catch(err => {
            // Erro ao recarregar agendamentos
        });
    };

    // ✅ CALCULAR MÉTRICAS DE DESEMPENHO
    const metrics = useMemo(() => {
        if (agendamentos.length === 0) {
            // Retornar métricas zeradas se não houver agendamentos
            const emptyMetrics = [
                { title: 'Reservas Totais', value: '0', isPositive: true, change: '+0%', subtitle: 'Nenhum agendamento no período' },
                { title: 'Receita Bruta', value: 'R$ 0,00', isPositive: true, change: '+0%', subtitle: 'Total faturado (serviços concluídos)' },
                { title: 'Receita do Proprietário', value: 'R$ 0,00', isPositive: true, change: '+0%', subtitle: 'Após pagar comissões dos agentes', adminOnly: true },
                { title: 'Comissões de Agentes', value: 'R$ 0,00', isPositive: false, change: '+0%', subtitle: '0 agendamentos concluídos' },
                { title: 'Ticket Médio', value: 'R$ 0,00', isPositive: true, change: '+0%', subtitle: 'Por agendamento concluído' },
                { title: 'Novos Clientes', value: '0', isPositive: true, change: '+0%', subtitle: 'Clientes únicos no período' },
                { title: 'Taxa de Cancelamento', value: '0%', isPositive: true, change: '+0%', subtitle: '0 de 0 cancelados' },
                { title: 'Agendamentos Pendentes', value: '0', isPositive: true, change: '+0%', subtitle: 'Aguardando confirmação' }
            ];
            
            // ✅ Filtrar cards baseado no role do usuário
            return userRole === 'AGENTE' 
                ? emptyMetrics.filter(metric => !metric.adminOnly)
                : emptyMetrics;
        }

        // ✅ CORREÇÃO CRÍTICA: Passar período anterior para calculateMetrics
        const allMetrics = calculateMetrics(agendamentos, previousPeriodAgendamentos);
        
        // ✅ Filtrar cards baseado no role do usuário
        return userRole === 'AGENTE' 
            ? allMetrics.filter(metric => !metric.adminOnly)
            : allMetrics;
    }, [agendamentos, previousPeriodAgendamentos, calculateMetrics, userRole]);

    // ✅ TRANSFORMAR DADOS DO BACKEND PARA FORMATO DO COMPONENTE
    const agents: Agent[] = useMemo(() => {
        console.log('[DashboardPage] Transformando backendAgentes:', backendAgentes.length, 'agentes', backendAgentes);

        return backendAgentes.map(agente => {
            // ✅ CORREÇÃO CRÍTICA: Backend pode retornar 'name' já formatado (igual CalendarPage)
            // Priorizar 'nome_exibicao', depois 'name', senão concatenar 'nome' + 'sobrenome'
            const displayName = agente.nome_exibicao || (agente as any).name || `${agente.nome} ${agente.sobrenome || ''}`.trim();

            // ✅ NOVO: Usar avatar real do backend com getAssetUrl (igual CalendarPage)
            const avatarUrl = agente.avatar
                ? getAssetUrl(agente.avatar)
                : `https://i.pravatar.cc/150?u=${agente.id}`;

            console.log(`[DashboardPage] Agente ${agente.id}: unidades=${JSON.stringify(agente.unidades)}`);

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
    
    // Mock data para outras seções (serão migrados posteriormente)
    const filteredAgentSchedules = useMemo(() => {
        return agentSchedules;
    }, []);

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
            />
            
            <PreviewSection
                schedules={filteredAgentSchedules}
                locations={locations}
                services={services}
                selectedLocation={previewLocation}
                setSelectedLocation={setPreviewLocation}
                selectedService={previewService}
                setSelectedService={setPreviewService}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onAppointmentClick={handleAppointmentClick}
                onSlotClick={handleSlotClick}
                unitSchedules={unitSchedules} // ✅ NOVO: Passar horários de funcionamento
                agents={agents} // ✅ NOVO: Passar lista de agentes para filtrar por local
                selectedDate={previewDate} // ✅ NOVO: Passar data selecionada
                onDateChange={setPreviewDate} // ✅ NOVO: Callback para mudar data
                appointments={previewAppointments} // ✅ NOVO: Passar agendamentos do dia
                backendAgentes={backendAgentes} // ✅ NOVO: Passar agentes do backend para detalhes
                calendarExceptions={calendarExceptions} // ✅ NOVO: Passar exceções de calendário
                isDateBlockedByException={isDateBlockedByException} // ✅ NOVO: Função para verificar bloqueios
            />
            
            <NewAppointmentModal
                isOpen={isAppointmentModalOpen}
                onClose={handleCloseModal}
                appointmentData={modalData?.appointment}
                newSlotData={modalData?.newSlot}
                selectedLocationId={previewLocation} // ✅ CRÍTICO: Passar local selecionado para filtrar agentes
                onSuccess={handleAppointmentSuccess} // ✅ NOVO: Callback para atualizar dados após sucesso
            />
        </div>
    );
};

export default DashboardPage;
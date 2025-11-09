import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardData } from '../hooks/useDashboardData';
import PerformanceSection from './PerformanceSection';
import PreviewSection from './PreviewSection';
import UpcomingAppointments from './UpcomingAppointments';
import NewAppointmentModal from './NewAppointmentModal';
import type { PerformanceMetric, AgentSchedule, UpcomingAppointment, Agent, Service, Location, ScheduleSlot } from '../types';

// --- Mock Data (PreviewSection e UpcomingAppointments - serão migrados posteriormente) ---
const agentSchedules: AgentSchedule[] = [];
const upcomingAppointments: UpcomingAppointment[] = [];

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
        isLoading,
        error,
        fetchAgendamentos,
        calculateMetrics
    } = useDashboardData();

    // Estados de filtro da seção Desempenho
    const [selectedLocation, setSelectedLocation] = useState('all');
    const [selectedAgent, setSelectedAgent] = useState('all');
    const [selectedService, setSelectedService] = useState('all');
    const [dateRange, setDateRange] = useState<{ startDate: Date | null; endDate: Date | null }>({ 
        startDate: null, 
        endDate: null 
    });
    
    // Estados de filtro das outras seções (PreviewSection e UpcomingAppointments)
    const [selectedPreviewService, setSelectedPreviewService] = useState('all');
    const [upcomingLocation, setUpcomingLocation] = useState('all');
    const [upcomingAgent, setUpcomingAgent] = useState('all');
    const [upcomingService, setUpcomingService] = useState('all');
    
    const [viewMode, setViewMode] = useState<'compromissos' | 'disponibilidade'>('compromissos');
    const [isAppointmentModalOpen, setAppointmentModalOpen] = useState(false);
    const [modalData, setModalData] = useState<{
        appointment?: ScheduleSlot['details'];
        newSlot?: { agent: Agent, start: number, date: Date };
    } | null>(null);

    // Determinar tipo de plano
    const isMultiPlan = user?.plano === 'Multi';
    const isSinglePlan = user?.plano === 'Single';

    console.log('🔍 [DashboardPage] Estado atual:', {
        userRole,
        loggedInAgentId,
        isMultiPlan,
        isSinglePlan,
        unidadesCount: backendUnidades.length,
        agentesCount: backendAgentes.length,
        servicosCount: backendServicos.length,
        agendamentosCount: agendamentos.length,
        selectedLocation,
        selectedAgent,
        selectedService
    });

    // ✅ AUTO-SELEÇÃO DE LOCAL (Idêntico ao CalendarPage)
    useEffect(() => {
        console.log('🔄 [DashboardPage] useEffect de auto-seleção executado:', {
            unidadesLength: backendUnidades.length,
            agentesLength: backendAgentes.length,
            userRole,
            loggedInAgentId,
            selectedLocation,
            timestamp: new Date().toISOString()
        });

        // 1. Garante que temos dados básicos para filtrar
        if (backendUnidades.length === 0 || backendAgentes.length === 0) {
            console.log('⏭️ [DashboardPage] Dados ainda não carregados, pulando auto-seleção');
            return;
        }

        let newLocationId: string | null = null;

        // 2. ✅ PRIORIDADE 1: Usuário AGENTE (CRÍTICO)
        if (userRole === 'AGENTE' && loggedInAgentId) {
            const agentData = backendAgentes.find(a => a.id.toString() === loggedInAgentId);
            
            console.log('🔍 [DashboardPage] Detectado usuário AGENTE:', {
                loggedInAgentId,
                agentFound: !!agentData,
                agentData: agentData ? {
                    id: agentData.id,
                    nome: agentData.nome,
                    unidade_id: agentData.unidade_id,
                    unidades: agentData.unidades
                } : null
            });
            
            // ✅ CORREÇÃO CRÍTICA: Priorizar unidade principal do agente
            if (agentData && agentData.unidade_id !== undefined && agentData.unidade_id !== null) {
                // Caso 1: AGENTE tem unidade principal definida - SEMPRE usar esta
                newLocationId = agentData.unidade_id.toString();
                console.log('✅ [DashboardPage] AGENTE com unidade_id principal (PRIORIDADE):', newLocationId);
            }
            // Se for AGENTE Multi-Local (que não tem unidade_id no agente, mas tem unidades no array 'unidades'):
            else if (agentData && Array.isArray(agentData.unidades) && agentData.unidades.length > 0) {
                // Caso 2: AGENTE sem unidade principal - usar primeira unidade do array
                newLocationId = agentData.unidades[0];
                console.log('✅ [DashboardPage] AGENTE multi-local, selecionando primeira unidade:', newLocationId);
            }
        }
        // 3. ✅ PRIORIDADE 2: Plano Single
        else if (isSinglePlan) {
            newLocationId = backendUnidades[0]?.id.toString() || null;
            console.log('✅ [DashboardPage] Plano Single, selecionando único local:', newLocationId);
        }
        // 4. ✅ PRIORIDADE 3: ADMIN com unidade padrão
        else if (user?.unidade_id) {
            newLocationId = user.unidade_id.toString();
            console.log('✅ [DashboardPage] ADMIN com unidade padrão:', newLocationId);
        }
        // 5. ✅ PRIORIDADE 4: ADMIN Multi-Local sem padrão
        else if (userRole === 'ADMIN' && isMultiPlan && backendUnidades.length > 0) {
            newLocationId = backendUnidades[0].id.toString();
            console.log('✅ [DashboardPage] ADMIN multi-local, selecionando primeiro local:', newLocationId);
        }

        // 6. Aplica a nova seleção se for diferente da atual E se for uma seleção válida
        if (newLocationId && newLocationId !== selectedLocation) {
            console.log(`⚙️ [DashboardPage] Forçando seleção inicial de Local para: ${newLocationId} (Regra: ${userRole})`);
            setSelectedLocation(newLocationId);
            console.log('✅ [DashboardPage] DEPOIS setSelectedLocation chamado');
        } else {
            console.log('⏭️ [DashboardPage] Seleção NÃO aplicada:', {
                newLocationId,
                selectedLocation,
                isEqual: newLocationId === selectedLocation,
                hasNewId: !!newLocationId,
                userRole
            });
        }

    }, [backendUnidades.length, backendAgentes.length, isSinglePlan, isMultiPlan, user?.unidade_id, userRole, loggedInAgentId, selectedLocation]);

    // ✅ AUTO-SELEÇÃO DE AGENTE (para usuário AGENTE)
    useEffect(() => {
        if (loggedInAgentId) {
            setSelectedAgent(loggedInAgentId);
            setUpcomingAgent(loggedInAgentId);
        } else {
            setSelectedAgent('all');
            setUpcomingAgent('all');
        }
    }, [loggedInAgentId]);

    // ✅ BUSCAR AGENDAMENTOS quando filtros ou período mudarem
    useEffect(() => {
        // Validar que temos período válido
        if (!dateRange.startDate || !dateRange.endDate) {
            console.log('⏳ [DashboardPage] Aguardando seleção de período...');
            return;
        }

        // Para Multi-Plan, exigir seleção de local
        if (isMultiPlan && selectedLocation === 'all') {
            console.log('⏳ [DashboardPage] Multi-Plan: Aguardando seleção de local...');
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
        if (selectedLocation !== 'all') {
            filters.unidade_id = parseInt(selectedLocation);
        }

        // Adicionar filtro de agente se não for 'all'
        if (selectedAgent !== 'all') {
            filters.agente_id = parseInt(selectedAgent);
        }

        // Adicionar filtro de serviço se não for 'all'
        if (selectedService !== 'all') {
            filters.servico_id = parseInt(selectedService);
        }

        console.log('📊 [DashboardPage] Buscando agendamentos com filtros:', filters);
        fetchAgendamentos(filters);
    }, [selectedLocation, selectedAgent, selectedService, dateRange, isMultiPlan, fetchAgendamentos]);

    const handleAppointmentClick = (details: ScheduleSlot['details']) => {
        setModalData({ appointment: details });
        setAppointmentModalOpen(true);
    };

    const handleSlotClick = (slotInfo: { agent: Agent, start: number, date: Date }) => {
        setModalData({ newSlot: slotInfo });
        setAppointmentModalOpen(true);
    };

    const handleUpcomingAppointmentClick = (appointment: UpcomingAppointment) => {
        // Assume a 1-hour duration for upcoming appointments to create a time range
        const startTime = appointment.time;
        const [hour, minute] = startTime.split(':').map(Number);
        const endDate = new Date();
        endDate.setHours(hour + 1, minute);
        const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

        const details: ScheduleSlot['details'] = {
            id: `upcoming-${Date.now()}`, // Create a temporary unique ID
            service: appointment.service,
            client: 'Cliente Exemplo', // Placeholder as this is not in UpcomingAppointment
            agentName: appointment.agent.name,
            agentEmail: 'email@exemplo.com.br', // Placeholder
            date: appointment.date,
            time: `${startTime}-${endTime}`,
            serviceId: appointment.serviceId,
            locationId: appointment.locationId,
            status: 'Aprovado',
        };

        setModalData({ appointment: details });
        setAppointmentModalOpen(true);
    };

    const handleCloseModal = () => {
        setAppointmentModalOpen(false);
        setModalData(null);
    }

    // ✅ CALCULAR MÉTRICAS DE DESEMPENHO
    const metrics = useMemo(() => {
        if (agendamentos.length === 0) {
            // Retornar métricas zeradas se não houver agendamentos
            return [
                { title: 'Reservas Totais', value: '0', isPositive: true, change: '+0%' },
                { title: 'Receita Líquida', value: 'R$0.00', isPositive: true, change: '+0%' },
                { title: 'Comissões de Agentes', value: 'R$0.00', isPositive: false, change: '+0%' },
                { title: 'Taxa de Ocupação', value: '0%', isPositive: true, change: '+0%' }
            ];
        }

        return calculateMetrics(agendamentos);
    }, [agendamentos, calculateMetrics]);

    // ✅ TRANSFORMAR DADOS DO BACKEND PARA FORMATO DO COMPONENTE
    const agents: Agent[] = useMemo(() => {
        return backendAgentes.map(agente => ({
            id: agente.id.toString(),
            name: `${agente.nome} ${agente.sobrenome || ''}`.trim(),
            avatar: `https://i.pravatar.cc/150?u=${agente.id}`
        }));
    }, [backendAgentes]);

    const services: Service[] = useMemo(() => {
        return backendServicos.map(servico => ({
            id: servico.id.toString(),
            name: servico.nome,
            color: '#3B82F6',
            textColor: '#FFFFFF'
        }));
    }, [backendServicos]);

    const locations: Location[] = useMemo(() => {
        return backendUnidades.map(unidade => ({
            id: unidade.id.toString(),
            name: unidade.nome
        }));
    }, [backendUnidades]);

    // ✅ FILTRAR AGENTES BASEADO NO LOCAL SELECIONADO
    const filteredAgents = useMemo(() => {
        if (selectedLocation === 'all') return agents;
        
        // Filtrar agentes que trabalham no local selecionado
        const locationId = parseInt(selectedLocation);
        return agents.filter(agent => {
            const backendAgent = backendAgentes.find(a => a.id.toString() === agent.id);
            return backendAgent?.unidades?.includes(locationId);
        });
    }, [agents, backendAgentes, selectedLocation]);

    // ✅ FILTRAR SERVIÇOS BASEADO NO AGENTE SELECIONADO
    // TODO: Implementar quando backend fornecer relação agente-serviço
    const filteredServices = useMemo(() => {
        return services;
    }, [services]);
    
    // Mock data para outras seções (serão migrados posteriormente)
    const filteredUpcomingAppointments = useMemo(() => {
        return upcomingAppointments;
    }, []);

    const filteredAgentSchedules = useMemo(() => {
        return agentSchedules;
    }, []);

    // Loading state
    if (isLoading && backendUnidades.length === 0) {
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <PerformanceSection 
                        metrics={metrics}
                        locations={locations}
                        agents={filteredAgents}
                        services={filteredServices}
                        selectedLocation={selectedLocation}
                        setSelectedLocation={setSelectedLocation}
                        selectedAgent={selectedAgent}
                        setSelectedAgent={setSelectedAgent}
                        selectedService={selectedService}
                        setSelectedService={setSelectedService}
                        loggedInAgentId={loggedInAgentId}
                        userRole={userRole}
                        isMultiPlan={isMultiPlan}
                        onDateRangeChange={setDateRange}
                    />
                </div>
                <div>
                    <UpcomingAppointments 
                        appointments={filteredUpcomingAppointments}
                        locations={locations}
                        agents={agents}
                        services={services}
                        selectedLocation={upcomingLocation}
                        setSelectedLocation={setUpcomingLocation}
                        selectedAgent={upcomingAgent}
                        setSelectedAgent={setUpcomingAgent}
                        selectedService={upcomingService}
                        setSelectedService={setUpcomingService}
                        onAppointmentClick={handleUpcomingAppointmentClick}
                        loggedInAgentId={loggedInAgentId}
                    />
                </div>
            </div>
            
            <PreviewSection 
                schedules={filteredAgentSchedules}
                locations={locations}
                services={services}
                selectedLocation={selectedLocation}
                setSelectedLocation={setSelectedLocation}
                selectedService={selectedPreviewService}
                setSelectedService={setSelectedPreviewService}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onAppointmentClick={handleAppointmentClick}
                onSlotClick={handleSlotClick}
            />
            
            <NewAppointmentModal 
                isOpen={isAppointmentModalOpen} 
                onClose={handleCloseModal} 
                appointmentData={modalData?.appointment}
                newSlotData={modalData?.newSlot}
            />
        </div>
    );
};

export default DashboardPage;
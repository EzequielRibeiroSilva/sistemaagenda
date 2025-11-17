import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardData } from '../hooks/useDashboardData';
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
        unitSchedules, // ✅ NOVO: Horários de funcionamento por unidade
        isLoading,
        error,
        fetchAgendamentos,
        fetchAgendamentosRaw, // ✅ NOVO: Função que retorna dados sem sobrescrever estado
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
    
    // ✅ NOVO: Estado para agendamentos do período anterior (para cálculo de variações)
    const [previousPeriodAgendamentos, setPreviousPeriodAgendamentos] = useState<any[]>([]);
    
    // Estados de filtro das outras seções (PreviewSection)
    const [selectedPreviewService, setSelectedPreviewService] = useState('all');
    
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

    }, [backendUnidades.length, backendAgentes.length, isSinglePlan, isMultiPlan, user?.unidade_id, userRole, loggedInAgentId]);
    // ✅ CORREÇÃO CRÍTICA: Remover selectedLocation das dependências para permitir mudança manual

    // ✅ AUTO-SELEÇÃO DE AGENTE (para usuário AGENTE)
    useEffect(() => {
        if (loggedInAgentId) {
            setSelectedAgent(loggedInAgentId);
        } else {
            setSelectedAgent('all');
        }
    }, [loggedInAgentId]);

    // ✅ BUSCAR AGENDAMENTOS quando filtros ou período mudarem
    useEffect(() => {
        console.log('🔄 [DashboardPage] useEffect de busca disparado:', {
            hasStartDate: !!dateRange.startDate,
            hasEndDate: !!dateRange.endDate,
            startDate: dateRange.startDate?.toISOString().split('T')[0],
            endDate: dateRange.endDate?.toISOString().split('T')[0],
            selectedLocation,
            selectedAgent,
            selectedService,
            isMultiPlan
        });

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
        
        console.log('📅 [DashboardPage] Buscando período anterior para variações:', {
            periodoAtual: `${dataInicio} a ${dataFim}`,
            periodoAnterior: `${prevFilters.data_inicio} a ${prevFilters.data_fim}`,
            diffDays
        });
        
        // ✅ CORREÇÃO CRÍTICA: Usar fetchAgendamentosRaw para não sobrescrever agendamentos do período atual
        fetchAgendamentosRaw(prevFilters).then((prevData) => {
            console.log('✅ [DashboardPage] Período anterior carregado:', prevData.length, 'agendamentos');
            setPreviousPeriodAgendamentos(prevData);
        }).catch(err => {
            console.error('❌ [DashboardPage] Erro ao buscar período anterior:', err);
            setPreviousPeriodAgendamentos([]);
        });
    }, [selectedLocation, selectedAgent, selectedService, dateRange, isMultiPlan, fetchAgendamentos, fetchAgendamentosRaw]);

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
    }

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
        console.log('🔍 [DashboardPage] Transformando agentes do backend:', {
            count: backendAgentes.length,
            sample: backendAgentes.slice(0, 2).map(a => ({
                id: a.id,
                nome: a.nome,
                sobrenome: a.sobrenome,
                name: (a as any).name,
                unidades: a.unidades
            }))
        });

        return backendAgentes.map(agente => {
            // ✅ CORREÇÃO CRÍTICA: Backend pode retornar 'name' já formatado (igual CalendarPage)
            // Priorizar 'nome_exibicao', depois 'name', senão concatenar 'nome' + 'sobrenome'
            const displayName = agente.nome_exibicao || (agente as any).name || `${agente.nome} ${agente.sobrenome || ''}`.trim();
            
            // ✅ NOVO: Usar avatar real do backend com getAssetUrl (igual CalendarPage)
            const avatarUrl = agente.avatar 
                ? getAssetUrl(agente.avatar)
                : `https://i.pravatar.cc/150?u=${agente.id}`;
            
            console.log(`🔍 [DashboardPage] Agente ${agente.id}:`, {
                nome_exibicao: agente.nome_exibicao,
                nome: agente.nome,
                sobrenome: agente.sobrenome,
                displayName,
                avatar: agente.avatar,
                avatarUrl,
                unidades: agente.unidades
            });

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
        console.log('🔍 [DashboardPage] Filtrando agentes por local:', {
            selectedLocation,
            totalAgents: agents.length,
            backendAgentesCount: backendAgentes.length
        });

        if (selectedLocation === 'all') {
            console.log('✅ [DashboardPage] Mostrando todos os agentes (selectedLocation = all)');
            return agents;
        }
        
        // Filtrar agentes que trabalham no local selecionado
        // ✅ CRÍTICO: Converter para string para comparação (igual CalendarPage)
        const locationIdStr = selectedLocation.toString();
        const filtered = agents.filter(agent => {
            const backendAgent = backendAgentes.find(a => a.id.toString() === agent.id);
            
            // Verificar se o agente tem o array 'unidades' e se inclui o local selecionado
            const hasLocation = Array.isArray(backendAgent?.unidades) && 
                               backendAgent.unidades.includes(locationIdStr);
            
            console.log(`🔍 [DashboardPage] Agente ${agent.name}:`, {
                agentId: agent.id,
                unidades: backendAgent?.unidades,
                locationIdStr,
                hasLocation
            });
            
            return hasLocation;
        });

        console.log('✅ [DashboardPage] Agentes filtrados:', {
            selectedLocation: locationIdStr,
            totalAgents: agents.length,
            filteredCount: filtered.length,
            filteredNames: filtered.map(a => a.name)
        });

        return filtered;
    }, [agents, backendAgentes, selectedLocation]);

    // ✅ FILTRAR SERVIÇOS BASEADO NO AGENTE SELECIONADO
    // TODO: Implementar quando backend fornecer relação agente-serviço
    const filteredServices = useMemo(() => {
        return services;
    }, [services]);
    
    // Mock data para outras seções (serão migrados posteriormente)
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
            {/* ✅ Seção Desempenho - Agora ocupa toda a largura */}
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
                unitSchedules={unitSchedules} // ✅ NOVO: Passar horários de funcionamento
                agents={agents} // ✅ NOVO: Passar lista de agentes para filtrar por local
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
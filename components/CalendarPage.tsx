import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Agent, Service, Appointment, UnavailableBlock, ScheduleSlot, Location } from '../types';
import { ChevronLeft, ChevronRight, Check, MoreHorizontal, ChevronDown, Plus } from './Icons';
import NewAppointmentModal from './NewAppointmentModal';
import { useCalendarData } from '../hooks/useCalendarData';
import type { CalendarAgent, CalendarService, CalendarLocation, CalendarAppointment } from '../hooks/useCalendarData';
import { useAuth } from '../contexts/AuthContext';

// Dados mock removidos - agora usando dados reais do backend via useCalendarData hook

const HeaderDropdown: React.FC<{
  options: string[],
  selected: string,
  onSelect: (option: string) => void
}> = ({ options, selected, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                }}
                className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-50 min-w-[120px] justify-between"
            >
                <span className="truncate">{selected}</span>
                <ChevronDown className="h-4 w-4 ml-2" />
            </button>
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl z-30 border border-gray-200">
                    {options.map(option => (
                        <button
                            key={option}
                            onClick={() => {
                                onSelect(option);
                                setIsOpen(false);
                            }}
                            className="w-full text-left flex items-center px-4 py-2 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg text-sm"
                        >
                            {selected === option && <Check className="h-4 w-4 mr-2 text-blue-600" />}
                            <span className={`${selected !== option ? 'ml-6' : ''} truncate`}>{option}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

interface CalendarPageProps {
  loggedInAgentId: string | null;
  userRole: 'ADMIN' | 'AGENTE';
}

const CalendarPage: React.FC<CalendarPageProps> = ({ loggedInAgentId, userRole }) => {
    // Hook de autenticação para acessar dados do usuário
    const { user } = useAuth();
    
    // Hook para buscar dados reais do backend (LÓGICA DIÁRIA APLICADA NA SEMANAL)
    const {
        agents: backendAgents,
        services: backendServices,
        locations: backendLocations,
        appointments: backendAppointments,
        unavailableBlocks: backendUnavailableBlocks,
        unitSchedules,
        calendarExceptions,
        isLoading,
        error,
        loadAllData,
        fetchAppointments,
        isDateBlockedByException
    } = useCalendarData();

    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('Dia');
    const [isModalOpen, setModalOpen] = useState(false);
    const [modalData, setModalData] = useState<{
        appointment?: ScheduleSlot['details'];
        newSlot?: { agent: Agent, start: number, date: Date };
    } | null>(null);
    const [selectedServiceFilter, setSelectedServiceFilter] = useState('all');
    const [selectedAgentFilter, setSelectedAgentFilter] = useState('all');
    const [selectedLocationFilter, setSelectedLocationFilter] = useState('all');

    // ✅ NOVO: Verificar se há uma data de navegação no localStorage (vindo da busca)
    useEffect(() => {
        const navigationDate = localStorage.getItem('calendarNavigationDate');
        if (navigationDate) {
            try {
                console.log('📅 [CalendarPage] Data recebida do localStorage:', navigationDate);
                // Adicionar 'T00:00:00' para garantir parsing correto no timezone local
                const parsedDate = new Date(navigationDate + 'T00:00:00');
                console.log('📅 [CalendarPage] Data parseada:', parsedDate);
                if (!isNaN(parsedDate.getTime())) {
                    setCurrentDate(parsedDate);
                    console.log('📅 [CalendarPage] Navegando para data:', navigationDate, '→', parsedDate.toLocaleDateString('pt-BR'));
                }
            } catch (error) {
                console.error('❌ [CalendarPage] Erro ao parsear data de navegação:', error);
            } finally {
                // Limpar o localStorage após usar
                localStorage.removeItem('calendarNavigationDate');
            }
        }
    }, []);
    
    // ✅ CORREÇÃO: Estado para rastrear qual slot específico está sendo hovereado
    // Formato: "agentId-dateStr-startTime-endTime" (ex: "23-2025-11-04-13:00-14:00")
    const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
    
    // 🎯 NOVO: Ref para a barra de navegação de dias
    const dayNavigationRef = useRef<HTMLDivElement>(null);
    
    // Estado do popover
    const [popover, setPopover] = useState<{
        visible: boolean;
        content: NonNullable<ScheduleSlot['details']>;
        style: React.CSSProperties;
    } | null>(null);

    // 🎯 NOVO: Scroll automático para centralizar o dia selecionado na barra de navegação
    useEffect(() => {
        if (view === 'Dia' && dayNavigationRef.current) {
            // Aguardar o próximo frame para garantir que o DOM foi atualizado
            setTimeout(() => {
                const selectedButton = dayNavigationRef.current?.querySelector('.bg-blue-600');
                if (selectedButton) {
                    selectedButton.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'center'
                    });
                }
            }, 100);
        }
    }, [currentDate, view]);

    // 🔍 DEBUG: Verificar se dados estão sendo carregados
    useEffect(() => {
            }, [backendAgents.length, backendServices.length, backendLocations.length, backendAppointments.length, isLoading, error]);

    // Converter dados do backend para formato do componente
    const agents: Agent[] = useMemo(() => {
        return backendAgents.map(agent => ({
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar,
            unidades: agent.unidades // ✅ CRÍTICO: Incluir array de unidades
        }));
    }, [backendAgents]);

    const services: Service[] = useMemo(() => {
        return backendServices.map(service => ({
            id: service.id,
            name: service.name,
            color: service.color,
            textColor: service.textColor
        }));
    }, [backendServices]);

    const locations: Location[] = useMemo(() => {
        return backendLocations.map(location => ({
            id: location.id,
            name: location.name
        }));
    }, [backendLocations]);
    
    // Detectar se é plano Single ou Multi
    const isSinglePlan = user.plano === 'Single' || locations.length === 1;
    const isMultiPlan = user.plano === 'Multi' && locations.length > 1;

    const appointments: (Appointment & { date: string; status?: string; clientName?: string; clientPhone?: string })[] = useMemo(() => {
        return backendAppointments.map(appointment => ({
            id: appointment.id,
            agentId: appointment.agentId,
            serviceId: appointment.serviceId,
            locationId: appointment.locationId,
            startTime: appointment.startTime,
            endTime: appointment.endTime,
            date: appointment.date,
            status: appointment.status, // ✅ INCLUIR STATUS PARA DESTAQUE VISUAL
            clientName: appointment.clientName, // ✅ CRÍTICO: Incluir nome do cliente
            clientPhone: appointment.clientPhone // ✅ CRÍTICO: Incluir telefone do cliente
        }));
    }, [backendAppointments]);

    const unavailableBlocks: (UnavailableBlock & { date?: string })[] = useMemo(() => {
        return backendUnavailableBlocks.map(block => ({
            id: block.id,
            agentId: block.agentId,
            startTime: block.startTime,
            endTime: block.endTime,
            date: block.date
        }));
    }, [backendUnavailableBlocks]);

    const today = new Date();

    // Calcular horários dinâmicos baseados nos horários de funcionamento da unidade selecionada
    const { startHour, endHour } = useMemo(() => {

        
        // Se há unidade selecionada, usar seus horários de funcionamento
        if (selectedLocationFilter && selectedLocationFilter !== 'all' && unitSchedules[selectedLocationFilter]) {
            const schedules = unitSchedules[selectedLocationFilter];
            

            
            // Encontrar o horário mais cedo de abertura e o mais tarde de fechamento
            let minHour = 23;
            let maxHour = 0;
            let hasValidSchedule = false; // 🚩 NOVO: Flag para rastrear se um horário foi encontrado
            
            schedules.forEach(schedule => {

                
                // ✅ CORREÇÃO CRÍTICA: Validar que é um Array antes de iterar
                if (schedule.is_aberto && Array.isArray(schedule.horarios_json) && schedule.horarios_json.length > 0) {
                    schedule.horarios_json.forEach(periodo => {
                        const startH = parseInt(periodo.inicio.split(':')[0]);
                        const endH = parseInt(periodo.fim.split(':')[0]);
                        

                        
                        if (startH < minHour) minHour = startH;
                        if (endH > maxHour) maxHour = endH;
                        
                        hasValidSchedule = true; // 🎯 ATUALIZAÇÃO CRÍTICA: Marcar que encontrou horário válido
                    });
                }
            });
            
            // ✅ USANDO: A nova flag de rastreamento (não mais minHour < 23 && maxHour > 0)
            if (hasValidSchedule) {
                return { startHour: minHour, endHour: maxHour };
            }
        }
        
        // Fallback: usar horários padrão
        return { startHour: 8, endHour: 21 };
    }, [selectedLocationFilter, unitSchedules]);

    // ✅ CORREÇÃO CRÍTICA: Todos os grids usam horários dinâmicos do local selecionado
    const START_HOUR_DAY = startHour;
    const END_HOUR_DAY = endHour;
    const hoursDay = Array.from({ length: END_HOUR_DAY - START_HOUR_DAY + 1 }, (_, i) => i + START_HOUR_DAY);

    // ✅ GRID SEMANA: Usar horários dinâmicos (não mais fixos)
    const START_HOUR_WEEK = startHour;
    const END_HOUR_WEEK = endHour;
    // ✅ CORREÇÃO DEFINITIVA: Array com apenas as horas que INICIAM slots (9h-16h = 8 elementos)
    // O label 17:00 será renderizado separadamente como marcador final
    const hoursWeek = Array.from({ length: END_HOUR_WEEK - START_HOUR_WEEK }, (_, i) => i + START_HOUR_WEEK);

    // ✅ GRID MÊS: Usar horários dinâmicos (não mais fixos)
    const START_HOUR_MONTH = startHour;
    const END_HOUR_MONTH = endHour;

    const allAgents = useMemo(() => {
        if (loggedInAgentId) {

            
            // ✅ CORREÇÃO CRÍTICA: Converter ambos para string para garantir comparação correta
            const filtered = agents.filter(agent => agent.id.toString() === loggedInAgentId.toString());
            

            
            return filtered;
        }
        return agents;
    }, [loggedInAgentId, agents]);

    const displayedAgents = useMemo(() => {
        let agentsToDisplay = allAgents;

        // 1. ✅ FILTRO POR LOCAL (UNIDADE): Se um local estiver selecionado, filtrar agentes
        // Apenas agentes que trabalham na unidade selecionada devem ser exibidos no grid
        if (selectedLocationFilter !== 'all') {
            agentsToDisplay = allAgents.filter(agent =>
                // Garante que a propriedade 'unidades' existe e é um array
                Array.isArray(agent.unidades) && 
                // Verifica se o ID do local selecionado está no array de unidades do agente
                agent.unidades.includes(selectedLocationFilter)
            );

        }

        // 2. FILTRO POR AGENTE (DROPDOWN): Se um agente específico for selecionado
        // (Isso se aplica apenas se a view não for 'Semana')
        if (view !== 'Semana' && selectedAgentFilter !== 'all') {
            return agentsToDisplay.filter(agent => agent.id === selectedAgentFilter);
        }

        return agentsToDisplay;

    }, [allAgents, selectedLocationFilter, selectedAgentFilter, view]); // ✅ CRÍTICO: Adicionar selectedLocationFilter às dependências
    
    const [selectedAgentId, setSelectedAgentId] = useState('');
    
    useEffect(() => {
        if (loggedInAgentId) {
            
            setSelectedAgentFilter(loggedInAgentId);
            // ✅ CORREÇÃO CRÍTICA: Para AGENTE, usar o ID do agente do array allAgents, não o loggedInAgentId
            // O loggedInAgentId pode ser diferente do agent.id no array
            if (allAgents.length > 0) {
                // ✅ CORREÇÃO: Converter para string na comparação
                const agentInList = allAgents.find(a => a.id.toString() === loggedInAgentId.toString());
                
                
                if (agentInList) {
                    setSelectedAgentId(agentInList.id);
                } else {
                    // Se não encontrar, usar o primeiro agente disponível
                    setSelectedAgentId(allAgents[0].id);
                }
            }
        }
    }, [loggedInAgentId, allAgents]);

    // 🔧 CORREÇÃO DEFINITIVA: Auto-selecionar primeiro agente disponível
    useEffect(() => {
        // Se não há agente selecionado e há agentes disponíveis, selecionar o primeiro
        if (allAgents.length > 0 && !selectedAgentId) {
            const firstAgentId = allAgents[0].id;
                        setSelectedAgentId(firstAgentId);
        }
    }, [allAgents, selectedAgentId, view]);

    // ✅ NOVO: Auto-selecionar primeiro agente de displayedAgents quando a lista mudar
    // Isso garante que ao trocar de unidade, um agente válido seja selecionado na view Semana
    useEffect(() => {
        if (view === 'Semana' && displayedAgents.length > 0) {
            // Se o agente selecionado não está mais na lista filtrada, selecionar o primeiro
            const isSelectedAgentInList = displayedAgents.some(a => a.id === selectedAgentId);
            if (!isSelectedAgentInList) {
                setSelectedAgentId(displayedAgents[0].id);
            }
        }
    }, [displayedAgents, selectedAgentId, view]);
    
    // Log controlado para debug (apenas quando dados mudarem)
    useEffect(() => {
        // 🚨 DEBUG CRÍTICO: Inspecionar dados brutos de agendamentos
        
        // 🔍 DEBUG CRÍTICO: Comparar IDs e tipos
                
        // 🔍 DEBUG: Agrupar por data
        const appointmentsByDate = appointments.reduce((acc, app) => {
            if (!acc[app.date]) acc[app.date] = [];
            acc[app.date].push(app);
            return acc;
        }, {} as Record<string, typeof appointments>);
        
                
        // 🔍 DEBUG: Verificar data atual
        const currentDateStr = toISODateString(currentDate);
        const appointmentsForToday = appointments.filter(a => a.date === currentDateStr);
        
    }, [agents.length, allAgents.length, displayedAgents.length, services.length, appointments.length, currentDate, selectedLocationFilter, loggedInAgentId]);

    // ✅ CORREÇÃO DEFINITIVA: Auto-seleção de local priorizando AGENTE/SinglePlan na montagem.
    // Esta lógica garante que o local seja selecionado ANTES da busca de dados e cálculo de horários.
    useEffect(() => {

        // 1. Garante que temos dados básicos para filtrar (locations e backendAgents)
        if (locations.length === 0 || backendAgents.length === 0) {
            return;
        }

        let newLocationFilterId: string | null = null;

        // 2. Lógica para Usuário AGENTE (PRIORIDADE MÁXIMA)
        if (userRole === 'AGENTE' && loggedInAgentId) {
            const agentData = backendAgents.find(a => a.id.toString() === loggedInAgentId);
            
            
            // ✅ CORREÇÃO CRÍTICA: Priorizar unidade principal do agente

            if (agentData && agentData.unidade_id !== undefined && agentData.unidade_id !== null) {
                // Caso 1: AGENTE tem unidade principal definida - SEMPRE usar esta
                newLocationFilterId = agentData.unidade_id.toString();
            }
            // Se for AGENTE Multi-Local (que não tem unidade_id no agente, mas tem unidades no array 'unidades'):
            else if (agentData && Array.isArray(agentData.unidades) && agentData.unidades.length > 0) {
                // Caso 2: AGENTE sem unidade principal - usar primeira unidade do array
                newLocationFilterId = agentData.unidades[0];
            }
        } 
        // 3. Lógica para Usuário ADMIN (ou plano Single)
        else {
            if (isSinglePlan) {
                // Plano Single: Seleciona o único local disponível
                newLocationFilterId = locations[0]?.id || null;
            } else if (user.unidade_id) {
                // Admin com unidade padrão: Seleciona a unidade padrão do usuário
                newLocationFilterId = user.unidade_id.toString();
            } else {
                // Admin Multi-Local sem padrão: Seleciona o primeiro da lista para não ficar em 'all'
                newLocationFilterId = locations[0]?.id || null;
            }
        }

        // 4. Aplica a nova seleção se for diferente da atual E se for uma seleção válida
        if (newLocationFilterId && newLocationFilterId !== selectedLocationFilter) {

            // ✅ DEBUG ADICIONAL: Verificar dados do agente para AGENTE
            if (userRole === 'AGENTE' && loggedInAgentId) {
                const agentData = backendAgents.find(a => a.id.toString() === loggedInAgentId);
            }

            setSelectedLocationFilter(newLocationFilterId);
        } else {
        }
        
        // 5. Garante que um agente seja selecionado na view Semana (crítico se a lista de displayedAgents mudar)
        if (allAgents.length > 0 && !selectedAgentId) {
            setSelectedAgentId(allAgents[0].id);
        }

    }, [locations.length, backendAgents.length, userRole, loggedInAgentId, isSinglePlan, user.unidade_id, allAgents.length, selectedAgentId]);

    // 🔍 DEBUG: Monitorar mudanças no selectedLocationFilter
    useEffect(() => {
    }, [selectedLocationFilter, userRole, loggedInAgentId]);

    // ✅ Função para recarregar agendamentos (extraída para ser reutilizada)
    const loadAppointmentsForDateRange = async () => {
        // 🛡️ REGRA DE NEGÓCIO: Não buscar dados se Multi-Plan e nenhum local estiver selecionado
        if (isMultiPlan && (!selectedLocationFilter || selectedLocationFilter === 'all')) {
            return;
        }

        let startDate: string;
        let endDate: string;

        if (view === 'Dia') {
            // Para view de dia, buscar apenas o dia atual
            startDate = toISODateString(currentDate);
            endDate = startDate;
        } else if (view === 'Semana') {
            // Para view de semana, buscar a semana completa
            const { start, end } = getWeekRange(currentDate);
            startDate = toISODateString(start);
            endDate = toISODateString(end);
        } else {
            // Para view de mês, buscar o mês completo
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            startDate = toISODateString(firstDay);
            endDate = toISODateString(lastDay);
        }

        // ✅ CORREÇÃO CRÍTICA: Usar user.agentId (ID do agente) ao invés de user.id (ID do usuário)
        const params: { startDate: string, endDate: string, unidade_id?: number, agente_id?: number } = {
            startDate,
            endDate,
        };

        if (loggedInAgentId) {
            // 🔧 CORREÇÃO: Para AGENTE, usar user.agentId (ID na tabela agentes) ao invés de user.id (ID na tabela usuarios)
            // loggedInAgentId já contém o ID correto do agente (ex: 23), não o ID do usuário (ex: 131)
            // ✅ CRÍTICO: AGENTE multi-local precisa buscar agendamentos de TODAS as suas unidades
            // O filtro por locationId será aplicado no frontend durante a renderização
            params.agente_id = parseInt(loggedInAgentId);
        } else if (selectedLocationFilter !== 'all') {
            // Se é ADMIN, backend filtra por unidade_id
            params.unidade_id = parseInt(selectedLocationFilter);
        }

        await fetchAppointments(params);
    };

    // Recarregar agendamentos quando a data, view, LOCAL ou AGENTE LOGADO mudar
    useEffect(() => {
        loadAppointmentsForDateRange();
    }, [currentDate, view, fetchAppointments, selectedLocationFilter, isMultiPlan, loggedInAgentId]);

    const handleAppointmentClick = (app: Appointment & { date: string; status?: string; clientName?: string; clientPhone?: string }) => {
        
        // ✅ DEBUG: Verificar backendAppointments
        const backendApp = backendAppointments.find(ba => ba.id === app.id);
        
        // ✅ CORREÇÃO CRÍTICA: Buscar dados completos de agente e serviço
        const agent = agents.find(a => a.id.toString() === app.agentId.toString());
        let service = services.find(s => s.id.toString() === app.serviceId.toString());


        // ✅ CORREÇÃO CRÍTICA: Se serviço não encontrado, buscar no backend via agendamento
        if (!service && app.id) {
            // Buscar o agendamento completo do backend para pegar o serviceId correto
            const backendAppointment = backendAppointments.find(ba => ba.id === app.id);
            if (backendAppointment) {
                // Tentar encontrar o serviço com o ID do backend
                service = services.find(s => s.id.toString() === backendAppointment.serviceId.toString());
                if (service) {
                    // Atualizar o serviceId no objeto app para usar o correto
                    app.serviceId = backendAppointment.serviceId;
                }
            }
        }
        
        // Fallback de serviço (replicado de handleSlotMouseEnter)
        if (!service && services.length > 0) {
            service = services[0];
        }
        
        if (!agent) {
            console.error('❌ [handleAppointmentClick] Agente não encontrado:', app.agentId);
        }
        if (!service) {
            console.error('❌ [handleAppointmentClick] Serviço não encontrado:', app.serviceId);
        }
        
        // Formatar data e horário (similar ao popover)
        const formattedDate = new Date(app.date + 'T00:00:00').toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        const formattedTime = `${app.startTime} - ${app.endTime}`;
        
        // ✅ DADOS COMPLETOS que o modal de edição/finalização precisa
        const appointmentDetails = {
            id: app.id,
            service: service?.name || 'Serviço não encontrado',
            client: app.clientName || 'Cliente não informado',
            agentName: agent?.name || 'Agente não encontrado',
            agentAvatar: agent?.avatar,
            agentEmail: backendAgents.find(a => a.id.toString() === app.agentId.toString())?.email || '',
            agentPhone: backendAgents.find(a => a.id.toString() === app.agentId.toString())?.phone,
            date: formattedDate,
            time: formattedTime,
            // ✅ CRÍTICO: IDs e horários brutos para submissão
            serviceId: app.serviceId,
            locationId: app.locationId,
            agentId: app.agentId,
            startTime: app.startTime,
            endTime: app.endTime,
            dateISO: app.date, // Data no formato ISO (YYYY-MM-DD)
            status: app.status || 'Aprovado',
            clientPhone: app.clientPhone || ''
        };
        
        
        setModalData({ appointment: appointmentDetails as any });
        setModalOpen(true);
    };
    
    const handleSlotClick = (slotInfo: { agent: Agent, startTime: string, date: Date }) => {
        const startHour = parseInt(slotInfo.startTime.split(':')[0], 10);
        setModalData({ newSlot: { 
            agent: slotInfo.agent, 
            start: startHour,
            date: slotInfo.date 
        }});
        setModalOpen(true);
    };

    const getWeekRange = (date: Date) => {
        const start = new Date(date);
        const dayOfWeek = start.getDay();
        const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust so Monday is the first day
        start.setDate(diff);
        
        const weekDays: Date[] = [];
        for (let i = 0; i < 7; i++) {
            const dayInWeek = new Date(start);
            dayInWeek.setDate(start.getDate() + i);
            weekDays.push(dayInWeek);
        }
        const end = weekDays[6];
        return { start, end, weekDays };
    };

    const { start: weekStart, end: weekEnd, weekDays } = getWeekRange(currentDate);

    const daysInCurrentMonth = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const date = new Date(year, month, 1);
        const days = [];
        while (date.getMonth() === month) {
            days.push(new Date(date));
            date.setDate(date.getDate() + 1);
        }
        return days;
    }, [currentDate]);

    const handlePrev = () => {
        const newDate = new Date(currentDate);
        if (view === 'Semana') {
            newDate.setDate(currentDate.getDate() - 7);
        } else if (view === 'Mês') {
            newDate.setMonth(currentDate.getMonth() - 1);
        } else {
            newDate.setDate(currentDate.getDate() - 1);
        }
        setCurrentDate(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(currentDate);
        if (view === 'Semana') {
            newDate.setDate(currentDate.getDate() + 7);
        } else if (view === 'Mês') {
            newDate.setMonth(currentDate.getMonth() + 1);
        } else {
            newDate.setDate(currentDate.getDate() + 1);
        }
        setCurrentDate(newDate);
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    // 🎯 NOVA FUNÇÃO: Helper para obter o dia da semana no formato 'dia_semana' (1=Segunda, 7=Domingo)
    const getDayOfWeekIndex = (date: Date): number => {
        // getDay() retorna 0=Domingo, 1=Segunda, ..., 6=Sábado
        const day = date.getDay();
        return day === 0 ? 7 : day; // Mapear 0 (Domingo) para 7
    };

    // 🎯 NOVA FUNÇÃO: Calcular Blocos de Intervalo do Local para uma determinada data
    const calculateLocationIntervalBlocks = (date: Date): Array<{ start: string; end: string; id: string; type?: string; description?: string; exceptionType?: string }> => {
        if (!selectedLocationFilter || selectedLocationFilter === 'all') return [];

        const dayIndex = getDayOfWeekIndex(date);
        const schedules = unitSchedules[selectedLocationFilter];
        
        if (!schedules) return [];

        const daySchedule = schedules.find(s => s.dia_semana === dayIndex);
        
        // 🎯 CORREÇÃO CRÍTICA: Usar o parâmetro 'date' ao invés de 'currentDate'
        // Isso garante que a verificação seja feita para a data correta em todas as vistas
        const exception = isDateBlockedByException(date, selectedLocationFilter);
        if (exception) {
            // ✅ BLOQUEIO POR EXCEÇÃO: Bloquear o dia inteiro (8h-21h para Vista Dia)
            // Usar START_HOUR_DAY e END_HOUR_DAY para Vista Dia (mais amplo que WEEK)
            const startTime = `${START_HOUR_DAY.toString().padStart(2, '0')}:00`;
            const endTime = `${(END_HOUR_DAY + 1).toString().padStart(2, '0')}:00`;

            console.log(`🚫 [CalendarPage] EXCEÇÃO DE CALENDÁRIO detectada para ${date.toISOString().split('T')[0]}:`, {
                tipo: exception.tipo,
                descricao: exception.descricao,
                bloqueio: `${startTime} - ${endTime}`
            });

            return [{
                start: startTime,
                end: endTime,
                id: `exception-${selectedLocationFilter}-${exception.id}`,
                type: 'exception',
                description: exception.descricao,
                exceptionType: exception.tipo
            }];
        }

        // 🎯 CORREÇÃO CRÍTICA: Se a unidade está FECHADA neste dia, bloquear o DIA INTEIRO
        if (!daySchedule || !daySchedule.is_aberto) {
            // ✅ CORREÇÃO: Usar os limites do grid (START_HOUR_WEEK a END_HOUR_WEEK) ao invés de 00:00-23:59
            // Isso garante que o bloqueio visual não extrapole o grid renderizado
            const startTime = `${START_HOUR_WEEK.toString().padStart(2, '0')}:00`;
            const endTime = `${END_HOUR_WEEK.toString().padStart(2, '0')}:00`;

            return [{
                start: startTime,
                end: endTime,
                id: `closed-${selectedLocationFilter}-${dayIndex}`
            }];
        }
        
        // Se não tem horários ou tem apenas 1 período, não há intervalo (mas o dia está aberto)
        if (!Array.isArray(daySchedule.horarios_json) || daySchedule.horarios_json.length <= 1) {
            return [];
        }

        // Ordenar os horários de funcionamento
        const sortedPeriods = daySchedule.horarios_json.sort((a, b) => a.inicio.localeCompare(b.inicio));

        const intervals: Array<{ start: string; end: string; id: string }> = [];

        // O intervalo está sempre entre o 'fim' de um período e o 'início' do próximo
        for (let i = 0; i < sortedPeriods.length - 1; i++) {
            const currentEnd = sortedPeriods[i].fim;
            const nextStart = sortedPeriods[i + 1].inicio;

            // Se o fim do período atual for anterior ao início do próximo, há um intervalo.
            if (currentEnd < nextStart) {
                intervals.push({
                    start: currentEnd,
                    end: nextStart,
                    id: `interval-${selectedLocationFilter}-${dayIndex}-${i}` // ID único para o bloco
                });
            }
        }

        return intervals;
    };

    const timeToPercentageDay = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        // Calcular minutos totais desde START_HOUR_DAY
        const totalMinutes = (h - START_HOUR_DAY) * 60 + m;
        
        // ✅ CORREÇÃO CRÍTICA: O grid visual tem (END_HOUR_DAY - START_HOUR_DAY + 1) slots
        // Exemplo: Se START=8 e END=21, temos 14 slots [8h, 9h, ..., 21h]
        // O vão total vai do início de START_HOUR_DAY (8:00) até o FIM de END_HOUR_DAY (22:00)
        // Portanto: totalDuration = (END_HOUR_DAY + 1) - START_HOUR_DAY = 14 horas
        const totalDurationMinutes = ((END_HOUR_DAY + 1) - START_HOUR_DAY) * 60;
        
        return (totalMinutes / totalDurationMinutes) * 100;
    };
    
    const timeToPositionStyleWeek = (startTime: string | null | undefined, endTime: string | null | undefined) => {
        // ✅ Log de Entrada + Validação
                if (!startTime || !endTime || typeof startTime !== 'string' || typeof endTime !== 'string' || !startTime.includes(':') || !endTime.includes(':')) {
                        return { top: '0%', height: '0%', display: 'none' }; // Ocultar se inválido
        }

        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        // ✅ Validar se a conversão para número funcionou
        if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
                          return { top: '0%', height: '0%', display: 'none' };
        }

        const startTotalMinutes = (startH - START_HOUR_WEEK) * 60 + startM;
        const endTotalMinutes = (endH - START_HOUR_WEEK) * 60 + endM;
        
        // ✅ CORREÇÃO DEFINITIVA: A duração visual é simplesmente END - START (em horas)
        // Exemplo: Se START=9 e END=17, a duração é 17 - 9 = 8 horas = 480 minutos
        // O grid tem 32rem de altura (8 slots × 4rem), então 100% = 8 horas
        const totalDurationMinutes = (END_HOUR_WEEK - START_HOUR_WEEK) * 60;

        // ✅ Evitar divisão por zero e durações negativas
        if (totalDurationMinutes <= 0) {
                          return { top: '0%', height: '0%', display: 'none' };
        }
        if (endTotalMinutes <= startTotalMinutes) {
                     }

        const top = (startTotalMinutes / totalDurationMinutes) * 100;
        const height = ((endTotalMinutes - startTotalMinutes) / totalDurationMinutes) * 100;

        // ✅ Log de Saída Detalhado
        const styleResult = { top: `${top}%`, height: `${height}%` };
        
        return styleResult;
    };

    const timeToPositionStyleMonth = (startTime: string, endTime: string) => {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        const startTotalMinutes = (startH - START_HOUR_MONTH) * 60 + startM;
        const endTotalMinutes = (endH - START_HOUR_MONTH) * 60 + endM;

        const totalDurationMinutes = (END_HOUR_MONTH - START_HOUR_MONTH) * 60;

        const left = (startTotalMinutes / totalDurationMinutes) * 100;
        const width = ((endTotalMinutes - startTotalMinutes) / totalDurationMinutes) * 100;

        // 🔍 DEBUG: Log detalhado do posicionamento
        const result = { left: `${Math.max(0, left)}%`, width: `${Math.min(100, width)}%` };
        
        return result;
    };

    // ✅ Componente AppointmentPopover - Exibe detalhes do agendamento
    const AppointmentPopover: React.FC<{ appointment: NonNullable<ScheduleSlot['details']> }> = ({ appointment }) => {
        const name = appointment.agentName || 'Agente';
        const fallbackAvatar = `https://i.pravatar.cc/150?u=${appointment.agentEmail}`;
        
        return (
            <div className="bg-white rounded-lg shadow-2xl p-4 w-64 border border-gray-200 text-sm z-50">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
                    <div>
                        <p className="font-bold text-gray-800 uppercase">{appointment.service}</p>
                        <p className="text-gray-500">{appointment.date}</p>
                        <p className="font-semibold text-blue-600">{appointment.time}</p>
                    </div>
                    <div className="w-3 h-3 rounded-full bg-blue-600 border-4 border-blue-100"></div>
                </div>
                
                {/* Cliente */}
                <div className="mb-3 pb-3 border-b border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cliente</p>
                    <p className="font-semibold text-gray-800">{appointment.client}</p>
                </div>
                
                {/* Agente */}
                <div className="flex items-center">
                    <img 
                        src={appointment.agentAvatar || fallbackAvatar} 
                        alt={name}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-md"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff`;
                        }}
                    />
                    <div className="ml-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Agente</p>
                        <p className="font-bold text-gray-800">{name}</p>
                    </div>
                </div>
            </div>
        );
    };

    // ✅ Handler de Mouse Enter - Cria e posiciona o popover
    const handleSlotMouseEnter = (e: React.MouseEvent, appointment: CalendarAppointment) => {
        const agent = agents.find(a => a.id === appointment.agentId);
        
        // ✅ FALLBACK INTELIGENTE: Se serviceId não encontrado, usa primeiro serviço disponível
        let service = services.find(s => s.id === appointment.serviceId);
        if (!service && services.length > 0) {
            service = services[0];
        }
        
        if (!agent || !service) return;

        const formattedDate = new Date(appointment.date + 'T00:00:00').toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        
        const formattedTime = `${appointment.startTime} - ${appointment.endTime}`;

        const appointmentDetails: NonNullable<ScheduleSlot['details']> = {
            id: appointment.id,
            service: service.name,
            client: appointment.clientName || 'Cliente não informado',
            agentName: agent.name,
            agentAvatar: agent.avatar,
            agentEmail: backendAgents.find(a => a.id === appointment.agentId)?.email || '',
            agentPhone: backendAgents.find(a => a.id === appointment.agentId)?.phone,
            date: formattedDate,
            time: formattedTime,
            serviceId: appointment.serviceId,
            locationId: appointment.locationId,
            status: appointment.status as any || 'Aprovado'
        };

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const POPOVER_ESTIMATED_HEIGHT = 156;
        const POPOVER_MARGIN = 8;
        
        const spaceBelow = window.innerHeight - rect.bottom;
        const hasSpaceBelow = spaceBelow >= POPOVER_ESTIMATED_HEIGHT + POPOVER_MARGIN;
        const hasSpaceAbove = rect.top >= POPOVER_ESTIMATED_HEIGHT + POPOVER_MARGIN;

        const positionAbove = !hasSpaceBelow && hasSpaceAbove;

        const style: React.CSSProperties = {
            position: 'fixed',
            left: `${rect.left}px`,
            top: positionAbove ? `${rect.top - POPOVER_MARGIN}px` : `${rect.bottom + POPOVER_MARGIN}px`,
            transform: positionAbove ? 'translateY(-100%)' : 'translateY(0)',
            zIndex: 50,
        };

        setPopover({
            visible: true,
            content: appointmentDetails,
            style: style,
        });
    };

    // ✅ Handler de Mouse Leave - Remove o popover
    const handleSlotMouseLeave = () => {
        setPopover(null);
    };

    const formatHeaderDate = () => {
        if (view === 'Semana') {
            const startMonth = weekStart.toLocaleString('pt-BR', { month: 'long' });
            const endMonth = weekEnd.toLocaleString('pt-BR', { month: 'long' });
            if (startMonth === endMonth) {
                return `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}`;
            }
            return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}`;
        }
        if (view === 'Mês') {
             return currentDate.toLocaleString('pt-BR', { month: 'long' });
        }
        return currentDate.toLocaleString('pt-BR', { month: 'long', day: 'numeric' });
    };

    const toISODateString = (date: Date) => {
        const pad = (num: number) => num.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };
    
    // ✅ CORREÇÃO CRÍTICA: Filtrar locais baseado no tipo de usuário
    // AGENTE: Mostrar apenas locais onde trabalha | ADMIN: Mostrar todos os locais
    const locationOptionsForHeader = useMemo(() => {
        if (userRole === 'AGENTE' && loggedInAgentId) {
            const agentData = backendAgents.find(a => a.id.toString() === loggedInAgentId);
            if (agentData && Array.isArray(agentData.unidades) && agentData.unidades.length > 0) {
                // Filtrar apenas locais onde o agente trabalha
                // 🔧 CORREÇÃO CRÍTICA: Converter location.id para string para comparação
                const agentLocations = locations.filter(location =>
                    agentData.unidades.includes(location.id.toString())
                );
                return agentLocations.map(l => l.name);
            }
        }
        // ADMIN ou fallback: Mostrar todos os locais
        return locations.map(l => l.name);
    }, [userRole, loggedInAgentId, backendAgents, locations]);

    // ✅ CORREÇÃO: selectedLocationName deve considerar apenas locais disponíveis para o usuário
    const selectedLocationName = useMemo(() => {
        // Buscar o nome do local selecionado
        const selectedLoc = locations.find(l => l.id === selectedLocationFilter);
        if (selectedLoc) {
            // Verificar se o local está disponível para o usuário atual
            if (userRole === 'AGENTE' && loggedInAgentId) {
                const agentData = backendAgents.find(a => a.id.toString() === loggedInAgentId);
                if (agentData && Array.isArray(agentData.unidades)) {
                    // Se o agente não trabalha neste local, mostrar o primeiro local disponível
                    // 🔧 CORREÇÃO CRÍTICA: Converter IDs para string para comparação
                    if (!agentData.unidades.includes(selectedLoc.id.toString())) {
                        const firstAvailableLocation = locations.find(l => agentData.unidades.includes(l.id.toString()));
                        return firstAvailableLocation?.name || 'Nenhum Local';
                    }
                }
            }
            return selectedLoc.name;
        }

        // Fallback: primeiro local disponível
        if (locationOptionsForHeader.length > 0) {
            return locationOptionsForHeader[0];
        }

        return 'Nenhum Local';
    }, [selectedLocationFilter, locations, userRole, loggedInAgentId, backendAgents, locationOptionsForHeader]);
    
    const handleLocationSelect = (locationName: string) => {

        const selectedLoc = locations.find(l => l.name === locationName);
        if (!selectedLoc) {
            console.error('❌ [CalendarPage] Local não encontrado:', locationName);
            return;
        }


        // ✅ VALIDAÇÃO CRÍTICA: AGENTE só pode selecionar locais onde trabalha
        if (userRole === 'AGENTE' && loggedInAgentId) {
            const agentData = backendAgents.find(a => a.id.toString() === loggedInAgentId);
            if (agentData && Array.isArray(agentData.unidades)) {
                // 🔧 CORREÇÃO CRÍTICA: Converter selectedLoc.id para string para comparação
                const selectedLocationIdStr = selectedLoc.id.toString();
                if (!agentData.unidades.includes(selectedLocationIdStr)) {
                    return; // Bloquear seleção
                }
            }
        }


        const locationIdStr = selectedLoc.id.toString();
        setSelectedLocationFilter(locationIdStr);
    };

    const renderDayView = () => {
        // 🛡️ GUARD CLAUSE: Impedir renderização se Multi-Plan sem local selecionado
        // REGRA DE NEGÓCIO: Usuários em plano Multi NUNCA devem visualizar agendamentos de múltiplos locais misturados
        if (isMultiPlan && (!selectedLocationFilter || selectedLocationFilter === 'all')) {
            return (
                <div className="flex-1 flex items-center justify-center p-10">
                    <div className="text-center">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">Nenhum local selecionado</h3>
                        <p className="mt-1 text-sm text-gray-500">Por favor, selecione um local no menu acima para visualizar a agenda.</p>
                    </div>
                </div>
            );
        }
        
        return (
        <div className="flex-1 overflow-auto p-4">
            <div className="flex">
                <div className="w-20 text-sm text-right pr-2">
                    {hoursDay.map(hour => (
                        <div key={hour} className="h-16 flex items-start justify-end pt-1">
                            <span className="text-gray-600 font-medium text-xs">{hour}:00</span>
                        </div>
                    ))}
                </div>
                <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${displayedAgents.length}, minmax(0, 1fr))` }}>
                    {displayedAgents.map(agent => {
                        const dateStr = toISODateString(currentDate);
                        
                        // ⚠️ IMPORTANTE: NÃO filtrar por horário (startTime/endTime)
                        // Todos os agendamentos do dia devem ser exibidos, mesmo os passados
                        // O usuário pode editar/finalizar agendamentos a qualquer momento
                        // 🛡️ REGRA DE NEGÓCIO: Filtro de local é ESTRITO (nunca 'all' para ADMIN/Multi)
                        // 🚫 REGRA DE NEGÓCIO: Agendamentos CANCELADOS não ocupam espaço no grid
                        const agentAppointments = appointments.filter(a => {
                            const agentIdMatch = a.agentId === agent.id.toString();
                            const dateMatch = a.date === dateStr;
                            const serviceMatch = selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter;
                            // ✅ CORREÇÃO CRÍTICA: Forçar comparação de strings para compatibilidade de tipos
                            const locationMatch = a.locationId.toString() === selectedLocationFilter;
                            // ✅ NOVO: Excluir agendamentos cancelados (libera espaço para novos agendamentos)
                            const notCancelled = a.status !== 'Cancelado';
                            
                            // 🔍 DEBUG: Log de filtro para cada agendamento
                            if (!locationMatch && agentIdMatch && dateMatch) {
                            }
                            
                            return agentIdMatch && dateMatch && serviceMatch && locationMatch && notCancelled;
                        });
                        
                        // 🔍 DEBUG DETALHADO: Log para TODOS os agentes
                                                
                        if (agent.id === '23' || agent.id === '25' || agent.id === '27') {
                                                    }
                        
                        const agentUnavailable = unavailableBlocks.filter(b => b.agentId === agent.id && (b.date === dateStr || !b.date));
                        
                        // 🎯 NOVO: Adicionar os intervalos do local
                        const locationIntervals = calculateLocationIntervalBlocks(currentDate);
                        
                        const busySlots = [
                            ...agentAppointments.map(a => ({ start: a.startTime, end: a.endTime, type: 'appointment' })),
                            ...agentUnavailable.map(u => ({ start: u.startTime, end: u.endTime, type: 'unavailable', id: u.id })),
                            // 🎯 NOVO: Adicionar intervalos do local como busySlots
                            ...locationIntervals.map(i => ({ start: i.start, end: i.end, type: 'interval', id: i.id }))
                        ].sort((a, b) => a.start.localeCompare(b.start));

                        // ✅ NOVA LÓGICA: Iterar sobre as horas do dia para slots individuais
                        // Se o grid vai de 8h a 21h, os slots clicáveis são 8h, 9h, ..., 20h
                        const iterableHours = Array.from({ length: END_HOUR_DAY - START_HOUR_DAY }, (_, i) => i + START_HOUR_DAY);

                        // ✅ NOVA LÓGICA: Helper para checar se a hora está livre
                        const isSlotAvailable = (hour: number) => {
                            const slotStart = `${hour.toString().padStart(2, '0')}:00`;
                            const slotEnd = `${(hour + 1).toString().padStart(2, '0')}:00`;

                            // Checa colisão com qualquer slot ocupado
                            for (const busy of busySlots) {
                                // (InícioOcupado < FimSlot) E (FimOcupado > InícioSlot)
                                if (busy.start < slotEnd && busy.end > slotStart) {
                                    return false; // Slot está ocupado
                                }
                            }
                            return true; // Slot está livre
                        };

                        return (
                            <div key={agent.id} className="relative border-l border-gray-200">
                                <div className="absolute inset-0">
                                    {hoursDay.map(hour => (
                                        <div key={`line-${hour}`} className="h-16 border-t border-gray-200"></div>
                                    ))}
                                </div>

                                {/* ✅ NOVA LÓGICA: Renderizar slots de 1 hora individuais */}
                                {iterableHours.map(hour => {
                                    const isAvailable = isSlotAvailable(hour);
                                    if (!isAvailable) {
                                        return null; // Não renderiza slot clicável
                                    }

                                    const slotStartStr = `${hour.toString().padStart(2, '0')}:00`;
                                    const slotEndStr = `${(hour + 1).toString().padStart(2, '0')}:00`;
                                    
                                    // ID do slot por hora
                                    const slotId = `${agent.id}-${dateStr}-${slotStartStr}-${slotEndStr}`;
                                    const isHovered = hoveredSlot === slotId;
                                    
                                    // Calcular Posição
                                    const top = timeToPercentageDay(slotStartStr);
                                    // Altura de 1 hora
                                    const height = timeToPercentageDay(slotEndStr) - top;

                                    return (
                                        <div
                                            key={slotId}
                                            className="absolute w-full cursor-pointer z-0"
                                            style={{ top: `${top}%`, height: `${height}%` }}
                                            onClick={() => handleSlotClick({ agent, startTime: slotStartStr, date: currentDate })}
                                            onMouseEnter={() => setHoveredSlot(slotId)}
                                            onMouseLeave={() => setHoveredSlot(null)}
                                        >
                                            <div 
                                                className="w-full h-full transition-all flex items-center justify-center"
                                                style={{
                                                    backgroundColor: isHovered ? '#DBEAFE' : 'transparent',
                                                    opacity: 1
                                                }}
                                            >
                                                {isHovered && <Plus className="w-5 h-5 text-blue-500" />}
                                            </div>
                                        </div>
                                    );
                                })}

                                {agentAppointments.map(app => {
                                    let service = services.find(s => s.id.toString() === app.serviceId);
                                    
                                    // Fallback: se serviço não encontrado, usar o primeiro disponível
                                    if (!service && services.length > 0) {
                                        service = services[0];
                                    }
                                    
                                    if (!service) {
                                        return null;
                                    }
                                    
                                    // ✅ CÁLCULO PRECISO: Alinhar cards com as linhas de horário
                                    // Cada linha tem 64px (h-16), e os horários estão centralizados com items-center
                                    // O card deve começar exatamente onde o horário está centralizado
                                    const top = timeToPercentageDay(app.startTime);
                                    const height = timeToPercentageDay(app.endTime) - top;
                                    
                                    // ✅ DEFINIR CLASSES CONDICIONAIS PARA TODOS OS ESTADOS ESPECIAIS
                                    const isApproved = app.status === 'Aprovado';
                                    const isCompleted = app.status === 'Concluído';
                                    const isCancelled = app.status === 'Cancelado';
                                    const isNoShow = app.status === 'Não Compareceu';

                                    let cardClasses, iconComponent;

                                    if (isApproved) {
                                        // ✅ APROVADO: #2663EB (azul escuro)
                                        cardClasses = 'text-white border border-blue-600';
                                        iconComponent = <Check className="absolute top-1 left-1 h-3 w-3 text-white" />;
                                    } else if (isCompleted) {
                                        // ✅ CONCLUÍDO: #DBEAFE (azul claro)
                                        cardClasses = 'text-blue-800 border border-blue-300';
                                        iconComponent = <Check className="absolute top-1 left-1 h-3 w-3 text-blue-600" />;
                                    } else if (isCancelled) {
                                        // ❌ CANCELADO: #FFE2E2 (vermelho claro)
                                        cardClasses = 'text-red-800 border border-red-300';
                                        iconComponent = <span className="absolute top-1 left-1 text-red-600 font-bold text-xs">✕</span>;
                                    } else if (isNoShow) {
                                        // ⚠️ NÃO COMPARECEU: #FEF9C3 (amarelo claro)
                                        cardClasses = 'text-yellow-800 border border-yellow-300';
                                        iconComponent = <span className="absolute top-1 left-1 text-yellow-600 font-bold text-xs">!</span>;
                                    } else {
                                        cardClasses = `${service.color} ${service.textColor}`;
                                        iconComponent = null;
                                    }

                                    const hasSpecialStatus = isApproved || isCompleted || isCancelled || isNoShow;

                                    // ✅ DEFINIR COR DE FUNDO CORRETA
                                    let backgroundColor = '';
                                    if (isApproved) {
                                        backgroundColor = '#2663EB'; // Azul escuro para aprovado
                                    } else if (isCompleted) {
                                        backgroundColor = '#DBEAFE'; // Azul claro para concluído
                                    } else if (isCancelled) {
                                        backgroundColor = '#FFE2E2'; // Vermelho claro para cancelado
                                    } else if (isNoShow) {
                                        backgroundColor = '#FEF9C3'; // Amarelo claro para não compareceu
                                    }

                                    return (
                                        <div
                                          key={app.id}
                                          onClick={() => handleAppointmentClick(app)}
                                          onMouseEnter={(e) => handleSlotMouseEnter(e, app)}
                                          onMouseLeave={handleSlotMouseLeave}
                                          className={`absolute w-full p-2 rounded-lg ${cardClasses} cursor-pointer hover:opacity-90 transition-opacity z-10 flex flex-col justify-center`}
                                          style={{
                                              top: `${top}%`,
                                              height: `${height}%`,
                                              ...(backgroundColor && { backgroundColor })
                                          }}>
                                            {/* Badge do ID no canto superior direito */}
                                            <div className="absolute top-1 right-1 bg-white px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-700 border border-gray-300 shadow-sm">
                                                #{app.id}
                                            </div>
                                            <p className={`font-bold text-xs ${hasSpecialStatus ? 'opacity-80' : ''}`}>{service.name}</p>
                                            <p className={`text-xs ${hasSpecialStatus ? 'opacity-80' : ''}`}>{app.startTime} - {app.endTime}</p>
                                            {/* Ícones para estados especiais */}
                                            {iconComponent}
                                        </div>
                                    )
                                })}
                                {/* 🎯 NOVO: Renderizar Bloqueios de Intervalo do Local (Junto com os AgentUnavailable) */}
                                {locationIntervals.map(block => {
                                    const top = timeToPercentageDay(block.start);
                                    const height = timeToPercentageDay(block.end) - top;
                                    
                                    // ✅ NOVO: Estilo diferenciado para exceções de calendário (estilo sutil como intervalos)
                                    const isException = block.type === 'exception';

                                    return (
                                        <div
                                            key={block.id}
                                            className={`absolute w-full ${isException ? 'bg-red-50' : 'bg-red-100'} rounded-lg z-5`}
                                            style={{ top: `${top}%`, height: `${height}%` }}
                                            title={isException ? `${block.exceptionType}: ${block.description}` : 'Intervalo de funcionamento'}
                                        >
                                            <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)' }}>
                                                {/* ✅ NOVO: Label sutil para exceções de calendário */}
                                                {isException && (
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <div className="bg-red-400 text-white px-2 py-1 rounded text-xs font-medium shadow-sm opacity-90">
                                                            🚫 {block.exceptionType}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {agentUnavailable.map(block => {
                                    const top = timeToPercentageDay(block.startTime);
                                    const height = timeToPercentageDay(block.endTime) - top;
                                    return (
                                        <div key={block.id} className="absolute w-full bg-red-100 rounded-lg z-5" style={{ top: `${top}%`, height: `${height}%` }}>
                                             <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)' }}></div>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
    };
    
    const renderWeekView = () => {
        // � DEBUG CRÍTICO: Log inicial da renderWeekView
        
        // �🛡️ GUARD CLAUSE: Impedir renderização se Multi-Plan sem local selecionado
        // REGRA DE NEGÓCIO: Usuários em plano Multi NUNCA devem visualizar agendamentos de múltiplos locais misturados
        if (isMultiPlan && (!selectedLocationFilter || selectedLocationFilter === 'all')) {
                        return (
                <div className="flex-1 flex items-center justify-center p-10">
                    <div className="text-center">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">Nenhum local selecionado</h3>
                        <p className="mt-1 text-sm text-gray-500">Por favor, selecione um local no menu acima para visualizar a agenda.</p>
                    </div>
                </div>
            );
        }
        
        // ✅ PASSO 1: VERIFICAR SE DADOS ESSENCIAIS ESTÃO CARREGADOS
        if (services.length === 0 || allAgents.length === 0) {
                        return <div className="p-4 text-center text-gray-500">Carregando dados da semana...</div>;
        }

        const selectedAgent = allAgents.find(a => a.id === selectedAgentId);
        
        // 🔍 DEBUG CRÍTICO: Verificar selectedAgentId e agendamentos
        
        return (
        <>
            <div className="flex items-center overflow-x-auto p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                    {displayedAgents.map(agent => (
                        <button 
                            key={agent.id}
                            onClick={() => setSelectedAgentId(agent.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${selectedAgentId === agent.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-100 border-gray-300'}`}
                        >
                            <img 
                                src={agent.avatar} 
                                alt={agent.name} 
                                className="w-6 h-6 rounded-full object-cover"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(agent.name)}&background=random`;
                                }}
                            />
                            {agent.name}
                        </button>
                    ))}
                </div>
            </div>
             <div className="flex-1 overflow-auto">
                <div className="flex flex-col">
                    <div className="flex sticky top-0 bg-white z-20 border-b border-gray-200">
                        <div className="w-20 flex-shrink-0"></div>
                        <div className="flex-1 grid grid-cols-7">
                            {weekDays.map(day => {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                const isToday = toISODateString(day) === toISODateString(today);
                                return (
                                <div key={day.toISOString()} className={`p-2 text-center border-l border-gray-200 ${isWeekend ? 'bg-yellow-50' : ''} ${isToday ? 'bg-blue-50' : ''}`}>
                                    <p className="text-xs text-gray-500 uppercase">{day.toLocaleString('pt-BR', { weekday: 'short' })}</p>
                                    <p className={`text-2xl font-semibold ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>{day.getDate()}</p>
                                </div>
                            )})}
                        </div>
                    </div>
                    
                    <div className="flex flex-1">
                        <div className="w-20 flex-shrink-0 text-sm text-right pr-2 border-r border-gray-200">
                             {/* Labels de horário inicial (9h-16h) */}
                             {hoursWeek.map(hour => (
                                <div key={hour} className="h-16 flex items-start justify-end pt-1 relative">
                                    <span className="text-gray-600 font-medium text-xs bg-white px-1">{hour}:00</span>
                                </div>
                            ))}
                            {/* ✅ NOVO: Label final (17:00) posicionado na base do último slot */}
                            <div key={END_HOUR_WEEK} className="h-0 flex items-start justify-end pt-1 relative -mt-4">
                                <span className="text-gray-600 font-medium text-xs bg-white px-1">{END_HOUR_WEEK}:00</span>
                            </div>
                        </div>

                        {/* ✅ CORREÇÃO DEFINITIVA: Altura = duração real (8 horas × 4rem = 32rem) */}
                        <div className="flex-1 grid grid-cols-7" style={{ height: `${(END_HOUR_WEEK - START_HOUR_WEEK) * 4}rem`}}>
                            {weekDays.map(day => {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                const dateStr = toISODateString(day);

                                // ⚠️ IMPORTANTE: NÃO filtrar por horário (startTime/endTime)
                                // Todos os agendamentos do dia devem ser exibidos, mesmo os passados
                                // O usuário pode editar/finalizar agendamentos a qualquer momento
                                // 🛡️ REGRA DE NEGÓCIO: Filtro de local é ESTRITO (nunca 'all' para ADMIN/Multi)
                                // 🚫 REGRA DE NEGÓCIO: Agendamentos CANCELADOS não ocupam espaço no grid
                                const agentAppointments = appointments.filter(a =>
                                    a.agentId === selectedAgentId.toString() &&
                                    a.date === dateStr &&
                                    (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                                    a.locationId.toString() === selectedLocationFilter && // ✅ CORREÇÃO: Forçar string
                                    a.status !== 'Cancelado' // ✅ NOVO: Excluir agendamentos cancelados (libera espaço)
                                );

                                // 🔍 DEBUG CRÍTICO: Comparar com visão diária
                                if (dateStr === '2025-10-28') {
                                                                    }

                                const agentUnavailable = unavailableBlocks.filter(b => b.agentId === selectedAgentId.toString() && (b.date === dateStr || !b.date));
                                
                                // 🎯 NOVO: Adicionar os intervalos do local para o dia atual
                                const locationIntervals = calculateLocationIntervalBlocks(day);
                                
                                const busySlots = [
                                    ...agentAppointments.map(a => ({ start: a.startTime, end: a.endTime, type: 'appointment' })),
                                    ...agentUnavailable.map(u => ({ start: u.startTime, end: u.endTime, type: 'unavailable', id: u.id })),
                                    // 🎯 NOVO: Adicionar intervalos do local como busySlots
                                    ...locationIntervals.map(i => ({ start: i.start, end: i.end, type: 'interval', id: i.id }))
                                ].sort((a, b) => a.start.localeCompare(b.start));
        
                                // ✅ CORREÇÃO DEFINITIVA: Slots clicáveis apenas para horas que iniciam (9h-16h = 8 slots)
                                // Cada slot representa 1 hora (ex: 9h-10h, 10h-11h, ..., 16h-17h)
                                const iterableHours = Array.from({ length: END_HOUR_WEEK - START_HOUR_WEEK }, (_, i) => i + START_HOUR_WEEK);

                                // ✅ NOVA LÓGICA: Helper para checar se a hora está livre
                                const isSlotAvailable = (hour: number) => {
                                    const slotStart = `${hour.toString().padStart(2, '0')}:00`;
                                    const slotEnd = `${(hour + 1).toString().padStart(2, '0')}:00`;
                                    for (const busy of busySlots) {
                                        if (busy.start < slotEnd && busy.end > slotStart) {
                                            return false;
                                        }
                                    }
                                    return true;
                                };

                                return (
                                <div key={dateStr} className={`relative border-l border-gray-200 ${isWeekend ? 'bg-yellow-50' : ''}`}>
                                    {/* Linhas pontilhadas do grid (9h-16h = 8 linhas) */}
                                    {hoursWeek.map(hour => (
                                        <div key={`line-${hour}`} className="h-16 border-t border-dashed border-gray-200"></div>
                                    ))}
                                    {/* ✅ NOVO: Linha pontilhada final (17:00) para fechar o grid */}
                                    <div key={`line-${END_HOUR_WEEK}`} className="h-0 border-t border-dashed border-gray-200"></div>

                                    {/* ✅ NOVA LÓGICA: Renderizar slots de 1 hora individuais */}
                                    {selectedAgent && iterableHours.map(hour => {
                                        const isAvailable = isSlotAvailable(hour);
                                        if (!isAvailable) {
                                            return null;
                                        }
                                        
                                        const slotStartStr = `${hour.toString().padStart(2, '0')}:00`;
                                        const slotEndStr = `${(hour + 1).toString().padStart(2, '0')}:00`;
                                        
                                        // ID do slot por hora
                                        const slotId = `${selectedAgent.id}-${dateStr}-${slotStartStr}-${slotEndStr}`;
                                        const isHovered = hoveredSlot === slotId;
                                        
                                        return (
                                            <div
                                                key={slotId}
                                                className="absolute w-full cursor-pointer z-0"
                                                // Usar a função de posicionamento da semana
                                                style={timeToPositionStyleWeek(slotStartStr, slotEndStr)}
                                                onClick={() => handleSlotClick({ agent: selectedAgent, startTime: slotStartStr, date: day })}
                                                onMouseEnter={() => setHoveredSlot(slotId)}
                                                onMouseLeave={() => setHoveredSlot(null)}
                                            >
                                                <div 
                                                    className="w-full h-full transition-all flex items-center justify-center"
                                                    style={{
                                                        backgroundColor: isHovered ? '#DBEAFE' : 'transparent',
                                                        opacity: 1
                                                    }}
                                                >
                                                    {isHovered && <Plus className="w-5 h-5 text-blue-500" />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {agentAppointments.map(app => {
                                        // ✅ Buscar serviço usando o ID real do banco de dados
                                        let service = services.find(s => s.id.toString() === app.serviceId);

                                        // ✅ LÓGICA DE FALLBACK CRÍTICA (REPLICADA DO renderDayView)
                                        if (!service && services.length > 0) {
                                            service = services[0];
                                        }

                                        if (!service) {
                                                                                        return null;
                                        }

                                        const style = timeToPositionStyleWeek(app.startTime, app.endTime);

                                        // ✅ Log Final Antes de Renderizar o Card
                                                                                // 🔍 DEBUG CRÍTICO: Investigar status dos agendamentos
                                        
                                        // ✅ DEFINIR CLASSES CONDICIONAIS PARA TODOS OS ESTADOS ESPECIAIS
                                        const isApproved = app.status === 'Aprovado';
                                        const isCompleted = app.status === 'Concluído';
                                        const isCancelled = app.status === 'Cancelado';
                                        const isNoShow = app.status === 'Não Compareceu';

                                        let cardClasses, iconComponent;

                                        if (isApproved) {
                                            // ✅ APROVADO: #2663EB (azul escuro)
                                            cardClasses = 'text-white border border-blue-600';
                                            iconComponent = <Check className="absolute top-1 left-1 h-3 w-3 text-white" />;
                                        } else if (isCompleted) {
                                            // ✅ CONCLUÍDO: #DBEAFE (azul claro)
                                            cardClasses = 'text-blue-800 border border-blue-300';
                                            iconComponent = <Check className="absolute top-1 left-1 h-3 w-3 text-blue-600" />;
                                        } else if (isCancelled) {
                                            // ❌ CANCELADO: #FFE2E2 (vermelho claro)
                                            cardClasses = 'text-red-800 border border-red-300';
                                            iconComponent = <span className="absolute top-1 left-1 text-red-600 font-bold text-xs">✕</span>;
                                        } else if (isNoShow) {
                                            // ⚠️ NÃO COMPARECEU: #FEF9C3 (amarelo claro)
                                            cardClasses = 'text-yellow-800 border border-yellow-300';
                                            iconComponent = <span className="absolute top-1 left-1 text-yellow-600 font-bold text-xs">!</span>;
                                        } else {
                                            cardClasses = `${service.color} ${service.textColor}`;
                                            iconComponent = null;
                                        }

                                        const hasSpecialStatus = isApproved || isCompleted || isCancelled || isNoShow;

                                        // ✅ DEFINIR COR DE FUNDO CORRETA (IGUAL AO GRID DIÁRIO)
                                        let backgroundColor = '';
                                        if (isApproved) {
                                            backgroundColor = '#2663EB'; // Azul escuro para aprovado
                                        } else if (isCompleted) {
                                            backgroundColor = '#DBEAFE'; // Azul claro para concluído
                                        } else if (isCancelled) {
                                            backgroundColor = '#FFE2E2'; // Vermelho claro para cancelado
                                        } else if (isNoShow) {
                                            backgroundColor = '#FEF9C3'; // Amarelo claro para não compareceu
                                        }

                                        return (
                                            <div
                                              key={app.id}
                                              onClick={() => handleAppointmentClick(app)}
                                              onMouseEnter={(e) => handleSlotMouseEnter(e, app)}
                                              onMouseLeave={handleSlotMouseLeave}
                                              className={`absolute w-[calc(100%-4px)] ml-[2px] p-2 rounded-lg ${cardClasses} z-10 cursor-pointer hover:opacity-90 transition-opacity flex flex-col`}
                                              style={{
                                                  ...style,
                                                  ...(backgroundColor && { backgroundColor })
                                              }}>
                                                {/* Ícones para estados especiais */}
                                                {iconComponent}
                                                <p className={`font-bold text-xs whitespace-nowrap overflow-hidden text-ellipsis ${hasSpecialStatus ? 'opacity-80' : ''}`}>{service.name}</p>
                                                {/* Horário e ID na mesma linha (Grid Semana) */}
                                                <div className="flex items-center gap-1.5">
                                                    <p className={`text-xs ${hasSpecialStatus ? 'opacity-80' : ''}`}>{app.startTime} - {app.endTime}</p>
                                                    <div className="inline-flex bg-white px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-700 border border-gray-300 shadow-sm">
                                                        #{app.id}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* 🎯 NOVO: Renderizar Bloqueios de Intervalo do Local (Junto com os AgentUnavailable) */}
                                    {locationIntervals.map(block => {
                                        return (
                                            <div key={block.id} className="absolute w-full bg-red-50 rounded-lg z-5" style={timeToPositionStyleWeek(block.start, block.end)}>
                                                <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)' }}></div>
                                            </div>
                                        )
                                    })}
                                    {agentUnavailable.map(block => {
                                        return (
                                            <div key={block.id} className="absolute w-full bg-red-50 rounded-lg z-5" style={timeToPositionStyleWeek(block.startTime, block.endTime)}>
                                                 <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)' }}></div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )})}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )};

    const renderMonthView = () => {
        // � DEBUG CRÍTICO: Log inicial da renderMonthView
        
        // �🛡️ GUARD CLAUSE: Impedir renderização se Multi-Plan sem local selecionado
        // REGRA DE NEGÓCIO: Usuários em plano Multi NUNCA devem visualizar agendamentos de múltiplos locais misturados
        if (isMultiPlan && (!selectedLocationFilter || selectedLocationFilter === 'all')) {
                        return (
                <div className="flex-1 flex items-center justify-center p-10">
                    <div className="text-center">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">Nenhum local selecionado</h3>
                        <p className="mt-1 text-sm text-gray-500">Por favor, selecione um local no menu acima para visualizar a agenda.</p>
                    </div>
                </div>
            );
        }
        
        return (
        <div className="flex-1 overflow-auto">
            <div className="flex sticky top-0 bg-white z-20 border-b border-gray-200">
                <div className="w-40 p-3 font-semibold text-gray-700">Data Selecionada</div>
                {displayedAgents.map(agent => (
                    <div key={agent.id} className="flex-1 p-3 font-semibold text-gray-700 flex items-center gap-2 border-l border-gray-200">
                        <img src={agent.avatar} alt={agent.name} className="w-6 h-6 rounded-full" />
                        <span>{agent.name}</span>
                    </div>
                ))}
            </div>
            <div className="divide-y divide-gray-200">
                {daysInCurrentMonth.map(day => {
                    const dateStr = toISODateString(day);
                    const isToday = toISODateString(today) === dateStr;
                    return (
                        <div key={dateStr} className="flex h-12">
                            <div className={`w-40 px-3 py-1 flex-shrink-0 relative ${isToday ? 'bg-blue-50' : ''} flex items-center`}>
                                {isToday && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>}
                                <div className="flex items-center gap-2">
                                     <span className={`font-bold text-lg ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>{day.getDate()}</span>
                                     <span className={`text-sm uppercase font-medium ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>{day.toLocaleString('pt-BR', { weekday: 'short' })}</span>
                                </div>
                            </div>
                            {displayedAgents.map(agent => {
                                // ⚠️ IMPORTANTE: NÃO filtrar por horário (startTime/endTime)
                                // Todos os agendamentos do dia devem ser exibidos, mesmo os passados
                                // O usuário pode editar/finalizar agendamentos a qualquer momento
                                // 🛡️ REGRA DE NEGÓCIO: Filtro de local é ESTRITO (nunca 'all' para ADMIN/Multi)
                                // 🚫 REGRA DE NEGÓCIO: Agendamentos CANCELADOS não ocupam espaço no grid
                                const agentAppointments = appointments.filter(a =>
                                    a.agentId === agent.id.toString() &&
                                    a.date === dateStr &&
                                    (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                                    a.locationId.toString() === selectedLocationFilter && // ✅ CORREÇÃO: Forçar string
                                    a.status !== 'Cancelado' // ✅ NOVO: Excluir agendamentos cancelados (libera espaço)
                                );

                                // 🔍 DEBUG: Log dos agendamentos encontrados
                                if (dateStr === '2025-10-28') {
                                                                    }
                                if (agentAppointments.length > 0) {
                                                                    }
                                const agentUnavailable = unavailableBlocks.filter(b => b.agentId === agent.id && (b.date === dateStr || !b.date));
                                
                                // 🎯 NOVO: Adicionar os intervalos do local para o dia atual
                                const locationIntervals = calculateLocationIntervalBlocks(day);
                                
                                const busySlots = [
                                    ...agentAppointments.map(a => ({ start: a.startTime, end: a.endTime, type: 'appointment' })),
                                    ...agentUnavailable.map(u => ({ start: u.startTime, end: u.endTime, type: 'unavailable', id: u.id })),
                                    // 🎯 NOVO: Adicionar intervalos do local como busySlots
                                    ...locationIntervals.map(i => ({ start: i.start, end: i.end, type: 'interval', id: i.id }))
                                ].sort((a, b) => a.start.localeCompare(b.start));
        
                                // ✅ CORREÇÃO DEFINITIVA: Slots clicáveis apenas para horas que iniciam (9h-16h = 8 slots)
                                // Cada slot representa 1 hora (ex: 9h-10h, 10h-11h, ..., 16h-17h)
                                const iterableHours = Array.from({ length: END_HOUR_MONTH - START_HOUR_MONTH }, (_, i) => i + START_HOUR_MONTH);
        
                                // ✅ NOVA LÓGICA: Helper para checar se a hora está livre
                                const isSlotAvailable = (hour: number) => {
                                    const slotStart = `${hour.toString().padStart(2, '0')}:00`;
                                    const slotEnd = `${(hour + 1).toString().padStart(2, '0')}:00`;
                                    for (const busy of busySlots) {
                                        if (busy.start < slotEnd && busy.end > slotStart) {
                                            return false;
                                        }
                                    }
                                    return true;
                                };
                                
                                return (
                                <div key={agent.id} className="flex-1 px-1 border-l border-gray-200 flex items-center">
                                    <div className="relative w-full h-6 bg-gray-50 rounded">
                                        {/* ✅ NOVA LÓGICA: Renderizar slots de 1 hora individuais */}
                                        {iterableHours.map(hour => {
                                            const isAvailable = isSlotAvailable(hour);
                                            if (!isAvailable) {
                                                return null;
                                            }
                                            
                                            const slotStartStr = `${hour.toString().padStart(2, '0')}:00`;
                                            const slotEndStr = `${(hour + 1).toString().padStart(2, '0')}:00`;
                                            
                                            // ID do slot por hora
                                            const slotId = `${agent.id}-${dateStr}-${slotStartStr}-${slotEndStr}`;
                                            const isHovered = hoveredSlot === slotId;
                                            
                                            return (
                                                <div
                                                    key={slotId}
                                                    className="absolute h-full rounded cursor-pointer transition-all z-0"
                                                    style={{
                                                        ...timeToPositionStyleMonth(slotStartStr, slotEndStr),
                                                        backgroundColor: isHovered ? '#DBEAFE' : 'transparent',
                                                        opacity: 1
                                                    }}
                                                    onClick={() => handleSlotClick({ agent, startTime: slotStartStr, date: day })}
                                                    onMouseEnter={() => setHoveredSlot(slotId)}
                                                    onMouseLeave={() => setHoveredSlot(null)}
                                                ></div>
                                            );
                                        })}

                                        {agentAppointments.map((app, index) => {
                                            // ✅ DEBUG CRÍTICO: Log do objeto app ANTES de renderizar
                                            
                                            // ✅ Buscar serviço usando o ID real do banco de dados
                                            let service = services.find(s => s.id.toString() === app.serviceId);

                                            // ✅ LÓGICA DE FALLBACK CRÍTICA (REPLICADA DO renderDayView)
                                            if (!service && services.length > 0) {
                                                service = services[0];
                                            }

                                            if (!service) {
                                                console.error('❌ [renderMonthView] Serviço não encontrado para agendamento:', app.id);
                                                return null;
                                            }

                                            // ✅ REFATORAR: Classes e Background Unificados
                                            const isApproved = app.status === 'Aprovado';
                                            const isCompleted = app.status === 'Concluído';
                                            const isCancelled = app.status === 'Cancelado';
                                            const isNoShow = app.status === 'Não Compareceu';

                                            let cardClasses = '';
                                            let indicatorComponent = null;
                                            let tooltipSuffix = '';

                                            if (isApproved) {
                                                // ✅ APROVADO: bg-* direto na classe
                                                cardClasses = 'bg-blue-600 border border-blue-700 text-white';
                                                indicatorComponent = <div className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-white rounded-full m-0.5 opacity-75"></div>;
                                                tooltipSuffix = ' - Aprovado';
                                            } else if (isCompleted) {
                                                // ✅ CONCLUÍDO: bg-* direto na classe
                                                cardClasses = 'bg-blue-100 border border-blue-300 text-blue-800';
                                                indicatorComponent = <div className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-blue-400 rounded-full m-0.5"></div>;
                                                tooltipSuffix = ' - Concluído';
                                            } else if (isCancelled) {
                                                // ❌ CANCELADO: bg-* direto na classe
                                                cardClasses = 'bg-red-100 border border-red-300 text-red-800';
                                                indicatorComponent = <div className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-red-500 rounded-full m-0.5"></div>;
                                                tooltipSuffix = ' - Cancelado';
                                            } else if (isNoShow) {
                                                // ⚠️ NÃO COMPARECEU: bg-* direto na classe
                                                cardClasses = 'bg-yellow-100 border border-yellow-300 text-yellow-800';
                                                indicatorComponent = <div className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-yellow-500 rounded-full m-0.5"></div>;
                                                tooltipSuffix = ' - Não Compareceu';
                                            } else {
                                                // Fallback para cor do serviço
                                                cardClasses = service.color || 'bg-gray-200 border border-gray-300';
                                                indicatorComponent = null;
                                                tooltipSuffix = '';
                                            }

                                            // ✅ CALCULAR apenas posição horizontal (sem empilhamento vertical)
                                            const positionStyle = timeToPositionStyleMonth(app.startTime, app.endTime);

                                            return (
                                                <div
                                                  key={app.id}
                                                  onClick={() => handleAppointmentClick(app)}
                                                  onMouseEnter={(e) => handleSlotMouseEnter(e, app)}
                                                  onMouseLeave={handleSlotMouseLeave}
                                                  className={`absolute h-full rounded ${cardClasses} cursor-pointer hover:opacity-80 transition-opacity z-10`}
                                                  style={positionStyle}
                                                  title={`${service.name} (${app.startTime}-${app.endTime})${tooltipSuffix}`}
                                                >
                                                    {indicatorComponent}
                                                </div>
                                            )
                                        })}
                                         {/* 🎯 NOVO: Renderizar Bloqueios de Intervalo do Local (Junto com os AgentUnavailable) */}
                                         {locationIntervals.map(block => {
                                            return (
                                                <div key={block.id} className="absolute h-full bg-red-50 z-5" style={timeToPositionStyleMonth(block.start, block.end)}>
                                                     <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)' }}></div>
                                                </div>
                                            )
                                         })}
                                         {agentUnavailable.map(block => {
                                            return (
                                                <div key={block.id} className="absolute h-full bg-red-50 z-5" style={timeToPositionStyleMonth(block.startTime, block.endTime)}>
                                                     <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)' }}></div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )})}
                        </div>
                    );
                })}
            </div>
        </div>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">

            {/* Mensagem de erro */}
            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Indicador de loading */}
            {isLoading && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
                    <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        <p className="mt-4 text-gray-600">Carregando agendamentos...</p>
                    </div>
                </div>
            )}

            <div className="p-4 border-b border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-baseline gap-4">
                        <span className="text-4xl text-gray-300 font-light">{currentDate.getFullYear()}</span>
                        <h1 className="text-3xl text-blue-600 font-bold capitalize">
                           {formatHeaderDate()}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleToday} className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50">
                            <span className="relative flex h-2 w-2 mr-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            Hoje
                        </button>
                        <button onClick={handlePrev} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                            <ChevronLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <button onClick={handleNext} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                            <ChevronRight className="h-5 w-5 text-gray-600" />
                        </button>
                        {/* 📍 DROPDOWN DE SELEÇÃO DE LOCAL - Visível quando há múltiplos locais disponíveis para o usuário */}
                        {locationOptionsForHeader.length > 1 && (
                            <HeaderDropdown
                                options={locationOptionsForHeader}
                                selected={selectedLocationName}
                                onSelect={handleLocationSelect}
                            />
                        )}
                        <HeaderDropdown
                            options={['Dia', 'Semana', 'Mês']}
                            selected={view}
                            onSelect={setView}
                        />
                    </div>
                </div>
            </div>

            {view === 'Dia' && (
                <>
                    {/* 🎨 BARRA DE NAVEGAÇÃO DE DIAS DO MÊS - MELHORADA */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                        <button 
                            onClick={handlePrev} 
                            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            aria-label="Dia anterior"
                        >
                            <ChevronLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        
                        <div ref={dayNavigationRef} className="flex items-center gap-1 overflow-x-auto mx-2 scrollbar-hide">
                        {daysInCurrentMonth.map(day => {
                            const dateStr = toISODateString(day);
                            const isSelected = day.getDate() === currentDate.getDate() && day.getMonth() === currentDate.getMonth();
                            const isToday = day.getDate() === today.getDate() && day.getMonth() === today.getMonth() && day.getFullYear() === today.getFullYear();
                            
                            // 🎯 NOVO: Verificar se o dia tem agendamentos
                            const hasAppointments = appointments.some(a => 
                                a.date === dateStr &&
                                (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                                (selectedAgentFilter === 'all' || a.agentId === selectedAgentFilter) &&
                                a.locationId.toString() === selectedLocationFilter // ✅ CORREÇÃO: Forçar string
                            );
                            
                            // 🎯 NOVO: Verificar se o dia está fechado (unidade não funciona)
                            const dayIndex = getDayOfWeekIndex(day);
                            const schedules = selectedLocationFilter && selectedLocationFilter !== 'all'
                                ? unitSchedules[selectedLocationFilter]
                                : null;
                            const daySchedule = schedules?.find(s => s.dia_semana === dayIndex);

                            // ✅ NOVO: Verificar se há exceção de calendário para este dia
                            const exception = selectedLocationFilter && selectedLocationFilter !== 'all'
                                ? isDateBlockedByException(day, selectedLocationFilter)
                                : null;

                            const isClosed = !daySchedule || !daySchedule.is_aberto || !!exception;
                            
                            // 🎨 CLASSES CONDICIONAIS APRIMORADAS
                            let containerClass = 'relative flex flex-col items-center flex-shrink-0 transition-all ';
                            let buttonClass = 'h-10 w-10 rounded-lg text-sm font-semibold transition-all ';
                            let indicatorClass = '';
                            
                            if (isSelected) {
                                // Dia selecionado: fundo azul sólido
                                buttonClass += 'bg-blue-600 text-white shadow-md';
                            } else if (isToday) {
                                // Dia atual: fundo azul claro com borda
                                buttonClass += 'bg-blue-100 text-blue-700 font-bold border-2 border-blue-400';
                            } else if (isClosed) {
                                // Dia fechado: texto cinza claro, sem hover
                                buttonClass += 'text-gray-400 cursor-not-allowed';
                            } else {
                                // Dia normal: hover suave
                                buttonClass += 'text-gray-700 hover:bg-gray-200';
                            }
                            
                            // 🎯 INDICADOR VERDE: Apenas para dias com agendamentos E abertos
                            if (hasAppointments && !isClosed) {
                                indicatorClass = 'absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 h-1 w-6 bg-green-500 rounded-full';
                            }

                            // 🎯 NOVO: Tooltip com dia da semana e informações de exceção
                            const weekdayName = day.toLocaleString('pt-BR', { weekday: 'long' });
                            let tooltipText = `${weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1)}, ${day.getDate()} de ${day.toLocaleString('pt-BR', { month: 'long' })}`;

                            if (exception) {
                                tooltipText = `${exception.tipo}: ${exception.descricao}`;
                            } else if (!daySchedule || !daySchedule.is_aberto) {
                                tooltipText = 'Unidade fechada';
                            }
                            
                            return (
                                <div key={day.getDate()} className={containerClass}>
                                    <button 
                                        onClick={() => !isClosed && setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day.getDate()))} 
                                        className={buttonClass}
                                        disabled={isClosed}
                                        title={tooltipText}
                                    >
                                        {day.getDate()}
                                    </button>
                                    {/* 🎯 INDICADOR DE AGENDAMENTOS */}
                                    {indicatorClass && <div className={indicatorClass}></div>}
                                </div>
                            )
                        })}
                        </div>
                        
                        <button 
                            onClick={handleNext} 
                            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            aria-label="Próximo dia"
                        >
                            <ChevronRight className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                    
                    {/* Header dos agentes - FIXO */}
                    <div className="flex border-b-2 border-gray-300 bg-white shadow-sm">
                        <div className="w-20 flex-shrink-0"></div>
                        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${displayedAgents.length}, minmax(0, 1fr))` }}>
                            {displayedAgents.map(agent => (
                                <div key={agent.id} className="flex items-center gap-2 px-3 py-2.5 border-l border-gray-200">
                                    <img 
                                        src={agent.avatar} 
                                        alt={agent.name} 
                                        className="w-7 h-7 rounded-full object-cover ring-2 ring-white"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(agent.name)}&background=random`;
                                        }}
                                    />
                                    <span className="text-sm font-semibold text-gray-900">{agent.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
            
            {view === 'Dia' && renderDayView()}
            {view === 'Semana' && renderWeekView()}
            {view === 'Mês' && renderMonthView()}
            
            <NewAppointmentModal
                isOpen={isModalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setModalData(null);
                    // ✅ CORREÇÃO: Recarregar agendamentos após fechar o modal
                    // Isso garante que o calendário mostre o novo agendamento criado/editado
                    loadAppointmentsForDateRange();
                }}
                appointmentData={modalData?.appointment}
                newSlotData={modalData?.newSlot}
                selectedLocationId={selectedLocationFilter} // ✅ PASSAR LOCAL SELECIONADO
            />
            
            {/* ✅ Portal do Popover - Renderizado fora da hierarquia do DOM */}
            {popover?.visible && popover.content && createPortal(
                <div style={popover.style}>
                    <AppointmentPopover appointment={popover.content} />
                </div>,
                document.body
            )}
        </div>
    );
};

export default CalendarPage;
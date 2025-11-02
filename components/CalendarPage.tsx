import React, { useState, useMemo, useRef, useEffect } from 'react';
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
            <button onClick={() => setIsOpen(!isOpen)} className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-50 min-w-[120px] justify-between">
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

interface FilterDropdownProps {
    label: string;
    options: { value: string; label: string }[];
    selectedValue: string;
    onSelect: (value: string) => void;
    disabled?: boolean;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ label, options, selectedValue, onSelect, disabled }) => {
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
    
    const selectedOptionLabel = options.find(opt => opt.value === selectedValue)?.label || `Todos`;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed w-48 justify-between"
            >
                <span className="truncate">{label}: {selectedOptionLabel}</span>
                <ChevronDown className={`h-4 w-4 ml-2 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-30 py-1">
                    {options.map(option => (
                        <a
                            key={option.value}
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                onSelect(option.value);
                                setIsOpen(false);
                            }}
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            {selectedValue === option.value && <Check className="h-4 w-4 mr-2 text-blue-600" />}
                            <span className={`${selectedValue !== option.value ? 'ml-6' : ''} truncate`}>{option.label}</span>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

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
        isLoading,
        error,
        loadAllData,
        fetchAppointments
    } = useCalendarData();

    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('Dia');
    const [showFilters, setShowFilters] = useState(false);
    const [isModalOpen, setModalOpen] = useState(false);
    const [modalData, setModalData] = useState<{
        appointment?: ScheduleSlot['details'];
        newSlot?: { agent: Agent, start: number, date: Date };
    } | null>(null);
    const [selectedServiceFilter, setSelectedServiceFilter] = useState('all');
    const [selectedAgentFilter, setSelectedAgentFilter] = useState('all');
    const [selectedLocationFilter, setSelectedLocationFilter] = useState('all');

    // 🔍 DEBUG: Verificar se dados estão sendo carregados
    useEffect(() => {
        console.log('🔍 [CalendarPage] Dados do useCalendarData:', {
            backendAgents: backendAgents.length,
            backendServices: backendServices.length,
            backendLocations: backendLocations.length,
            backendAppointments: backendAppointments.length,
            isLoading,
            error,
            locations: backendLocations
        });
    }, [backendAgents.length, backendServices.length, backendLocations.length, backendAppointments.length, isLoading, error]);

    // Converter dados do backend para formato do componente
    const agents: Agent[] = useMemo(() => {
        return backendAgents.map(agent => ({
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar
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

    const appointments: (Appointment & { date: string; status?: string })[] = useMemo(() => {
        return backendAppointments.map(appointment => ({
            id: appointment.id,
            agentId: appointment.agentId,
            serviceId: appointment.serviceId,
            locationId: appointment.locationId,
            startTime: appointment.startTime,
            endTime: appointment.endTime,
            date: appointment.date,
            status: appointment.status // ✅ INCLUIR STATUS PARA DESTAQUE VISUAL
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
            
            schedules.forEach(schedule => {
                if (schedule.is_aberto && schedule.horarios_json && schedule.horarios_json.length > 0) {
                    schedule.horarios_json.forEach(periodo => {
                        const startH = parseInt(periodo.inicio.split(':')[0]);
                        const endH = parseInt(periodo.fim.split(':')[0]);
                        
                        if (startH < minHour) minHour = startH;
                        if (endH > maxHour) maxHour = endH;
                    });
                }
            });
            
            // Se encontrou horários válidos, usar eles
            if (minHour < 23 && maxHour > 0) {
                console.log(`📅 [CalendarPage] Usando horários da unidade: ${minHour}:00 - ${maxHour}:00`);
                return { startHour: minHour, endHour: maxHour };
            }
        }
        
        // Fallback: usar horários padrão
        console.log('📅 [CalendarPage] Usando horários padrão: 8:00 - 21:00');
        return { startHour: 8, endHour: 21 };
    }, [selectedLocationFilter, unitSchedules]);

    const START_HOUR_DAY = startHour;
    const END_HOUR_DAY = endHour;
    const hoursDay = Array.from({ length: END_HOUR_DAY - START_HOUR_DAY + 1 }, (_, i) => i + START_HOUR_DAY);

    const START_HOUR_WEEK = 9;
    const END_HOUR_WEEK = 21;
    // ✅ CORREÇÃO: Grid visual tem slots de 9h até 21h (inclusive), total de 13 slots
    // Array: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
    const hoursWeek = Array.from({ length: END_HOUR_WEEK - START_HOUR_WEEK + 1 }, (_, i) => i + START_HOUR_WEEK);

    const START_HOUR_MONTH = 9;
    const END_HOUR_MONTH = 21;

    const allAgents = useMemo(() => {
        if (loggedInAgentId) {
            return agents.filter(agent => agent.id === loggedInAgentId);
        }
        return agents;
    }, [loggedInAgentId, agents]);

    const displayedAgents = useMemo(() => {
        if (view !== 'Semana' && selectedAgentFilter !== 'all') {
             return allAgents.filter(agent => agent.id === selectedAgentFilter);
        }
        return allAgents;
    }, [allAgents, selectedAgentFilter, view]);
    
    const [selectedAgentId, setSelectedAgentId] = useState('');
    
    useEffect(() => {
        if (loggedInAgentId) {
            setSelectedAgentFilter(loggedInAgentId);
            // ✅ CORREÇÃO CRÍTICA: Para AGENTE, usar o ID do agente do array allAgents, não o loggedInAgentId
            // O loggedInAgentId pode ser diferente do agent.id no array
            if (allAgents.length > 0) {
                const agentInList = allAgents.find(a => a.id === loggedInAgentId);
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
            console.log('🔧 [CalendarPage] Auto-selecionando primeiro agente:', {
                firstAgentId,
                firstAgentName: allAgents[0].name,
                view,
                allAgentsIds: allAgents.map(a => ({ id: a.id, name: a.name }))
            });
            setSelectedAgentId(firstAgentId);
        }
    }, [allAgents, selectedAgentId, view]);
    
    // Log controlado para debug (apenas quando dados mudarem)
    useEffect(() => {
        console.log('🔍 [CalendarPage] Estado atualizado:', {
            userRole,
            loggedInAgentId,
            totalAgents: agents.length,
            allAgents: allAgents.length,
            displayedAgents: displayedAgents.length,
            totalServices: services.length,
            totalAppointments: appointments.length,
            currentDate: toISODateString(currentDate),
            agentsList: agents.map(a => ({ id: a.id, name: a.name })),
            allAgentsList: allAgents.map(a => ({ id: a.id, name: a.name })),
            servicesList: services.map(s => ({ id: s.id, name: s.name })),
            appointmentsSample: appointments.slice(0, 10).map(a => ({
                id: a.id,
                agentId: a.agentId,
                serviceId: a.serviceId,
                date: a.date,
                time: `${a.startTime}-${a.endTime}`
            }))
        });
        
        // 🔍 DEBUG CRÍTICO: Mostrar TODOS os agendamentos
        console.log('📋 [CalendarPage] TODOS OS AGENDAMENTOS:', appointments);

        // 🔍 DEBUG CRÍTICO: Comparar IDs dos agentes
        console.log('🆔 [CalendarPage] COMPARAÇÃO DE IDs:', {
            selectedAgentId,
            selectedAgentIdType: typeof selectedAgentId,
            allAgentsIds: allAgents.map(a => ({ id: a.id, name: a.name, type: typeof a.id })),
            appointmentAgentIds: [...new Set(appointments.map(a => a.agentId))].map(id => ({ id, type: typeof id })),
            lucasAndradeInAgents: allAgents.find(a => a.name.includes('Lucas')),
            lucasAndradeAppointments: appointments.filter(a => a.agentId === '25').length
        });
        
        // 🔍 DEBUG: Agrupar por data
        const appointmentsByDate = appointments.reduce((acc, app) => {
            if (!acc[app.date]) acc[app.date] = [];
            acc[app.date].push(app);
            return acc;
        }, {} as Record<string, typeof appointments>);
        console.log('📅 [CalendarPage] Agendamentos por data:', appointmentsByDate);
        
        // 🔍 DEBUG: Verificar data atual
        const currentDateStr = toISODateString(currentDate);
        const appointmentsForToday = appointments.filter(a => a.date === currentDateStr);
        console.log(`📍 [CalendarPage] Agendamentos para ${currentDateStr}:`, appointmentsForToday);
    }, [agents.length, allAgents.length, displayedAgents.length, services.length, appointments.length, currentDate]);

    // ✅ REFATORADO: Auto-seleção de local baseada no PLANO, não no ROLE
    // Aplica-se a ADMIN e AGENTE em plano Multi
    useEffect(() => {
        if (locations.length === 0 || selectedLocationFilter !== 'all') return;

        // Caso 1: Plano Single (sempre seleciona o primeiro)
        if (isSinglePlan) {
            console.log('🔧 [CalendarPage] Auto-selecting single location:', locations[0]);
            setSelectedLocationFilter(locations[0].id);
            return;
        }

        if (isMultiPlan) {
            // Caso 2: Plano Multi e usuário AGENTE - usar unidade do agente
            if (userRole === 'AGENTE' && loggedInAgentId) {
                const agentData = backendAgents.find(a => a.id.toString() === loggedInAgentId);
                if (agentData && agentData.unidade_id) {
                    const agentLocation = locations.find(l => l.id === agentData.unidade_id.toString());
                    if (agentLocation) {
                        console.log('🔧 [CalendarPage] Auto-selecting agent location:', agentLocation);
                        setSelectedLocationFilter(agentLocation.id);
                        return;
                    }
                }
            }

            // Caso 3: Plano Multi e usuário (Admin/Gestor) tem unidade padrão.
            if (user.unidade_id) {
                const userLocation = locations.find(l => l.id === user.unidade_id?.toString());
                if (userLocation) {
                    console.log('🔧 [CalendarPage] Auto-selecting user default location:', userLocation);
                    setSelectedLocationFilter(userLocation.id);
                    return;
                }
            }

            // Caso 4 (Generalizado): Plano Multi, sem unidade padrão (ADMIN ou Agente multi-local).
            // Seleciona o primeiro da lista para quebrar o deadlock.
            console.log('🔧 [CalendarPage] Multi-Plan: Auto-selecting first available location:', locations[0]);
            setSelectedLocationFilter(locations[0].id);
        }
    }, [locations, selectedLocationFilter, isSinglePlan, isMultiPlan, user.unidade_id, userRole, loggedInAgentId, backendAgents]);

    // Recarregar agendamentos quando a data, view, LOCAL ou AGENTE LOGADO mudar
    useEffect(() => {
        const loadAppointmentsForDateRange = async () => {
            // 🛡️ REGRA DE NEGÓCIO: Não buscar dados se Multi-Plan e nenhum local estiver selecionado
            if (isMultiPlan && (!selectedLocationFilter || selectedLocationFilter === 'all')) {
                console.log('🚫 [CalendarPage] Busca de agendamentos bloqueada. Aguardando seleção de local.');
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
                params.agente_id = parseInt(loggedInAgentId);
                console.log('🔧 [CalendarPage] AGENTE detectado. Usando agente_id:', params.agente_id);
            } else if (selectedLocationFilter !== 'all') {
                // Se é ADMIN, backend filtra por unidade_id
                params.unidade_id = parseInt(selectedLocationFilter);
                console.log('🔧 [CalendarPage] ADMIN detectado. Usando unidade_id:', params.unidade_id);
            }

            console.log('🚀 [CalendarPage] Buscando agendamentos com filtros:', params);
            await fetchAppointments(params);
        };

        loadAppointmentsForDateRange();
    }, [currentDate, view, fetchAppointments, selectedLocationFilter, isMultiPlan, loggedInAgentId]);

    const handleAppointmentClick = (app: Appointment & { date: string }) => {
        console.log('🔵🔵🔵 [CalendarPage] CLIQUE NO AGENDAMENTO DETECTADO!');
        console.log('📋 [CalendarPage] Dados do agendamento:', {
            id: app.id,
            agentId: app.agentId,
            serviceId: app.serviceId,
            locationId: app.locationId,
            date: app.date,
            startTime: app.startTime,
            endTime: app.endTime
        });
        
        // Passar apenas o ID do agendamento para o modal buscar os detalhes completos
        const modalPayload = { 
            appointment: { 
                id: app.id,
                // Dados mínimos para o modal saber que é edição
                service: '',
                client: '',
                agentName: '',
                agentEmail: '',
                agentPhone: '',
                date: '',
                time: '',
                serviceId: app.serviceId,
                locationId: app.locationId,
                status: 'PENDENTE'
            } 
        };
        
        console.log('📦 [CalendarPage] Payload para o modal:', modalPayload);
        setModalData(modalPayload);
        console.log('✅ [CalendarPage] setModalData executado');
        setModalOpen(true);
        console.log('✅ [CalendarPage] setModalOpen(true) executado');
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
        console.log(`📐 [timeToPositionStyleWeek] INPUT: startTime=${startTime}, endTime=${endTime}`);
        if (!startTime || !endTime || typeof startTime !== 'string' || typeof endTime !== 'string' || !startTime.includes(':') || !endTime.includes(':')) {
            console.error(`❌ [timeToPositionStyleWeek] Horários inválidos recebidos!`, { startTime, endTime });
            return { top: '0%', height: '0%', display: 'none' }; // Ocultar se inválido
        }

        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        // ✅ Validar se a conversão para número funcionou
        if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
             console.error(`❌ [timeToPositionStyleWeek] Falha ao converter horas/minutos para número!`, { startTime, endTime });
             return { top: '0%', height: '0%', display: 'none' };
        }

        const startTotalMinutes = (startH - START_HOUR_WEEK) * 60 + startM;
        const endTotalMinutes = (endH - START_HOUR_WEEK) * 60 + endM;
        
        // ✅ CORREÇÃO CRÍTICA: O grid visual tem (END_HOUR_WEEK - START_HOUR_WEEK + 1) slots
        // Exemplo: Se START=9 e END=21, temos 13 slots [9h, 10h, ..., 21h]
        // O vão total vai do início de START_HOUR_WEEK (9:00) até o FIM de END_HOUR_WEEK (22:00)
        // Portanto: totalDuration = (END_HOUR_WEEK + 1) - START_HOUR_WEEK = 13 horas
        const totalDurationMinutes = ((END_HOUR_WEEK + 1) - START_HOUR_WEEK) * 60;

        // ✅ Evitar divisão por zero e durações negativas
        if (totalDurationMinutes <= 0) {
             console.error(`❌ [timeToPositionStyleWeek] Duração total do dia inválida!`, { START_HOUR_WEEK, END_HOUR_WEEK });
             return { top: '0%', height: '0%', display: 'none' };
        }
        if (endTotalMinutes <= startTotalMinutes) {
             console.warn(`⚠️ [timeToPositionStyleWeek] Horário final (${endTime}) é menor ou igual ao inicial (${startTime}). Ajustando altura mínima.`);
        }

        const top = (startTotalMinutes / totalDurationMinutes) * 100;
        const height = ((endTotalMinutes - startTotalMinutes) / totalDurationMinutes) * 100;

        // ✅ Log de Saída Detalhado
        const styleResult = { top: `${top}%`, height: `${height}%` };
        console.log(`📐✅ [timeToPositionStyleWeek] OUTPUT para ${startTime}-${endTime}:`, styleResult);

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
        console.log(`📐 [timeToPositionStyleMonth] ${startTime}-${endTime}: left=${left.toFixed(1)}%, width=${width.toFixed(1)}%`, result);

        return result;
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
    
    const serviceOptions = [
        { value: 'all', label: 'Todos os Serviços' },
        ...services.map(service => ({ value: service.id, label: service.name }))
    ];

    const agentOptions = [
        { value: 'all', label: 'Todos os Agentes' },
        ...agents.map(agent => ({ value: agent.id, label: agent.name }))
    ];

    const locationOptions = [
        { value: 'all', label: 'Todos os Locais' },
        ...locations.map(location => ({ value: location.id, label: location.name }))
    ];
    
    const locationOptionsForHeader = ['Todos os Locais', ...locations.map(l => l.name)];

    const selectedLocationName = selectedLocationFilter === 'all' 
        ? 'Todos os Locais' 
        : locations.find(l => l.id === selectedLocationFilter)?.name || 'Todos os Locais';
    
    const handleLocationSelect = (locationName: string) => {
        if (locationName === 'Todos os Locais') {
            setSelectedLocationFilter('all');
        } else {
            const selectedLoc = locations.find(l => l.name === locationName);
            if (selectedLoc) {
                setSelectedLocationFilter(selectedLoc.id);
            }
        }
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
                        const agentAppointments = appointments.filter(a =>
                            a.agentId === agent.id.toString() &&
                            a.date === dateStr &&
                            (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                            a.locationId === selectedLocationFilter
                        );
                        
                        // 🔍 DEBUG DETALHADO: Log para TODOS os agentes
                        console.log(`🔍 [CalendarPage.renderDayView] Agente: ${agent.name} (ID: ${agent.id})`, {
                            dateStr,
                            totalAppointmentsInState: appointments.length,
                            appointmentsForThisAgent: agentAppointments.length,
                            selectedServiceFilter,
                            selectedLocationFilter,
                            allAppointmentsForDate: appointments.filter(a => a.date === dateStr).map(a => ({
                                id: a.id,
                                agentId: a.agentId,
                                agentIdType: typeof a.agentId,
                                agentMatch: a.agentId === agent.id.toString(),
                                serviceId: a.serviceId,
                                locationId: a.locationId,
                                time: `${a.startTime}-${a.endTime}`
                            })),
                            filteredAppointments: agentAppointments.map(a => ({
                                id: a.id,
                                time: `${a.startTime}-${a.endTime}`
                            }))
                        });
                        
                        if (agent.id === '23' || agent.id === '25' || agent.id === '27') {
                            console.log(`🔍 [CalendarPage] Filtro para agente ${agent.name} (ID: ${agent.id}):`, {
                                dateStr,
                                totalAppointments: appointments.length,
                                appointmentsForThisAgent: agentAppointments.length,
                                appointmentsSample: appointments.slice(0, 2).map(a => ({
                                    id: a.id,
                                    agentId: a.agentId,
                                    agentIdType: typeof a.agentId,
                                    date: a.date,
                                    match: a.agentId === agent.id.toString() && a.date === dateStr
                                })),
                                agentIdType: typeof agent.id
                            });
                        }
                        
                        const agentUnavailable = unavailableBlocks.filter(b => b.agentId === agent.id && (b.date === dateStr || !b.date));
                        
                        
                        const busySlots = [
                            ...agentAppointments.map(a => ({ start: a.startTime, end: a.endTime })),
                            ...agentUnavailable.map(u => ({ start: u.startTime, end: u.endTime }))
                        ].sort((a, b) => a.start.localeCompare(b.start));

                        const availableSlots: {start: string, end: string}[] = [];
                        let lastEndTime = `${START_HOUR_DAY.toString().padStart(2, '0')}:00`;

                        busySlots.forEach(slot => {
                            if (slot.start > lastEndTime) {
                                availableSlots.push({ start: lastEndTime, end: slot.start });
                            }
                            lastEndTime = slot.end > lastEndTime ? slot.end : lastEndTime;
                        });

                        const endOfDay = `${END_HOUR_DAY.toString().padStart(2, '0')}:00`;
                        if (endOfDay > lastEndTime) {
                            availableSlots.push({ start: lastEndTime, end: endOfDay });
                        }

                        return (
                            <div key={agent.id} className="relative border-l border-gray-200">
                                <div className="absolute inset-0">
                                    {hoursDay.map(hour => (
                                        <div key={`line-${hour}`} className="h-16 border-t border-gray-200"></div>
                                    ))}
                                </div>

                                {availableSlots.map((slot, index) => {
                                    const top = timeToPercentageDay(slot.start);
                                    const height = timeToPercentageDay(slot.end) - top;
                                    return (
                                        <div
                                            key={`avail-${index}`}
                                            className="absolute w-full group cursor-pointer z-0"
                                            style={{ top: `${top}%`, height: `${height}%` }}
                                            onClick={() => handleSlotClick({ agent, startTime: slot.start, date: currentDate })}
                                        >
                                            <div className="w-full h-full opacity-0 group-hover:opacity-100 bg-blue-50 transition-opacity flex items-center justify-center">
                                                <Plus className="w-5 h-5 text-blue-500" />
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
                                        iconComponent = <Check className="absolute top-1 right-1 h-3 w-3 text-white" />;
                                    } else if (isCompleted) {
                                        // ✅ CONCLUÍDO: #DBEAFE (azul claro)
                                        cardClasses = 'text-blue-800 border border-blue-300';
                                        iconComponent = <Check className="absolute top-1 right-1 h-3 w-3 text-blue-600" />;
                                    } else if (isCancelled) {
                                        // ❌ CANCELADO: #FFE2E2 (vermelho claro)
                                        cardClasses = 'text-red-800 border border-red-300';
                                        iconComponent = <span className="absolute top-1 right-1 text-red-600 font-bold text-xs">✕</span>;
                                    } else if (isNoShow) {
                                        // ⚠️ NÃO COMPARECEU: #FEF9C3 (amarelo claro)
                                        cardClasses = 'text-yellow-800 border border-yellow-300';
                                        iconComponent = <span className="absolute top-1 right-1 text-yellow-600 font-bold text-xs">!</span>;
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
                                          className={`absolute w-full p-2 rounded-lg ${cardClasses} cursor-pointer hover:opacity-90 transition-opacity z-10 flex flex-col justify-center`}
                                          style={{
                                              top: `${top}%`,
                                              height: `${height}%`,
                                              ...(backgroundColor && { backgroundColor })
                                          }}>
                                            <p className={`font-bold text-xs ${hasSpecialStatus ? 'opacity-80' : ''}`}>{service.name}</p>
                                            <p className={`text-xs ${hasSpecialStatus ? 'opacity-80' : ''}`}>{app.startTime} - {app.endTime}</p>
                                            {/* Ícones para estados especiais */}
                                            {iconComponent}
                                        </div>
                                    )
                                })}
                                {agentUnavailable.map(block => {
                                    const top = timeToPercentageDay(block.startTime);
                                    const height = timeToPercentageDay(block.endTime) - top;
                                    return (
                                        <div key={block.id} className="absolute w-full bg-red-100 rounded-lg z-5" style={{ top: `${top}%`, height: `${height}%` }}>
                                             <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)', backgroundSize: '10px 10px' }}></div>
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
        console.log('🚀 [renderWeekView] INÍCIO DA RENDERIZAÇÃO:', {
            isMultiPlan,
            selectedLocationFilter,
            appointments: appointments.length,
            services: services.length,
            allAgents: allAgents.length,
            selectedAgentId,
            currentDate: toISODateString(currentDate)
        });

        // �🛡️ GUARD CLAUSE: Impedir renderização se Multi-Plan sem local selecionado
        // REGRA DE NEGÓCIO: Usuários em plano Multi NUNCA devem visualizar agendamentos de múltiplos locais misturados
        if (isMultiPlan && (!selectedLocationFilter || selectedLocationFilter === 'all')) {
            console.log('❌ [renderWeekView] BLOQUEADO: Multi-Plan sem local selecionado');
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
            console.log('⏳ [renderWeekView] Aguardando carregamento de services e allAgents...', {
                servicesLength: services.length,
                allAgentsLength: allAgents.length
            });
            return <div className="p-4 text-center text-gray-500">Carregando dados da semana...</div>;
        }

        const selectedAgent = allAgents.find(a => a.id === selectedAgentId);
        
        // 🔍 DEBUG CRÍTICO: Verificar selectedAgentId e agendamentos
        console.log('🔍 [renderWeekView] ESTADO INICIAL:', {
            selectedAgentId,
            selectedAgentIdType: typeof selectedAgentId,
            selectedAgent: selectedAgent ? { id: selectedAgent.id, name: selectedAgent.name } : 'NÃO ENCONTRADO',
            allAgentsIds: allAgents.map(a => ({ id: a.id, type: typeof a.id, name: a.name })),
            totalAppointments: appointments.length,
            weekDays: weekDays.map(d => toISODateString(d)),
            appointmentsSample: appointments.slice(0, 5).map(a => ({
                id: a.id,
                agentId: a.agentId,
                agentIdType: typeof a.agentId,
                date: a.date,
                serviceId: a.serviceId,
                time: `${a.startTime}-${a.endTime}`
            }))
        });

        return (
        <>
            <div className="flex items-center overflow-x-auto p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                    {allAgents.map(agent => (
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
                             {hoursWeek.map(hour => (
                                <div key={hour} className="h-16 flex items-start justify-end pt-1 relative">
                                    <span className="text-gray-600 font-medium text-xs bg-white px-1">{hour}:00</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 grid grid-cols-7" style={{ height: `${(END_HOUR_WEEK - START_HOUR_WEEK) * 4}rem`}}>
                            {weekDays.map(day => {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                const dateStr = toISODateString(day);

                                // ⚠️ IMPORTANTE: NÃO filtrar por horário (startTime/endTime)
                                // Todos os agendamentos do dia devem ser exibidos, mesmo os passados
                                // O usuário pode editar/finalizar agendamentos a qualquer momento
                                // 🛡️ REGRA DE NEGÓCIO: Filtro de local é ESTRITO (nunca 'all' para ADMIN/Multi)
                                const agentAppointments = appointments.filter(a =>
                                    a.agentId === selectedAgentId.toString() &&
                                    a.date === dateStr &&
                                    (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                                    a.locationId === selectedLocationFilter
                                );

                                // 🔍 DEBUG CRÍTICO: Comparar com visão diária
                                if (dateStr === '2025-10-28') {
                                    console.log(`🎯 [WeekView DEBUG] FOCO NO DIA 28/10 - ${dateStr}:`, {
                                        selectedAgentId,
                                        selectedAgentIdType: typeof selectedAgentId,
                                        loggedInAgentId,
                                        allAgentsIds: allAgents.map(a => ({ id: a.id, name: a.name })),
                                        totalAppointments: appointments.length,
                                        appointmentsForDate: appointments.filter(a => a.date === dateStr).length,
                                        appointmentsForAgent: appointments.filter(a => a.agentId === selectedAgentId.toString()).length,
                                        finalFiltered: agentAppointments.length,
                                        sampleAppointments: appointments.filter(a => a.date === dateStr).map(a => ({
                                            id: a.id,
                                            agentId: a.agentId,
                                            date: a.date,
                                            startTime: a.startTime,
                                            locationId: a.locationId,
                                            serviceId: a.serviceId
                                        })),
                                        filters: {
                                            serviceFilter: selectedServiceFilter,
                                            locationFilter: selectedLocationFilter
                                        }
                                    });
                                }


                                const agentUnavailable = unavailableBlocks.filter(b => b.agentId === selectedAgentId.toString() && (b.date === dateStr || !b.date));
                                
                                const busySlots = [
                                    ...agentAppointments.map(a => ({ start: a.startTime, end: a.endTime })),
                                    ...agentUnavailable.map(u => ({ start: u.startTime, end: u.endTime }))
                                ].sort((a, b) => a.start.localeCompare(b.start));
        
                                const availableSlots: {start: string, end: string}[] = [];
                                let lastEndTime = `${START_HOUR_WEEK.toString().padStart(2, '0')}:00`;
        
                                busySlots.forEach(slot => {
                                    if (slot.start > lastEndTime) {
                                        availableSlots.push({ start: lastEndTime, end: slot.start });
                                    }
                                    lastEndTime = slot.end > lastEndTime ? slot.end : lastEndTime;
                                });
        
                                const endOfDay = `${END_HOUR_WEEK.toString().padStart(2, '0')}:00`;
                                if (endOfDay > lastEndTime) {
                                    availableSlots.push({ start: lastEndTime, end: endOfDay });
                                }

                                return (
                                <div key={dateStr} className={`relative border-l border-gray-200 ${isWeekend ? 'bg-yellow-50' : ''}`}>
                                    {hoursWeek.map(hour => (
                                        <div key={`line-${hour}`} className="h-16 border-t border-dashed border-gray-200"></div>
                                    ))}

                                    {selectedAgent && availableSlots.map((slot, index) => (
                                        <div
                                            key={`avail-${index}`}
                                            className="absolute w-full group cursor-pointer z-0"
                                            style={timeToPositionStyleWeek(slot.start, slot.end)}
                                            onClick={() => handleSlotClick({ agent: selectedAgent, startTime: slot.start, date: day })}
                                        >
                                            <div className="w-full h-full opacity-0 group-hover:opacity-100 bg-blue-50 transition-opacity flex items-center justify-center">
                                                <Plus className="w-5 h-5 text-blue-500" />
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {agentAppointments.map(app => {
                                        // ✅ Buscar serviço usando o ID real do banco de dados
                                        let service = services.find(s => s.id.toString() === app.serviceId);

                                        // ✅ LÓGICA DE FALLBACK CRÍTICA (REPLICADA DO renderDayView)
                                        if (!service && services.length > 0) {
                                            service = services[0];
                                        }

                                        if (!service) {
                                            console.error(`❌ [renderWeekView] SERVIÇO NÃO ENCONTRADO! App ID=${app.id}, serviceId='${app.serviceId}'. Serviços disponíveis: ${services.map(s => `${s.id}:${s.name}`).join(', ')}`);
                                            return null;
                                        }

                                        const style = timeToPositionStyleWeek(app.startTime, app.endTime);

                                        // ✅ Log Final Antes de Renderizar o Card
                                        console.log(`🎨 [renderWeekView] Renderizando Card Agendamento ID ${app.id}:`, {
                                            startTime: app.startTime,
                                            endTime: app.endTime,
                                            status: app.status,
                                            calculatedStyle: style,
                                            serviceName: service.name,
                                            dateStr // Adicionado para contexto
                                        });
                                        // 🔍 DEBUG CRÍTICO: Investigar status dos agendamentos
                                        console.log(`🔍 [DEBUG STATUS] App ID ${app.id}:`, {
                                            status: app.status,
                                            statusType: typeof app.status,
                                            statusLength: app.status?.length,
                                            serviceColor: service.color,
                                            serviceTextColor: service.textColor,
                                            allAppData: app
                                        });

                                        // ✅ DEFINIR CLASSES CONDICIONAIS PARA TODOS OS ESTADOS ESPECIAIS
                                        const isApproved = app.status === 'Aprovado';
                                        const isCompleted = app.status === 'Concluído';
                                        const isCancelled = app.status === 'Cancelado';
                                        const isNoShow = app.status === 'Não Compareceu';

                                        let cardClasses, iconComponent;

                                        if (isApproved) {
                                            // ✅ APROVADO: #2663EB (azul escuro)
                                            cardClasses = 'text-white border border-blue-600';
                                            iconComponent = <Check className="absolute top-1 right-1 h-3 w-3 text-white" />;
                                        } else if (isCompleted) {
                                            // ✅ CONCLUÍDO: #DBEAFE (azul claro)
                                            cardClasses = 'text-blue-800 border border-blue-300';
                                            iconComponent = <Check className="absolute top-1 right-1 h-3 w-3 text-blue-600" />;
                                        } else if (isCancelled) {
                                            // ❌ CANCELADO: #FFE2E2 (vermelho claro)
                                            cardClasses = 'text-red-800 border border-red-300';
                                            iconComponent = <span className="absolute top-1 right-1 text-red-600 font-bold text-xs">✕</span>;
                                        } else if (isNoShow) {
                                            // ⚠️ NÃO COMPARECEU: #FEF9C3 (amarelo claro)
                                            cardClasses = 'text-yellow-800 border border-yellow-300';
                                            iconComponent = <span className="absolute top-1 right-1 text-yellow-600 font-bold text-xs">!</span>;
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
                                              className={`absolute w-[calc(100%-4px)] ml-[2px] p-2 rounded-lg ${cardClasses} z-10 cursor-pointer hover:opacity-90 transition-opacity`}
                                              style={{
                                                  ...style,
                                                  ...(backgroundColor && { backgroundColor })
                                              }}>
                                                <p className={`font-bold text-xs whitespace-nowrap overflow-hidden text-ellipsis ${hasSpecialStatus ? 'opacity-80' : ''}`}>{service.name}</p>
                                                <p className={`text-xs ${hasSpecialStatus ? 'opacity-80' : ''}`}>{app.startTime} - {app.endTime}</p>
                                                {/* Ícones para estados especiais */}
                                                {iconComponent}
                                            </div>
                                        )
                                    })}

                                    {agentUnavailable.map(block => {
                                        return (
                                            <div key={block.id} className="absolute w-full bg-red-50 rounded-lg z-5" style={timeToPositionStyleWeek(block.startTime, block.endTime)}>
                                                 <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 100, 100, 0.2) 4px, rgba(255, 100, 100, 0.2) 8px)'}}></div>
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
        console.log('🚀 [renderMonthView] INÍCIO DA RENDERIZAÇÃO:', {
            isMultiPlan,
            selectedLocationFilter,
            appointments: appointments.length,
            services: services.length,
            allAgents: allAgents.length,
            displayedAgents: displayedAgents.length,
            currentDate: toISODateString(currentDate)
        });

        // �🛡️ GUARD CLAUSE: Impedir renderização se Multi-Plan sem local selecionado
        // REGRA DE NEGÓCIO: Usuários em plano Multi NUNCA devem visualizar agendamentos de múltiplos locais misturados
        if (isMultiPlan && (!selectedLocationFilter || selectedLocationFilter === 'all')) {
            console.log('❌ [renderMonthView] BLOQUEADO: Multi-Plan sem local selecionado');
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
                                const agentAppointments = appointments.filter(a =>
                                    a.agentId === agent.id.toString() &&
                                    a.date === dateStr &&
                                    (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                                    a.locationId === selectedLocationFilter
                                );

                                // 🔍 DEBUG: Log dos agendamentos encontrados
                                if (dateStr === '2025-10-28') {
                                    console.log(`🎯 [MonthView DEBUG] FOCO NO DIA 28/10 - Agente ${agent.name}:`, {
                                        agentId: agent.id,
                                        agentIdType: typeof agent.id,
                                        dateStr,
                                        totalAppointments: appointments.length,
                                        appointmentsForDate: appointments.filter(a => a.date === dateStr).length,
                                        appointmentsForAgent: appointments.filter(a => a.agentId === agent.id.toString()).length,
                                        finalFiltered: agentAppointments.length,
                                        sampleAppointments: appointments.filter(a => a.date === dateStr).map(a => ({
                                            id: a.id,
                                            agentId: a.agentId,
                                            date: a.date,
                                            startTime: a.startTime,
                                            locationId: a.locationId,
                                            serviceId: a.serviceId
                                        })),
                                        filters: {
                                            serviceFilter: selectedServiceFilter,
                                            locationFilter: selectedLocationFilter
                                        }
                                    });
                                }
                                if (agentAppointments.length > 0) {
                                    console.log(`📅 [GRID MENSAL] ${dateStr} - Agente ${agent.name}: ${agentAppointments.length} agendamentos`, agentAppointments.map(a => `${a.id}:${a.status}`));
                                }
                                const agentUnavailable = unavailableBlocks.filter(b => b.agentId === agent.id && (b.date === dateStr || !b.date));
                                
                                const busySlots = [
                                    ...agentAppointments.map(a => ({ start: a.startTime, end: a.endTime })),
                                    ...agentUnavailable.map(u => ({ start: u.startTime, end: u.endTime }))
                                ].sort((a, b) => a.start.localeCompare(b.start));
        
                                const availableSlots: {start: string, end: string}[] = [];
                                let lastEndTime = `${START_HOUR_MONTH.toString().padStart(2, '0')}:00`;
        
                                busySlots.forEach(slot => {
                                    if (slot.start > lastEndTime) {
                                        availableSlots.push({ start: lastEndTime, end: slot.start });
                                    }
                                    lastEndTime = slot.end > lastEndTime ? slot.end : lastEndTime;
                                });
        
                                const endOfDay = `${END_HOUR_MONTH.toString().padStart(2, '0')}:00`;
                                if (endOfDay > lastEndTime) {
                                    availableSlots.push({ start: lastEndTime, end: endOfDay });
                                }
                                
                                return (
                                <div key={agent.id} className="flex-1 px-1 border-l border-gray-200 flex items-center">
                                    <div className="relative w-full h-6 bg-gray-50 rounded">
                                        {availableSlots.map((slot, index) => (
                                            <div
                                                key={`avail-${index}`}
                                                className="absolute h-full rounded bg-blue-50 opacity-0 hover:opacity-100 cursor-pointer transition-opacity z-0"
                                                style={timeToPositionStyleMonth(slot.start, slot.end)}
                                                onClick={() => handleSlotClick({ agent, startTime: slot.start, date: day })}
                                            ></div>
                                        ))}

                                        {agentAppointments.map((app, index) => {
                                            // ✅ Buscar serviço usando o ID real do banco de dados
                                            let service = services.find(s => s.id.toString() === app.serviceId);

                                            // ✅ LÓGICA DE FALLBACK CRÍTICA (REPLICADA DO renderDayView)
                                            if (!service && services.length > 0) {
                                                service = services[0];
                                            }

                                            if (!service) {
                                                console.error(`❌ [GRID MENSAL] Serviço não encontrado! App ID=${app.id}, serviceId='${app.serviceId}'. Serviços disponíveis: ${services.map(s => `${s.id}:${s.name}`).join(', ')}`);
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
                                                  className={`absolute h-full rounded ${cardClasses} cursor-pointer hover:opacity-80 transition-opacity z-10`}
                                                  style={positionStyle}
                                                  title={`${service.name} (${app.startTime}-${app.endTime})${tooltipSuffix}`}
                                                >
                                                    {indicatorComponent}
                                                </div>
                                            )
                                        })}
                                         {agentUnavailable.map(block => {
                                            return (
                                                <div key={block.id} className="absolute h-full bg-red-50 z-5" style={timeToPositionStyleMonth(block.startTime, block.endTime)}>
                                                     <div className="w-full h-full" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(255, 100, 100, 0.3) 2px, rgba(255, 100, 100, 0.3) 4px)'}}></div>
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
                        {/* 📍 DROPDOWN DE SELEÇÃO DE LOCAL - Sempre visível quando há múltiplos locais */}
                        {locations.length > 1 && (
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
                        <button onClick={() => setShowFilters(!showFilters)} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                            <MoreHorizontal className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                </div>
                 {showFilters && (
                     <div className="mt-4 flex items-center gap-2">
                        <FilterDropdown
                            label="Serviços"
                            options={serviceOptions}
                            selectedValue={selectedServiceFilter}
                            onSelect={setSelectedServiceFilter}
                        />
                         <FilterDropdown
                            label="Agentes"
                            options={agentOptions}
                            selectedValue={selectedAgentFilter}
                            onSelect={setSelectedAgentFilter}
                            disabled={!!loggedInAgentId || view === 'Semana'}
                        />
                    </div>
                )}
            </div>

            {view === 'Dia' && (
                <>
                    {/* Barra de números do mês */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
                        <button onClick={handlePrev}><ChevronLeft className="h-5 w-5 text-gray-400" /></button>
                        <div className="flex items-center gap-1 overflow-x-auto mx-2">
                        {daysInCurrentMonth.map(day => {
                            const isSelected = day.getDate() === currentDate.getDate() && day.getMonth() === currentDate.getMonth();
                            const isToday = day.getDate() === today.getDate() && day.getMonth() === today.getMonth() && day.getFullYear() === today.getFullYear();
                            
                            let buttonClass = 'h-8 w-8 flex-shrink-0 rounded-full text-sm font-medium ';
                            if (isSelected) {
                                buttonClass += 'bg-blue-600 text-white';
                            } else if (isToday) {
                                buttonClass += 'bg-blue-100 text-blue-700 font-bold';
                            } else {
                                buttonClass += 'hover:bg-gray-100 text-gray-700';
                            }

                            return (
                                <button key={day.getDate()} onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day.getDate()))} className={buttonClass}>
                                    {day.getDate()}
                                </button>
                            )
                        })}
                        </div>
                        <button onClick={handleNext}><ChevronRight className="h-5 w-5 text-gray-400" /></button>
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
                }}
                appointmentData={modalData?.appointment}
                newSlotData={modalData?.newSlot}
            />
        </div>
    );
};

export default CalendarPage;
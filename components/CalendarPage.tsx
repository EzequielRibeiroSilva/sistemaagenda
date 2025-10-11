import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Agent, Service, Appointment, UnavailableBlock, ScheduleSlot, Location } from '../types';
import { ChevronLeft, ChevronRight, Check, MoreHorizontal, ChevronDown, Plus } from './Icons';
import NewAppointmentModal from './NewAppointmentModal';

const agents: Agent[] = [
    { id: '1', name: 'Eduardo Soares', avatar: 'https://picsum.photos/id/1005/100/100' },
    { id: '2', name: 'Ângelo Paixão', avatar: 'https://picsum.photos/id/1011/100/100' },
    { id: '3', name: 'Snake Filho', avatar: 'https://picsum.photos/id/1012/100/100' },
];

const services: Service[] = [
    { id: 'corte', name: 'CORTE', color: 'bg-blue-600', textColor: 'text-white' },
    { id: 'barba', name: 'CORTE + BARBA', color: 'bg-cyan-500', textColor: 'text-white' },
    { id: 'outro', name: 'SERVIÇO', color: 'bg-fuchsia-500', textColor: 'text-white' },
];

const locations: Location[] = [
    { id: 'loc1', name: 'Local Principal' },
    { id: 'loc2', name: 'Unidade Filial' },
];

const appointments: (Appointment & { date: string })[] = [
    // Data from week view
    { id: 'a1', agentId: '1', serviceId: 'corte', locationId: 'loc1', startTime: '14:00', endTime: '15:00', date: '2025-10-08' },
    { id: 'a2', agentId: '1', serviceId: 'corte', locationId: 'loc2', startTime: '15:00', endTime: '16:00', date: '2025-10-09' },
    { id: 'a3', agentId: '1', serviceId: 'corte', locationId: 'loc1', startTime: '17:00', endTime: '18:00', date: '2025-10-10' },
    { id: 'a4', agentId: '1', serviceId: 'corte', locationId: 'loc2', startTime: '18:00', endTime: '19:00', date: '2025-10-07' },
    { id: 'a5', agentId: '1', serviceId: 'barba', locationId: 'loc1', startTime: '19:00', endTime: '20:00', date: '2025-10-06' },
    { id: 'b1', agentId: '3', serviceId: 'corte', locationId: 'loc1', startTime: '09:00', endTime: '10:00', date: '2025-10-06' },
    { id: 'b2', agentId: '3', serviceId: 'corte', locationId: 'loc2', startTime: '10:00', endTime: '11:00', date: '2025-10-07' },
    { id: 'b3', agentId: '3', serviceId: 'corte', locationId: 'loc1', startTime: '14:00', endTime: '15:00', date: '2025-10-08' },
    { id: 'b4', agentId: '3', serviceId: 'corte', locationId: 'loc2', startTime: '17:00', endTime: '18:00', date: '2025-10-09' },
    { id: 'b5', agentId: '3', serviceId: 'corte', locationId: 'loc1', startTime: '18:00', endTime: '19:00', date: '2025-10-10' },
    // New data for month view
    { id: 'c1', agentId: '1', serviceId: 'corte', locationId: 'loc1', startTime: '11:00', endTime: '12:00', date: '2025-10-01' },
    { id: 'c2', agentId: '1', serviceId: 'barba', locationId: 'loc2', startTime: '15:00', endTime: '16:30', date: '2025-10-02' },
    { id: 'c3', agentId: '1', serviceId: 'corte', locationId: 'loc1', startTime: '10:00', endTime: '11:00', date: '2025-10-03' },
    { id: 'c4', agentId: '1', serviceId: 'outro', locationId: 'loc2', startTime: '09:00', endTime: '10:30', date: '2025-10-04' },
    { id: 'c5', agentId: '2', serviceId: 'corte', locationId: 'loc1', startTime: '14:00', endTime: '15:00', date: '2025-10-01' },
    { id: 'c6', agentId: '2', serviceId: 'corte', locationId: 'loc2', startTime: '16:00', endTime: '17:00', date: '2025-10-02' },
    { id: 'c7', agentId: '3', serviceId: 'barba', locationId: 'loc1', startTime: '18:00', endTime: '19:00', date: '2025-10-03' },
    { id: 'c8', agentId: '3', serviceId: 'corte', locationId: 'loc2', startTime: '11:00', endTime: '12:00', date: '2025-10-04' },
    { id: 'c9', agentId: '2', serviceId: 'corte', locationId: 'loc1', startTime: '10:00', endTime: '11:00', date: '2025-10-07' },
    { id: 'c10', agentId: '3', serviceId: 'corte', locationId: 'loc2', startTime: '16:00', endTime: '17:00', date: '2025-10-06' },
];

const unavailableBlocks: (UnavailableBlock & { date?: string })[] = [
    // Week view data
    { id: 'u1', agentId: '1', startTime: '12:00', endTime: '14:00' },
    { id: 'u2', agentId: '2', startTime: '09:00', endTime: '13:00' },
    { id: 'u3', agentId: '1', startTime: '12:00', endTime: '14:00', date: '2025-10-06' },
    { id: 'u4', agentId: '1', startTime: '12:00', endTime: '14:00', date: '2025-10-07' },
    { id: 'u5', agentId: '1', startTime: '12:00', endTime: '14:00', date: '2025-10-08' },
    { id: 'u6', agentId: '1', startTime: '12:00', endTime: '14:00', date: '2025-10-09' },
    { id: 'u7', agentId: '1', startTime: '12:00', endTime: '14:00', date: '2025-10-10' },
    { id: 'u8', agentId: '1', startTime: '13:00', endTime: '21:00', date: '2025-10-11' },
    { id: 'u9', agentId: '1', startTime: '09:00', endTime: '21:00', date: '2025-10-12' },
    // New month view data
    { id: 'm1', agentId: '1', startTime: '09:00', endTime: '11:00', date: '2025-10-01' },
    { id: 'm2', agentId: '2', startTime: '10:00', endTime: '14:00', date: '2025-10-01' },
    { id: 'm3', agentId: '3', startTime: '09:00', endTime: '21:00', date: '2025-10-05' },
    { id: 'm4', agentId: '1', startTime: '09:00', endTime: '21:00', date: '2025-10-13' },
    { id: 'm5', agentId: '2', startTime: '09:00', endTime: '21:00', date: '2025-10-14' },
    { id: 'm6', agentId: '3', startTime: '09:00', endTime: '21:00', date: '2025-10-15' },
    { id: 'm7', agentId: '1', startTime: '09:00', endTime: '15:00', date: '2025-10-16' },
    { id: 'm8', agentId: '2', startTime: '15:00', endTime: '21:00', date: '2025-10-17' },
    { id: 'm9', agentId: '3', startTime: '09:00', endTime: '21:00', date: '2025-10-18' },
    { id: 'm10', agentId: '1', startTime: '09:00', endTime: '21:00', date: '2025-10-19' },
    { id: 'm11', agentId: '2', startTime: '09:00', endTime: '21:00', date: '2025-10-20' },
    { id: 'm12', agentId: '3', startTime: '09:00', endTime: '21:00', date: '2025-10-21' },
    { id: 'm13', agentId: '1', startTime: '14:00', endTime: '21:00', date: '2025-10-22' },
    { id: 'm14', agentId: '2', startTime: '09:00', endTime: '14:00', date: '2025-10-23' },
    { id: 'm15', agentId: '3', startTime: '09:00', endTime: '21:00', date: '2025-10-24' },
    { id: 'm16', agentId: '1', startTime: '09:00', endTime: '21:00', date: '2025-10-25' },
    { id: 'm17', agentId: '2', startTime: '09:00', endTime: '21:00', date: '2025-10-26' },
    { id: 'm18', agentId: '3', startTime: '09:00', endTime: '21:00', date: '2025-10-27' },
    { id: 'm19', agentId: '1', startTime: '09:00', endTime: '12:00', date: '2025-10-28' },
    { id: 'm20', agentId: '2', startTime: '12:00', endTime: '21:00', date: '2025-10-29' },
    { id: 'm21', agentId: '3', startTime: '09:00', endTime: '17:00', date: '2025-10-30' },
    { id: 'm22', agentId: '1', startTime: '17:00', endTime: '21:00', date: '2025-10-31' },
];

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
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl z-20 border border-gray-200">
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
                <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-20 py-1">
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

    const today = new Date();

    const START_HOUR_DAY = 8;
    const END_HOUR_DAY = 21;
    const hoursDay = Array.from({ length: END_HOUR_DAY - START_HOUR_DAY + 1 }, (_, i) => i + START_HOUR_DAY);

    const START_HOUR_WEEK = 9;
    const END_HOUR_WEEK = 21;
    const hoursWeek = Array.from({ length: END_HOUR_WEEK - START_HOUR_WEEK }, (_, i) => i + START_HOUR_WEEK);

    const START_HOUR_MONTH = 9;
    const END_HOUR_MONTH = 21;

    const allAgents = useMemo(() => {
        if (loggedInAgentId) {
            return agents.filter(agent => agent.id === loggedInAgentId);
        }
        return agents;
    }, [loggedInAgentId]);

    const displayedAgents = useMemo(() => {
        if (view !== 'Semana' && selectedAgentFilter !== 'all') {
             return allAgents.filter(agent => agent.id === selectedAgentFilter);
        }
        return allAgents;
    }, [allAgents, selectedAgentFilter, view]);
    
    const [selectedAgentId, setSelectedAgentId] = useState(allAgents[0]?.id || '1');
    
    useEffect(() => {
        if (loggedInAgentId) {
            setSelectedAgentFilter(loggedInAgentId);
            setSelectedAgentId(loggedInAgentId);
        }
    }, [loggedInAgentId]);

    const handleAppointmentClick = (app: Appointment & { date: string }) => {
        const agent = agents.find(a => a.id === app.agentId);
        const service = services.find(s => s.id === app.serviceId);
        if (!agent || !service) return;

        const appointmentDetails: ScheduleSlot['details'] = {
            id: app.id,
            service: service.name,
            client: 'Cliente Exemplo', // Placeholder as client info is not in this component's data
            agentName: agent.name,
            agentEmail: `${agent.name.split(' ')[0].toLowerCase()}@email.com`, // Placeholder email
            agentPhone: 'N/A',
            date: new Date(app.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }),
            time: `${app.startTime}-${app.endTime}`,
            serviceId: app.serviceId,
            locationId: app.locationId,
            status: 'Aprovado', // Placeholder
        };

        setModalData({ appointment: appointmentDetails });
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

    const timeToPercentageDay = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        const totalMinutes = (h + m / 60) - START_HOUR_DAY;
        const totalDuration = END_HOUR_DAY - START_HOUR_DAY;
        return (totalMinutes / totalDuration) * 100;
    };
    
    const timeToPositionStyleWeek = (startTime: string, endTime: string) => {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        const startTotalMinutes = (startH - START_HOUR_WEEK) * 60 + startM;
        const endTotalMinutes = (endH - START_HOUR_WEEK) * 60 + endM;

        const totalDurationMinutes = (END_HOUR_WEEK - START_HOUR_WEEK) * 60;
        
        const top = (startTotalMinutes / totalDurationMinutes) * 100;
        const height = ((endTotalMinutes - startTotalMinutes) / totalDurationMinutes) * 100;

        return { top: `${top}%`, height: `${height}%` };
    };

    const timeToPositionStyleMonth = (startTime: string, endTime: string) => {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
    
        const startTotalMinutes = (startH - START_HOUR_MONTH) * 60 + startM;
        const endTotalMinutes = (endH - START_HOUR_MONTH) * 60 + endM;
    
        const totalDurationMinutes = (END_HOUR_MONTH - START_HOUR_MONTH) * 60;
            
        const left = (startTotalMinutes / totalDurationMinutes) * 100;
        const width = ((endTotalMinutes - startTotalMinutes) / totalDurationMinutes) * 100;
    
        return { left: `${Math.max(0, left)}%`, width: `${Math.min(100, width)}%` };
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

    const renderDayView = () => (
        <div className="flex-1 overflow-auto p-4">
            <div className="flex">
                <div className="w-20 text-sm text-right pr-2">
                    <div className="h-10"></div>
                    {hoursDay.map(hour => (
                        <div key={hour} className="h-16 -mt-2.5">
                            <span className="text-gray-500">{hour}:00</span>
                        </div>
                    ))}
                </div>
                <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${displayedAgents.length}, minmax(0, 1fr))` }}>
                    {displayedAgents.map(agent => {
                        const dateStr = toISODateString(currentDate);
                        const agentAppointments = appointments.filter(a =>
                            a.agentId === agent.id && 
                            a.date === dateStr && 
                            (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                            (selectedLocationFilter === 'all' || a.locationId === selectedLocationFilter)
                        );
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
                                <div className="flex items-center gap-2 p-2 h-10 sticky top-0 bg-white z-10 border-b border-gray-200 -mt-4 pt-0">
                                    <img src={agent.avatar} alt={agent.name} className="w-6 h-6 rounded-full" />
                                    <span className="text-sm font-medium text-gray-800">{agent.name}</span>
                                </div>
                                <div className="absolute inset-0 top-10">
                                    {hoursDay.slice(1).map(hour => <div key={`line-${hour}`} className="h-16 border-t border-gray-200"></div>)}
                                </div>

                                {availableSlots.map((slot, index) => {
                                    const top = timeToPercentageDay(slot.start);
                                    const height = timeToPercentageDay(slot.end) - top;
                                    return (
                                        <div
                                            key={`avail-${index}`}
                                            className="absolute w-full group cursor-pointer z-0"
                                            style={{ top: `calc(${top}% + 40px)`, height: `${height}%` }}
                                            onClick={() => handleSlotClick({ agent, startTime: slot.start, date: currentDate })}
                                        >
                                            <div className="w-full h-full opacity-0 group-hover:opacity-100 bg-blue-50 transition-opacity flex items-center justify-center">
                                                <Plus className="w-5 h-5 text-blue-500" />
                                            </div>
                                        </div>
                                    );
                                })}

                                {agentAppointments.map(app => {
                                    const service = services.find(s => s.id === app.serviceId);
                                    if (!service) return null;
                                    const top = timeToPercentageDay(app.startTime);
                                    const height = timeToPercentageDay(app.endTime) - top;
                                    return (
                                        <div 
                                          key={app.id} 
                                          onClick={() => handleAppointmentClick(app)}
                                          className={`absolute w-full p-2 rounded-lg ${service.color} ${service.textColor} cursor-pointer hover:opacity-90 transition-opacity z-10`} 
                                          style={{ top: `calc(${top}% + 40px)`, height: `${height}%` }}>
                                            <p className="font-bold text-xs">{service.name}</p>
                                            <p className="text-xs">{app.startTime} - {app.endTime}</p>
                                        </div>
                                    )
                                })}
                                {agentUnavailable.map(block => {
                                    const top = timeToPercentageDay(block.startTime);
                                    const height = timeToPercentageDay(block.endTime) - top;
                                    return (
                                        <div key={block.id} className="absolute w-full bg-red-100 rounded-lg z-10" style={{ top: `calc(${top}% + 40px)`, height: `${height}%` }}>
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
    
    const renderWeekView = () => {
        const selectedAgent = allAgents.find(a => a.id === selectedAgentId);

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
                            <img src={agent.avatar} alt={agent.name} className="w-6 h-6 rounded-full" />
                            {agent.name}
                        </button>
                    ))}
                </div>
            </div>
             <div className="flex-1 overflow-auto">
                <div className="flex flex-col">
                    <div className="flex sticky top-0 bg-white z-10 border-b border-gray-200">
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
                        <div className="w-20 flex-shrink-0 text-sm text-right pr-2">
                             {hoursWeek.map(hour => (
                                <div key={hour} className="h-16 -mt-3 relative">
                                    <span className="absolute right-2 text-gray-500">{hour}:00</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 grid grid-cols-7" style={{ height: `${(END_HOUR_WEEK - START_HOUR_WEEK) * 4}rem`}}>
                            {weekDays.map(day => {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                const dateStr = toISODateString(day);

                                const agentAppointments = appointments.filter(a =>
                                    a.agentId === selectedAgentId &&
                                    a.date === dateStr &&
                                    (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                                    (selectedLocationFilter === 'all' || a.locationId === selectedLocationFilter)
                                );
                                const agentUnavailable = unavailableBlocks.filter(b => b.agentId === selectedAgentId && (b.date === dateStr || !b.date));
                                
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
                                        const service = services.find(s => s.id === app.serviceId);
                                        if (!service) return null;
                                        return (
                                            <div 
                                              key={app.id} 
                                              onClick={() => handleAppointmentClick(app)}
                                              className={`absolute w-[calc(100%-4px)] ml-[2px] p-2 rounded-lg ${service.color} ${service.textColor} z-10 cursor-pointer hover:opacity-90 transition-opacity`} 
                                              style={timeToPositionStyleWeek(app.startTime, app.endTime)}>
                                                <p className="font-bold text-xs whitespace-nowrap overflow-hidden text-ellipsis">{service.name}</p>
                                                <p className="text-xs">{app.startTime} - {app.endTime}</p>
                                            </div>
                                        )
                                    })}

                                    {agentUnavailable.map(block => {
                                        return (
                                            <div key={block.id} className="absolute w-full bg-red-50 rounded-lg z-10" style={timeToPositionStyleWeek(block.startTime, block.endTime)}>
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

    const renderMonthView = () => (
        <div className="flex-1 overflow-auto">
            <div className="flex sticky top-0 bg-white z-10 border-b border-gray-200">
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
                        <div key={dateStr} className="flex min-h-[60px]">
                            <div className={`w-40 p-3 flex-shrink-0 relative ${isToday ? 'bg-blue-50' : ''}`}>
                                {isToday && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>}
                                <div className="flex items-center gap-2">
                                     <span className={`font-bold text-lg ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>{day.getDate()}</span>
                                     <span className={`text-sm uppercase font-medium ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>{day.toLocaleString('pt-BR', { weekday: 'short' })}</span>
                                </div>
                            </div>
                            {displayedAgents.map(agent => {
                                const agentAppointments = appointments.filter(a =>
                                    a.agentId === agent.id &&
                                    a.date === dateStr &&
                                    (selectedServiceFilter === 'all' || a.serviceId === selectedServiceFilter) &&
                                    (selectedLocationFilter === 'all' || a.locationId === selectedLocationFilter)
                                );
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
                                <div key={agent.id} className="flex-1 p-1 border-l border-gray-200">
                                    <div className="relative w-full h-full min-h-[52px]">
                                        {availableSlots.map((slot, index) => (
                                            <div
                                                key={`avail-${index}`}
                                                className="absolute h-full rounded bg-blue-50 opacity-0 hover:opacity-100 cursor-pointer transition-opacity z-0"
                                                style={timeToPositionStyleMonth(slot.start, slot.end)}
                                                onClick={() => handleSlotClick({ agent, startTime: slot.start, date: day })}
                                            ></div>
                                        ))}

                                        {agentAppointments.map(app => {
                                            const service = services.find(s => s.id === app.serviceId);
                                            if (!service) return null;
                                            return (
                                                <div 
                                                  key={app.id}
                                                  onClick={() => handleAppointmentClick(app)}
                                                  className={`absolute h-full rounded ${service.color} cursor-pointer hover:opacity-80 transition-opacity z-10`} 
                                                  style={timeToPositionStyleMonth(app.startTime, app.endTime)}></div>
                                            )
                                        })}
                                         {agentUnavailable.map(block => {
                                            return (
                                                <div key={block.id} className="absolute h-full bg-red-50 z-10" style={timeToPositionStyleMonth(block.startTime, block.endTime)}>
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


    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
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
                        {userRole === 'ADMIN' && (
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
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
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
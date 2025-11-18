import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { AgentSchedule, Location, Service, ScheduleSlot, Agent } from '../types';
import { ChevronDown, Check, MoreHorizontal, Plus } from './Icons';
import DatePicker from './DatePicker';
import { getAssetUrl } from '../utils/api';

// ✅ CORRIGIDO: Popover igual ao CalendarPage.tsx
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
                    src={getAssetUrl(appointment.agentAvatar) || fallbackAvatar} 
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


interface FilterDropdownProps {
    label: string;
    options: { value: string; label: string }[];
    selectedValue: string;
    onSelect: (value: string) => void;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ label, options, selectedValue, onSelect }) => {
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
    
    const selectedOptionLabel = options.find(opt => opt.value === selectedValue)?.label || options[0]?.label;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 min-w-[160px] justify-between"
            >
                <span>{selectedOptionLabel}</span>
                <ChevronDown className={`h-4 w-4 ml-2 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-1">
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
                            {selectedValue === option.value && <Check className="w-4 h-4 mr-2 text-blue-600" />}
                            <span className={selectedValue !== option.value ? 'ml-6' : ''}>{option.label}</span>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

const ToggleButton: React.FC<{ children: React.ReactNode; active?: boolean, onClick?: () => void }> = ({ children, active, onClick }) => (
  <button onClick={onClick} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
    {children}
  </button>
);


// ✅ NOVO: Interface para horários de funcionamento da unidade
interface UnitSchedule {
  dia_semana: number;
  is_aberto: boolean;
  horarios_json: Array<{
    inicio: string;
    fim: string;
  }>;
}

// ✅ NOVO: Interface para agendamentos do backend
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
  cliente_nome?: string;
  cliente_telefone?: string;
  servicos?: Array<{
    id: number;
    nome: string;
    preco: string;
  }>;
}

// ✅ NOVO: Interface para agentes do backend
interface BackendAgente {
  id: number;
  nome: string;
  sobrenome?: string;
  name?: string;              // ✅ CRÍTICO: Backend retorna 'name' já formatado (nome completo)
  nome_exibicao?: string;     // ✅ CRÍTICO: Nome de exibição formatado
  email: string;
  telefone?: string;
  avatar?: string;
  avatar_url?: string;        // ✅ CRÍTICO: URL do avatar
}

interface PreviewSectionProps {
  schedules: AgentSchedule[];
  locations: Location[];
  services: {id: string, name: string}[];
  selectedLocation: string;
  setSelectedLocation: (id: string) => void;
  selectedService: string;
  setSelectedService: (id: string) => void;
  viewMode: 'compromissos' | 'disponibilidade';
  setViewMode: (mode: 'compromissos' | 'disponibilidade') => void;
  onAppointmentClick: (details: ScheduleSlot['details']) => void;
  onSlotClick: (slotInfo: { agent: Agent, start: number, date: Date }) => void;
  unitSchedules?: Record<string, UnitSchedule[]>; // ✅ NOVO: Horários de funcionamento por unidade
  agents?: Agent[]; // ✅ NOVO: Lista de agentes para filtrar por local
  selectedDate?: Date; // ✅ NOVO: Data selecionada
  onDateChange?: (date: Date) => void; // ✅ NOVO: Callback para mudar data
  appointments?: BackendAgendamento[]; // ✅ NOVO: Agendamentos do dia
  backendAgentes?: BackendAgente[]; // ✅ NOVO: Agentes do backend para detalhes
}

const PreviewSection: React.FC<PreviewSectionProps> = ({ 
    schedules,
    locations,
    services,
    selectedLocation,
    setSelectedLocation,
    selectedService,
    setSelectedService,
    viewMode,
    setViewMode,
    onAppointmentClick,
    onSlotClick,
    unitSchedules = {}, // ✅ NOVO: Horários de funcionamento (default vazio)
    agents = [], // ✅ NOVO: Lista de agentes (default vazio)
    selectedDate: propSelectedDate, // ✅ NOVO: Data selecionada (prop)
    onDateChange, // ✅ NOVO: Callback para mudar data
    appointments = [], // ✅ NOVO: Agendamentos do dia
    backendAgentes = [] // ✅ NOVO: Agentes do backend
}) => {


  // ✅ CORREÇÃO: Usar prop se fornecida, senão usar estado local
  const [internalSelectedDate, setInternalSelectedDate] = useState(new Date());
  const selectedDate = propSelectedDate || internalSelectedDate;
  const handleDateChange = (date: Date) => {
    if (onDateChange) {
      onDateChange(date);
    } else {
      setInternalSelectedDate(date);
    }
  };
  const [popover, setPopover] = useState<{ visible: boolean; content: NonNullable<ScheduleSlot['details']>; style: React.CSSProperties } | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const scheduleContainerRef = useRef<HTMLDivElement>(null);
  const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

  // ✅ NOVO: Filtrar agentes por local selecionado (igual CalendarPage)
  const displayedAgents = useMemo(() => {


    // ✅ CORREÇÃO: Não permitir 'all' - sempre filtrar por local específico
    if (!selectedLocation || selectedLocation === 'all' || agents.length === 0) {

      return [];
    }

    // Filtrar agentes que trabalham no local selecionado
    const locationIdStr = selectedLocation.toString();
    const filtered = agents.filter(agent => {
      const hasLocation = Array.isArray(agent.unidades) && 
                         agent.unidades.includes(locationIdStr);
      

      
      return hasLocation;
    });



    return filtered;
  }, [agents, selectedLocation]);

  // ✅ NOVO: Transformar agendamentos do backend em formato de cards por agente
  const agentAppointmentCards = useMemo(() => {


    const dateStr = selectedDate.toISOString().split('T')[0];
    const cardsByAgent: Record<string, Array<{
      id: number;
      startTime: string;
      endTime: string;
      serviceName: string;
      clientName: string;
      status: string;
      agentName: string;
      agentAvatar?: string;
      agentEmail: string;
      agentPhone?: string;
      // ✅ CRÍTICO: Campos necessários para o modal de edição
      agentId: number;
      serviceId?: number;
      clientPhone?: string;
      dateISO: string;
    }>> = {};

    // Inicializar arrays vazios para cada agente exibido
    displayedAgents.forEach(agent => {
      cardsByAgent[agent.id] = [];
    });

    // Processar agendamentos
    appointments.forEach(apt => {
      // ✅ CORREÇÃO CRÍTICA: Extrair apenas a data (YYYY-MM-DD) do campo data_agendamento
      // O backend pode retornar 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:MM:SS'
      const aptDateStr = apt.data_agendamento.split('T')[0];
      

      
      // Verificar se o agendamento é do dia selecionado
      if (aptDateStr !== dateStr) {
        return;
      }

      const agentId = apt.agente_id.toString();
      
      // Verificar se o agente está sendo exibido
      if (!cardsByAgent[agentId]) {
        return;
      }

      // Buscar nome do serviço
      let serviceName = 'Serviço';
      if (apt.servicos && apt.servicos.length > 0) {
        serviceName = apt.servicos.map(s => s.nome).join(', ');
      } else if (apt.servico_id) {
        const service = services.find(s => s.id === apt.servico_id.toString());
        serviceName = service?.name || 'Serviço';
      }

      // ✅ CORREÇÃO CRÍTICA: Buscar dados do agente com fallback robusto
      const backendAgent = backendAgentes.find(a => a.id === apt.agente_id);
      
      // ✅ PRIORIDADE: nome_exibicao > name > concatenar nome+sobrenome
      const agentName = backendAgent 
        ? (backendAgent.nome_exibicao || backendAgent.name || `${backendAgent.nome || ''} ${backendAgent.sobrenome || ''}`.trim() || 'Agente')
        : 'Agente';
      
      const agentEmail = backendAgent?.email || 'agente@email.com';
      const agentAvatar = backendAgent?.avatar_url || backendAgent?.avatar;
      


      cardsByAgent[agentId].push({
        id: apt.id,
        startTime: apt.hora_inicio,
        endTime: apt.hora_fim,
        serviceName,
        clientName: apt.cliente_nome || 'Cliente',
        status: apt.status,
        agentName,
        agentAvatar,
        agentEmail,
        agentPhone: backendAgent?.telefone,
        // ✅ CRÍTICO: Campos necessários para o modal de edição
        agentId: apt.agente_id,
        serviceId: apt.servico_id,
        clientPhone: apt.cliente_telefone,
        dateISO: aptDateStr
      });
    });


    return cardsByAgent;
  }, [appointments, displayedAgents, selectedDate, services, backendAgentes]);

  const filteredSchedules = useMemo(() => {
    // ✅ CORREÇÃO: Não permitir 'all' para location - sempre exigir local específico
    if (!selectedLocation || selectedLocation === 'all') {

      return [];
    }
    
    return schedules.map(schedule => ({
        ...schedule,
        appointments: schedule.appointments.filter(appointment => {
            if (appointment.type !== 'booked' || !appointment.details) {
                return true; 
            }
            // ✅ CRÍTICO: Sempre filtrar por locationId (não mais permitir 'all')
            const locationMatch = appointment.details.locationId === selectedLocation;
            const serviceMatch = selectedService === 'all' || appointment.details.serviceId === selectedService;
            return locationMatch && serviceMatch;
        })
    }));
  }, [schedules, selectedLocation, selectedService]);

  // ✅ NOVO: Calcular horários dinâmicos baseados nos horários de funcionamento da unidade selecionada
  const { startHour, endHour } = useMemo(() => {

    
    // Se há unidade selecionada, usar seus horários de funcionamento
    if (selectedLocation && selectedLocation !== 'all' && unitSchedules[selectedLocation]) {
      const schedules = unitSchedules[selectedLocation];
      
      // Encontrar o horário mais cedo de abertura e o mais tarde de fechamento
      let minHour = 23;
      let maxHour = 0;
      let hasValidSchedule = false; // 🚩 Flag para rastrear se um horário foi encontrado
      
      schedules.forEach(schedule => {
        // ✅ CORREÇÃO CRÍTICA: Validar que é um Array antes de iterar
        if (schedule.is_aberto && Array.isArray(schedule.horarios_json) && schedule.horarios_json.length > 0) {
          schedule.horarios_json.forEach(periodo => {
            const startH = parseInt(periodo.inicio.split(':')[0]);
            const endH = parseInt(periodo.fim.split(':')[0]);
            
            if (startH < minHour) minHour = startH;
            if (endH > maxHour) maxHour = endH;
            
            hasValidSchedule = true; // 🎯 Marcar que encontrou horário válido
          });
        }
      });
      
      // ✅ Usando a flag de rastreamento
      if (hasValidSchedule) {

        return { startHour: minHour, endHour: maxHour };
      }
    }
    
    // Fallback: usar horários padrão

    return { startHour: 9, endHour: 21 };
  }, [selectedLocation, unitSchedules]);

  // ✅ NOVO: Calcular blocos de intervalo do local (igual CalendarPage)
  const calculateLocationIntervalBlocks = useCallback((date: Date): Array<{ start: string; end: string; id: string }> => {
    if (!selectedLocation || selectedLocation === 'all') return [];

    // Helper para obter o dia da semana (1=Segunda, 7=Domingo)
    const getDayOfWeekIndex = (d: Date): number => {
      const day = d.getDay();
      return day === 0 ? 7 : day;
    };

    const dayIndex = getDayOfWeekIndex(date);
    const schedules = unitSchedules[selectedLocation];
    
    if (!schedules) return [];

    const daySchedule = schedules.find(s => s.dia_semana === dayIndex);
    
    // Se a unidade está FECHADA neste dia, bloquear o DIA INTEIRO
    if (!daySchedule || !daySchedule.is_aberto) {
      const startTime = `${startHour.toString().padStart(2, '0')}:00`;
      const endTime = `${endHour.toString().padStart(2, '0')}:00`;
      
      return [{
        start: startTime,
        end: endTime,
        id: `closed-${selectedLocation}-${dayIndex}`
      }];
    }
    
    // Se não tem horários ou tem apenas 1 período, não há intervalo
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

      // Se o fim do período atual for anterior ao início do próximo, há um intervalo
      if (currentEnd < nextStart) {
        intervals.push({
          start: currentEnd,
          end: nextStart,
          id: `interval-${selectedLocation}-${dayIndex}-${i}`
        });
      }
    }


    return intervals;
  }, [selectedLocation, unitSchedules, startHour, endHour]);

  // ✅ NOVO: Calcular intervalos do local para o dia selecionado
  const locationIntervals = useMemo(() => {
    return calculateLocationIntervalBlocks(selectedDate);
  }, [calculateLocationIntervalBlocks, selectedDate]);

  // ✅ NOVO: Gerar array de horas dinâmico baseado nos horários da unidade
  const hours = useMemo(() => {
    const hourCount = endHour - startHour + 1;
    const hoursArray = Array.from({ length: hourCount }, (_, i) => i + startHour);

    return hoursArray;
  }, [startHour, endHour]);

  // ✅ CORRIGIDO: Converter horário (HH:MM) em porcentagem da timeline
  const timeToPercentage = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    // Calcular minutos totais desde startHour
    const totalMinutes = (h - startHour) * 60 + m;
    // ✅ CORREÇÃO CRÍTICA: Total de minutos no range (sem +1)
    // Se startHour=9 e endHour=17, temos 8 horas = 480 minutos
    const totalDurationMinutes = (endHour - startHour) * 60;
    return (totalMinutes / totalDurationMinutes) * 100;
  };

  // ✅ CORRIGIDO: Usar horários dinâmicos no cálculo de posição (para slots antigos)
  const getSlotStyle = (start: number, end: number) => {
    // ✅ CORREÇÃO: Garantir que os slots ocupem o espaço correto
    const totalHours = endHour - startHour;
    const left = ((start - startHour) / totalHours) * 100;
    const width = ((end - start) / totalHours) * 100;
    return { left: `${left}%`, width: `${width}%` };
  };

  // ✅ NOVO: Calcular posição de um card de agendamento na timeline
  const getAppointmentCardStyle = (startTime: string, endTime: string) => {
    const left = timeToPercentage(startTime);
    const right = timeToPercentage(endTime);
    const width = right - left;
    return { left: `${left}%`, width: `${width}%` };
  };

  const getSlotColor = (type: ScheduleSlot['type']) => {
    switch(type) {
      case 'booked': return 'bg-blue-600';
      case 'tentative': return 'bg-gray-400';
      case 'unavailable': return 'bg-transparent'; // Will use pattern for this one
    }
  }
  
  const handleSlotMouseEnter = (e: React.MouseEvent, slot: ScheduleSlot) => {
    if (slot.type !== 'booked' || !slot.details) return;
    
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
      content: slot.details,
      style: style,
    });
  };

  const handleSlotMouseLeave = () => {
    setPopover(null);
  };

  // ✅ NOVO: Handler para hover nos cards de agendamentos
  const handleAppointmentCardMouseEnter = (e: React.MouseEvent, card: {
    id: number;
    startTime: string;
    endTime: string;
    serviceName: string;
    clientName: string;
    status: string;
    agentName: string;
    agentAvatar?: string;
    agentEmail: string;
  }) => {
    // ✅ SEMPRE MOSTRAR: Seção focada em exibir agendamentos

    // Formatar data
    const formattedDate = selectedDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    
    const formattedTime = `${card.startTime} - ${card.endTime}`;

    const appointmentDetails: NonNullable<ScheduleSlot['details']> = {
      id: card.id.toString(),
      service: card.serviceName,
      client: card.clientName,
      agentName: card.agentName,
      agentAvatar: card.agentAvatar,
      agentEmail: card.agentEmail,
      agentPhone: undefined,
      date: formattedDate,
      time: formattedTime,
      serviceId: '',
      locationId: selectedLocation,
      status: card.status as any
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
  
  // ✅ NOVO: Calcular slots disponíveis baseado nos agendamentos reais do backend
  const availableSlots = useMemo(() => {


    return displayedAgents.map((agent, agentIndex) => {
      // Buscar agendamentos deste agente no dia selecionado
      const dateStr = selectedDate.toISOString().split('T')[0];
      const agentAppointments = appointments.filter(apt => {
        const aptDateStr = apt.data_agendamento.split('T')[0];
        return apt.agente_id === parseInt(agent.id) && aptDateStr === dateStr;
      });



      // Converter agendamentos para slots ocupados (formato: hora numérica)
      const busySlots = agentAppointments.map(apt => {
        const startHourNum = parseInt(apt.hora_inicio.split(':')[0]);
        const endHourNum = parseInt(apt.hora_fim.split(':')[0]);
        return { start: startHourNum, end: endHourNum };
      }).sort((a, b) => a.start - b.start);

      // Calcular slots disponíveis
      const available = [];
      let lastEnd = startHour;

      busySlots.forEach(slot => {
        if (slot.start > lastEnd) {
          available.push({ type: 'available', start: lastEnd, end: slot.start });
        }
        lastEnd = Math.max(lastEnd, slot.end);
      });

      if (lastEnd < endHour) {
        available.push({ type: 'available', start: lastEnd, end: endHour });
      }

      // ✅ DEBUG: Se não há slots disponíveis, criar um slot de teste
      if (available.length === 0 && busySlots.length === 0) {
        // Se não há agendamentos, todo o período está disponível
        available.push({ type: 'available', start: startHour, end: endHour });
      }


      return available;
    });
  }, [displayedAgents, appointments, selectedDate, startHour, endHour]);

  // ✅ CORREÇÃO: Remover opção "Todos os Locais" (igual CalendarPage)
  // Sempre deve haver um local específico selecionado
  const locationOptions = locations.map(loc => ({ 
      value: loc.id, 
      label: loc.name 
  }));

  // ✅ REMOVIDO: serviceOptions não é mais necessário

  // ✅ DEBUG: Log do estado geral da PreviewSection


  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold">Dia de Pré-Visualização</h2>
          <div className="hidden lg:flex items-center gap-2 mt-2 flex-wrap">
            <DatePicker 
                mode="single" 
                selectedDate={selectedDate} 
                onDateChange={(date) => handleDateChange(date as Date)} 
            />
            {/* ✅ CORREÇÃO: Dropdown de Local sem opção "Todos os Locais" */}
            <FilterDropdown 
                label="" 
                options={locationOptions} 
                selectedValue={selectedLocation} 
                onSelect={setSelectedLocation} 
            />

          </div>
        </div>

         <button className="p-2 -mr-2 text-gray-500 hover:text-gray-700 lg:hidden">
            <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
      
      <div className="relative" ref={scheduleContainerRef}>
        <div className="grid text-center text-sm text-gray-500 mb-4" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
          {hours.map(hour => <div key={hour}>{hour}</div>)}
        </div>
        
        <div className="space-y-4">
          {displayedAgents.map((agent, agentIndex) => (
            <div key={agent.id} className="flex items-center gap-4 h-12">
              <img src={agent.avatar} alt={agent.name} className="w-10 h-10 rounded-full object-cover"/>
              <div className="flex-1 bg-gray-100 h-full rounded relative overflow-hidden">
                {/* ✅ CORRIGIDO: Grid com divisões corretas usando CSS Grid */}
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${hours.length - 1}, 1fr)` }}>
                   {hours.slice(0, -1).map((h, idx) => (
                     <div key={`line-${h}`} className="border-r border-dashed border-gray-300"></div>
                   ))}
                </div>
                


                {/* ✅ SLOTS CLICÁVEIS: Implementação idêntica à CalendarPage - SEMPRE RENDERIZADOS */}
                {(() => {
                  // Filtrar agendamentos deste agente no dia selecionado
                  const dateStr = selectedDate.toISOString().split('T')[0];
                  const agentAppointments = appointments.filter(apt => {
                    const aptDateStr = apt.data_agendamento.split('T')[0];
                    return apt.agente_id === parseInt(agent.id) && aptDateStr === dateStr;
                  });

                  // Criar busySlots (igual CalendarPage) - INCLUINDO INTERVALOS
                  const busySlots = [
                    ...agentAppointments.map(a => ({
                      start: a.hora_inicio,
                      end: a.hora_fim,
                      type: 'appointment'
                    })),
                    // ✅ CRÍTICO: Adicionar intervalos do local para impedir cliques
                    ...locationIntervals.map(i => ({
                      start: i.start,
                      end: i.end,
                      type: 'interval',
                      id: i.id
                    }))
                  ].sort((a, b) => a.start.localeCompare(b.start));

                  // Helper para checar se a hora está livre (igual CalendarPage)
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

                  // Iterar sobre as horas do dia para slots individuais (igual CalendarPage)
                  const iterableHours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);

                  return iterableHours.map(hour => {
                    const isAvailable = isSlotAvailable(hour);
                    if (!isAvailable) {
                      return null; // Não renderiza slot clicável
                    }

                    const slotStartStr = `${hour.toString().padStart(2, '0')}:00`;
                    const slotEndStr = `${(hour + 1).toString().padStart(2, '0')}:00`;

                    // ID do slot por hora (igual CalendarPage)
                    const slotId = `${agent.id}-${dateStr}-${slotStartStr}-${slotEndStr}`;
                    const isHovered = hoveredSlot === slotId;

                    return (
                      <div
                        key={slotId}
                        className="absolute h-full cursor-pointer z-30"
                        style={{
                          ...getSlotStyle(hour, hour + 1)
                        }}
                        onClick={() => onSlotClick({ agent: agent, start: hour, date: selectedDate })}
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
                  });
                })()}


                {/* ✅ NOVO: Renderizar cards de agendamentos do backend */}
                {agentAppointmentCards[agent.id]?.map((card) => {
                  // Determinar cor e estilo baseado no status
                  const isApproved = card.status === 'Aprovado';
                  const isCompleted = card.status === 'Concluído';
                  const isCancelled = card.status === 'Cancelado';
                  const isNoShow = card.status === 'Não Compareceu';

                  let cardClasses, iconComponent, backgroundColor;

                  if (isApproved) {
                    backgroundColor = '#2663EB'; // Azul escuro
                    cardClasses = 'text-white border border-blue-600';
                    iconComponent = <Check className="absolute top-1 right-1 h-3 w-3 text-white" />;
                  } else if (isCompleted) {
                    backgroundColor = '#DBEAFE'; // Azul claro
                    cardClasses = 'text-blue-800 border border-blue-300';
                    iconComponent = <Check className="absolute top-1 right-1 h-3 w-3 text-blue-600" />;
                  } else if (isCancelled) {
                    backgroundColor = '#FFE2E2'; // Vermelho claro
                    cardClasses = 'text-red-800 border border-red-300';
                    iconComponent = <span className="absolute top-1 right-1 text-red-600 font-bold text-xs">✕</span>;
                  } else if (isNoShow) {
                    backgroundColor = '#FEF9C3'; // Amarelo claro
                    cardClasses = 'text-yellow-800 border border-yellow-300';
                    iconComponent = <span className="absolute top-1 right-1 text-yellow-600 font-bold text-xs">!</span>;
                  } else {
                    backgroundColor = '#3B82F6'; // Azul padrão
                    cardClasses = 'text-white';
                    iconComponent = null;
                  }

                  const hasSpecialStatus = isApproved || isCompleted || isCancelled || isNoShow;

                  return (
                    <div
                      key={card.id}
                      className={`absolute h-full p-2 rounded-lg ${cardClasses} cursor-pointer hover:opacity-90 transition-opacity z-20 flex flex-col justify-center`}
                      style={{
                        ...getAppointmentCardStyle(card.startTime, card.endTime),
                        backgroundColor
                      }}
                      onMouseEnter={(e) => handleAppointmentCardMouseEnter(e, card)}
                      onMouseLeave={handleSlotMouseLeave}
                      onClick={() => {
                        // ✅ CORREÇÃO CRÍTICA: Passar TODOS os dados necessários para o modal (igual CalendarPage.tsx)
                        const details: ScheduleSlot['details'] = {
                          id: card.id.toString(),
                          service: card.serviceName,
                          client: card.clientName,
                          agentName: card.agentName,
                          agentAvatar: card.agentAvatar,
                          agentEmail: card.agentEmail,
                          agentPhone: card.agentPhone,
                          date: selectedDate.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric'
                          }),
                          time: `${card.startTime} - ${card.endTime}`,
                          // ✅ CRÍTICO: IDs e horários brutos para submissão
                          serviceId: card.serviceId?.toString() || '',
                          locationId: selectedLocation,
                          agentId: card.agentId.toString(),
                          startTime: card.startTime,
                          endTime: card.endTime,
                          dateISO: card.dateISO, // Data no formato ISO (YYYY-MM-DD)
                          status: card.status as any,
                          clientPhone: card.clientPhone || ''
                        };
                        

                        onAppointmentClick(details);
                      }}
                    >
                      <p className={`font-bold text-xs ${hasSpecialStatus ? 'opacity-80' : ''}`}>{card.serviceName}</p>
                      <p className={`text-xs ${hasSpecialStatus ? 'opacity-80' : ''}`}>{card.startTime} - {card.endTime}</p>
                      {iconComponent}
                    </div>
                  );
                })}

                {/* ✅ NOVO: Renderizar bloqueios de intervalo do local (linhas vermelhas) */}
                {locationIntervals.map(block => {
                  const blockStyle = getAppointmentCardStyle(block.start, block.end);
                  return (
                    <div 
                      key={block.id} 
                      className="absolute h-full bg-red-100 rounded z-5" 
                      style={blockStyle}
                    >
                      <div 
                        className="w-full h-full" 
                        style={{ 
                          backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 0, 0, 0.2) 4px, rgba(255, 0, 0, 0.2) 5px)' 
                        }}
                      ></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {popover?.visible && popover.content && portalRoot && createPortal(
          <div style={popover.style}>
              <AppointmentPopover appointment={popover.content} />
          </div>,
          portalRoot
      )}
    </div>
  );
};

export default PreviewSection;
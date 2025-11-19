import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Table, Download, MoreHorizontal, ChevronDown, CheckCircle, ChevronLeft, ChevronRight, X, Check, RotateCw, UserX, FaUser, MessageSquare } from './Icons';
import type { AppointmentDetail, AppointmentStatus, Location, ScheduleSlot } from '../types';
import { useAppointmentManagement, AppointmentFilters } from '../hooks/useAppointmentManagement';
import { useAuth } from '../contexts/AuthContext';
import { getAssetUrl } from '../utils/api'; // ✅ CORREÇÃO: Importar getAssetUrl para avatars
import { useCalendarData } from '../hooks/useCalendarData'; // ✅ NOVO: Hook para obter locations
import NewAppointmentModal from './NewAppointmentModal'; // ✅ NOVO: Modal para editar agendamentos

// ✅ NOVO: Componente HeaderDropdown reutilizado do CalendarPage.tsx
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

const ColumnToggle: React.FC<{ label: string; name: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, checked, onChange }) => (
    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white">
      <label htmlFor={name} className="text-gray-800 font-medium text-sm">{label}</label>
      <button
        id={name}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange({ target: { name, checked: !checked } } as any)}
        className="relative flex items-center justify-center w-6 h-6 cursor-pointer"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <input 
          type="checkbox" 
          checked={checked}
          name={name}
          onChange={onChange}
          className="sr-only"
        />
        <span className={`w-5 h-5 rounded-full border-2 transition-all ${checked ? 'border-blue-600 bg-blue-600' : 'border-gray-400 bg-white'}`}></span>
        {checked && <span className="absolute w-2 h-2 bg-white rounded-full"></span>}
      </button>
    </div>
);

const FilterInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input 
        {...props}
        className="w-full bg-white p-1.5 border border-gray-300 rounded-md text-xs text-gray-700 focus:ring-blue-500 focus:border-blue-500"
    />
);

const FilterSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, ...props }) => (
    <select 
        {...props}
        className="w-full bg-white p-1.5 border border-gray-300 rounded-md text-xs text-gray-700 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
    >
        {children}
    </select>
);

const StatusBadge: React.FC<{ status: AppointmentStatus }> = ({ status }) => {
    const statusStyles: { [key in AppointmentStatus]: { icon: React.ReactNode; text: string; className: string } } = {
        'Aprovado': { icon: <CheckCircle className="w-3 h-3" />, text: 'Aprovado', className: 'bg-green-100 text-green-800' },
        'Concluído': { icon: <Check className="w-3 h-3" />, text: 'Concluído', className: 'bg-blue-100 text-blue-800' },
        'Cancelado': { icon: <X className="w-3 h-3" />, text: 'Cancelado', className: 'bg-red-100 text-red-800' },
        'Não Compareceu': { icon: <UserX className="w-3 h-3" />, text: 'Não Compareceu', className: 'bg-gray-200 text-gray-700' },
    };

    const style = statusStyles[status];

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${style.className}`}>
            {style.icon}
            {style.text}
        </span>
    );
};

interface AppointmentsPageProps {
  loggedInAgentId: string | null;
}

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ loggedInAgentId }) => {
    const { user } = useAuth();
    const {
        appointments,
        isLoading,
        error,
        pagination,
        agentOptions,
        fetchAppointments,
        updateAppointmentStatus,
        deleteAppointment
    } = useAppointmentManagement();

    // ✅ NOVO: Hook para obter locations (unidades)
    const {
        locations: backendLocations,
    } = useCalendarData();

    const [isModalOpen, setModalOpen] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState({
        id: true,
        servico: true,
        dataHora: true,
        tempoRestante: true,
        agente: true, // Renomeado de 'selecionado' para 'agente'
        cliente: true,
        estado: true,
        statusPagamento: true,
        criadoEm: true,
        metodoPagamento: true,
        email: false,
        telefone: false,
        code: false,
        duracao: false,
        sourceId: false,
        pagamentoDeParte: false,
        preco: false,
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    
    // ✅ NOVO: Estado para seleção de Local
    const [selectedLocationFilter, setSelectedLocationFilter] = useState('all');
    
    // ✅ NOVO: Estado para popover de observações
    const [observationPopover, setObservationPopover] = useState<{
        x: number;
        y: number;
        position: 'above' | 'below';
        observacoes: string;
    } | null>(null);
    
    // ✅ NOVO: Estados para o modal de edição
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState<ScheduleSlot['details'] | null>(null);

    const initialFilters = {
        id: '',
        service: 'all',
        dateTime: '',
        timeRemainingStatus: 'all' as 'all' | AppointmentDetail['timeRemainingStatus'],
        agent: 'all',
        client: '',
        status: 'all' as AppointmentStatus | 'all',
        paymentStatus: 'all',
        createdAt: '',
        paymentMethod: 'all',
    };

    const [filters, setFilters] = useState(initialFilters);

    // ✅ NOVO: Converter locations do backend para formato do componente
    const locations: Location[] = useMemo(() => {
        return backendLocations.map(location => ({
            id: location.id,
            name: location.name
        }));
    }, [backendLocations]);
    
    // ✅ NOVO: Detectar se é plano Single ou Multi
    // Para AGENTE sem plano definido, usar lógica baseada no número de locais
    const isSinglePlan = user.plano === 'Single' || locations.length === 1 || (user.role === 'AGENTE' && locations.length === 1);
    const isMultiPlan = (user.plano === 'Multi' && locations.length > 1) || (user.role === 'AGENTE' && locations.length > 1);

    // ✅ NOVO: Auto-seleção de local baseada no PLANO (mesma lógica do CalendarPage.tsx)
    useEffect(() => {
        // 🔧 CORREÇÃO: Permitir auto-seleção quando selectedLocationFilter === 'all'
        if (locations.length === 0) return;

        // Se já tem um local específico selecionado, não alterar
        if (selectedLocationFilter !== 'all') return;

        // Caso 1: Plano Single (sempre seleciona o primeiro)
        if (isSinglePlan) {
            setSelectedLocationFilter(locations[0].id);
            return;
        }

        if (isMultiPlan) {
            // Caso 2: Plano Multi e usuário tem unidade padrão
            if (user.unidade_id) {
                const userLocation = locations.find(l => l.id === user.unidade_id?.toString());
                if (userLocation) {
                    setSelectedLocationFilter(userLocation.id);
                    return;
                }
            }

            // Caso 3: Plano Multi, sem unidade padrão (ADMIN Master)
            // Seleciona o primeiro da lista para quebrar o deadlock
            setSelectedLocationFilter(locations[0].id);
        }
    }, [locations, selectedLocationFilter, isSinglePlan, isMultiPlan, user.unidade_id]);

    // ✅ MODIFICADO: Buscar agendamentos quando filtros, página ou LOCAL mudarem
    useEffect(() => {
        // 🔧 CORREÇÃO FINAL: Não buscar se selectedLocationFilter === 'all' (aguardando auto-seleção)
        // Isso evita a requisição inicial que mostra todos os agendamentos
        if (selectedLocationFilter === 'all') {
            return;
        }

        const apiFilters: AppointmentFilters = {
            page: currentPage,
            limit: itemsPerPage,
        };

        if (filters.status !== 'all') {
            apiFilters.status = filters.status;
        }

        // ✅ NOVO: Adicionar filtro temporal para o backend
        if (filters.timeRemainingStatus !== 'all') {
            apiFilters.time_filter = filters.timeRemainingStatus;
        }

        // Se o usuário logado for um agente, filtrar apenas seus agendamentos
        if (user?.role === 'AGENTE' && user?.agentId) {
            apiFilters.agente_id = parseInt(user.agentId);
        }

        // ✅ CORREÇÃO: Sempre aplicar filtro de unidade_id quando local específico estiver selecionado
        if (selectedLocationFilter !== 'all') {
            apiFilters.unidade_id = parseInt(selectedLocationFilter);
        }
        fetchAppointments(apiFilters);
    }, [currentPage, itemsPerPage, filters.status, filters.timeRemainingStatus, selectedLocationFilter, isMultiPlan, fetchAppointments, user]);
    
    const handleColumnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setVisibleColumns(prev => ({ ...prev, [name]: checked }));
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const serviceOptions = useMemo(() => [...new Set(appointments.map(a => a.service))], [appointments]);
    // agentOptions agora vem do hook useAppointmentManagement
    const paymentStatusOptions = useMemo(() => [...new Set(appointments.map(a => a.paymentStatus))], [appointments]);
    const paymentMethodOptions = ['Não definido', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'PIX'];

    const getRemainingTimeClass = (status: AppointmentDetail['timeRemainingStatus']) => {
        switch (status) {
            case 'happening_now': return 'bg-green-100 text-green-800'; // ✅ Verde para "Agora"
            case 'soon': return 'bg-orange-100 text-orange-800'; // Laranja para "X horas"
            case 'pending': return 'bg-blue-100 text-blue-800'; // Azul para "X dias"
            case 'overdue': return 'bg-gray-100 text-gray-600'; // Cinza para "Passado"
            default: return 'bg-gray-100 text-gray-600';
        }
    };
    
    const filteredAppointments = useMemo(() => {
        // 🔍 DEBUG: Log para rastrear observações
        const app94 = appointments.find(app => app.id === 94);
        if (app94) {
            console.log('🔍 [AppointmentsPage] Agendamento #94 encontrado:', {
                id: app94.id,
                observacoes: app94.observacoes,
                hasObservacoes: !!app94.observacoes,
                observacoesTrimmed: app94.observacoes?.trim(),
                shouldShowIcon: !!(app94.observacoes && app94.observacoes.trim())
            });
        }

        // Aplicar filtros locais (os filtros do servidor já foram aplicados)
        const filtered = appointments.filter(app => {
            const { id, service, dateTime, timeRemainingStatus, agent, client, paymentStatus, createdAt, paymentMethod } = filters;

            if (id && !String(app.id).toLowerCase().includes(id.toLowerCase())) return false;
            if (service !== 'all' && app.service !== service) return false;
            if (dateTime && !app.dateTime.toLowerCase().includes(dateTime.toLowerCase())) return false;
            // ✅ REMOVIDO: Filtro temporal agora é feito no backend
            // if (timeRemainingStatus !== 'all' && app.timeRemainingStatus !== timeRemainingStatus) return false;
            if (agent !== 'all' && app.agent.name !== agent) return false;
            if (paymentStatus !== 'all' && app.paymentStatus !== paymentStatus) return false;
            if (paymentMethod !== 'all' && app.paymentMethod !== paymentMethod) return false;
            if (createdAt && !app.createdAt.toLowerCase().includes(createdAt.toLowerCase())) return false;

            // ✅ CORREÇÃO: Busca APENAS por nome do cliente (não busca agentes)
            if (client) {
                const searchTerm = client.toLowerCase();
                const matchesClient = app.client.name.toLowerCase().includes(searchTerm);

                if (!matchesClient) return false;
            }

            return true;
        });

        // ✅ ORDENAÇÃO TEMPORAL: [Agora, Horas, Dias, Passado]
        // Formato do dateTime: "7 novembro, 2025 - 10:30"
        return filtered.sort((a, b) => {
            // 🎯 ORDEM DE PRIORIDADE:
            // 1. happening_now (Agora) - verde
            // 2. soon (X horas) - laranja
            // 3. pending (X dias) - azul
            // 4. overdue (Passado) - cinza
            
            const priorityOrder: Record<AppointmentDetail['timeRemainingStatus'], number> = {
                'happening_now': 1,
                'soon': 2,
                'pending': 3,
                'overdue': 4
            };
            
            const priorityA = priorityOrder[a.timeRemainingStatus];
            const priorityB = priorityOrder[b.timeRemainingStatus];
            
            // Se têm prioridades diferentes, ordenar por prioridade
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            
            // Se têm a mesma prioridade, ordenar por timestamp (mais próximo primeiro)
            // Função auxiliar para converter dateTime string em timestamp
            const parseDateTime = (dateTimeStr: string): number => {
                try {
                    // Extrair partes: "7 novembro, 2025 - 10:30"
                    const [datePart, timePart] = dateTimeStr.split(' - ');
                    if (!datePart || !timePart) return 0;

                    // Extrair dia, mês e ano
                    const [dayStr, monthStr, yearStr] = datePart.split(' ');
                    const day = parseInt(dayStr);
                    const year = parseInt(yearStr.replace(',', ''));

                    // Mapear nome do mês para número (0-11)
                    const monthMap: { [key: string]: number } = {
                        'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3,
                        'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7,
                        'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
                    };
                    const month = monthMap[monthStr.toLowerCase()] ?? 0;

                    // Extrair hora e minuto
                    const [hourStr, minuteStr] = timePart.split(':');
                    const hour = parseInt(hourStr);
                    const minute = parseInt(minuteStr);

                    // Criar objeto Date e retornar timestamp
                    const date = new Date(year, month, day, hour, minute);
                    return date.getTime();
                } catch (error) {
                    return 0;
                }
            };

            const timestampA = parseDateTime(a.dateTime);
            const timestampB = parseDateTime(b.dateTime);

            // Ordenar crescente (mais próximo primeiro)
            return timestampA - timestampB;
        });
    }, [appointments, filters]);

    
    // ✅ NOVO: Preparar opções e handler para o dropdown de Locais
    const locationOptionsForHeader = useMemo(() => {
        return locations.map(location => location.name);
    }, [locations]);

    const selectedLocationName = useMemo(() => {
        const location = locations.find(l => l.id === selectedLocationFilter);
        return location ? location.name : 'Selecione um Local';
    }, [locations, selectedLocationFilter]);

    const handleLocationSelect = (locationName: string) => {
        const location = locations.find(l => l.name === locationName);
        if (location) {
            setSelectedLocationFilter(location.id);
            setCurrentPage(1); // Reset para primeira página ao mudar de local
        }
    };

    const handleClearFilters = () => {
        setFilters(initialFilters);
        setCurrentPage(1);
    };

    // ✅ NOVO: Handler para exibir popover de observações
    const handleObservationMouseEnter = (e: React.MouseEvent, observacoes: string) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const POPOVER_ESTIMATED_HEIGHT = 150;
        const POPOVER_MARGIN = 8;
        
        const spaceBelow = window.innerHeight - rect.bottom;
        const hasSpaceBelow = spaceBelow >= POPOVER_ESTIMATED_HEIGHT + POPOVER_MARGIN;
        const hasSpaceAbove = rect.top >= POPOVER_ESTIMATED_HEIGHT + POPOVER_MARGIN;

        const positionAbove = !hasSpaceBelow && hasSpaceAbove;

        setObservationPopover({
            x: rect.left + rect.width / 2,
            y: positionAbove ? rect.top : rect.bottom,
            position: positionAbove ? 'above' : 'below',
            observacoes
        });
    };

    // ✅ NOVO: Handler para ocultar popover de observações
    const handleObservationMouseLeave = () => {
        setObservationPopover(null);
    };

    // ✅ NOVO: Handler para abrir modal de edição ao clicar na linha
    const handleRowClick = (app: AppointmentDetail) => {
        // Converter AppointmentDetail para o formato esperado pelo modal
        const appointmentData: ScheduleSlot['details'] = {
            id: app.id.toString(),
            service: app.service,
            client: app.client.name,
            agentName: app.agent.name,
            agentAvatar: app.agent.avatar,
            agentEmail: '', // Não temos esse dado aqui
            agentPhone: '', // Não temos esse dado aqui
            date: app.dateTime,
            time: app.dateTime.split(' - ')[1] || '',
            serviceId: '', // Será carregado do backend
            locationId: selectedLocationFilter,
            status: app.status,
            agentId: app.agent.id, // ✅ CORREÇÃO: Passar ID do agente
            startTime: app.dateTime.split(' - ')[1] || '',
            endTime: '', // Será carregado do backend
            dateISO: app.date,
            clientPhone: '', // Será carregado do backend
            observacoes: app.observacoes
        };
        
        setEditingAppointment(appointmentData);
        setIsEditModalOpen(true);
    };

    // ✅ NOVO: Handler para fechar modal e recarregar dados
    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setEditingAppointment(null);
    };

    // ✅ NOVO: Handler para recarregar dados após salvar
    const handleEditSuccess = () => {
        // Recarregar agendamentos
        const apiFilters: AppointmentFilters = {
            page: currentPage,
            limit: itemsPerPage,
        };

        if (filters.status !== 'all') {
            apiFilters.status = filters.status;
        }

        if (filters.timeRemainingStatus !== 'all') {
            apiFilters.time_filter = filters.timeRemainingStatus;
        }

        if (user?.role === 'AGENTE' && user?.agentId) {
            apiFilters.agente_id = parseInt(user.agentId);
        }

        if (selectedLocationFilter !== 'all') {
            apiFilters.unidade_id = parseInt(selectedLocationFilter);
        }
        
        fetchAppointments(apiFilters);
    };

    // Função para mudar página
    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.pages) {
            setCurrentPage(newPage);
        }
    };

    // Função para atualizar status de agendamento
    const handleStatusChange = async (appointmentId: number, newStatus: AppointmentStatus) => {
        try {
            await updateAppointmentStatus(appointmentId, newStatus);
        } catch (error) {
            // Erro já tratado no hook
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Compromissos</h1>
                    <p className="text-sm text-gray-500">
                        Mostrando {filteredAppointments.length} de {pagination.total} agendamentos
                        {isLoading && ' (Carregando...)'}
                    </p>
                    {error && (
                        <p className="text-sm text-red-600 mt-1">
                            Erro: {error}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {/* ✅ NOVO: Dropdown de seleção de Local - visível apenas quando há múltiplos locais */}
                    {locations.length > 1 && (
                        <HeaderDropdown
                            options={locationOptionsForHeader}
                            selected={selectedLocationName}
                            onSelect={handleLocationSelect}
                        />
                    )}
                    <button
                        onClick={() => fetchAppointments({ page: currentPage, limit: itemsPerPage })}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1600px] text-sm table-fixed">
                        <thead className="bg-gray-50">
                            <tr>
                                {visibleColumns.id && <th className="p-3 w-28 text-left font-semibold text-gray-600 whitespace-nowrap">ID</th>}
                                {visibleColumns.servico && <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">SERVIÇO</th>}
                                {visibleColumns.dataHora && <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">DATA/HORA</th>}
                                {visibleColumns.tempoRestante && <th className="p-3 w-32 text-left font-semibold text-gray-600 whitespace-nowrap">TEMPO</th>}
                                {visibleColumns.agente && <th className="p-4 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">AGENTE</th>}
                                {visibleColumns.cliente && <th className="p-4 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">CLIENTE</th>}
                                {visibleColumns.estado && <th className="p-3 w-32 text-left font-semibold text-gray-600 whitespace-nowrap">ESTADO</th>}
                                {visibleColumns.statusPagamento && <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">STATUS DE PAGAMENTO</th>}
                                {visibleColumns.criadoEm && <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">CRIADO EM</th>}
                                {visibleColumns.metodoPagamento && <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">MÉTODO DE PAGAMENTO</th>}
                                <th className="p-3 w-40 text-left font-semibold text-gray-600 whitespace-nowrap">AÇÕES</th>
                            </tr>
                            <tr>
                                {visibleColumns.id && <td className="p-3 w-28 border-t border-gray-200"><FilterInput type="text" name="id" value={filters.id} onChange={handleFilterChange} placeholder="Pesquisar ID" /></td>}
                                {visibleColumns.servico && <td className="p-3 w-64 border-t border-gray-200"><FilterSelect name="service" value={filters.service} onChange={handleFilterChange}><option value="all">Todos Os Serviços</option>{serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}</FilterSelect></td>}
                                {visibleColumns.dataHora && <td className="p-3 w-64 border-t border-gray-200"><FilterInput type="text" name="dateTime" value={filters.dateTime} onChange={handleFilterChange} placeholder="Pesquisar Data/Hora" /></td>}
                                {visibleColumns.tempoRestante && <td className="p-3 w-32 border-t border-gray-200"><FilterSelect name="timeRemainingStatus" value={filters.timeRemainingStatus} onChange={handleFilterChange}><option value="all">Mostrar Todos</option><option value="soon">Próximo/Agora</option><option value="overdue">Passado</option><option value="pending">Futuro</option></FilterSelect></td>}
                                {visibleColumns.agente && <td className="p-4 w-64 border-t border-gray-200"><FilterSelect name="agent" value={filters.agent} onChange={handleFilterChange} disabled={user?.role === 'AGENTE'}><option value="all">Todos Os Agentes</option>{agentOptions.map(a => <option key={a} value={a}>{a}</option>)}</FilterSelect></td>}
                                {visibleColumns.cliente && <td className="p-4 w-64 border-t border-gray-200"><FilterInput type="text" name="client" value={filters.client} onChange={handleFilterChange} placeholder="Pesquisar por Cliente" /></td>}
                                {visibleColumns.estado && (
                                    <td className="p-3 w-32 border-t border-gray-200">
                                        <FilterSelect name="status" value={filters.status} onChange={handleFilterChange}>
                                            <option value="all">Mostrar Todos Os</option>
                                            <option value="Aprovado">Aprovado</option>
                                            <option value="Concluído">Concluído</option>
                                            <option value="Cancelado">Cancelado</option>
                                            <option value="Não Compareceu">Não Compareceu</option>
                                        </FilterSelect>
                                    </td>
                                )}
                                {visibleColumns.statusPagamento && <td className="p-3 w-64 border-t border-gray-200"><FilterSelect name="paymentStatus" value={filters.paymentStatus} onChange={handleFilterChange}><option value="all">Mostrar Todos Os</option>{paymentStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}</FilterSelect></td>}
                                {visibleColumns.criadoEm && <td className="p-3 w-64 border-t border-gray-200"><FilterInput type="text" name="createdAt" value={filters.createdAt} onChange={handleFilterChange} placeholder="Pesquisar Data Criação" /></td>}
                                {visibleColumns.metodoPagamento && 
                                    <td className="p-3 w-64 border-t border-gray-200">
                                        <FilterSelect name="paymentMethod" value={filters.paymentMethod} onChange={handleFilterChange}>
                                            <option value="all">Método De Pagamento</option>
                                            {paymentMethodOptions.map(m => <option key={m} value={m}>{m}</option>)}
                                        </FilterSelect>
                                    </td>
                                }
                                <td className="p-3 w-40 border-t border-gray-200">
                                     <button
                                        onClick={handleClearFilters}
                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 whitespace-nowrap"
                                    >
                                        <RotateCw className="w-3 h-3" />
                                        Limpar
                                    </button>
                                </td>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-gray-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <RotateCw className="w-4 h-4 animate-spin" />
                                            Carregando agendamentos...
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredAppointments.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-gray-500">
                                        {error ? 'Erro ao carregar agendamentos' : 'Nenhum agendamento encontrado'}
                                    </td>
                                </tr>
                            ) : (
                                filteredAppointments.map(app => (
                                    <tr 
                                        key={app.id} 
                                        className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                                        onClick={() => handleRowClick(app)}
                                    >
                                        {visibleColumns.id && <td className="p-3 w-28 text-gray-500 whitespace-nowrap">{app.id}</td>}
                                        {visibleColumns.servico && <td className="p-3 w-64 font-medium text-gray-800 flex items-center gap-2 whitespace-nowrap"><span className={`w-2 h-2 rounded-full ${app.service === 'CORTE' ? 'bg-blue-500' : 'bg-cyan-500'}`}></span><span className="truncate">{app.service}</span></td>}
                                        {visibleColumns.dataHora && <td className="p-3 w-64 text-gray-600 whitespace-nowrap">{app.dateTime}</td>}
                                        {visibleColumns.tempoRestante && <td className="p-3 w-32"><span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${getRemainingTimeClass(app.timeRemainingStatus)}`}>{app.timeRemaining}</span></td>}
                                        {visibleColumns.agente && (
                                            <td className="p-4 w-64">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative w-8 h-8">
                                                        {app.agent.avatar && !app.agent.avatar.includes('pravatar') ? (
                                                            <img
                                                                src={getAssetUrl(app.agent.avatar)}
                                                                alt={app.agent.name}
                                                                className="w-8 h-8 rounded-full object-cover border-2 border-gray-200"
                                                                onError={(e) => {
                                                                    const target = e.target as HTMLImageElement;
                                                                    target.style.display = 'none';
                                                                    const fallbackDiv = target.nextElementSibling as HTMLElement;
                                                                    if (fallbackDiv) {
                                                                        fallbackDiv.classList.remove('hidden');
                                                                    }
                                                                }}
                                                            />
                                                        ) : null}
                                                        <div className={`w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center border-2 border-gray-200 ${app.agent.avatar && !app.agent.avatar.includes('pravatar') ? 'hidden' : ''}`}>
                                                            <FaUser className="w-4 h-4 text-gray-600" />
                                                        </div>
                                                    </div>
                                                    <span className="font-medium text-gray-800 truncate">{app.agent.name}</span>
                                                </div>
                                            </td>
                                        )}
                                        {visibleColumns.cliente && (
                                            <td className="p-4 w-64">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="font-medium text-gray-800 truncate">{app.client.name}</span>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        {/* ✅ NOVO: Ícone de observações (apenas se existirem) */}
                                                        {(() => {
                                                            const hasObservacoes = app.observacoes && app.observacoes.trim();
                                                            if (app.id === 94) {
                                                                console.log('🔍 [AppointmentsPage] Renderizando linha #94:', {
                                                                    hasObservacoes,
                                                                    observacoes: app.observacoes,
                                                                    shouldRenderIcon: !!hasObservacoes,
                                                                    visibleColumns_cliente: visibleColumns.cliente
                                                                });
                                                            }
                                                            return hasObservacoes ? (
                                                                <button
                                                                    className="text-blue-600 hover:text-blue-800 p-2 transition-colors bg-blue-50 rounded-md border-2 border-blue-300"
                                                                    onMouseEnter={(e) => {
                                                                        e.stopPropagation();
                                                                        handleObservationMouseEnter(e, app.observacoes!);
                                                                    }}
                                                                    onMouseLeave={handleObservationMouseLeave}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="Ver observações"
                                                                >
                                                                    <MessageSquare className="w-5 h-5" />
                                                                </button>
                                                            ) : null;
                                                        })()}
                                                        <button 
                                                            className="text-gray-400 hover:text-gray-700 p-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        )}
                                        {visibleColumns.estado && <td className="p-3 w-32"><StatusBadge status={app.status} /></td>}
                                        {visibleColumns.statusPagamento && <td className="p-3 w-64 text-gray-600 whitespace-nowrap">{app.paymentStatus}</td>}
                                        {visibleColumns.criadoEm && <td className="p-3 w-64 text-gray-600 whitespace-nowrap">{app.createdAt}</td>}
                                        {visibleColumns.metodoPagamento && <td className="p-3 w-64 text-gray-600 whitespace-nowrap">{app.paymentMethod}</td>}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
                <p>
                    Mostrando {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, pagination.total)} de {pagination.total}
                </p>
                <div className="flex items-center gap-2">
                    <span>Página:</span>
                    <span className="font-semibold text-gray-800">{currentPage}</span>
                    <span>de {pagination.pages}</span>
                    <div className="flex items-center">
                        <button
                            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50"
                            disabled={currentPage <= 1}
                            onClick={() => handlePageChange(currentPage - 1)}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50"
                            disabled={currentPage >= pagination.pages}
                            onClick={() => handlePageChange(currentPage + 1)}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ✅ NOVO: Popover de Observações */}
            {observationPopover && (
                <div
                    className="fixed bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-sm z-50 pointer-events-none"
                    style={{
                        left: `${observationPopover.x}px`,
                        top: observationPopover.position === 'above' 
                            ? `${observationPopover.y - 8}px` 
                            : `${observationPopover.y + 8}px`,
                        transform: observationPopover.position === 'above'
                            ? 'translate(-50%, -100%)'
                            : 'translate(-50%, 0)',
                    }}
                >
                    <div className="flex items-start gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        <h3 className="text-sm font-semibold text-gray-800">Observações</h3>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">
                        {observationPopover.observacoes}
                    </p>
                    {/* Seta do popover */}
                    <div
                        className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-gray-200 transform rotate-45"
                        style={{
                            [observationPopover.position === 'above' ? 'bottom' : 'top']: '-6px',
                            borderWidth: observationPopover.position === 'above' ? '0 1px 1px 0' : '1px 0 0 1px',
                        }}
                    />
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
                    <div className="bg-gray-50 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold text-gray-800">Mostrar Colunas Adicionais</h2>
                                <button onClick={() => setModalOpen(false)} className="p-1 rounded-full hover:bg-gray-200">
                                    <X className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 space-y-6 overflow-y-auto">
                           <div>
                               <h3 className="mb-2 text-xs font-semibold text-gray-500 uppercase">CAMPOS DO CLIENTE</h3>
                               <div className="space-y-2">
                                   <ColumnToggle label="E-mail" name="email" checked={visibleColumns.email} onChange={handleColumnChange} />
                                   <ColumnToggle label="Telefone" name="telefone" checked={visibleColumns.telefone} onChange={handleColumnChange} />
                               </div>
                           </div>
                            <div>
                               <h3 className="mb-2 text-xs font-semibold text-gray-500 uppercase">RESERVAS CAMPOS</h3>
                               <div className="space-y-2">
                                   <ColumnToggle label="Code" name="code" checked={visibleColumns.code} onChange={handleColumnChange} />
                                   <ColumnToggle label="Duração" name="duracao" checked={visibleColumns.duracao} onChange={handleColumnChange} />
                                   <ColumnToggle label="Source ID" name="sourceId" checked={visibleColumns.sourceId} onChange={handleColumnChange} />
                                   <ColumnToggle label="Método De Pagamento" name="metodoPagamento" checked={visibleColumns.metodoPagamento} onChange={handleColumnChange} />
                                   <ColumnToggle label="Pagamento De Parte" name="pagamentoDeParte" checked={visibleColumns.pagamentoDeParte} onChange={handleColumnChange} />
                                   <ColumnToggle label="Preço" name="preco" checked={visibleColumns.preco} onChange={handleColumnChange} />
                               </div>
                           </div>
                        </div>
                         <div className="p-6 border-t border-gray-200 bg-white rounded-b-xl">
                            <button onClick={() => setModalOpen(false)} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors">
                                Salvar Colunas Da Tabela
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* ✅ NOVO: Modal de Edição de Agendamento */}
            <NewAppointmentModal
                isOpen={isEditModalOpen}
                onClose={handleCloseEditModal}
                selectedLocationId={selectedLocationFilter}
                isEditing={true}
                appointmentData={editingAppointment}
                onSuccess={handleEditSuccess}
            />
        </div>
    );
};

export default AppointmentsPage;
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Search, Plus, RotateCw, ChevronDown, Check } from './Icons';
import type { ScheduleSlot, Agent, AppointmentStatus } from '../types';
import AvailabilityModal from './AvailabilityModal';
import {
  useInternalBooking,
  InternalServico,
  InternalServicoExtra,
  InternalAgente,
  InternalCliente
} from '../hooks/useInternalBooking';
import { useAuth } from '../contexts/AuthContext';
import { useSettingsManagement } from '../hooks/useSettingsManagement';
import { useToast } from '../contexts/ToastContext';
import { useUnitManagement } from '../hooks/useUnitManagement';

// Helper components for styling consistency
const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
        className={`w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${className}`}
        {...props}
    />
);

const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <div className="relative">
        <select
            className={`appearance-none w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500 ${className}`}
            {...props}
        >
            {children}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
    </div>
);

const Textarea = ({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea
        className={`w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 ${className}`}
        rows={2}
        {...props}
    />
);

const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label className={`text-sm font-medium text-gray-600 mb-1 block ${className}`} {...props} />
);

const FormField: React.FC<{ label: string; children: React.ReactNode, className?: string }> = ({ label, children, className }) => (
    <div className={className}>
        <Label>{label}</Label>
        {children}
    </div>
);

const FormSection: React.FC<{ title: string; children: React.ReactNode; actions?: React.ReactNode; }> = ({ title, children, actions }) => (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-blue-600">{title}</h3>
            {actions && <div className="flex items-center gap-4">{actions}</div>}
        </div>
        {children}
    </div>
);

// MultiSelect Dropdown Component para Serviços
const ServiceMultiSelectDropdown: React.FC<{
    label: string;
    options: InternalServico[];
    selectedOptions: number[];
    onChange: (selected: number[]) => void;
    placeholder: string;
}> = ({ label, options, selectedOptions, onChange, placeholder }) => {


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

    const handleToggleOption = (optionId: number) => {
        const newSelectedOptions = selectedOptions.includes(optionId)
            ? selectedOptions.filter(item => item !== optionId)
            : [...selectedOptions, optionId];
        onChange(newSelectedOptions);
    };

    const displayValue = selectedOptions.length > 0
        ? selectedOptions.map(id => {
            // ✅ CORREÇÃO CRÍTICA: Comparação robusta de IDs (string vs number)
            const foundService = options.find(opt => String(opt.id) === String(id));

            return foundService?.nome;
        }).filter(Boolean).join(', ')
        : placeholder;



    return (
        <FormField label={label}>
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 flex justify-between items-center text-left"
                >
                    <span className="truncate">{displayValue}</span>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-48 overflow-y-auto">
                        {options.map(option => (
                            <label key={option.id} className="flex items-center p-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedOptions.some(selectedId => String(selectedId) === String(option.id))}
                                    onChange={() => handleToggleOption(option.id)}
                                    className="sr-only peer"
                                />
                                <div className="w-4 h-4 mr-3 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-sm peer-checked:bg-blue-600 peer-checked:border-blue-600">
                                   <Check className="w-2.5 h-2.5 text-white hidden peer-checked:block" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">{option.nome}</div>
                                    <div className="text-xs text-gray-500">{option.duracao_minutos} min - R$ {parseFloat(option.preco.toString()).toFixed(2)}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </FormField>
    );
};

// MultiSelect Dropdown Component para Extras
const ExtraMultiSelectDropdown: React.FC<{
    label: string;
    options: InternalServicoExtra[];
    selectedOptions: number[];
    onChange: (selected: number[]) => void;
    placeholder: string;
}> = ({ label, options, selectedOptions, onChange, placeholder }) => {
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

    const handleToggleOption = (optionId: number) => {
        const newSelectedOptions = selectedOptions.includes(optionId)
            ? selectedOptions.filter(item => item !== optionId)
            : [...selectedOptions, optionId];
        onChange(newSelectedOptions);
    };

    const displayValue = selectedOptions.length > 0
        ? selectedOptions.map(id => options.find(opt => opt.id === id)?.nome).filter(Boolean).join(', ')
        : placeholder;

    return (
        <FormField label={label}>
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 flex justify-between items-center text-left"
                >
                    <span className="truncate">{displayValue}</span>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-48 overflow-y-auto">
                        {options.map(option => (
                            <label key={option.id} className="flex items-center p-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedOptions.includes(option.id)}
                                    onChange={() => handleToggleOption(option.id)}
                                    className="sr-only peer"
                                />
                                <div className="w-4 h-4 mr-3 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-sm peer-checked:bg-blue-600 peer-checked:border-blue-600">
                                   <Check className="w-2.5 h-2.5 text-white hidden peer-checked:block" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">{option.nome}</div>
                                    <div className="text-xs text-gray-500">{option.duracao_minutos} min - R$ {parseFloat(option.preco.toString()).toFixed(2)}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </FormField>
    );
};


interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentData?: ScheduleSlot['details'];
  newSlotData?: { agent: Agent, start: number, date: Date };
  selectedLocationId?: string; // ✅ CRÍTICO: ID do local selecionado no CalendarPage
  onSuccess?: () => void; // ✅ NOVO: Callback para atualizar dados após sucesso
  // ✅ NOVO: Permite passar apenas o ID para buscar dados do agendamento internamente
  appointmentId?: number;
}

// Dados mock removidos - agora usando dados reais do useInternalBooking

const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({ isOpen, onClose, appointmentData: externalAppointmentData, newSlotData, selectedLocationId, onSuccess, appointmentId: propAppointmentId }) => {
    const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

    // Hook para dados reais
    const {
        fetchServicos,
        fetchServicosExtras,
        fetchAgentes,
        searchClientes,
        createCliente,
        fetchAgendamentoDetalhes,
        createAgendamento,
        updateAgendamento,
        finalizeAgendamento,
        isLoading,
        error
    } = useInternalBooking();

    // ✅ NOVO: Estado para dados carregados via appointmentId (prop)
    const [loadedAppointmentData, setLoadedAppointmentData] = useState<ScheduleSlot['details'] | null>(null);
    const [isLoadingFromProp, setIsLoadingFromProp] = useState(false);

    // ✅ NOVO: Usar dados externos ou carregados internamente
    const appointmentData = externalAppointmentData || loadedAppointmentData;

    // Hook para autenticação e configurações
    const { user } = useAuth();
    const { settings, loadSettings } = useSettingsManagement();
    const toast = useToast();
    const { units, fetchUnits } = useUnitManagement();

    // ✅ NOVO: Estado para seleção manual de local (quando modal aberto sem contexto)
    const [manualSelectedLocationId, setManualSelectedLocationId] = useState<string | null>(null);
    
    // ✅ NOVO: Determinar qual locationId usar (prop ou seleção manual)
    const effectiveLocationId = selectedLocationId || manualSelectedLocationId;

    // Estados para dados reais
    const [allServices, setAllServices] = useState<InternalServico[]>([]);
    const [allExtras, setAllExtras] = useState<InternalServicoExtra[]>([]);
    const [allAgents, setAllAgents] = useState<InternalAgente[]>([]); // TODOS os agentes
    const [filteredAgents, setFilteredAgents] = useState<InternalAgente[]>([]); // ✅ Agentes filtrados por unidade
    const [filteredClients, setFilteredClients] = useState<InternalCliente[]>([]);
    const [selectedClient, setSelectedClient] = useState<InternalCliente | null>(null);
    const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
    const [unitSchedule, setUnitSchedule] = useState<{ inicio: string; fim: string }[]>([]); // ✅ Horários da unidade

    const [isAvailabilityModalOpen, setAvailabilityModalOpen] = useState(false);
    const [selectedServices, setSelectedServices] = useState<number[]>([]);
    const [selectedExtras, setSelectedExtras] = useState<number[]>([]);


    const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [clientFirstName, setClientFirstName] = useState('');
    const [clientLastName, setClientLastName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [status, setStatus] = useState<AppointmentStatus>('Aprovado');
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
    const [observacoes, setObservacoes] = useState('');

    const [isSearchingClient, setIsSearchingClient] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [totalPrice, setTotalPrice] = useState(0);
    const [appointmentId, setAppointmentId] = useState<number | null>(null);
    const [isLoadingAppointment, setIsLoadingAppointment] = useState(false);

    // ✅ NOVO: Estados para sistema de pontos
    const [clienteId, setClienteId] = useState<number | null>(null);
    const [pontosDisponiveis, setPontosDisponiveis] = useState<number>(0);
    const [pontosUsados, setPontosUsados] = useState<number>(0);
    const [descontoCalculado, setDescontoCalculado] = useState<number>(0);
    const [valorFinal, setValorFinal] = useState<number>(0);
    const [podeUsarPontos, setPodeUsarPontos] = useState<boolean>(false);

    // ✅ NOVO: Configurações de pontos
    const pontosAtivo = settings?.pontos_ativo || false;
    const reaisPorPontos = settings?.reais_por_pontos || 10;

    const isEditing = !!appointmentData;
    
    // 🔍 DEBUG: Log para rastrear o que o modal está recebendo
    useEffect(() => {
        if (isOpen) {
            console.log('🔍 [NewAppointmentModal] Modal aberto com:');
            console.log('🔍 [NewAppointmentModal] isEditing:', isEditing);
            console.log('🔍 [NewAppointmentModal] appointmentData:', appointmentData);
            console.log('🔍 [NewAppointmentModal] newSlotData:', newSlotData);
            console.log('🔍 [NewAppointmentModal] propAppointmentId:', propAppointmentId);
        }
    }, [isOpen, isEditing, appointmentData, newSlotData, propAppointmentId]);

    // ✅ NOVO: Buscar dados do agendamento quando appointmentId for passado via prop
    useEffect(() => {
        const loadAppointmentFromId = async () => {
            if (!isOpen || !propAppointmentId || externalAppointmentData) {
                return; // Não buscar se já temos dados externos
            }

            console.log('🔄 [NewAppointmentModal] Buscando dados do agendamento ID:', propAppointmentId);
            setIsLoadingFromProp(true);

            try {
                const detalhes = await fetchAgendamentoDetalhes(propAppointmentId);

                if (detalhes) {
                    console.log('✅ [NewAppointmentModal] Dados do agendamento carregados:', detalhes);
                    console.log('📅 [NewAppointmentModal] data_agendamento raw:', detalhes.data_agendamento);

                    // ✅ CORREÇÃO: Extrair apenas a data (YYYY-MM-DD) do formato ISO
                    // Backend pode retornar: "2025-12-06" ou "2025-12-06T03:00:00.000Z"
                    let dateISOClean = detalhes.data_agendamento;
                    if (dateISOClean && dateISOClean.includes('T')) {
                        dateISOClean = dateISOClean.split('T')[0]; // Pega apenas "2025-12-06"
                    }
                    console.log('📅 [NewAppointmentModal] dateISO limpo:', dateISOClean);

                    // Converter dados do backend para formato ScheduleSlot['details']
                    const formattedDate = new Date(dateISOClean + 'T12:00:00').toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                    });
                    const formattedTime = `${detalhes.hora_inicio} - ${detalhes.hora_fim}`;

                    const convertedData: ScheduleSlot['details'] = {
                        id: detalhes.id.toString(),
                        service: detalhes.servicos?.[0]?.nome || 'Serviço não encontrado',
                        client: detalhes.cliente?.nome_completo || '',
                        agentName: detalhes.agente?.nome || '',
                        agentAvatar: '',
                        agentEmail: '',
                        agentPhone: '',
                        date: formattedDate,
                        time: formattedTime,
                        serviceId: detalhes.servicos?.[0]?.id?.toString() || '',
                        locationId: detalhes.unidade_id?.toString() || selectedLocationId || '', // ✅ USAR unidade_id do agendamento
                        agentId: detalhes.agente_id?.toString() || '',
                        startTime: detalhes.hora_inicio,
                        endTime: detalhes.hora_fim,
                        dateISO: dateISOClean, // ✅ CORREÇÃO: Usar data limpa (YYYY-MM-DD)
                        status: detalhes.status as any || 'Aprovado',
                        clientPhone: detalhes.cliente?.telefone || '',
                        observacoes: detalhes.observacoes
                    };

                    console.log('📤 [NewAppointmentModal] Dados convertidos:', convertedData);
                    setLoadedAppointmentData(convertedData);
                } else {
                    console.error('❌ [NewAppointmentModal] Agendamento não encontrado');
                }
            } catch (err) {
                console.error('❌ [NewAppointmentModal] Erro ao buscar agendamento:', err);
            } finally {
                setIsLoadingFromProp(false);
            }
        };

        loadAppointmentFromId();
    }, [isOpen, propAppointmentId, externalAppointmentData, fetchAgendamentoDetalhes, selectedLocationId]);

    // ✅ NOVO: Carregar unidades quando modal abre
    useEffect(() => {
        if (isOpen) {
            fetchUnits();
        }
    }, [isOpen, fetchUnits]);

    // Carregar dados iniciais
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [servicos, extras, agentes] = await Promise.all([
                    fetchServicos(),
                    fetchServicosExtras(),
                    fetchAgentes()
                ]);


                setAllServices(servicos);
                setAllExtras(extras);
                setAllAgents(agentes);
                
                // ✅ NOVO: Carregar configurações de pontos
                await loadSettings();
            } catch (error) {
            }
        };

        if (isOpen) {
            loadInitialData();
        }
    }, [isOpen, fetchServicos, fetchServicosExtras, fetchAgentes, loadSettings]);

    // ✅ FILTRAR AGENTES POR UNIDADE SELECIONADA
    useEffect(() => {
        if (!effectiveLocationId || allAgents.length === 0) {
            setFilteredAgents([]);
            return;
        }

        // Filtrar agentes que trabalham na unidade selecionada
        const agentesNaUnidade = allAgents.filter(agente => {
            // Verificar se o agente tem a propriedade unidades (array de IDs)
            // Ou se tem unidade_id (ID único)
            const agenteUnidades = (agente as any).unidades || [];
            const agenteUnidadeId = (agente as any).unidade_id;
            
            // ✅ CORREÇÃO CRÍTICA: Converter effectiveLocationId para número para comparação
            const locationIdNumber = parseInt(effectiveLocationId);
            
            // Verificar se o agente trabalha nesta unidade
            return agenteUnidades.includes(locationIdNumber) || 
                   agenteUnidadeId === locationIdNumber;
        });

        setFilteredAgents(agentesNaUnidade);

        // ✅ CORREÇÃO CRÍTICA: NÃO sobrescrever agente se estamos em modo de edição
        // O agente já foi definido pelo useEffect de carregamento de dados
        if (isEditing && selectedAgentId) {
            return;
        }

        // ✅ CORREÇÃO: Auto-seleção inteligente (APENAS para novos agendamentos)
        // 1. Se usuário é AGENTE, selecionar ele mesmo
        if (user?.role === 'AGENTE' && user?.agentId) {
            const agenteLogado = agentesNaUnidade.find(a => a.id.toString() === user.agentId);
            if (agenteLogado) {
                setSelectedAgentId(agenteLogado.id);
                return;
            }
        }
        
        // 2. Se há apenas um agente na unidade, selecionar automaticamente
        if (agentesNaUnidade.length === 1) {
            setSelectedAgentId(agentesNaUnidade[0].id);
        }
    }, [effectiveLocationId, allAgents, user, isEditing, selectedAgentId]);

    // ✅ BUSCAR HORÁRIOS DE FUNCIONAMENTO DA UNIDADE SELECIONADA
    useEffect(() => {
        const fetchUnitSchedule = async () => {
            if (!effectiveLocationId || effectiveLocationId === 'all') {
                setUnitSchedule([]);
                return;
            }

            try {
                const token = localStorage.getItem('authToken');
                if (!token) return;

                const response = await fetch(`http://localhost:3000/api/unidades/${effectiveLocationId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    console.error('❌ [NewAppointmentModal] Erro ao buscar horários da unidade:', response.status);
                    return;
                }

                const data = await response.json();
                if (data.success && data.data.horarios_funcionamento) {
                    // Extrair horários de todos os dias da semana
                    const todosHorarios: { inicio: string; fim: string }[] = [];
                    data.data.horarios_funcionamento.forEach((dia: any) => {
                        if (dia.is_aberto && dia.horarios_json) {
                            todosHorarios.push(...dia.horarios_json);
                        }
                    });

                    setUnitSchedule(todosHorarios);
                }
            } catch (error) {
                console.error('❌ [NewAppointmentModal] Erro ao buscar horários da unidade:', error);
            }
        };

        fetchUnitSchedule();
    }, [effectiveLocationId]);

    // Busca dinâmica de clientes
    useEffect(() => {
        const searchClientsDebounced = async () => {
            if (clientSearchQuery.trim().length >= 2) {
                try {
                    const clientes = await searchClientes(clientSearchQuery.trim());
                    setFilteredClients(clientes);
                } catch (error) {
                    setFilteredClients([]);
                }
            } else {
                setFilteredClients([]);
            }
        };

        const timeoutId = setTimeout(searchClientsDebounced, 300); // Debounce de 300ms
        return () => clearTimeout(timeoutId);
    }, [clientSearchQuery, searchClientes]);

    const calculateEndTime = (startTimeStr: string, serviceIds: number[], extraIds: number[]): string => {
        if (!startTimeStr) return '';

        const totalDuration = serviceIds.reduce((acc, serviceId) => {
            const service = allServices.find(s => s.id === serviceId);
            return acc + (service?.duracao_minutos || 0);
        }, 0) + extraIds.reduce((acc, extraId) => {
            const extra = allExtras.find(e => e.id === extraId);
            return acc + (extra?.duracao_minutos || 0);
        }, 0);

        if (totalDuration === 0) return '';

        const [hours, minutes] = startTimeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return '';

        const startDate = new Date();
        startDate.setHours(hours, minutes, 0, 0);

        const endDate = new Date(startDate.getTime() + totalDuration * 60000);

        const endHours = String(endDate.getHours()).padStart(2, '0');
        const endMinutes = String(endDate.getMinutes()).padStart(2, '0');

        return `${endHours}:${endMinutes}`;
    };

    // ✅ Função para gerar horários disponíveis baseados nos horários da unidade
    const generateAvailableTimeSlots = (selectedDate: string, agentId: number | null): string[] => {
        if (!selectedDate || !agentId) return [];

        // ✅ CORREÇÃO CRÍTICA: Usar horários reais da unidade ao invés de hardcoded
        if (unitSchedule.length === 0) {
            return [];
        }

        const timeSlots: string[] = [];
        const intervalMinutes = 30; // Intervalos de 30 minutos

        // Gerar slots baseados nos horários reais da unidade
        for (const periodo of unitSchedule) {
            const [startHour, startMinute] = periodo.inicio.split(':').map(Number);
            const [endHour, endMinute] = periodo.fim.split(':').map(Number);
            
            const startTotalMinutes = startHour * 60 + startMinute;
            const endTotalMinutes = endHour * 60 + endMinute;

            for (let totalMinutes = startTotalMinutes; totalMinutes < endTotalMinutes; totalMinutes += intervalMinutes) {
                const hour = Math.floor(totalMinutes / 60);
                const minute = totalMinutes % 60;
                const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                
                // Evitar duplicatas
                if (!timeSlots.includes(timeString)) {
                    timeSlots.push(timeString);
                }
            }
        }



        // TODO: Filtrar horários já ocupados consultando agendamentos existentes
        return timeSlots.sort();
    };

    const handleRecalculate = () => {
        // USAR ESTADOS DIRETAMENTE - sem parâmetros

        let currentTotal = 0;

        selectedServices.forEach(serviceId => {
            const service = allServices.find(s => s.id === serviceId);
            if (service) {
                currentTotal += parseFloat(service.preco.toString());
            } else {
            }
        });

        selectedExtras.forEach(extraId => {
            const extra = allExtras.find(e => e.id === extraId);
            if (extra) {
                currentTotal += parseFloat(extra.preco.toString());
            } else {
            }
        });

        setTotalPrice(currentTotal);
    };

    // ✅ CORREÇÃO CRÍTICA: Resetar formulário ANTES de carregar dados (APENAS para novos agendamentos)
    useEffect(() => {
        // ✅ NOVO: Limpar dados carregados quando modal fecha
        if (!isOpen) {
            setLoadedAppointmentData(null);
            // ✅ CORREÇÃO: Limpar estados de pontos ao fechar modal
            setClienteId(null);
            setPontosDisponiveis(0);
            setPontosUsados(0);
            setPodeUsarPontos(false);
            setDescontoCalculado(0);
            setValorFinal(0);
            return;
        }

        // ⚠️ IMPORTANTE: Só resetar se NÃO for edição
        if (isEditing) {
            return;
        }
        setIsSearchingClient(false);
        setClientSearchQuery('');
        setTotalPrice(0);

        // Se é novo slot (não é edição)
        if (newSlotData) {
            setSelectedServices([]);
            setSelectedExtras([]);

            // ✅ CORREÇÃO: Preencher horário E data
            setStartTime(`${String(newSlotData.start).padStart(2,'0')}:00`);
            setEndTime('');

            // ✅ CORREÇÃO CRÍTICA: Garantir que a data seja preenchida corretamente
            const dateObj = newSlotData.date;
            const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
            setDate(formattedDate);

            // ✅ NOVA CORREÇÃO: Pré-selecionar o agente baseado no slot clicado
            if (newSlotData.agent && newSlotData.agent.id) {
                // Converter string para number se necessário
                const agentId = typeof newSlotData.agent.id === 'string'
                    ? parseInt(newSlotData.agent.id)
                    : newSlotData.agent.id;
                setSelectedAgentId(agentId);
            }

            setClientFirstName('');
            setClientLastName('');
            setClientPhone('');
            setSelectedClient(null);
            setStatus('Aprovado');
            setObservacoes('');
        }
        // Se não é edição nem novo slot, resetar tudo
        else {
            setSelectedServices([]);
            setSelectedExtras([]);
            setSelectedAgentId(allAgents.length === 1 ? allAgents[0]?.id : null);
            setDate('');
            setStartTime('');
            setEndTime('');
            setClientFirstName('');
            setClientLastName('');
            setClientPhone('');
            setSelectedClient(null);
            setStatus('Aprovado');
            setAppointmentId(null);
            setObservacoes('');
        }
    }, [isOpen, isEditing, newSlotData, allAgents]);

    // ✅ CORREÇÃO CRÍTICA: Preencher formulário com dados passados pelo CalendarPage
    // Elimina necessidade de buscar no backend, resolvendo problema de 403 para AGENTE
    useEffect(() => {
        const loadAppointmentDetails = async () => {
            if (!isOpen || !isEditing || !appointmentData) {
                return;
            }

            // ✅ AGUARDAR SERVIÇOS SEREM CARREGADOS ANTES DE DEFINIR selectedServices
            if (allServices.length === 0) {
                return;
            }


            
            setIsLoadingAppointment(true);
            try {
                // ✅ SOLUÇÃO: Usar dados passados pelo CalendarPage ao invés de buscar no backend
                // Isso evita erro 403 quando AGENTE tenta editar agendamento
                
                const parsedId = parseInt(appointmentData.id);
                setAppointmentId(parsedId);
                
                // ✅ Preencher agente
                if (appointmentData.agentId) {
                    const agentIdNumber = typeof appointmentData.agentId === 'string' 
                        ? parseInt(appointmentData.agentId) 
                        : appointmentData.agentId;
                    setSelectedAgentId(agentIdNumber);
                }
                
                // ✅ Preencher status
                if (appointmentData.status) {
                    setStatus(appointmentData.status as AppointmentStatus);
                }
                
                // ✅ Preencher horários
                if (appointmentData.startTime) {
                    setStartTime(appointmentData.startTime);
                }
                if (appointmentData.endTime) {
                    setEndTime(appointmentData.endTime);
                }
                
                // ✅ Preencher data (converter de ISO para DD/MM/YYYY)
                if (appointmentData.dateISO) {
                    const [ano, mes, dia] = appointmentData.dateISO.split('-');
                    const formattedDate = `${dia}/${mes}/${ano}`;
                    setDate(formattedDate);
                }
                
                // ✅ Preencher cliente
                if (appointmentData.client) {
                    const nameParts = appointmentData.client.split(' ');
                    const firstName = nameParts[0] || '';
                    const lastName = nameParts.slice(1).join(' ') || '';
                    
                    setClientFirstName(firstName);
                    setClientLastName(lastName);
                    setClientPhone((appointmentData.clientPhone || '').replace('+55', '').trim());
                }
                
                // ✅ Preencher observações (se existirem)
                if (appointmentData.observacoes) {
                    setObservacoes(appointmentData.observacoes);
                }
                
                // ⚠️ TEMPORÁRIO: NÃO usar serviceId passado se não existir nos serviços disponíveis
                // Deixar vazio e aguardar busca do backend
                if (appointmentData.serviceId) {
                    const serviceIdNumber = typeof appointmentData.serviceId === 'string' 
                        ? parseInt(appointmentData.serviceId) 
                        : appointmentData.serviceId;
                    
                    // ✅ VERIFICAR se o serviço existe antes de definir
                    const serviceExists = allServices.some(s => s.id === serviceIdNumber);
                    if (serviceExists) {
                        setSelectedServices([serviceIdNumber]);
                    } else {
                        setSelectedServices([]); // Deixar vazio para ser preenchido pelo backend
                    }
                }
                
                // ✅ CORREÇÃO CRÍTICA: AGENTE agora pode buscar detalhes do backend
                // O backend já valida que AGENTE só pode acessar seus próprios agendamentos
                if (appointmentData.id) {
                    try {
                        const details = await fetchAgendamentoDetalhes(parseInt(appointmentData.id));

                        if (details) {
                            // Extrair IDs dos serviços e extras
                            const servicoIds = details.servicos?.map(s => s.id) || [];
                            const extraIds = details.extras?.map(e => e.id) || [];

                            // ✅ Atualizar serviços apenas se a busca retornou dados
                            if (servicoIds.length > 0) {
                                setSelectedServices(servicoIds);
                            }
                            setSelectedExtras(extraIds);

                            // Calcular preço total
                            let calculatedTotal = 0;
                            
                            if (details.servicos && details.servicos.length > 0) {
                                details.servicos.forEach(servico => {
                                    const preco = servico.preco_aplicado || servico.preco;
                                    calculatedTotal += parseFloat(preco.toString());
                                });
                            }

                            if (details.extras && details.extras.length > 0) {
                                details.extras.forEach(extra => {
                                    const preco = extra.preco_aplicado || extra.preco;
                                    calculatedTotal += parseFloat(preco.toString());
                                });
                            }

                            setTotalPrice(calculatedTotal);
                            
                            // ✅ Preencher observações do backend (sobrescreve se houver)
                            if (details.observacoes) {
                                setObservacoes(details.observacoes);
                            }
                            
                            // ✅ CORREÇÃO: Preencher telefone do cliente do backend
                            if (details.cliente && details.cliente.telefone) {
                                setClientPhone(details.cliente.telefone.replace('+55', '').trim());
                            }
                            
                            // ✅ CORREÇÃO: Apenas armazenar ID do cliente e unidade_id
                            // A busca de pontos agora é feita em um useEffect separado que depende de settings
                            if (details.cliente && details.cliente.id) {
                                setClienteId(details.cliente.id);
                            }
                        }
                    } catch (error) {
                        // ✅ NÃO BLOQUEAR: Mesmo sem serviços/extras, o usuário pode finalizar o agendamento
                        // Os serviços já foram preenchidos com serviceId passado
                    }
                }
            } catch (error) {
                console.error('❌ [NewAppointmentModal] Erro ao preencher formulário:', error);
            } finally {
                setIsLoadingAppointment(false);
            }
        };

        loadAppointmentDetails();
    }, [isOpen, isEditing, appointmentData, fetchAgendamentoDetalhes, allServices]);



    useEffect(() => {
        if (startTime && (selectedServices.length > 0 || selectedExtras.length > 0)) {
            const newEndTime = calculateEndTime(startTime, selectedServices, selectedExtras);
            setEndTime(newEndTime);
        } else {
            setEndTime('');
        }
    }, [startTime, selectedServices, selectedExtras, allServices, allExtras]);

    // Atualizar horários disponíveis quando agente ou data mudarem
    useEffect(() => {
        if (date && selectedAgentId) {
            const slots = generateAvailableTimeSlots(date, selectedAgentId);
            setAvailableTimeSlots(slots);
        } else {
            setAvailableTimeSlots([]);
        }
    }, [date, selectedAgentId]);

    // ✅ RESTAURADO: useEffect dedicado ao cálculo de preço (com lógica corrigida)
    useEffect(() => {
        // Só calcular se as listas de serviços/extras JÁ estiverem carregadas
        if (allServices.length > 0 || allExtras.length > 0) {
            handleRecalculate();
        } else {
        }
        // Depender de TUDO que afeta o preço
    }, [selectedServices, selectedExtras, allServices, allExtras]);

    // ✅ CORREÇÃO CRÍTICA: Buscar pontos do cliente DEPOIS que settings estiver carregado
    // Este useEffect separado garante que pontosAtivo esteja correto antes de fazer a busca
    useEffect(() => {
        const buscarPontosDoCliente = async () => {
            // ✅ Precisa de: modal aberto, cliente identificado, settings carregado, pontos ativo
            if (!isOpen || !clienteId || !settings || !pontosAtivo) {
                return;
            }

            // ✅ Usar locationId do appointmentData (vem do agendamento) ou selectedLocationId
            const unidadeId = appointmentData?.locationId || selectedLocationId;

            if (!unidadeId) {
                console.log('⚠️ [Pontos] unidadeId não disponível');
                return;
            }

            console.log('🔍 [Pontos] Buscando pontos do cliente:', clienteId, 'unidade:', unidadeId);

            try {
                const token = localStorage.getItem('authToken');
                const response = await fetch(
                    `http://localhost:3000/api/clientes/${clienteId}/pontos?unidade_id=${unidadeId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    console.log('✅ [Pontos] Dados recebidos:', data);
                    setPontosDisponiveis(data.pontos_disponiveis || 0);
                    setPodeUsarPontos(data.pode_usar_pontos || false);
                } else {
                    console.error('❌ [Pontos] Erro na resposta:', response.status);
                }
            } catch (error) {
                console.error('❌ [Pontos] Erro ao buscar pontos do cliente:', error);
            }
        };

        buscarPontosDoCliente();
    }, [isOpen, clienteId, settings, pontosAtivo, appointmentData?.locationId, selectedLocationId]);

    // ✅ NOVO: Calcular desconto e valor final quando pontos usados mudarem
    useEffect(() => {
        if (!pontosAtivo || pontosUsados === 0) {
            setDescontoCalculado(0);
            setValorFinal(totalPrice);
            return;
        }

        // Fórmula: desconto = (pontos / reais_por_pontos) * 1
        // Exemplo: 400 pontos / 20 = 20 reais de desconto
        const desconto = (pontosUsados / reaisPorPontos) * 1;
        const valorComDesconto = Math.max(0, totalPrice - desconto);

        setDescontoCalculado(desconto);
        setValorFinal(valorComDesconto);
    }, [pontosUsados, totalPrice, pontosAtivo, reaisPorPontos]);

    if (!isOpen || !portalRoot) return null;

    const handleDateTimeSelect = (selectedDateTime: { date: Date, time: string }) => {

        if (!selectedDateTime) {
            return;
        }

        const { date: selectedDate, time: selectedTime } = selectedDateTime;

        if (!selectedDate) {
            return;
        }

        if (!selectedTime) {
            return;
        }

        setDate(`${String(selectedDate.getDate()).padStart(2, '0')}/${String(selectedDate.getMonth() + 1).padStart(2, '0')}/${selectedDate.getFullYear()}`);
        setStartTime(selectedTime);
    };

    const handleModalContentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };
    
    const modalTitle = isEditing ? 'Editar Agendamento' : 'Novo Agendamento';
    const submitButtonText = isEditing ? 'Salvar Alterações' : 'Criar Compromisso';

    const handleSelectClient = async (client: InternalCliente) => {
        setSelectedClient(client);
        setClientFirstName(client.primeiro_nome);
        setClientLastName(client.ultimo_nome);
        setClientPhone(client.telefone.replace('+55', '').trim());
        setIsSearchingClient(false);
        setClientSearchQuery('');
        
        // ✅ NOVO: Armazenar ID do cliente e buscar pontos
        setClienteId(client.id);
        
        if (pontosAtivo && selectedLocationId) {
            try {
                const token = localStorage.getItem('authToken');
                const response = await fetch(
                    `http://localhost:3000/api/clientes/${client.id}/pontos?unidade_id=${selectedLocationId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    setPontosDisponiveis(data.pontos_disponiveis || 0);
                    setPodeUsarPontos(data.pode_usar_pontos || false);
                }
            } catch (error) {
                console.error('❌ Erro ao buscar pontos do cliente:', error);
            }
        }
    }

    const handleCreateNewClient = async () => {
        const nomeCompleto = clientSearchQuery.trim();
        const nomePartes = nomeCompleto.split(' ');
        const primeiroNome = nomePartes[0] || '';
        const ultimoNome = nomePartes.slice(1).join(' ') || '';

        // Preencher os campos do formulário com os dados do novo cliente
        setClientFirstName(primeiroNome);
        setClientLastName(ultimoNome);
        setClientPhone(''); // Usuário precisará inserir o telefone
        setIsSearchingClient(false);
        setClientSearchQuery('');
        setSelectedClient(null); // Indica que é um novo cliente
    }

    const handleSubmit = async () => {
        try {
            // Validações básicas
            if (!selectedAgentId) {
                toast.warning('Campo Obrigatório', 'Por favor, selecione um agente.');
                return;
            }

            if (selectedServices.length === 0) {
                toast.warning('Campo Obrigatório', 'Por favor, selecione pelo menos um serviço.');
                return;
            }

            if (!date || !startTime) {
                toast.warning('Campos Obrigatórios', 'Por favor, preencha a data e horário.');
                return;
            }

            if (!clientFirstName.trim() || !clientPhone.trim()) {
                toast.warning('Dados do Cliente', 'Por favor, preencha o nome e telefone do cliente.');
                return;
            }

            // Converter data do formato DD/MM/AAAA para AAAA-MM-DD
            const [dia, mes, ano] = date.split('/');
            const dataFormatada = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;

            // ✅ CORREÇÃO CRÍTICA: Usar effectiveLocationId (selectedLocationId OU manualSelectedLocationId)
            if (!effectiveLocationId) {
                toast.error('Local Não Selecionado', 'Por favor, selecione um local.');
                return;
            }

            // Validar se endTime foi calculado
            if (!endTime) {
                toast.error('Erro de Cálculo', 'Horário de fim não foi calculado. Verifique os serviços selecionados.');
                return;
            }

            const agendamentoData = {
                agente_id: selectedAgentId,
                servico_ids: selectedServices,
                servico_extra_ids: selectedExtras,
                data_agendamento: dataFormatada,
                hora_inicio: startTime,
                hora_fim: endTime,
                unidade_id: parseInt(effectiveLocationId),
                observacoes: observacoes.trim() || '',
                ...(selectedClient
                    ? { cliente_id: selectedClient.id }
                    : {
                        cliente_nome: `${clientFirstName.trim()} ${clientLastName.trim()}`.trim(),
                        cliente_telefone: `+55${clientPhone.replace(/\D/g, '')}`
                    }
                )
            };

            if (isEditing && appointmentId) {
                
                const updateData = {
                    agente_id: selectedAgentId,
                    servico_ids: selectedServices,
                    servico_extra_ids: selectedExtras,
                    data_agendamento: dataFormatada,
                    hora_inicio: startTime,
                    hora_fim: endTime,
                    status: status,
                    forma_pagamento: paymentMethod,
                    observacoes: observacoes.trim() || '',
                    // ✅ NOVO: Incluir pontos usados se houver
                    ...(pontosUsados > 0 && clienteId ? { pontos_usados: pontosUsados, cliente_id: clienteId } : {}),
                    ...(selectedClient
                        ? { cliente_id: selectedClient.id }
                        : {
                            cliente_nome: `${clientFirstName.trim()} ${clientLastName.trim()}`.trim(),
                            cliente_telefone: `+55${clientPhone.replace(/\D/g, '')}`
                        }
                    )
                };

                
                try {
                    const resultado = await updateAgendamento(appointmentId, updateData);

                    if (resultado) {
                        toast.success('Agendamento Atualizado!', 'As alterações foram salvas com sucesso.');
                        onClose();
                        // ✅ NOVO: Chamar callback de sucesso para atualizar dados
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        throw new Error('Resposta vazia do servidor');
                    }
                } catch (updateError) {
                    console.error('❌ [NewAppointmentModal] Erro ao atualizar:', updateError);
                    throw updateError;
                }
            } else {
                const resultado = await createAgendamento(agendamentoData);

                if (resultado && resultado.success) {
                    toast.success('Agendamento Criado!', 'O agendamento foi criado com sucesso.');
                    onClose();
                    // ✅ NOVO: Chamar callback de sucesso para atualizar dados
                    if (onSuccess) {
                        onSuccess();
                    }
                } else {
                    throw new Error(resultado?.message || 'Erro ao criar agendamento');
                }
            }
        } catch (error) {
            console.error('❌ [NewAppointmentModal] Erro ao salvar agendamento:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            toast.error('Erro ao Salvar', `Não foi possível salvar o agendamento: ${errorMessage}`);
        }
    }

    const renderClientContent = () => {
        if (isSearchingClient) {
            return (
                <div>
                    <div className="relative mb-4">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Comece a digitar para pesquisar..."
                            value={clientSearchQuery}
                            onChange={(e) => setClientSearchQuery(e.target.value)}
                            className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pl-10 pr-24 focus:ring-blue-500 focus:border-blue-500"
                        />
                         <button 
                            onClick={() => { setIsSearchingClient(false); setClientSearchQuery(''); }}
                            className="absolute inset-y-0 right-0 px-3 text-sm font-semibold text-red-600 hover:text-red-800"
                        >
                            x cancelar
                        </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                        {filteredClients.length > 0 ? (
                            filteredClients.map(client => (
                                <div
                                    key={client.id}
                                    onClick={() => handleSelectClient(client)}
                                    className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-200"
                                >
                                    <p className="font-bold text-gray-800">{client.nome_completo}</p>
                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span>ID: {client.id}</span>
                                        <span>Telefone: {client.telefone}</span>
                                        {client.is_assinante && <span className="text-green-600">✓ Assinante</span>}
                                    </div>
                                </div>
                            ))
                        ) : clientSearchQuery.trim().length >= 2 ? (
                            <div className="p-4 text-center">
                                <p className="text-gray-500 mb-3">Nenhum cliente encontrado para "{clientSearchQuery}"</p>
                                <button
                                    onClick={() => handleCreateNewClient()}
                                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Criar Novo Cliente
                                </button>
                            </div>
                        ) : (
                            <div className="p-4 text-center text-gray-500">
                                Digite pelo menos 2 caracteres para buscar
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Primeiro Nome">
                        <Input placeholder="Primeiro Nome" value={clientFirstName} onChange={e => setClientFirstName(e.target.value)} />
                    </FormField>
                    <FormField label="Último Nome">
                        <Input placeholder="Último Nome" value={clientLastName} onChange={e => setClientLastName(e.target.value)} />
                    </FormField>
                </div>
                <FormField label="Número De Telefone">
                    <div className="flex items-center w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                        <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                        <span className="text-gray-600 pr-2">+55</span>
                        <input 
                            type="tel" 
                            placeholder="11 96123-4567" 
                            className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400"
                            value={clientPhone}
                            onChange={e => setClientPhone(e.target.value)}
                         />
                    </div>
                </FormField>
            </div>
        );
    };

    return createPortal(
        <>
            <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose} aria-labelledby="modal-title" role="dialog" aria-modal="true">
                <div 
                    className="relative flex w-full max-w-2xl flex-col bg-gray-50 shadow-xl transform transition-transform duration-300 ease-in-out" 
                    onClick={handleModalContentClick}
                    style={{ animation: 'slideInFromRight 0.3s forwards' }}
                >
                    <style>{`
                        @keyframes slideInFromRight {
                            from { transform: translateX(100%); }
                            to { transform: translateX(0); }
                        }
                    `}</style>
                    
                    <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white flex-shrink-0">
                        <h2 className="text-xl font-bold text-gray-800" id="modal-title">{modalTitle}</h2>
                        <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Loading Indicator */}
                        {(isLoadingAppointment || isLoadingFromProp) && (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                                <span className="ml-3 text-gray-600 font-medium">Carregando detalhes do agendamento...</span>
                            </div>
                        )}

                        {/* Service Section */}
                        {!isLoadingAppointment && !isLoadingFromProp && (
                        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
                            {/* ✅ NOVO: Seletor de Local (apenas quando modal aberto sem contexto) */}
                            {!selectedLocationId && units.length > 0 && (
                                <FormField label="Selecione o Local">
                                    <Select
                                        value={manualSelectedLocationId || ''}
                                        onChange={e => setManualSelectedLocationId(e.target.value || null)}
                                    >
                                        <option value="">Escolha um local...</option>
                                        {units.map(unit => (
                                            <option key={unit.id} value={unit.id.toString()}>
                                                {unit.nome}
                                            </option>
                                        ))}
                                    </Select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Selecione o local onde o agendamento será realizado
                                    </p>
                                </FormField>
                            )}

                            <ServiceMultiSelectDropdown
                                label="Escolha Do Serviço"
                                options={allServices}
                                selectedOptions={selectedServices}
                                onChange={setSelectedServices}
                                placeholder="Selecione um ou mais serviços..."
                            />
                            <ExtraMultiSelectDropdown
                                label="Serviço Extra"
                                options={allExtras}
                                selectedOptions={selectedExtras}
                                onChange={setSelectedExtras}
                                placeholder="Clique para selecionar..."
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="Selecionado" className={!isEditing ? 'md:col-span-2' : ''}>
                                    <Select
                                        value={selectedAgentId || ''}
                                        onChange={e => setSelectedAgentId(e.target.value ? parseInt(e.target.value) : null)}
                                        disabled={user?.role === 'AGENTE'} // ✅ AGENTE não pode trocar de agente
                                    >
                                        <option value="">Selecione um agente...</option>
                                        {/* ✅ CORREÇÃO: Usar filteredAgents ao invés de allAgents */}
                                        {filteredAgents.map(agente => (
                                            <option key={agente.id} value={agente.id}>{agente.nome}</option>
                                        ))}
                                    </Select>
                                    {user?.role === 'AGENTE' && (
                                        <p className="text-xs text-gray-500 mt-1">Você só pode criar agendamentos para si mesmo</p>
                                    )}
                                    {!effectiveLocationId && (
                                        <p className="text-xs text-yellow-600 mt-1">⚠️ Selecione um local primeiro para ver os agentes disponíveis</p>
                                    )}
                                </FormField>
                                {isEditing && (
                                    <FormField label="Estado">
                                        <Select value={status} onChange={e => setStatus(e.target.value as AppointmentStatus)}>
                                            <option value="Aprovado">Aprovado</option>
                                            <option value="Concluído">Concluído</option>
                                            <option value="Cancelado">Cancelado</option>
                                            <option value="Não Compareceu">Não Compareceu</option>
                                        </Select>
                                    </FormField>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                <FormField label="Data De Início">
                                    <Input value={date} onChange={e => setDate(e.target.value)} placeholder="DD/MM/AAAA" />
                                </FormField>
                                <button
                                    type="button"
                                    onClick={() => setAvailabilityModalOpen(true)}
                                    className="flex items-center justify-center bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors h-[44px] disabled:bg-blue-400 disabled:cursor-not-allowed"
                                    disabled={!selectedAgentId}
                                >
                                    <Calendar className="h-5 w-5 mr-2" />
                                    Mostrar Calendário
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Hora De Início">
                                    {availableTimeSlots.length > 0 ? (
                                        <Select value={startTime} onChange={e => setStartTime(e.target.value)}>
                                            <option value="">Selecione um horário...</option>
                                            {availableTimeSlots.map(slot => (
                                                <option key={slot} value={slot}>{slot}</option>
                                            ))}
                                        </Select>
                                    ) : (
                                        <Input
                                            type="text"
                                            value={startTime}
                                            onChange={e => setStartTime(e.target.value)}
                                            placeholder="Selecione agente e data primeiro"
                                            disabled={!selectedAgentId || !date}
                                        />
                                    )}
                                </FormField>
                                <FormField label="Horário de Fim">
                                    <Input type="text" value={endTime} onChange={e => setEndTime(e.target.value)} placeholder="HH:MM" readOnly />
                                </FormField>
                            </div>
                        </div>
                        )}

                        {/* Client Section */}
                        {!isLoadingAppointment && !isLoadingFromProp && (
                        <FormSection
                            title="Cliente"
                            actions={!isSearchingClient && (
                                <button onClick={() => setIsSearchingClient(true)} className="flex items-center text-sm font-semibold text-gray-600 hover:text-gray-800">
                                    <Search className="h-4 w-4 mr-1.5" />
                                    Encontrar
                                </button>
                            )}
                        >
                           {renderClientContent()}
                        </FormSection>
                        )}

                        {/* Price Section */}
                        {!isLoadingAppointment && !isLoadingFromProp && (
                        <FormSection
                            title="Total do Serviço"
                            actions={
                                <button
                                    type="button"
                                    onClick={handleRecalculate}
                                    className="flex items-center text-sm font-semibold text-gray-600 hover:text-gray-800"
                                >
                                    <RotateCw className="h-4 w-4 mr-1.5" />
                                    Recalcular
                                </button>
                            }
                        >
                            <div className="space-y-3">
                                <div className="flex justify-between items-center font-bold text-gray-800 text-base">
                                    <p>Preço Total</p>
                                    <p>R$ {totalPrice.toFixed(2).replace('.', ',')}</p>
                                </div>
                            </div>
                        </FormSection>
                        )}
                        
                        {/* Payment Section - Only shows on edit */}
                        {!isLoadingAppointment && !isLoadingFromProp && isEditing && (
                            <FormSection title="Finalizar Agendamento">
                                <div className="space-y-4">
                                     <div className="text-sm space-y-2 text-gray-600 p-3 bg-gray-50 rounded-lg">
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Cliente:</span> <span>{clientFirstName} {clientLastName}</span></div>
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Agente:</span> <span>{allAgents.find(a => a.id === selectedAgentId)?.nome || 'N/A'}</span></div>
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Serviços:</span> <span className="text-right">{selectedServices.map(id => allServices.find(s => s.id === id)?.nome).filter(Boolean).join(', ')}</span></div>
                                        {selectedExtras.length > 0 && <div className="flex justify-between"><span className="font-medium text-gray-500">Extras:</span> <span>{selectedExtras.map(id => allExtras.find(e => e.id === id)?.nome).filter(Boolean).join(', ')}</span></div>}
                                    </div>

                                    <div className="border-t border-gray-200 my-2"></div>
                                    
                                    <div className="flex justify-between items-center font-bold text-gray-800 text-lg">
                                        <p>Valor Total:</p>
                                        <p>R$ {totalPrice.toFixed(2).replace('.', ',')}</p>
                                    </div>
                                    
                                    {/* ✅ NOVO: Sistema de Pontos */}
                                    {pontosAtivo && clienteId && (
                                        <>
                                            <div className="border-t border-gray-200 my-3"></div>
                                            
                                            <div className={`${podeUsarPontos ? 'bg-[#F0F6FF] border-blue-200' : 'bg-gray-50 border-gray-300'} border rounded-lg p-4 space-y-3`}>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-medium text-gray-700">Saldo de Pontos:</span>
                                                    <span className={`text-lg font-bold ${podeUsarPontos ? 'text-blue-600' : 'text-gray-500'}`}>{pontosDisponiveis} pts</span>
                                                </div>
                                                {pontosDisponiveis > 0 && (
                                                    <div className="text-xs text-gray-500">
                                                        Equivalente a R$ {((pontosDisponiveis / reaisPorPontos) * 1).toFixed(2).replace('.', ',')} de desconto
                                                    </div>
                                                )}
                                                
                                                {!podeUsarPontos && (
                                                    <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700">
                                                        Pontos só podem ser usados a partir do segundo agendamento. Continue acumulando!
                                                    </div>
                                                )}
                                                
                                                {podeUsarPontos && pontosDisponiveis > 0 && (
                                                <FormField label="Quantos pontos deseja usar?">
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max={pontosDisponiveis}
                                                            value={pontosUsados}
                                                            onChange={(e) => {
                                                                const valor = parseInt(e.target.value) || 0;
                                                                if (valor <= pontosDisponiveis) {
                                                                    setPontosUsados(valor);
                                                                } else {
                                                                    alert(`Você só tem ${pontosDisponiveis} pontos disponíveis.`);
                                                                }
                                                            }}
                                                            placeholder="0"
                                                            className="flex-1"
                                                            disabled={!podeUsarPontos}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setPontosUsados(pontosDisponiveis)}
                                                            className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap disabled:bg-gray-400 disabled:cursor-not-allowed"
                                                            disabled={!podeUsarPontos}
                                                        >
                                                            Usar Tudo
                                                        </button>
                                                    </div>
                                                </FormField>
                                                )}
                                                
                                                {pontosUsados > 0 && (
                                                    <div className="space-y-2 pt-2 border-t border-blue-300">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-gray-600">Desconto aplicado:</span>
                                                            <span className="font-bold text-green-600">- R$ {descontoCalculado.toFixed(2).replace('.', ',')}</span>
                                                        </div>
                                                        <div className="flex justify-between text-base font-bold">
                                                            <span className="text-gray-800">Valor Final:</span>
                                                            <span className="text-blue-600">R$ {valorFinal.toFixed(2).replace('.', ',')}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                    
                                    <FormField label="Forma de Pagamento">
                                        <Select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                            <option value="Dinheiro">Dinheiro</option>
                                            <option value="Cartão Crédito">Cartão Crédito</option>
                                            <option value="Cartão Débito">Cartão Débito</option>
                                            <option value="PIX">PIX</option>
                                        </Select>
                                    </FormField>
                                    
                                    <FormField label="Observações">
                                        <textarea
                                            value={observacoes}
                                            onChange={e => setObservacoes(e.target.value)}
                                            placeholder="Adicione observações sobre o serviço realizado (ex: produtos utilizados, procedimentos específicos, etc.)"
                                            className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 min-h-[100px] resize-y"
                                            rows={4}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Essas observações ficarão registradas no histórico do agendamento
                                        </p>
                                    </FormField>
                                </div>
                            </FormSection>
                        )}
                    </div>

                    <div className="p-6 border-t border-gray-200 bg-white flex-shrink-0">
                        <button
                            onClick={handleSubmit}
                            disabled={isLoading}
                            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors text-base disabled:bg-blue-400 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Salvando...' : submitButtonText}
                        </button>
                    </div>
                </div>
            </div>
            <AvailabilityModal
                isOpen={isAvailabilityModalOpen}
                onClose={() => setAvailabilityModalOpen(false)}
                onSelect={handleDateTimeSelect}
                agentName={filteredAgents.find(a => a.id === selectedAgentId)?.nome || ''}
                agentId={selectedAgentId} // ✅ PASSAR ID DO AGENTE PARA BUSCAR DISPONIBILIDADE REAL
                unidadeId={selectedLocationId ? parseInt(selectedLocationId) : undefined} // ✅ PASSAR ID DA UNIDADE
            />
        </>
    , portalRoot);
};

export default NewAppointmentModal;

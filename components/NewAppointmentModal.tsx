
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
    // ✅ LOG PARA DEBUG: Verificar prop selectedOptions

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
}

// Dados mock removidos - agora usando dados reais do useInternalBooking

const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({ isOpen, onClose, appointmentData, newSlotData }) => {
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

    // Hook para autenticação
    const { user } = useAuth();

    // Estados para dados reais
    const [allServices, setAllServices] = useState<InternalServico[]>([]);
    const [allExtras, setAllExtras] = useState<InternalServicoExtra[]>([]);
    const [allAgents, setAllAgents] = useState<InternalAgente[]>([]);
    const [filteredClients, setFilteredClients] = useState<InternalCliente[]>([]);
    const [selectedClient, setSelectedClient] = useState<InternalCliente | null>(null);
    const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);

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

    const [isSearchingClient, setIsSearchingClient] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [totalPrice, setTotalPrice] = useState(0);
    const [appointmentId, setAppointmentId] = useState<number | null>(null);
    const [isLoadingAppointment, setIsLoadingAppointment] = useState(false);

    const isEditing = !!appointmentData;

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

                // Se há apenas um agente (AGENTE logado), selecionar automaticamente
                if (agentes.length === 1) {
                    setSelectedAgentId(agentes[0].id);
                }
            } catch (error) {
            }
        };

        if (isOpen) {
            loadInitialData();
        }
    }, [isOpen, fetchServicos, fetchServicosExtras, fetchAgentes]);

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

    // Função para gerar horários disponíveis
    const generateAvailableTimeSlots = (selectedDate: string, agentId: number | null): string[] => {
        if (!selectedDate || !agentId) return [];

        // Horários padrão de funcionamento (8:00 às 18:00)
        const startHour = 8;
        const endHour = 18;
        const intervalMinutes = 30; // Intervalos de 30 minutos

        const timeSlots: string[] = [];

        for (let hour = startHour; hour < endHour; hour++) {
            for (let minute = 0; minute < 60; minute += intervalMinutes) {
                const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                timeSlots.push(timeString);
            }
        }

        // TODO: Filtrar horários já ocupados consultando agendamentos existentes
        // Por enquanto, retorna todos os horários disponíveis
        return timeSlots;
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

    // Carregar detalhes do agendamento quando modal abrir em modo de edição
    useEffect(() => {
        const loadAppointmentDetails = async () => {
            if (!isOpen || !isEditing || !appointmentData?.id) {
                return;
            }
            
            setIsLoadingAppointment(true);
            try {
                const details = await fetchAgendamentoDetalhes(parseInt(appointmentData.id));
                
                if (details) {
                    // Preencher formulário com dados do agendamento
                    setAppointmentId(details.id);
                    
                    // Extrair IDs dos serviços e extras
                    const servicoIds = details.servicos?.map(s => s.id) || [];
                    const extraIds = details.extras?.map(e => e.id) || [];


                    setSelectedServices(servicoIds);
                    setSelectedExtras(extraIds);
                    setSelectedAgentId(details.agente_id);
                    setStatus(details.status as AppointmentStatus);
                    setStartTime(details.hora_inicio.substring(0, 5));
                    setEndTime(details.hora_fim.substring(0, 5));

                    
                    // ✅ CORREÇÃO: Formatar data sem conversão de timezone
                    if (details.data_agendamento) {
                        // A data vem como "2025-10-28T00:00:00.000Z". Pegamos apenas a parte da data.
                        const [ano, mes, dia] = details.data_agendamento.substring(0, 10).split('-');
                        const formattedDate = `${dia}/${mes}/${ano}`;
                        setDate(formattedDate);
                    } else {
                        setDate('');
                    }

                    // ✅ CORREÇÃO: Centralizar e validar dados do cliente
                    if (details.cliente) {
                        const nameParts = (details.cliente.nome_completo || '').split(' ');
                        const clientData = {
                            id: details.cliente_id,
                            primeiro_nome: nameParts[0] || '',
                            ultimo_nome: nameParts.slice(1).join(' ') || '',
                            nome_completo: details.cliente.nome_completo,
                            telefone: details.cliente.telefone || '',
                            email: details.cliente.email || '',
                            is_assinante: details.cliente.is_assinante || false
                        };
                        setSelectedClient(clientData);
                        setClientFirstName(clientData.primeiro_nome);
                        setClientLastName(clientData.ultimo_nome);
                        setClientPhone((clientData.telefone || '').replace('+55', '').trim());
                    } else {
                        // Se a API não retornar o objeto cliente, os campos ficarão vazios.
                        // Isso indica um problema no backend (a API deveria retornar os dados do cliente).
                        setSelectedClient(null);
                        setClientFirstName('');
                        setClientLastName('');
                        setClientPhone('');
                    }
                    
                    // ✅ CRÍTICO: Calcular preço total após carregar serviços e extras
                    // Aguardar um tick para garantir que os estados foram atualizados
                    setTimeout(() => {
                        let calculatedTotal = 0;
                        
                        // Calcular total dos serviços
                        servicoIds.forEach(serviceId => {
                            const service = allServices.find(s => s.id === serviceId);
                            if (service) {
                                calculatedTotal += parseFloat(service.preco.toString());
                            }
                        });
                        
                        // Calcular total dos extras
                        extraIds.forEach(extraId => {
                            const extra = allExtras.find(e => e.id === extraId);
                            if (extra) {
                                calculatedTotal += parseFloat(extra.preco.toString());
                            }
                        });
                        
                        setTotalPrice(calculatedTotal);
                    }, 100);
                }
            } catch (error) {
            } finally {
                setIsLoadingAppointment(false);
            }
        };

        loadAppointmentDetails();
    }, [isOpen, isEditing, appointmentData?.id, fetchAgendamentoDetalhes]);

    // Resetar formulário quando modal abrir (APENAS para novos agendamentos)
    useEffect(() => {
        if (!isOpen) return;

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
            setStartTime(`${String(newSlotData.start).padStart(2,'0')}:00`);
            setEndTime('');
            const dateObj = newSlotData.date;
            setDate(`${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`);
            setClientFirstName('');
            setClientLastName('');
            setClientPhone('');
            setSelectedClient(null);
            setStatus('Aprovado');
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
        }
    }, [isOpen, isEditing, newSlotData, allAgents]);

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
    
    const modalTitle = isEditing ? 'Editar Compromisso' : 'Novo Agendamento';
    const submitButtonText = isEditing ? 'Salvar Alterações' : 'Criar Compromisso';

    const handleSelectClient = (client: InternalCliente) => {
        setSelectedClient(client);
        setClientFirstName(client.primeiro_nome);
        setClientLastName(client.ultimo_nome);
        setClientPhone(client.telefone.replace('+55', '').trim());
        setIsSearchingClient(false);
        setClientSearchQuery('');
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
                alert('Por favor, selecione um agente.');
                return;
            }

            if (selectedServices.length === 0) {
                alert('Por favor, selecione pelo menos um serviço.');
                return;
            }

            if (!date || !startTime) {
                alert('Por favor, preencha a data e horário.');
                return;
            }

            if (!clientFirstName.trim() || !clientPhone.trim()) {
                alert('Por favor, preencha o nome e telefone do cliente.');
                return;
            }

            // Converter data do formato DD/MM/AAAA para AAAA-MM-DD
            const [dia, mes, ano] = date.split('/');
            const dataFormatada = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;

            // Validar se temos unidade_id
            if (!user?.unidade_id) {
                alert('Erro: Usuário não está associado a uma unidade. Contate o administrador.');
                return;
            }

            // Validar se endTime foi calculado
            if (!endTime) {
                alert('Erro: Horário de fim não foi calculado. Verifique os serviços selecionados.');
                return;
            }

            // ✅ Validação final dos dados antes do envio

            const agendamentoData = {
                agente_id: selectedAgentId,
                servico_ids: selectedServices,
                servico_extra_ids: selectedExtras,
                data_agendamento: dataFormatada,
                hora_inicio: startTime,
                hora_fim: endTime, // Campo obrigatório adicionado
                unidade_id: user.unidade_id, // Campo obrigatório adicionado
                observacoes: '',
                ...(selectedClient
                    ? { cliente_id: selectedClient.id }
                    : {
                        cliente_nome: `${clientFirstName.trim()} ${clientLastName.trim()}`.trim(),
                        cliente_telefone: `+55${clientPhone.replace(/\D/g, '')}`
                    }
                )
            };

            // 🔥 LOG DETALHADO DO PAYLOAD

            if (isEditing && appointmentId) {
                // Atualizar agendamento existente
                
                const updateData = {
                    agente_id: selectedAgentId,
                    servico_ids: selectedServices,
                    servico_extra_ids: selectedExtras,
                    data_agendamento: dataFormatada,
                    hora_inicio: startTime,
                    hora_fim: endTime,
                    status: status,
                    forma_pagamento: paymentMethod, // ✅ Adicionar forma de pagamento
                    observacoes: '',
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
                        alert('Agendamento atualizado com sucesso!');
                        onClose();
                        // Recarregar página para atualizar calendário
                        window.location.reload();
                    } else {
                        throw new Error('Resposta vazia do servidor');
                    }
                } catch (updateError) {
                    throw updateError;
                }
            } else {
                const resultado = await createAgendamento(agendamentoData);
                if (resultado) {
                    alert('Agendamento criado com sucesso!');
                    onClose();
                }
            }
        } catch (error) {
            alert('Erro ao salvar agendamento. Tente novamente.');
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
                        {isLoadingAppointment && (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                                <span className="ml-3 text-gray-600 font-medium">Carregando detalhes do agendamento...</span>
                            </div>
                        )}
                        
                        {/* Service Section */}
                        {!isLoadingAppointment && (
                        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
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
                                    >
                                        <option value="">Selecione um agente...</option>
                                        {allAgents.map(agente => (
                                            <option key={agente.id} value={agente.id}>{agente.nome}</option>
                                        ))}
                                    </Select>
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
                        {!isLoadingAppointment && (
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
                        {!isLoadingAppointment && (
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
                        {!isLoadingAppointment && isEditing && (
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
                                    
                                    <FormField label="Forma de Pagamento">
                                        <Select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                            <option value="Dinheiro">Dinheiro</option>
                                            <option value="Cartão Crédito">Cartão Crédito</option>
                                            <option value="Cartão Débito">Cartão Débito</option>
                                            <option value="PIX">PIX</option>
                                        </Select>
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
                agentName={allAgents.find(a => a.id === selectedAgentId)?.nome || ''}
                agentId={selectedAgentId} // ✅ PASSAR ID DO AGENTE PARA BUSCAR DISPONIBILIDADE REAL
            />
        </>
    , portalRoot);
};

export default NewAppointmentModal;

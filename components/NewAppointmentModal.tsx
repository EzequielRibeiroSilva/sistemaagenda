
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Search, Plus, RotateCw, ChevronDown, Check } from './Icons';
import type { ScheduleSlot, Agent, AppointmentStatus } from '../types';
import AvailabilityModal from './AvailabilityModal';

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

// MultiSelect Dropdown Component
const MultiSelectDropdown: React.FC<{
    label: string;
    options: { name: string; duration: number }[];
    selectedOptions: string[];
    onChange: (selected: string[]) => void;
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

    const handleToggleOption = (optionName: string) => {
        const newSelectedOptions = selectedOptions.includes(optionName)
            ? selectedOptions.filter(item => item !== optionName)
            : [...selectedOptions, optionName];
        onChange(newSelectedOptions);
    };

    const displayValue = selectedOptions.length > 0
        ? selectedOptions.join(', ')
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
                            <label key={option.name} className="flex items-center p-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedOptions.includes(option.name)}
                                    onChange={() => handleToggleOption(option.name)}
                                    className="sr-only peer"
                                />
                                <div className="w-4 h-4 mr-3 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-sm peer-checked:bg-blue-600 peer-checked:border-blue-600">
                                   <Check className="w-2.5 h-2.5 text-white hidden peer-checked:block" />
                                </div>
                                {option.name}
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

const allServices = [
    { name: 'CORTE', duration: 60, price: 30 },
    { name: 'CORTE + BARBA', duration: 90, price: 45 },
    { name: 'BARBA', duration: 30, price: 20 }
];

const allExtras = [
    { name: 'SOBRANCELHA', duration: 15, price: 15 },
    { name: 'HIDRATAÇÃO', duration: 45, price: 50 },
    { name: 'PIGMENTAÇÃO', duration: 30, price: 25 }
];

const allAgents = ['Eduardo Soares', 'Ângelo Paixão', 'Snake Filho'];

const mockClients = [
    { id: 4172, name: 'Vicente Arley', phone: '+558899200566' },
    { id: 4168, name: 'Charles Gesso', phone: '+558899200567' },
    { id: 4165, name: 'José Raine', phone: '+558899200568' },
    { id: 4164, name: 'Pedro Hugo', phone: '+558899200569' },
    { id: 511, name: 'Ademir Matos', phone: '+558899200570' },
    { id: 510, name: 'Adryan Morais', phone: '+558899200571' },
    { id: 505, name: 'Aldeides Mendes', phone: '+558592149983' },
    { id: 501, name: 'Aldeides Araujo', phone: '+558598644524' },
];

const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({ isOpen, onClose, appointmentData, newSlotData }) => {
    const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

    const [isAvailabilityModalOpen, setAvailabilityModalOpen] = useState(false);
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
    const [agent, setAgent] = useState('');
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

    const isEditing = !!appointmentData;

    const calculateEndTime = (startTimeStr: string, serviceNames: string[], extraNames: string[]): string => {
        if (!startTimeStr) return '';
        
        const totalDuration = serviceNames.reduce((acc, curr) => {
            const service = allServices.find(s => s.name === curr);
            return acc + (service?.duration || 0);
        }, 0) + extraNames.reduce((acc, curr) => {
            const extra = allExtras.find(e => e.name === curr);
            return acc + (extra?.duration || 0);
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

    const handleRecalculate = () => {
        let currentTotal = 0;

        selectedServices.forEach(serviceName => {
            const service = allServices.find(s => s.name === serviceName);
            if (service) {
                currentTotal += service.price;
            }
        });

        selectedExtras.forEach(extraName => {
            const extra = allExtras.find(e => e.name === extraName);
            if (extra) {
                currentTotal += extra.price;
            }
        });

        setTotalPrice(currentTotal);
    };

    useEffect(() => {
        if (isOpen) {
            setIsSearchingClient(false);
            setClientSearchQuery('');
            setTotalPrice(0);
            if (isEditing && appointmentData) {
                setSelectedServices([appointmentData.service]);
                setSelectedExtras([]);
                setAgent(appointmentData.agentName);
                setStatus(appointmentData.status);
                const [start, end] = appointmentData.time.split('-');
                setStartTime(start);
                setEndTime(end);
                const nameParts = appointmentData.client.split(' ');
                setClientFirstName(nameParts[0] || '');
                setClientLastName(nameParts.slice(1).join(' '));
                setClientPhone('11961234567'); // Mock phone
                const dateObj = new Date(2025, 8, 30); // Mock date from appointment
                setDate(`${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`);
            } else if (newSlotData) {
                setSelectedServices([]);
                setSelectedExtras([]);
                setAgent(newSlotData.agent.name);
                setStartTime(`${String(newSlotData.start).padStart(2,'0')}:00`);
                setEndTime('');
                const dateObj = newSlotData.date;
                setDate(`${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`);
                setClientFirstName('');
                setClientLastName('');
                setClientPhone('');
                setStatus('Aprovado');
            } else {
                // Reset form
                 setSelectedServices([]);
                 setSelectedExtras([]);
                 setAgent(allAgents[0]); // Default to first agent
                 setDate('');
                 setStartTime('');
                 setEndTime('');
                 setClientFirstName('');
                 setClientLastName('');
                 setClientPhone('');
                 setStatus('Aprovado');
            }
        }
    }, [isOpen, appointmentData, newSlotData, isEditing]);

    useEffect(() => {
        if (startTime && (selectedServices.length > 0 || selectedExtras.length > 0)) {
            const newEndTime = calculateEndTime(startTime, selectedServices, selectedExtras);
            setEndTime(newEndTime);
        } else {
            setEndTime('');
        }
    }, [startTime, selectedServices, selectedExtras]);
    
    useEffect(() => {
        if (isEditing) {
            handleRecalculate();
        }
    }, [isEditing, selectedServices, selectedExtras]);

    if (!isOpen || !portalRoot) return null;

    const handleDateTimeSelect = (selectedDateTime: { date: Date, time: string }) => {
        const { date: selectedDate, time: selectedTime } = selectedDateTime;
        setDate(`${String(selectedDate.getDate()).padStart(2, '0')}/${String(selectedDate.getMonth() + 1).padStart(2, '0')}/${selectedDate.getFullYear()}`);
        setStartTime(selectedTime);
    };

    const handleModalContentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };
    
    const modalTitle = isEditing ? 'Editar Compromisso' : 'Novo Agendamento';
    const submitButtonText = isEditing ? 'Salvar Alterações' : 'Criar Compromisso';

    const filteredClients = clientSearchQuery
        ? mockClients.filter(c => c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()))
        : mockClients;

    const handleSelectClient = (client: { name: string, phone: string }) => {
        const nameParts = client.name.split(' ');
        setClientFirstName(nameParts[0] || '');
        setClientLastName(nameParts.slice(1).join(' '));
        setClientPhone(client.phone.replace('+55', '').trim());
        setIsSearchingClient(false);
        setClientSearchQuery('');
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
                        {filteredClients.map(client => (
                            <div 
                                key={client.id}
                                onClick={() => handleSelectClient(client)}
                                className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-200"
                            >
                                <p className="font-bold text-gray-800">{client.name}</p>
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>ID: {client.id}</span>
                                    <span>Telefone: {client.phone}</span>
                                </div>
                            </div>
                        ))}
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
                        {/* Service Section */}
                        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
                            <MultiSelectDropdown
                                label="Escolha Do Serviço"
                                options={allServices}
                                selectedOptions={selectedServices}
                                onChange={setSelectedServices}
                                placeholder="Selecione um ou mais serviços..."
                            />
                            <MultiSelectDropdown
                                label="Serviço Extra"
                                options={allExtras}
                                selectedOptions={selectedExtras}
                                onChange={setSelectedExtras}
                                placeholder="Clique para selecionar..."
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="Selecionado" className={!isEditing ? 'md:col-span-2' : ''}>
                                    <Select value={agent} onChange={e => setAgent(e.target.value)}>
                                        {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
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
                                    disabled={!agent}
                                >
                                    <Calendar className="h-5 w-5 mr-2" />
                                    Mostrar Calendário
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Hora De Início">
                                    <Input type="text" value={startTime} onChange={e => setStartTime(e.target.value)} placeholder="HH:MM" />
                                </FormField>
                                <FormField label="Horário de Fim">
                                    <Input type="text" value={endTime} onChange={e => setEndTime(e.target.value)} placeholder="HH:MM" readOnly />
                                </FormField>
                            </div>
                        </div>

                        {/* Client Section */}
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

                        {/* Price Section */}
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
                        
                        {/* Payment Section - Only shows on edit */}
                        {isEditing && (
                            <FormSection title="Finalizar Agendamento">
                                <div className="space-y-4">
                                     <div className="text-sm space-y-2 text-gray-600 p-3 bg-gray-50 rounded-lg">
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Cliente:</span> <span>{clientFirstName} {clientLastName}</span></div>
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Agente:</span> <span>{agent}</span></div>
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Serviços:</span> <span className="text-right">{selectedServices.join(', ')}</span></div>
                                        {selectedExtras.length > 0 && <div className="flex justify-between"><span className="font-medium text-gray-500">Extras:</span> <span>{selectedExtras.join(', ')}</span></div>}
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
                        <button className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors text-base">
                            {submitButtonText}
                        </button>
                    </div>
                </div>
            </div>
            <AvailabilityModal
                isOpen={isAvailabilityModalOpen}
                onClose={() => setAvailabilityModalOpen(false)}
                onSelect={handleDateTimeSelect}
                agentName={agent}
            />
        </>
    , portalRoot);
};

export default NewAppointmentModal;

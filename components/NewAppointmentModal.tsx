import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Search, Plus, RotateCw, ChevronDown } from './Icons';
import type { ScheduleSlot, Agent, AppointmentStatus } from '../types';

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

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentData?: ScheduleSlot['details'];
  newSlotData?: { agent: Agent, start: number, date: Date };
}

const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({ isOpen, onClose, appointmentData, newSlotData }) => {
    const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

    const [service, setService] = useState('');
    const [agent, setAgent] = useState('');
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [clientFirstName, setClientFirstName] = useState('');
    const [clientLastName, setClientLastName] = useState('');
    const [status, setStatus] = useState<AppointmentStatus>('Aprovado');

    const isEditing = !!appointmentData;

    useEffect(() => {
        if (isOpen) {
            if (isEditing && appointmentData) {
                setService(appointmentData.service);
                setAgent(appointmentData.agentName);
                setStatus(appointmentData.status);
                const [start, end] = appointmentData.time.split('-');
                setStartTime(start);
                setEndTime(end);
                const nameParts = appointmentData.client.split(' ');
                setClientFirstName(nameParts[0] || '');
                setClientLastName(nameParts.slice(1).join(' '));
                setDate(new Date(2025, 8, 30).toLocaleDateString('pt-BR')); // Mock date
            } else if (newSlotData) {
                setService('');
                setAgent(newSlotData.agent.name);
                setStartTime(`${newSlotData.start}:00`);
                setEndTime(`${newSlotData.start + 1}:00`); // Assume 1 hr slot
                setDate(newSlotData.date.toLocaleDateString('pt-BR'));
                setClientFirstName('');
                setClientLastName('');
                setStatus('Aprovado');
            } else {
                // Reset form for a completely new appointment
                 setService('');
                 setAgent('');
                 setDate('');
                 setStartTime('');
                 setEndTime('');
                 setClientFirstName('');
                 setClientLastName('');
                 setStatus('Aprovado');
            }
        }
    }, [isOpen, appointmentData, newSlotData, isEditing]);

    if (!isOpen || !portalRoot) return null;

    const handleModalContentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };
    
    const modalTitle = isEditing ? 'Editar Compromisso' : 'Novo Agendamento';
    const submitButtonText = isEditing ? 'Salvar Alterações' : 'Criar Compromisso';

    return createPortal(
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
                        <FormField label="Escolha Do Serviço">
                            <Select value={service} onChange={e => setService(e.target.value)}>
                                <option>Selecione um serviço...</option>
                                <option>CORTE</option>
                                <option>CORTE + BARBA</option>
                                <option>BARBA</option>
                            </Select>
                        </FormField>
                        <FormField label="Extras de Serviço">
                            <Input placeholder="Clique para selecionar..." />
                        </FormField>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Selecionado">
                                <Select value={agent} onChange={e => setAgent(e.target.value)}>
                                    <option>Vicente Arley</option>
                                    <option>Ângelo Paixão</option>
                                    <option>Snake Filho</option>
                                </Select>
                            </FormField>
                            <FormField label="Estado">
                                <Select value={status} onChange={e => setStatus(e.target.value as AppointmentStatus)}>
                                    <option value="Aprovado">Aprovado</option>
                                    <option value="Concluído">Concluído</option>
                                    <option value="Cancelado">Cancelado</option>
                                    <option value="Não Compareceu">Não Compareceu</option>
                                </Select>
                            </FormField>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                            <FormField label="Data De Início">
                                <Input value={date} onChange={e => setDate(e.target.value)} />
                            </FormField>
                            <button className="flex items-center justify-center bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors h-[44px]">
                                <Calendar className="h-5 w-5 mr-2" />
                                Mostrar Calendário
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Hora De Início">
                                <Input type="text" value={startTime} onChange={e => setStartTime(e.target.value)} />
                            </FormField>
                            <FormField label="Horário de Fim">
                                <Input type="text" value={endTime} onChange={e => setEndTime(e.target.value)} />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Buffer Antes De">
                                <Input placeholder="Buffer Antes De" />
                            </FormField>
                            <FormField label="Depois De Buffer">
                                <Input placeholder="Depois De Buffer" />
                            </FormField>
                        </div>
                        <FormField label="Comentário deixado por cliente">
                            <Textarea />
                        </FormField>
                    </div>

                    {/* Client Section */}
                    <FormSection 
                        title="Cliente"
                        actions={
                            <>
                                <button className="flex items-center text-sm font-semibold text-gray-600 hover:text-gray-800">
                                    <Plus className="h-4 w-4 mr-1.5" />
                                    Novo
                                </button>
                                <button className="flex items-center text-sm font-semibold text-gray-600 hover:text-gray-800">
                                    <Search className="h-4 w-4 mr-1.5" />
                                    Encontrar
                                </button>
                            </>
                        }
                    >
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Primeiro Nome">
                                    <Input placeholder="Primeiro Nome" value={clientFirstName} onChange={e => setClientFirstName(e.target.value)} />
                                </FormField>
                                <FormField label="Último Nome">
                                    <Input placeholder="Último Nome" value={clientLastName} onChange={e => setClientLastName(e.target.value)} />
                                </FormField>
                            </div>
                            <FormField label="Endereço De E-Mail">
                                <Input type="email" placeholder="Endereço De E-Mail" />
                            </FormField>
                            <FormField label="Número De Telefone">
                                <div className="flex items-center w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                                    <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                                    <span className="text-gray-600 pr-2">+55</span>
                                    <input type="tel" placeholder="11 96123-4567" className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400" />
                                </div>
                            </FormField>
                            <FormField label="Notas De Clientes">
                                <Textarea />
                            </FormField>
                            <FormField label="Notas visíveis apenas para os administradores">
                                <Textarea />
                            </FormField>
                        </div>
                    </FormSection>

                    {/* Price Section */}
                    <FormSection 
                        title="Repartição De Preço"
                        actions={
                            <button className="flex items-center text-sm font-semibold text-gray-600 hover:text-gray-800">
                                <RotateCw className="h-4 w-4 mr-1.5" />
                                Recalcular
                            </button>
                        }
                    >
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <p className="text-gray-500">Sub-Total</p>
                                <p className="font-medium text-gray-800">R$ 0,00</p>
                            </div>
                            <div className="flex justify-between items-center font-bold text-gray-800 text-base">
                                <p>Preço Total</p>
                                <p>R$ 0,00</p>
                            </div>
                        </div>
                    </FormSection>
                    
                    {/* Payment Section */}
                    <FormSection title="Equilíbrio E De Pagamentos">
                        <div className="space-y-4">
                            <Select defaultValue="Não Pago">
                                <option>Não Pago</option>
                                <option>Pago</option>
                            </Select>
                            <div className="grid grid-cols-3 gap-4 text-center pt-2">
                                <div>
                                    <p className="text-2xl font-bold text-gray-800">R$0,00</p>
                                    <p className="text-xs text-gray-500">Total</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-800">R$0,00</p>
                                    <p className="text-xs text-gray-500">Total de Pagamentos</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-800">R$0,00</p>
                                    <p className="text-xs text-gray-500">O Saldo A Pagar</p>
                                </div>
                            </div>
                        </div>
                    </FormSection>

                    {/* Transactions Section */}
                    <FormSection 
                        title="Transações"
                        actions={
                            <button className="flex items-center text-sm font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
                                <Plus className="h-4 w-4 mr-1.5" />
                                Adicionar Transação
                            </button>
                        }
                    >
                         <div className="text-center text-gray-500 text-sm py-4 border-t border-gray-200 mt-[-1rem]">
                            {/* Empty state for transactions table */}
                         </div>
                    </FormSection>
                </div>

                <div className="p-6 border-t border-gray-200 bg-white flex-shrink-0">
                    <button className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors text-base">
                        {submitButtonText}
                    </button>
                </div>
            </div>
        </div>
    , portalRoot);
};

export default NewAppointmentModal;
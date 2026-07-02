import React, { useState, useMemo, useEffect } from 'react';
import { Check, Cog, CheckCircle, ArrowLeft, Save, AlertCircle, FaUser } from './Icons';
import AgentScheduleEditor from './AgentScheduleEditor';
import CalendarExceptionsEditor from './CalendarExceptionsEditor';
import { useUnitManagement, CalendarException } from '../hooks/useUnitManagement';
import { getAssetUrl } from '../utils/api';
import { getDefaultSchedule, mergeWithDefaultSchedule, type ScheduleDay } from '../utils/schedule';
import { useToast } from '../contexts/ToastContext';

// Reusable components (copied from CreateLocationPage)
const FormCard: React.FC<{ title: string; children: React.ReactNode; rightContent?: React.ReactNode }> = ({ title, children, rightContent }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
            {rightContent}
        </div>
        {children}
    </div>
);

const TextInput: React.FC<{
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  error?: string;
}> = ({ label, value, onChange, required = false, error }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-1 block">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          value={value}
          onChange={onChange}
          className={`w-full bg-gray-50 border text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 ${
            error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
          }`}
        />
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
);

const AgentSelectItem: React.FC<{
  id: number;
  name: string;
  avatar: string | null;
  checked: boolean;
  onChange: () => void;
}> = ({ id, name, avatar, checked, onChange }) => (
    <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
        </div>
        <div className="relative w-10 h-10 mx-4">
            {avatar ? (
                <img
                    src={getAssetUrl(avatar)}
                    alt={name}
                    className="w-10 h-10 rounded-full object-cover"
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
            <div className={`w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center ${avatar ? 'hidden' : ''}`}>
                <FaUser className="w-5 h-5 text-gray-600" />
            </div>
        </div>
        <span className="font-bold text-gray-800 text-md flex-1">{name}</span>
        <span className="text-sm text-gray-500 mr-4">Agente #{id}</span>
    </label>
);

const ServiceCheckbox: React.FC<{
  id: number;
  name: string;
  checked: boolean;
  onChange: () => void;
}> = ({ id, name, checked, onChange }) => (
    <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
        </div>
        <span className="ml-4 font-medium text-gray-800 text-sm">{name}</span>
    </label>
);

const StatusToggle: React.FC<{ isOpen: boolean; setIsOpen: (isOpen: boolean) => void; }> = ({ isOpen, setIsOpen }) => {
    return (
        <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Status do Local</label>
            <div className="flex items-center space-x-4 mt-2">
                <button
                    type="button"
                    className={`${isOpen ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
                    role="switch"
                    aria-checked={isOpen}
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <span
                        aria-hidden="true"
                        className={`${isOpen ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                    />
                </button>
                <span className={`font-semibold ${isOpen ? 'text-green-700 bg-green-100 px-2.5 py-1 rounded-full text-xs' : 'text-red-700 bg-red-100 px-2.5 py-1 rounded-full text-xs'}`}>
                    {isOpen ? 'Aberto' : 'Fechado'}
                </span>
            </div>
             <p className="text-xs text-gray-500 mt-2">
                Locais fechados não poderão receber novos agendamentos.
            </p>
        </div>
    );
};


interface EditLocationPageProps {
  setActiveView: (view: string) => void;
  locationId: number | null;
}

const EditLocationPage: React.FC<EditLocationPageProps> = ({ setActiveView, locationId }) => {
    const toast = useToast();
    const {
        fetchUnitById,
        updateUnit,
        agents,
        services,
        loading,
        error,
        clearError,
        fetchUnitExceptions
    } = useUnitManagement();

    // Component state for form fields
    const [formData, setFormData] = useState({
        nome: '',
        endereco: '',
        telefone: '',
        status: 'Ativo' as 'Ativo' | 'Bloqueado'
    });

    // Estado para agentes e serviços selecionados
    const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set());
    const [selectedServices, setSelectedServices] = useState<Set<number>>(new Set());

    // Estado para horários (7 dias da semana)
    const [scheduleData, setScheduleData] = useState<ScheduleDay[]>(getDefaultSchedule());
    
    // Estado para exceções de calendário
    const [calendarExceptions, setCalendarExceptions] = useState<CalendarException[]>([]);

    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadUnit = async () => {
            if (locationId) {
                setIsLoading(true);
                const unit = await fetchUnitById(locationId);

                if (unit) {

                    // Preencher dados básicos
                    setFormData({
                        nome: unit.nome,
                        endereco: unit.endereco,
                        telefone: unit.telefone,
                        status: unit.status
                    });

                    // Pré-selecionar agentes associados
                    if (unit.agentes_ids && Array.isArray(unit.agentes_ids)) {
                        setSelectedAgents(new Set(unit.agentes_ids));
                    }

                    // Pré-selecionar serviços associados
                    if (unit.servicos_ids && Array.isArray(unit.servicos_ids)) {
                        setSelectedServices(new Set(unit.servicos_ids));
                    }

                    // Preencher horários de funcionamento
                    if (unit.horarios_funcionamento && Array.isArray(unit.horarios_funcionamento)) {
                        const horariosDoBackend = unit.horarios_funcionamento
                            .map(horario => ({
                                dia_semana: horario.dia_semana,
                                is_aberto: horario.is_aberto,
                                periodos: horario.horarios_json ? horario.horarios_json.map(h => ({
                                    inicio: h.inicio,
                                    fim: h.fim
                                })) : []
                            }));

                        // Usar função utilitária para mesclar com 7 dias padrão
                        const horariosCompletos = mergeWithDefaultSchedule(horariosDoBackend);
                        setScheduleData(horariosCompletos); // Garante sempre 7 dias
                    }

                    // Carregar exceções de calendário
                    try {
                        const exceptions = await fetchUnitExceptions(locationId);
                        setCalendarExceptions(exceptions || []);
                    } catch (excError) {
                        // Erro silencioso - não quebra o fluxo, apenas deixa array vazio
                        setCalendarExceptions([]);
                    }
                } else {
                    // Unidade não encontrada
                }
                setIsLoading(false);
            }
        };

        loadUnit();
    }, [locationId]); // ✅ REMOVIDO fetchUnitById das dependências

    // Handlers para agentes
    const handleAgentToggle = (agentId: number) => {
        setSelectedAgents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(agentId)) {
                newSet.delete(agentId);
            } else {
                newSet.add(agentId);
            }
            return newSet;
        });
    };

    const handleSelectAllAgents = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        if (agents.length === 0) {
            setSelectedAgents(new Set());
            return;
        }
        if (isChecked) {
            setSelectedAgents(new Set(agents.map(agent => agent.id)));
        } else {
            setSelectedAgents(new Set());
        }
    };

    // Handlers para serviços
    const handleServiceToggle = (serviceId: number) => {
        setSelectedServices(prev => {
            const newSet = new Set(prev);
            if (newSet.has(serviceId)) {
                newSet.delete(serviceId);
            } else {
                newSet.add(serviceId);
            }
            return newSet;
        });
    };

    const handleSelectAllServices = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        if (services.length === 0) {
            setSelectedServices(new Set());
            return;
        }
        if (isChecked) {
            setSelectedServices(new Set(services.map(service => service.id)));
        } else {
            setSelectedServices(new Set());
        }
    };

    // Computed values
    const allAgentsSelected = useMemo(() =>
        agents.length > 0 && agents.every(agent => selectedAgents.has(agent.id)),
        [agents, selectedAgents]
    );

    const allServicesSelected = useMemo(() =>
        services.length > 0 && services.every(service => selectedServices.has(service.id)),
        [services, selectedServices]
    );

    // Form handlers
    const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [field]: e.target.value }));
        // Clear error when user starts typing
        if (formErrors[field]) {
            setFormErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};

        if (!formData.nome.trim()) {
            errors.nome = 'Nome do local é obrigatório';
            toast.warning('Campo Obrigatório', 'Por favor, preencha o nome do local.');
        }

        if (!formData.endereco.trim()) {
            errors.endereco = 'Endereço é obrigatório';
            toast.warning('Campo Obrigatório', 'Por favor, preencha o endereço do local.');
        }

        if (!formData.telefone.trim()) {
            errors.telefone = 'Telefone é obrigatório';
            toast.warning('Campo Obrigatório', 'Por favor, preencha o telefone do local.');
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm() || !locationId) {
            return;
        }

        setIsSubmitting(true);
        clearError();

        // Preparar dados para envio
        const updateData = {
            nome: formData.nome.trim(),
            endereco: formData.endereco.trim(),
            telefone: formData.telefone.trim(),
            status: formData.status,
            agentes_ids: Array.from(selectedAgents) as number[],
            servicos_ids: Array.from(selectedServices) as number[],
            horarios_funcionamento: scheduleData, // ✅ CORREÇÃO: Nome padronizado (array com 7 dias garantido)
            excecoes_calendario: calendarExceptions.map(exc => ({
                data_inicio: exc.data_inicio,
                data_fim: exc.data_fim,
                hora_inicio: (exc as any).hora_inicio ?? null,
                hora_fim: (exc as any).hora_fim ?? null,
                tipo: exc.tipo,
                descricao: exc.descricao
            }))
        };

        const success = await updateUnit(locationId, updateData);

        setIsSubmitting(false);

        if (success) {
            toast.success('Local Atualizado!', `O local "${formData.nome}" foi atualizado com sucesso.`);
            // Redirect back to locations list
            setActiveView('locations-list');
        } else {
            toast.error('Erro ao Atualizar Local', 'Não foi possível atualizar o local. Tente novamente.');
        }
    };

    if (!locationId) {
        // Handle case where no location ID is provided
        return (
            <div className="p-4 text-center">
                <h2 className="text-xl font-semibold text-gray-700">Local não encontrado.</h2>
                <button onClick={() => setActiveView('locations-list')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Voltar para a lista de locais
                </button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-800">Editar Local</h1>
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Carregando dados do local...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Editar Local</h1>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center">
                        <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                        <span className="text-red-800">{error}</span>
                    </div>
                    <button
                        onClick={clearError}
                        className="text-red-600 hover:text-red-800 font-medium text-sm"
                    >
                        Fechar
                    </button>
                </div>
            )}

            <FormCard title="Informações Básicas">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <TextInput
                            label="Nome do Local"
                            value={formData.nome}
                            onChange={handleInputChange('nome')}
                            required
                            error={formErrors.nome}
                        />
                        <TextInput
                            label="Endereço do Local"
                            value={formData.endereco}
                            onChange={handleInputChange('endereco')}
                            required
                            error={formErrors.endereco}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-1 block">
                            Telefone (WhatsApp) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <div className={`flex items-center w-full bg-gray-50 border text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500 ${
                                formErrors.telefone ? 'border-red-300 focus-within:border-red-500 focus-within:ring-red-500' : 'border-gray-300'
                            }`}>
                                <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                                <span className="text-gray-600 pr-2">+55</span>
                                <input
                                    type="tel"
                                    placeholder="(00) 90000-0000"
                                    className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400"
                                    value={formData.telefone}
                                    onChange={handleInputChange('telefone')}
                                />
                            </div>
                        </div>
                        {formErrors.telefone && <p className="text-red-500 text-xs mt-1">{formErrors.telefone}</p>}
                        <p className="text-xs text-gray-500 mt-1">
                            Este número será usado para notificações e contato via WhatsApp.
                        </p>
                    </div>
                    <div>
                        <StatusToggle isOpen={formData.status === 'Ativo'} setIsOpen={(isOpen) => setFormData(prev => ({ ...prev, status: isOpen ? 'Ativo' : 'Bloqueado' }))} />
                    </div>
                </div>
            </FormCard>

            <FormCard
                title="Selecione os Agentes para Este Local"
                rightContent={
                    agents.length > 0 ? (
                        <label className="flex items-center cursor-pointer">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={allAgentsSelected} onChange={handleSelectAllAgents} className="sr-only" />
                                <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${allAgentsSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                    {allAgentsSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </div>
                            <span className="ml-2 font-medium text-sm text-gray-700">Selecionar Todos</span>
                        </label>
                    ) : null
                }
            >
                <div className="space-y-3">
                    {agents.length > 0 ? (
                        agents.map(agent => (
                            <AgentSelectItem
                                key={agent.id}
                                id={agent.id}
                                name={agent.nome}
                                avatar={agent.avatar_url}
                                checked={selectedAgents.has(agent.id)}
                                onChange={() => handleAgentToggle(agent.id)}
                            />
                        ))
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <p>Nenhum agente encontrado.</p>
                            <p className="text-sm">Cadastre agentes primeiro para associá-los a este local.</p>
                        </div>
                    )}
                </div>
            </FormCard>

            <FormCard
                title="Serviços Oferecidos"
                rightContent={
                    services.length > 0 ? (
                        <label className="flex items-center cursor-pointer">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={allServicesSelected} onChange={handleSelectAllServices} className="sr-only" />
                                <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${allServicesSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                    {allServicesSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </div>
                            <span className="ml-2 font-medium text-sm text-gray-700">Selecionar Todos</span>
                        </label>
                    ) : null
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {services.length > 0 ? (
                        services.map(service => (
                            <ServiceCheckbox
                                key={service.id}
                                id={service.id}
                                name={service.nome}
                                checked={selectedServices.has(service.id)}
                                onChange={() => handleServiceToggle(service.id)}
                            />
                        ))
                    ) : (
                        <div className="text-center py-8 text-gray-500 md:col-span-2">
                            <p>Nenhum serviço encontrado.</p>
                            <p className="text-sm">Cadastre serviços primeiro para associá-los a este local.</p>
                        </div>
                    )}
                </div>
            </FormCard>

            <FormCard title="Definir Horários">
                <AgentScheduleEditor
                    scheduleData={scheduleData}
                    onScheduleChange={setScheduleData}
                />
            </FormCard>

            <FormCard title="Calendário de Exceções">
                <CalendarExceptionsEditor
                    exceptions={calendarExceptions}
                    onExceptionsChange={setCalendarExceptions}
                />
            </FormCard>

            <div className="pt-2 flex items-center gap-4">
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || loading}
                    className="bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                    {isSubmitting || loading ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Salvando...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            Salvar Alterações
                        </>
                    )}
                </button>
                <button
                    onClick={() => setActiveView('locations-list')}
                    disabled={isSubmitting || loading}
                    className="bg-gray-100 text-gray-800 font-semibold px-8 py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Cancelar
                </button>
            </div>
        </div>
    );
};

export default EditLocationPage;

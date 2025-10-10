import React, { useState, useMemo } from 'react';
import { ChevronDown, Plus, ImagePlaceholder, Check, Cog, CheckCircle, ArrowLeft, Save, AlertCircle } from './Icons';
import AgentScheduleEditor from './AgentScheduleEditor';
import { useUnitManagement } from '../hooks/useUnitManagement';

// Mock data for agents
const agentsData = [
    { name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=1' },
    { name: 'Ângelo Paixão', avatar: 'https://i.pravatar.cc/150?img=2' },
    { name: 'Snake Filho', avatar: 'https://i.pravatar.cc/150?img=3' },
];

const servicesList = [
    'CORTE', 'CORTE + PIGMENTAÇÃO', 'CORTE + BARBA', 'BARBA + PIGMENTAÇÃO', 'LUZES + CORTE',
    'BARBA', 'BARBOTERAPIA', 'CORTE+BARBA+PIGMENTAÇÃO DA BARBA', 'CORTE+BARBA+PIGMENTAÇÃO BARBA E CABELO',
    'ALISAMENTO AMERICANO +CORTE', 'ALISAMENTO AMERICANO', 'LIMPEZA DE PELE'
];

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
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  error?: string;
}> = ({ label, placeholder, value, onChange, required = false, error }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-1 block">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={`w-full bg-gray-50 border text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 ${
            error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
          }`}
        />
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
);

const AgentSelectItem: React.FC<{ name: string; avatar: string; checked: boolean; onChange: () => void; }> = ({ name, avatar, checked, onChange }) => (
    <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
        </div>
        <img src={avatar} alt={name} className="w-10 h-10 rounded-full object-cover mx-4" />
        <span className="font-bold text-gray-800 text-md flex-1">{name}</span>
        <span className="text-sm text-gray-500 mr-4">Todos os Serviços Selecionados</span>
        <button className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50">
          <Cog className="w-4 h-4 mr-1" />
          Personalizar
        </button>
    </label>
);

const ServiceCheckbox: React.FC<{ label: string, checked: boolean, onChange: () => void }> = ({ label, checked, onChange }) => (
    <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
        </div>
        <span className="ml-4 font-medium text-gray-800 text-sm">{label}</span>
    </label>
);

const StatusToggle: React.FC = () => {
    const [isOpen, setIsOpen] = useState(true);

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

interface CreateLocationPageProps {
  setActiveView: (view: string) => void;
}

const CreateLocationPage: React.FC<CreateLocationPageProps> = ({ setActiveView }) => {
    const { createUnit, loading, error, clearError, limitInfo } = useUnitManagement();

    // Form state
    const [formData, setFormData] = useState({
        nome: '',
        endereco: '',
        telefone: '',
        status: 'Ativo' as 'Ativo' | 'Bloqueado'
    });

    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [checkedAgents, setCheckedAgents] = useState<Record<string, boolean>>(
        agentsData.reduce((acc, agent) => ({...acc, [agent.name]: true }), {})
    );
    const [checkedServices, setCheckedServices] = useState<Record<string, boolean>>(
        servicesList.reduce((acc, service) => ({ ...acc, [service]: true }), {})
    );

    const handleAgentCheck = (agentName: string) => {
        setCheckedAgents(prev => ({ ...prev, [agentName]: !prev[agentName] }));
    };
    
    const allAgentsSelected = useMemo(() => agentsData.every(agent => checkedAgents[agent.name]), [checkedAgents]);
    
    const handleSelectAllAgents = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const newCheckedState = agentsData.reduce((acc, agent) => {
            acc[agent.name] = isChecked;
            return acc;
        }, {} as Record<string, boolean>);
        setCheckedAgents(newCheckedState);
    };

    const handleSelectAllServices = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const newCheckedState = Object.keys(checkedServices).reduce((acc, service) => {
            acc[service] = isChecked;
            return acc;
        }, {} as Record<string, boolean>);
        setCheckedServices(newCheckedState);
    };

    const handleServiceCheck = (serviceName: string) => {
        setCheckedServices(prev => ({ ...prev, [serviceName]: !prev[serviceName] }));
    };

    const allServicesSelected = useMemo(() => Object.values(checkedServices).every(Boolean), [checkedServices]);

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
        }

        if (!formData.endereco.trim()) {
            errors.endereco = 'Endereço é obrigatório';
        }

        if (!formData.telefone.trim()) {
            errors.telefone = 'Telefone é obrigatório';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);
        clearError();

        const success = await createUnit({
            nome: formData.nome.trim(),
            endereco: formData.endereco.trim(),
            telefone: formData.telefone.trim(),
            status: formData.status
        });

        setIsSubmitting(false);

        if (success) {
            // Redirect back to locations list
            setActiveView('locations-list');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-gray-800">Criar Novo Local</h1>
                {limitInfo && (
                    <div className="text-sm text-gray-600">
                        <span className="font-medium">{limitInfo.currentCount}</span>
                        {limitInfo.limit ? ` de ${limitInfo.limit}` : ''} unidades utilizadas
                    </div>
                )}
            </div>

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
                            placeholder="Ex: Matriz Centro"
                            value={formData.nome}
                            onChange={handleInputChange('nome')}
                            required
                            error={formErrors.nome}
                        />
                        <TextInput
                            label="Endereço do Local"
                            placeholder="Av. Principal, 123"
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
                        <StatusToggle />
                    </div>
                </div>
            </FormCard>

            <FormCard 
                title="Selecione os Agentes para Este Local"
                rightContent={
                    <label className="flex items-center cursor-pointer">
                        <div className="relative flex items-center">
                             <input type="checkbox" checked={allAgentsSelected} onChange={handleSelectAllAgents} className="sr-only" />
                             <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${allAgentsSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                {allAgentsSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </div>
                        <span className="ml-2 font-medium text-sm text-gray-700">Selecionar Todos</span>
                    </label>
                }
            >
                <div className="space-y-3">
                    {agentsData.map(agent => <AgentSelectItem key={agent.name} {...agent} checked={!!checkedAgents[agent.name]} onChange={() => handleAgentCheck(agent.name)} />)}
                </div>
            </FormCard>

            <FormCard 
                title="Serviços Oferecidos"
                rightContent={
                    <label className="flex items-center cursor-pointer">
                        <div className="relative flex items-center">
                             <input type="checkbox" checked={allServicesSelected} onChange={handleSelectAllServices} className="sr-only" />
                             <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${allServicesSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                {allServicesSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </div>
                        <span className="ml-2 font-medium text-sm text-gray-700">Selecionar Todos</span>
                    </label>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {servicesList.map(service => (
                        <ServiceCheckbox 
                            key={service} 
                            label={service} 
                            checked={checkedServices[service] || false}
                            onChange={() => handleServiceCheck(service)}
                        />
                    ))}
                </div>
            </FormCard>

            <FormCard title="Definir Horários">
                <AgentScheduleEditor />
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
                            Salvar Local
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

export default CreateLocationPage;

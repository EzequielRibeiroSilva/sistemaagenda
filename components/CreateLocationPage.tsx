import React, { useState, useMemo } from 'react';
import { ChevronDown, Plus, ImagePlaceholder, Check, Cog, CheckCircle } from './Icons';
import AgentScheduleEditor from './AgentScheduleEditor';

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

const TextInput: React.FC<{ label: string; placeholder?: string; }> = ({ label, placeholder }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <input type="text" placeholder={placeholder} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
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

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Criar Novo Local</h1>

            <FormCard title="Informações Básicas">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <TextInput label="Nome do Local" placeholder="Ex: Matriz Centro" />
                        <TextInput label="Endereço do Local" placeholder="Av. Principal, 123" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-1 block">Telefone (WhatsApp)</label>
                        <div className="relative">
                            <div className="flex items-center w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                                <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                                <span className="text-gray-600 pr-2">+55</span>
                                <input type="tel" placeholder="(00) 90000-0000" className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400" />
                            </div>
                        </div>
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

            <div className="pt-2">
                <button className="bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Salvar Local
                </button>
            </div>
        </div>
    );
};

export default CreateLocationPage;

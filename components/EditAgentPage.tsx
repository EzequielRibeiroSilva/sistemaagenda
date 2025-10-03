import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Check, Leaf, ImagePlaceholder } from './Icons';
import AgentScheduleEditor from './AgentScheduleEditor';

// Mock data, should be consistent with AgentsPage
const agentsData = [
  {
    id: '1',
    name: 'Eduardo Soares',
    phone: '+5585989522202',
    avatar: 'https://i.pravatar.cc/150?img=1',
  },
  {
    id: '2',
    name: 'Ângelo Paixão',
    phone: '+5585989307925',
    avatar: 'https://i.pravatar.cc/150?img=2',
  },
  {
    id: '3',
    name: 'Snake Filho',
    phone: '+5585989307925',
    avatar: 'https://i.pravatar.cc/150?img=3',
  },
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

const TextInput: React.FC<{ label: string; placeholder?: string; defaultValue?: string; className?: string, value?: string, onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void }> = ({ label, placeholder, defaultValue, className = "", value, onChange }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <input type="text" placeholder={placeholder} defaultValue={defaultValue} value={value} onChange={onChange} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
    </div>
);
const TextArea: React.FC<{ label: string; placeholder?: string; rows?: number; className?: string }> = ({ label, placeholder, rows = 2, className = "" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <textarea placeholder={placeholder} rows={rows} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
    </div>
);

const SelectInput: React.FC<{ label: string; children: React.ReactNode, className?: string, value?: string, onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void }> = ({ label, children, className="", value, onChange }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <select value={value} onChange={onChange} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500">
            {children}
        </select>
    </div>
);

const servicesList = [
    'CORTE', 'CORTE + PIGMENTAÇÃO', 'CORTE + BARBA', 'BARBA + PIGMENTAÇÃO', 'LUZES + CORTE',
    'BARBA', 'BARBOTERAPIA', 'CORTE+BARBA+PIGMENTAÇÃO DA BARBA', 'CORTE+BARBA+PIGMENTAÇÃO BARBA E CABELO',
    'ALISAMENTO AMERICANO +CORTE', 'ALISAMENTO AMERICANO', 'LIMPEZA DE PELE'
];

const ServiceCheckboxWithIcon: React.FC<{ label: string, checked: boolean, onChange: () => void }> = ({ label, checked, onChange }) => (
    <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
        </div>
        <span className="ml-3 font-medium text-gray-800 text-sm">{label}</span>
    </label>
);

interface EditAgentPageProps {
  setActiveView: (view: string) => void;
  agentId: string | null;
}

const EditAgentPage: React.FC<EditAgentPageProps> = ({ setActiveView, agentId }) => {
    const agentToEdit = useMemo(() => agentsData.find(agent => agent.id === agentId), [agentId]);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');

    useEffect(() => {
        if (agentToEdit) {
            const nameParts = agentToEdit.name.split(' ');
            setFirstName(nameParts[0]);
            setLastName(nameParts.slice(1).join(' '));
            setPhone(agentToEdit.phone.replace('+55', '').trim());
        }
    }, [agentToEdit]);
    
    const [checkedServices, setCheckedServices] = useState<Record<string, boolean>>(
        servicesList.reduce((acc, service) => ({ ...acc, [service]: true }), {})
    );
    const [isCustomSchedule, setIsCustomSchedule] = useState(true);

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
    
    if (!agentToEdit) {
        return (
            <div className="p-4 text-center">
                <h2 className="text-xl font-semibold text-gray-700">Agente não encontrado.</h2>
                <button onClick={() => setActiveView('agents-list')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Voltar para a lista de agentes
                </button>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Editar Agente</h1>

            <FormCard title="Informações Gerais">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                        <div className="border-2 border-dotted border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-500 group h-full min-h-[220px]">
                             <img src={agentToEdit.avatar} alt={agentToEdit.name} className="w-32 h-32 rounded-full object-cover mb-4" />
                            <span className="text-sm font-semibold text-gray-600 group-hover:text-blue-600">Mudar foto</span>
                        </div>
                    </div>
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <TextInput label="Primeiro Nome" value={firstName} onChange={e => setFirstName(e.target.value)} />
                        <TextInput label="Último Nome" value={lastName} onChange={e => setLastName(e.target.value)} />
                        <TextInput label="Nome De Exibição" className="md:col-span-2" value={`${firstName} ${lastName}`} />
                        <TextInput label="Endereço De E-Mail" className="md:col-span-2" />
                        
                        <div className="relative">
                            <label className="text-sm font-medium text-gray-600 mb-2 block">Telefone</label>
                            <div className="flex items-center w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                                <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                                <span className="text-gray-600 pr-2">+55</span>
                                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="11 96123-4567" className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400" />
                            </div>
                        </div>
                        
                        <SelectInput label="Estado">
                            <option>Ativo</option>
                            <option>Bloqueado</option>
                        </SelectInput>
                    </div>
                </div>
            </FormCard>
            
            <FormCard title="Informações Extras">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                         <TextInput label="Nome de Exibição" value={`${firstName} ${lastName}`} />
                         <TextArea label="Biografia" rows={5} />
                    </div>
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
                        <ServiceCheckboxWithIcon
                            key={service} 
                            label={service} 
                            checked={checkedServices[service] || false}
                            onChange={() => handleServiceCheck(service)}
                        />
                    ))}
                </div>
            </FormCard>
            
            <FormCard
                title="Selecione a agenda do agente"
                rightContent={
                     <label className="flex items-center text-sm font-medium text-blue-600 cursor-pointer">
                        <div className="relative flex items-center">
                            <input 
                                type="checkbox"
                                checked={isCustomSchedule}
                                onChange={() => setIsCustomSchedule(!isCustomSchedule)}
                                className="sr-only"
                            />
                            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${isCustomSchedule ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                {isCustomSchedule && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </div>
                        <span className="ml-2 font-semibold">Definir Agenda Personalizada</span>
                    </label>
                }
            >
                {isCustomSchedule ? (
                    <AgentScheduleEditor />
                ) : (
                    <div className="bg-gray-100 p-4 rounded-lg text-sm text-center text-gray-600">
                        O agente usará o horário de trabalho padrão.
                    </div>
                )}
            </FormCard>

            <div className="pt-2">
                <button className="bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Salvar Alterações
                </button>
            </div>
        </div>
    );
};

export default EditAgentPage;

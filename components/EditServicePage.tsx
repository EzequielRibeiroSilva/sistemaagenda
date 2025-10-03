import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Check } from './Icons';

// Mock data to find the service to edit
const mockServicesData = [
    { id: 's1', name: 'CORTE', price: 30, duration: 60, commission: 70 },
    { id: 's2', name: 'CORTE + PIGMENTAÇÃO', price: 50, duration: 60, commission: 70 },
    { id: 's3', name: 'CORTE + BARBA', price: 45, duration: 60, commission: 70 },
    { id: 's4', name: 'BARBA + PIGMENTAÇÃO', price: 30, duration: 60, commission: 70 },
];

const agentsData = [
    { name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=1' },
    { name: 'Ângelo Paixão', avatar: 'https://i.pravatar.cc/150?img=2' },
    { name: 'Snake Filho', avatar: 'https://i.pravatar.cc/150?img=3' },
];

// Reusable components from CreateServicePage
const FormCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">{title}</h2>
        {children}
    </div>
);

const TextInput: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <input type={type} value={value} onChange={onChange} className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
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
        <img src={avatar} alt={name} className="w-8 h-8 rounded-full object-cover mx-3" />
        <span className="font-medium text-gray-800 text-sm">{name}</span>
    </label>
);

interface EditServicePageProps {
    setActiveView: (view: string) => void;
    serviceId: string | null;
}

const EditServicePage: React.FC<EditServicePageProps> = ({ setActiveView, serviceId }) => {
    const serviceToEdit = useMemo(() => mockServicesData.find(s => s.id === serviceId), [serviceId]);

    const [serviceName, setServiceName] = useState('');
    const [price, setPrice] = useState(0);
    const [duration, setDuration] = useState(0);
    const [commission, setCommission] = useState(0);
    const [checkedAgents, setCheckedAgents] = useState<Record<string, boolean>>(
        agentsData.reduce((acc, agent) => ({...acc, [agent.name]: true }), {})
    );

    useEffect(() => {
        if (serviceToEdit) {
            setServiceName(serviceToEdit.name);
            setPrice(serviceToEdit.price);
            setDuration(serviceToEdit.duration);
            setCommission(serviceToEdit.commission);
        }
    }, [serviceToEdit]);

    const handleAgentCheck = (agentName: string) => {
        setCheckedAgents(prev => ({ ...prev, [agentName]: !prev[agentName] }));
    };

    if (!serviceToEdit) {
        return (
            <div className="p-4 text-center">
                <h2 className="text-xl font-semibold text-gray-700">Serviço não encontrado.</h2>
                <button onClick={() => setActiveView('services-list')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Voltar para a lista de serviços
                </button>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Editar Serviço</h1>

            <FormCard title="Informações Gerais">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TextInput label="Nome Do Serviço" value={serviceName} onChange={e => setServiceName(e.target.value)} />
                    <TextInput label="Valor Final (R$)" type="number" value={String(price)} onChange={e => setPrice(Number(e.target.value))} />
                    <TextInput label="Duração (minutos)" type="number" value={String(duration)} onChange={e => setDuration(Number(e.target.value))} />
                    <TextInput label="Comissão (%)" type="number" value={String(commission)} onChange={e => setCommission(Number(e.target.value))} />
                </div>
            </FormCard>
            
            <FormCard title="Agentes Que Oferecem Este Serviço">
                 <div className="space-y-3">
                     {agentsData.map(agent => <AgentSelectItem key={agent.name} {...agent} checked={!!checkedAgents[agent.name]} onChange={() => handleAgentCheck(agent.name)} />)}
                 </div>
            </FormCard>

            <div className="pt-2">
                <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
                    Salvar Alterações
                </button>
                <button onClick={() => setActiveView('services-list')} className="ml-4 bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors">
                    Cancelar
                </button>
            </div>
        </div>
    );
};

export default EditServicePage;
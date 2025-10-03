
import React, { useState, useEffect } from 'react';
import { Check } from './Icons';

// Mock data (in a real app, this would be fetched)
const mockExtraServicesData = [
  {
    id: 'extra1',
    name: 'SOBRANCELHA',
    services: 'Todos Selecionados',
    duration: 0,
    price: 7,
    maxQty: 1,
    status: 'Ativo',
    description: 'Design de sobrancelha profissional.',
  },
];

const connectedServicesList = [
    'CORTE', 'CORTE + PIGMENTAÇÃO', 'CORTE + BARBA', 'BARBA + PIGMENTAÇÃO', 'LUZES + CORTE',
    'BARBA', 'BARBOTERAPIA', 'CORTE+BARBA+PIGMENTAÇÃO DA BARBA', 'CORTE+BARBA+PIGMENTAÇÃO BARBA E CABELO',
    'ALISAMENTO AMERICANO +CORTE', 'ALISAMENTO AMERICANO', 'LIMPEZA DE PELE'
];


// Reusable components (same as CreateExtraServicePage)
const FormCard: React.FC<{ title: string; children: React.ReactNode; rightContent?: React.ReactNode }> = ({ title, children, rightContent }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      {rightContent}
    </div>
    {children}
  </div>
);

const TextInput: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <input type={type} value={value} onChange={onChange} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
    </div>
);

const TextArea: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; }> = ({ label, value, onChange }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <textarea value={value} onChange={onChange} rows={3} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]" />
    </div>
);

const SelectInput: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }> = ({ label, value, onChange, children }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <select value={value} onChange={onChange} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500">
            {children}
        </select>
    </div>
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


interface EditExtraServicePageProps {
  setActiveView: (view: string) => void;
  extraServiceId: string | null;
}

const EditExtraServicePage: React.FC<EditExtraServicePageProps> = ({ setActiveView, extraServiceId }) => {
    const serviceToEdit = React.useMemo(() => mockExtraServicesData.find(s => s.id === extraServiceId), [extraServiceId]);

    const [name, setName] = useState('');
    const [duration, setDuration] = useState(0);
    const [price, setPrice] = useState(0);
    const [maxQty, setMaxQty] = useState(1);
    const [status, setStatus] = useState('Ativo');
    const [description, setDescription] = useState('');
    
    const [checkedServices, setCheckedServices] = useState<Record<string, boolean>>(
        connectedServicesList.reduce((acc, service) => ({ ...acc, [service]: true }), {})
    );

    useEffect(() => {
        if (serviceToEdit) {
            setName(serviceToEdit.name);
            setDuration(serviceToEdit.duration);
            setPrice(serviceToEdit.price);
            setMaxQty(serviceToEdit.maxQty);
            setStatus(serviceToEdit.status);
            setDescription(serviceToEdit.description);
        }
    }, [serviceToEdit]);
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    
    const allSelected = Object.values(checkedServices).every(Boolean);

    if (!serviceToEdit) {
        return (
            <div className="p-4 text-center">
                <h2 className="text-xl font-semibold text-gray-700">Serviço extra não encontrado.</h2>
                <button onClick={() => setActiveView('services-extra')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Voltar para serviços extras
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Editar Serviço Extra</h1>
            
            <FormCard title="Informações básicas">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                   <TextInput label="Nome do serviço extra" value={name} onChange={e => setName(e.target.value)} />
                   <TextInput label="Duração (minutos)" type="number" value={String(duration)} onChange={e => setDuration(Number(e.target.value))} />
                   <TextInput label="Valor de cobrança (R$)" type="number" value={String(price)} onChange={e => setPrice(Number(e.target.value))} />
                   <TextInput label="Quantidade Máxima" type="number" value={String(maxQty)} onChange={e => setMaxQty(Number(e.target.value))} />
                   <SelectInput label="Status" value={status} onChange={e => setStatus(e.target.value)}>
                        <option>Ativo</option>
                        <option>Inativo</option>
                   </SelectInput>
                </div>
                <TextArea label="Descrição curta" value={description} onChange={e => setDescription(e.target.value)} />
            </FormCard>

            <FormCard 
                title="Serviços Conectados"
                rightContent={
                    <label className="flex items-center cursor-pointer">
                        <div className="relative flex items-center">
                             <input type="checkbox" checked={allSelected} onChange={handleSelectAll} className="sr-only" />
                             <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${allSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                {allSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </div>
                        <span className="ml-2 font-medium text-sm text-gray-700">Selecionar Todos</span>
                    </label>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {connectedServicesList.map(service => (
                        <ServiceCheckbox 
                            key={service} 
                            label={service} 
                            checked={checkedServices[service] || false}
                            onChange={() => handleServiceCheck(service)}
                        />
                    ))}
                </div>
            </FormCard>
            
            <div className="pt-2 flex items-center gap-4">
                <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
                    Salvar Alterações
                </button>
                <button onClick={() => setActiveView('services-extra')} className="bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors">
                    Cancelar
                </button>
            </div>
        </div>
    );
};

export default EditExtraServicePage;
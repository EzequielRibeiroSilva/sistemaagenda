import React, { useState } from 'react';
import { ImagePlaceholder, Check, ChevronLeft } from './Icons';

const FormCard: React.FC<{ title: string; children: React.ReactNode; rightContent?: React.ReactNode }> = ({ title, children, rightContent }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      {rightContent}
    </div>
    {children}
  </div>
);

const TextInput: React.FC<{ label: string; placeholder?: string; defaultValue?: string; className?: string }> = ({ label, placeholder, defaultValue, className = "" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <input type="text" placeholder={placeholder} defaultValue={defaultValue} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
    </div>
);
const TextArea: React.FC<{ label: string; placeholder?: string; className?: string }> = ({ label, placeholder, className = "" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <textarea placeholder={placeholder} rows={3} className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]" />
    </div>
);

const SelectInput: React.FC<{ label: string; children: React.ReactNode, className?: string }> = ({ label, children, className="" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <select className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500">
            {children}
        </select>
    </div>
);

const ImageUploadPlaceholder: React.FC<{ title: string; }> = ({ title }) => (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex items-center justify-center text-center cursor-pointer hover:border-blue-500 group h-full bg-gray-50">
        <div className="flex items-center text-gray-600 group-hover:text-blue-600">
            <ImagePlaceholder className="w-8 h-8 text-gray-400 group-hover:text-blue-500" />
            <span className="ml-3 text-sm font-medium">{title}</span>
        </div>
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

const connectedServicesList = [
    'CORTE', 'CORTE + PIGMENTAÇÃO', 'CORTE + BARBA', 'BARBA + PIGMENTAÇÃO', 'LUZES + CORTE',
    'BARBA', 'BARBOTERAPIA', 'CORTE+BARBA+PIGMENTAÇÃO DA BARBA', 'CORTE+BARBA+PIGMENTAÇÃO BARBA E CABELO',
    'ALISAMENTO AMERICANO +CORTE', 'ALISAMENTO AMERICANO', 'LIMPEZA DE PELE'
];

interface CreateExtraServicePageProps {
  setActiveView: (view: string) => void;
}

const CreateExtraServicePage: React.FC<CreateExtraServicePageProps> = ({ setActiveView }) => {
    const [checkedServices, setCheckedServices] = useState<Record<string, boolean>>(
        connectedServicesList.reduce((acc, service) => ({ ...acc, [service]: true }), {})
    );

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

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 -mb-2">
              <h1 className="text-3xl font-bold text-gray-800">Criar novo serviço extra</h1>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-6">
                    <FormCard title="Informações básicas">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                           <TextInput label="Nome do serviço extra" className="md:col-span-2" />
                           <TextInput label="Duração (minutos)" defaultValue="0" />
                           <TextInput label="Valor de cobrança" defaultValue="R$ 0,00" />
                           <TextInput label="Quantidade Máxima" defaultValue="1" />
                           <SelectInput label="Status">
                                <option>Ativo</option>
                                <option>Inativo</option>
                           </SelectInput>
                        </div>
                        <TextArea label="Descrição curta" />
                    </FormCard>
                </div>
                
            </div>

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
            
            <div className="pt-2">
                <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Adicionar serviço extra
                </button>
            </div>
        </div>
    );
};

export default CreateExtraServicePage;
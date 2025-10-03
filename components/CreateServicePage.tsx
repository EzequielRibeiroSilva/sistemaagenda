import React, { useState, useMemo } from 'react';
import { Plus, Check, ChevronDown, Leaf, ImagePlaceholder } from './Icons';

// Helper components for UI elements to match the design
const FormCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">{title}</h2>
        {children}
    </div>
);

const TextInput: React.FC<{ label: string; placeholder?: string; defaultValue?: string; className?: string, type?: string }> = ({ label, placeholder, defaultValue, className = "", type = "text" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <input type={type} placeholder={placeholder} defaultValue={defaultValue} className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
    </div>
);
const TextArea: React.FC<{ label: string; placeholder?: string; className?: string }> = ({ label, placeholder, className = "" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <textarea placeholder={placeholder} className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]" />
    </div>
);

const SelectInput: React.FC<{ label: string; children: React.ReactNode, className?: string }> = ({ label, children, className="" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <div className="relative">
            <select className="appearance-none w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500">
                {children}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
        </div>
    </div>
);

const ColorInput: React.FC<{ label: string, value: string }> = ({ label, value }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <div className="relative flex items-center">
            <div className="w-11 h-11 flex items-center justify-center bg-white border border-r-0 border-gray-300 rounded-l-lg">
                <div className="w-6 h-6 rounded" style={{ backgroundColor: value }}></div>
            </div>
            <input type="text" value={value} readOnly className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-r-lg p-2.5 focus:ring-blue-500 focus:border-blue-500" />
        </div>
    </div>
);

const ImageUploadBox: React.FC<{ title: string; description: string }> = ({ title, description }) => (
    <div>
        <h3 className="text-sm font-medium text-gray-800">{title}</h3>
        <p className="text-xs text-gray-500 mt-1 mb-2 h-8">{description}</p>
        <div className="border-2 border-dotted border-gray-300 rounded-lg p-6 flex items-center justify-center text-center cursor-pointer hover:border-blue-500 h-28 group">
            <div className="flex items-center text-gray-600 group-hover:text-blue-600">
                <ImagePlaceholder className="w-8 h-8 text-gray-400 group-hover:text-blue-500" />
                <span className="ml-3 text-sm font-medium">Adicionar Imagem</span>
            </div>
        </div>
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

const ExtraSelectItem: React.FC<{ name: string; checked: boolean; onChange: () => void; }> = ({ name, checked, onChange }) => (
    <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
        </div>
        
        <span className="ml-3 font-medium text-gray-800 text-sm">{name}</span>
    </label>
);

const ToggleSwitch: React.FC<{ label: string; description: string; checked: boolean }> = ({ label, description, checked }) => {
    const [isChecked, setIsChecked] = React.useState(checked);
    return (
        <div className="flex items-center">
            <button onClick={() => setIsChecked(!isChecked)} role="switch" aria-checked={isChecked} className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${isChecked ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isChecked ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <div className="ml-3">
                <p className="font-medium text-gray-800 text-sm">{label}</p>
                <p className="text-sm text-gray-500">{description}</p>
            </div>
        </div>
    );
};

const CreateServicePage: React.FC = () => {
    const agentsData = [
        { name: 'Eduardo Soares', avatar: 'https://i.pravatar.cc/150?img=1' },
        { name: 'Ângelo Paixão', avatar: 'https://i.pravatar.cc/150?img=2' },
        { name: 'Snake Filho', avatar: 'https://i.pravatar.cc/150?img=3' },
    ];
    
    const extrasData = [{ name: 'SOBRANCELHA' }];

    const [checkedAgents, setCheckedAgents] = useState<Record<string, boolean>>(
        agentsData.reduce((acc, agent) => ({...acc, [agent.name]: true }), {})
    );
    
    const [checkedExtras, setCheckedExtras] = useState<Record<string, boolean>>(
        extrasData.reduce((acc, extra) => ({...acc, [extra.name]: true }), {})
    );

    const handleAgentCheck = (agentName: string) => {
        setCheckedAgents(prev => ({ ...prev, [agentName]: !prev[agentName] }));
    };

    const allAgentsSelected = useMemo(() => agentsData.length > 0 && agentsData.every(agent => checkedAgents[agent.name]), [checkedAgents, agentsData]);

    const handleSelectAllAgents = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const newCheckedState = agentsData.reduce((acc, agent) => {
            acc[agent.name] = isChecked;
            return acc;
        }, {} as Record<string, boolean>);
        setCheckedAgents(newCheckedState);
    };
    
    const handleExtraCheck = (extraName: string) => {
        setCheckedExtras(prev => ({ ...prev, [extraName]: !prev[extraName] }));
    };

    const allExtrasSelected = useMemo(() => extrasData.length > 0 && extrasData.every(extra => checkedExtras[extra.name]), [checkedExtras, extrasData]);

    const handleSelectAllExtras = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const newCheckedState = extrasData.reduce((acc, extra) => {
            acc[extra.name] = isChecked;
            return acc;
        }, {} as Record<string, boolean>);
        setCheckedExtras(newCheckedState);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Criar Novo Serviço</h1>
            
            <div className="space-y-6">
                <FormCard title="Informações Gerais">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <TextInput label="Nome Do Serviço" placeholder="Nome Do Serviço" />
                        <TextArea label="Breve Descrição" placeholder="Breve Descrição" />
                        <div className="flex items-end gap-2">
                             <SelectInput label="Categoria" className="flex-1">
                                <option>Sem Categoria</option>
                            </SelectInput>
                            <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 h-[44px]">
                                <Plus className="w-4 h-4" />
                                Adicionar Categoria
                            </button>
                        </div>
                        
                        <SelectInput label="Estado">
                            <option>Ativo</option>
                            <option>Bloqueado</option>
                        </SelectInput>
                    </div>
                </FormCard>


                <FormCard title="Duração do Serviço e Preço">
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <TextInput label="Duração (minutos)" defaultValue="60" type="number" />
                        <TextInput label="Valor De Custo" defaultValue="R$ 0,00" />
                        <TextInput label="Valor Final" defaultValue="R$ 0,00" />
                        <TextInput label="Comissão (%)" defaultValue="70" type="number" />
                    </div>
                </FormCard>

                <FormCard title="Preços para Exibição">
                    <div className="bg-gray-100 p-4 rounded-lg text-sm text-gray-600 mb-4">
                        Este preço é apenas para fins de exibição, não é o preço que o cliente será cobrado. O Valor Final acima controla a quantidade que o cliente será cobrado. Definição de mínimo e preço máximo, vai mostrar uma faixa de preço no serviço de etapa de seleção.
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <TextInput label="Preço Mínimo" defaultValue="R$ 0,00" />
                         <TextInput label="Preço Máximo" defaultValue="R$ 0,00" />
                     </div>
                </FormCard>
                
                

                <FormCard title="Agentes Que Oferecem Este Serviço">
                     <div className="flex justify-end mb-4">
                         <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={allAgentsSelected} onChange={handleSelectAllAgents} className="sr-only" />
                                <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${allAgentsSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                    {allAgentsSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </div>
                            <span className="ml-2">Selecionar Todos</span>
                         </label>
                     </div>
                     <div className="space-y-3">
                         {agentsData.map(agent => <AgentSelectItem key={agent.name} {...agent} checked={!!checkedAgents[agent.name]} onChange={() => handleAgentCheck(agent.name)} />)}
                     </div>
                </FormCard>

                

                <FormCard title="Serviços Extras">
                     <div className="flex justify-end mb-4">
                         <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={allExtrasSelected} onChange={handleSelectAllExtras} className="sr-only" />
                                <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${allExtrasSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                    {allExtrasSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </div>
                            <span className="ml-2">Selecionar Todos</span>
                         </label>
                     </div>
                     <div className="space-y-3">
                         {extrasData.map(extra => <ExtraSelectItem key={extra.name} name={extra.name} checked={!!checkedExtras[extra.name]} onChange={() => handleExtraCheck(extra.name)} />)}
                     </div>
                </FormCard>
                
                

            </div>
            
            <div className="pt-2">
                <button className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Adicionar Serviço
                </button>
            </div>
        </div>
    );
};

export default CreateServicePage;
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Check, ChevronDown, Leaf, ImagePlaceholder } from './Icons';
import { useServiceManagement } from '../hooks/useServiceManagement';

// Helper components for UI elements to match the design
const FormCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">{title}</h2>
        {children}
    </div>
);

const TextInput: React.FC<{
  label: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  type?: string;
  step?: string;
}> = ({ label, placeholder, value, onChange, className = "", type = "text", step }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          step={step}
          className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
        />
    </div>
);

const TextArea: React.FC<{
  label: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
}> = ({ label, placeholder, value, onChange, className = "" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
        />
    </div>
);

const SelectInput: React.FC<{
  label: string;
  children: React.ReactNode;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
}> = ({ label, children, value, onChange, className="" }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
        <div className="relative">
            <select
              value={value}
              onChange={onChange}
              className="appearance-none w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500"
            >
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

interface CreateServicePageProps {
  setActiveView?: (view: string) => void;
}

const CreateServicePage: React.FC<CreateServicePageProps> = ({ setActiveView }) => {
    // Hook para gerenciar serviços
    const {
        agents,
        extraServices,
        loading,
        error,
        createService
    } = useServiceManagement();

    // Estados do formulário
    const [nome, setNome] = useState('');
    const [descricao, setDescricao] = useState('');
    const [duracaoMinutos, setDuracaoMinutos] = useState(60);
    const [preco, setPreco] = useState(0);
    const [comissaoPercentual, setComissaoPercentual] = useState(70);
    const [status, setStatus] = useState<'Ativo' | 'Inativo'>('Ativo');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Estados para seleções
    const [checkedAgents, setCheckedAgents] = useState<Record<number, boolean>>({});
    const [checkedExtras, setCheckedExtras] = useState<Record<number, boolean>>({});

    // Inicializar seleções quando os dados carregarem
    useEffect(() => {
        if (agents.length > 0) {
            const initialAgentState = agents.reduce((acc, agent) => {
                acc[agent.id] = false; // Por padrão, nenhum agente selecionado
                return acc;
            }, {} as Record<number, boolean>);
            setCheckedAgents(initialAgentState);
        }
    }, [agents]);

    useEffect(() => {
        if (extraServices.length > 0) {
            const initialExtraState = extraServices.reduce((acc, extra) => {
                acc[extra.id] = false; // Por padrão, nenhum extra selecionado
                return acc;
            }, {} as Record<number, boolean>);
            setCheckedExtras(initialExtraState);
        }
    }, [extraServices]);

    const handleAgentCheck = (agentId: number) => {
        setCheckedAgents(prev => ({ ...prev, [agentId]: !prev[agentId] }));
    };

    const allAgentsSelected = useMemo(() =>
        agents.length > 0 && agents.every(agent => checkedAgents[agent.id]),
        [checkedAgents, agents]
    );

    const handleSelectAllAgents = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const newCheckedState = agents.reduce((acc, agent) => {
            acc[agent.id] = isChecked;
            return acc;
        }, {} as Record<number, boolean>);
        setCheckedAgents(newCheckedState);
    };

    const handleExtraCheck = (extraId: number) => {
        setCheckedExtras(prev => ({ ...prev, [extraId]: !prev[extraId] }));
    };

    const allExtrasSelected = useMemo(() =>
        extraServices.length > 0 && extraServices.every(extra => checkedExtras[extra.id]),
        [checkedExtras, extraServices]
    );

    const handleSelectAllExtras = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const newCheckedState = extraServices.reduce((acc, extra) => {
            acc[extra.id] = isChecked;
            return acc;
        }, {} as Record<number, boolean>);
        setCheckedExtras(newCheckedState);
    };

    // Função para submeter o formulário
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!nome.trim()) {
            setSubmitError('Nome é obrigatório');
            return;
        }

        if (preco < 0) {
            setSubmitError('Preço deve ser maior ou igual a zero');
            return;
        }

        try {
            setSubmitting(true);
            setSubmitError(null);

            // Obter IDs dos agentes e extras selecionados
            const agentesIds = agents
                .filter(agent => checkedAgents[agent.id])
                .map(agent => agent.id);

            const extrasIds = extraServices
                .filter(extra => checkedExtras[extra.id])
                .map(extra => extra.id);

            const serviceData = {
                nome: nome.trim(),
                descricao: descricao.trim(),
                duracao_minutos: duracaoMinutos,
                preco: preco,
                comissao_percentual: comissaoPercentual,
                status: status,
                agentes_ids: agentesIds,
                extras_ids: extrasIds
            };

            console.log('🚀 Enviando dados do serviço:', serviceData);

            const result = await createService(serviceData);

            if (result.success) {
                console.log('✅ Serviço criado com sucesso!');
                if (setActiveView) {
                    setActiveView('services-list'); // Voltar para a lista de serviços
                }
            } else {
                setSubmitError(result.error || 'Erro ao criar serviço');
            }
        } catch (error) {
            console.error('❌ Erro ao criar serviço:', error);
            setSubmitError(error instanceof Error ? error.message : 'Erro desconhecido');
        } finally {
            setSubmitting(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-800">Criar Novo Serviço</h1>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <p className="text-gray-600">Carregando dados...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Criar Novo Serviço</h1>

            {/* Exibir erro de carregamento */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-600 text-sm">❌ {error}</p>
                </div>
            )}

            {/* Exibir erro de submissão */}
            {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-600 text-sm">❌ {submitError}</p>
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                    <FormCard title="Informações Gerais">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <TextInput
                              label="Nome Do Serviço"
                              placeholder="Nome Do Serviço"
                              value={nome}
                              onChange={(e) => setNome(e.target.value)}
                            />
                            <TextArea
                              label="Breve Descrição"
                              placeholder="Breve Descrição"
                              value={descricao}
                              onChange={(e) => setDescricao(e.target.value)}
                            />
                            <div className="flex items-end gap-2">
                                 <SelectInput label="Categoria" className="flex-1">
                                    <option>Sem Categoria</option>
                                </SelectInput>
                                <button
                                  type="button"
                                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 h-[44px]"
                                >
                                    <Plus className="w-4 h-4" />
                                    Adicionar Categoria
                                </button>
                            </div>

                            <SelectInput
                              label="Estado"
                              value={status}
                              onChange={(e) => setStatus(e.target.value as 'Ativo' | 'Inativo')}
                            >
                                <option value="Ativo">Ativo</option>
                                <option value="Inativo">Inativo</option>
                            </SelectInput>
                        </div>
                    </FormCard>


                    <FormCard title="Duração do Serviço e Preço">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <TextInput
                              label="Duração (minutos)"
                              type="number"
                              value={String(duracaoMinutos)}
                              onChange={(e) => setDuracaoMinutos(Number(e.target.value))}
                            />
                            <TextInput
                              label="Valor Final (R$)"
                              type="number"
                              step="0.01"
                              value={String(preco)}
                              onChange={(e) => setPreco(Number(e.target.value))}
                            />
                            <TextInput
                              label="Comissão (%)"
                              type="number"
                              value={String(comissaoPercentual)}
                              onChange={(e) => setComissaoPercentual(Number(e.target.value))}
                            />
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
                         {agents.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-500 text-sm">
                                    👥 Nenhum agente encontrado.
                                </p>
                                <p className="text-gray-400 text-xs mt-1">
                                    Cadastre agentes primeiro para associá-los aos serviços.
                                </p>
                            </div>
                         ) : (
                             <div className="space-y-3">
                                 {agents.map(agent => (
                                    <AgentSelectItem
                                      key={agent.id}
                                      name={agent.nome}
                                      avatar={agent.avatar || 'https://i.pravatar.cc/150?img=1'}
                                      checked={!!checkedAgents[agent.id]}
                                      onChange={() => handleAgentCheck(agent.id)}
                                    />
                                 ))}
                             </div>
                         )}
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
                         {extraServices.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-500 text-sm">
                                    ⭐ Nenhum serviço extra encontrado.
                                </p>
                                <p className="text-gray-400 text-xs mt-1">
                                    Cadastre serviços extras primeiro para associá-los aos serviços principais.
                                </p>
                            </div>
                         ) : (
                             <div className="space-y-3">
                                 {extraServices.map(extra => (
                                    <ExtraSelectItem
                                      key={extra.id}
                                      name={extra.nome}
                                      checked={!!checkedExtras[extra.id]}
                                      onChange={() => handleExtraCheck(extra.id)}
                                    />
                                 ))}
                             </div>
                         )}
                    </FormCard>
                </div>

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={submitting || !nome.trim()}
                        className={`font-semibold px-6 py-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                            submitting || !nome.trim()
                                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                        {submitting ? 'Criando...' : 'Adicionar Serviço'}
                    </button>
                    {setActiveView && (
                        <button
                            type="button"
                            onClick={() => setActiveView('services-list')}
                            className="ml-4 bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};

export default CreateServicePage;
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Check, FaUser } from './Icons';
import { useServiceManagement } from '../hooks/useServiceManagement';
import { useToast } from '../contexts/ToastContext';
import { getAssetUrl } from '../utils/api';

interface Service {
  id: number;
  nome: string;
  descricao?: string;
  duracao_minutos: number;
  preco: number;
  comissao_percentual: number;
  status: 'Ativo' | 'Bloqueado';
  convite_retorno_ativo?: boolean;
  convite_retorno_dias?: number | null;
  agentes_associados?: Array<{ id: number; nome: string; sobrenome: string }>;
  agentes_atuais_ids?: number[];
  extras_associados?: Array<{ id: number; nome: string }>;
  extras_atuais_ids?: number[];
}

// Reusable components from CreateServicePage
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
          rows={3}
          className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
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
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    </div>
);

const AgentSelectItem: React.FC<{ name: string; avatar: string | null; checked: boolean; onChange: () => void; }> = ({ name, avatar, checked, onChange }) => (
    <label className={`flex items-center p-3 rounded-lg border-2 ${checked ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'} cursor-pointer transition-colors`}>
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                {checked && <Check className="w-3 h-3 text-white" />}
            </div>
        </div>
        <div className="relative w-8 h-8 mx-3">
            {avatar ? (
                <img
                    src={getAssetUrl(avatar)}
                    alt={name}
                    className="w-8 h-8 rounded-full object-cover"
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
            <div className={`w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center ${avatar ? 'hidden' : ''}`}>
                <FaUser className="w-4 h-4 text-gray-600" />
            </div>
        </div>
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

interface EditServicePageProps {
    setActiveView: (view: string) => void;
    serviceId: string | null;
}

const EditServicePage: React.FC<EditServicePageProps> = ({ setActiveView, serviceId }) => {
    // Hook para gerenciar serviços
    const {
        agents,
        extraServices,
        loading,
        error,
        fetchService,
        updateService
    } = useServiceManagement();
    const toast = useToast();

    // Estados do formulário
    const [nome, setNome] = useState('');
    const [descricao, setDescricao] = useState('');
    const [duracaoMinutos, setDuracaoMinutos] = useState(60);
    const [preco, setPreco] = useState(0);
    const [comissaoPercentual, setComissaoPercentual] = useState(70);
    const [status, setStatus] = useState<'Ativo' | 'Bloqueado'>('Ativo');
    const [conviteRetornoAtivo, setConviteRetornoAtivo] = useState(false);
    const [conviteRetornoDias, setConviteRetornoDias] = useState<number>(30);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [loadingService, setLoadingService] = useState(true);

    // Estados para seleções
    const [checkedAgents, setCheckedAgents] = useState<Record<number, boolean>>({});
    const [checkedExtras, setCheckedExtras] = useState<Record<number, boolean>>({});

    // ✅ Estado para armazenar dados do serviço carregado (para configurar seleções depois)
    const [loadedService, setLoadedService] = useState<Service | null>(null);

    // Carregar dados do serviço - CORRIGIDO: não depende mais de agents e extraServices
    useEffect(() => {
        let isMounted = true;

        const loadService = async () => {
            if (!serviceId) {
                setLoadingService(false);
                return;
            }

            try {
                setLoadingService(true);
                setSubmitError(null);

                const service = await fetchService(Number(serviceId));

                if (isMounted && service) {
                    setNome(service.nome);
                    setDescricao(service.descricao || '');
                    setDuracaoMinutos(service.duracao_minutos);
                    setPreco(service.preco);
                    setComissaoPercentual(service.comissao_percentual);
                    setStatus(service.status);
                    setConviteRetornoAtivo(Boolean(service.convite_retorno_ativo));
                    setConviteRetornoDias(service.convite_retorno_dias ? Number(service.convite_retorno_dias) : 30);
                    setLoadedService(service); // Armazenar para usar nos useEffects abaixo
                }
            } catch (error) {
                if (isMounted) {
                    setSubmitError('Erro ao carregar dados do serviço');
                }
            } finally {
                if (isMounted) {
                    setLoadingService(false);
                }
            }
        };

        loadService();

        return () => {
            isMounted = false;
        };
    }, [serviceId, fetchService]);

    // ✅ CORRIGIDO: Configurar agentes selecionados quando agents E loadedService estiverem prontos
    useEffect(() => {
        if (agents.length > 0 && loadedService) {
            const initialAgentState = agents.reduce((acc, agent) => {
                acc[agent.id] = loadedService.agentes_atuais_ids?.includes(agent.id) || false;
                return acc;
            }, {} as Record<number, boolean>);
            setCheckedAgents(initialAgentState);
        }
    }, [agents, loadedService]);

    // ✅ CORRIGIDO: Configurar extras selecionados quando extraServices E loadedService estiverem prontos
    useEffect(() => {
        if (extraServices.length > 0 && loadedService) {
            const initialExtraState = extraServices.reduce((acc, extra) => {
                acc[extra.id] = loadedService.extras_atuais_ids?.includes(extra.id) || false;
                return acc;
            }, {} as Record<number, boolean>);
            setCheckedExtras(initialExtraState);
        }
    }, [extraServices, loadedService]);
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
            toast.warning('Campo Obrigatório', 'Nome do serviço é obrigatório.');
            return;
        }

        if (duracaoMinutos < 1) {
            toast.warning('Duração Inválida', 'A duração deve ser maior que zero.');
            return;
        }

        if (preco < 0) {
            toast.warning('Preço Inválido', 'O preço deve ser maior ou igual a zero.');
            return;
        }

        if (conviteRetornoAtivo && (!conviteRetornoDias || conviteRetornoDias < 1)) {
            toast.warning('Convite de retorno inválido', 'Informe um número de dias maior que zero.');
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
                convite_retorno_ativo: conviteRetornoAtivo,
                convite_retorno_dias: conviteRetornoAtivo ? conviteRetornoDias : null,
                agentes_ids: agentesIds,
                extras_ids: extrasIds
            };

            const result = await updateService(Number(serviceId), serviceData);

            if (result.success) {
                toast.success('Serviço Atualizado!', `As alterações no serviço "${nome}" foram salvas com sucesso.`);
                setActiveView('services-list'); // Voltar para a lista de serviços
            } else {
                toast.error('Erro ao Atualizar Serviço', result.error || 'Não foi possível atualizar o serviço. Tente novamente.');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            toast.error('Erro ao Atualizar Serviço', errorMessage);
        } finally {
            setSubmitting(false);
        }
    };

    // Loading state
    if (loading || loadingService) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-800">Editar Serviço</h1>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <p className="text-gray-600">Carregando dados...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Editar Serviço</h1>

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


                            <SelectInput
                              label="Estado"
                              value={status}
                              onChange={(e) => setStatus(e.target.value as 'Ativo' | 'Bloqueado')}
                            >
                                <option value="Ativo">Disponível</option>
                                <option value="Bloqueado">Indisponível</option>
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

                    <FormCard title="Convite de retorno">
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                                Envie uma mensagem automática ao cliente após a conclusão do serviço, convidando para um novo agendamento.
                            </p>

                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-800 text-sm">Ativar convite de retorno</p>
                                    <p className="text-sm text-gray-500">Configure por serviço</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setConviteRetornoAtivo(v => !v)}
                                    role="switch"
                                    aria-checked={conviteRetornoAtivo}
                                    className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${conviteRetornoAtivo ? 'bg-blue-600' : 'bg-gray-200'}`}
                                >
                                    <span
                                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${conviteRetornoAtivo ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>

                            {conviteRetornoAtivo && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <TextInput
                                        label="Enviar após (dias)"
                                        type="number"
                                        value={String(conviteRetornoDias)}
                                        onChange={(e) => setConviteRetornoDias(Number(e.target.value))}
                                    />
                                </div>
                            )}
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
                                      avatar={agent.avatar_url}
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
                        {submitting ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveView('services-list')}
                        className="ml-4 bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EditServicePage;
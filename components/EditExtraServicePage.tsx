
import React, { useState, useEffect } from 'react';
import { Check } from './Icons';
import { useExtraServiceManagement } from '../hooks/useExtraServiceManagement';

interface ExtraService {
  id: number;
  nome: string;
  descricao?: string;
  duracao_minutos: number;
  preco: number;
  quantidade_maxima: number;
  status: 'Ativo' | 'Inativo';
  servicos_conectados?: Array<{ id: number; nome: string }>;
  servicos_conectados_ids?: number[];
}


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

const TextInput: React.FC<{
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  step?: string;
}> = ({ label, value, onChange, type = 'text', step }) => (
    <div>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <input
          type={type}
          value={value}
          onChange={onChange}
          step={step}
          className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
        />
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
    // Hook para gerenciar serviços extras
    const {
        services,
        loading,
        error,
        fetchExtraService,
        updateExtraService
    } = useExtraServiceManagement();

    // Estados do formulário
    const [nome, setNome] = useState('');
    const [descricao, setDescricao] = useState('');
    const [duracaoMinutos, setDuracaoMinutos] = useState(0);
    const [preco, setPreco] = useState(0);
    const [quantidadeMaxima, setQuantidadeMaxima] = useState(1);
    const [status, setStatus] = useState<'Ativo' | 'Inativo'>('Ativo');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [loadingService, setLoadingService] = useState(true);

    // Estado dos serviços conectados
    const [checkedServices, setCheckedServices] = useState<Record<number, boolean>>({});

    // Carregar dados do serviço extra
    useEffect(() => {
        let isMounted = true;

        const loadExtraService = async () => {
            if (!extraServiceId) return;

            try {
                setLoadingService(true);
                setSubmitError(null);

                const numericId = Number(extraServiceId);

                if (isNaN(numericId)) {
                    setSubmitError('ID do serviço extra inválido');
                    return;
                }

                const extraService = await fetchExtraService(numericId);

                if (isMounted && extraService) {
                    setNome(extraService.nome);
                    setDescricao(extraService.descricao || '');
                    setDuracaoMinutos(extraService.duracao_minutos);
                    setPreco(typeof extraService.preco === 'string' ? parseFloat(extraService.preco) : extraService.preco);
                    setQuantidadeMaxima(extraService.quantidade_maxima);
                    setStatus(extraService.status);

                    // Configurar serviços conectados
                    if (services.length > 0) {
                        const initialCheckedState = services.reduce((acc, service) => {
                            acc[service.id] = extraService.servicos_conectados_ids?.includes(service.id) || false;
                            return acc;
                        }, {} as Record<number, boolean>);
                        setCheckedServices(initialCheckedState);
                    }

                }
            } catch (error) {
                if (isMounted) {
                    console.error('❌ [EditExtraServicePage] Erro ao carregar serviço extra:', error);
                    setSubmitError('Erro ao carregar dados do serviço extra');
                }
            } finally {
                if (isMounted) {
                    setLoadingService(false);
                }
            }
        };

        if (services.length > 0) {
            loadExtraService();
        }

        return () => {
            isMounted = false;
        };
    }, [extraServiceId, fetchExtraService, services]);

    // Atualizar serviços conectados quando os serviços carregarem
    useEffect(() => {
        if (services.length > 0 && !loadingService) {
            // Manter seleções existentes ou inicializar como false
            setCheckedServices(prev => {
                const newState = services.reduce((acc, service) => {
                    acc[service.id] = prev[service.id] || false;
                    return acc;
                }, {} as Record<number, boolean>);
                return newState;
            });
        }
    }, [services, loadingService]);
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const newCheckedState = services.reduce((acc, service) => {
            acc[service.id] = isChecked;
            return acc;
        }, {} as Record<number, boolean>);
        setCheckedServices(newCheckedState);
    };

    const handleServiceCheck = (serviceId: number) => {
        setCheckedServices(prev => ({ ...prev, [serviceId]: !prev[serviceId] }));
    };

    const allSelected = services.length > 0 && services.every(service => checkedServices[service.id]);

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

            // Obter IDs dos serviços selecionados
            const servicosConectados = services
                .filter(service => checkedServices[service.id])
                .map(service => service.id);

            const extraServiceData = {
                nome: nome.trim(),
                descricao: descricao.trim(),
                duracao_minutos: duracaoMinutos,
                preco: preco,
                quantidade_maxima: quantidadeMaxima,
                status: status,
                servicos_conectados: servicosConectados
            };

            const result = await updateExtraService(Number(extraServiceId), extraServiceData);

            if (result.success) {
                setActiveView('services-extra'); // Voltar para a lista
            } else {
                setSubmitError(result.error || 'Erro ao atualizar serviço extra');
            }
        } catch (error) {
            console.error('❌ [EditExtraServicePage] Erro ao atualizar serviço extra:', error);
            setSubmitError(error instanceof Error ? error.message : 'Erro desconhecido');
        } finally {
            setSubmitting(false);
        }
    };
    
    // Loading state
    if (loading || loadingService) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-800">Editar serviço extra</h1>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <p className="text-gray-600">Carregando dados...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 -mb-2">
              <h1 className="text-3xl font-bold text-gray-800">Editar serviço extra</h1>
            </div>

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
                <FormCard title="Informações básicas">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                       <TextInput
                         label="Nome do serviço extra"
                         value={nome}
                         onChange={e => setNome(e.target.value)}
                       />
                       <TextInput
                         label="Duração (minutos)"
                         type="number"
                         value={String(duracaoMinutos)}
                         onChange={e => setDuracaoMinutos(Number(e.target.value))}
                       />
                       <TextInput
                         label="Valor de cobrança (R$)"
                         type="number"
                         step="0.01"
                         value={String(preco)}
                         onChange={e => setPreco(Number(e.target.value))}
                       />
                       <TextInput
                         label="Quantidade Máxima"
                         type="number"
                         value={String(quantidadeMaxima)}
                         onChange={e => setQuantidadeMaxima(Number(e.target.value))}
                       />
                       <SelectInput
                         label="Status"
                         value={status}
                         onChange={e => setStatus(e.target.value as 'Ativo' | 'Inativo')}
                       >
                            <option value="Ativo">Ativo</option>
                            <option value="Inativo">Inativo</option>
                       </SelectInput>
                    </div>
                    <TextArea
                      label="Descrição curta"
                      value={descricao}
                      onChange={e => setDescricao(e.target.value)}
                    />
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
                    {services.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-500 text-sm">
                                📋 Nenhum serviço principal encontrado.
                            </p>
                            <p className="text-gray-400 text-xs mt-1">
                                Cadastre serviços principais primeiro para conectá-los aos extras.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {services.map(service => (
                                <ServiceCheckbox
                                    key={service.id}
                                    label={service.nome}
                                    checked={checkedServices[service.id] || false}
                                    onChange={() => handleServiceCheck(service.id)}
                                />
                            ))}
                        </div>
                    )}
                </FormCard>
            
                <div className="pt-2 flex items-center gap-4">
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
                        onClick={() => setActiveView('services-extra')}
                        className="bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EditExtraServicePage;
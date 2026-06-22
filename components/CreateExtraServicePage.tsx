import React, { useState, useEffect } from 'react';
import { ImagePlaceholder, Check, ChevronLeft } from './Icons';
import { useExtraServiceManagement } from '../hooks/useExtraServiceManagement';
import { useToast } from '../contexts/ToastContext';

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
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  className?: string;
  step?: string;
  onWheel?: (e: React.WheelEvent<HTMLInputElement>) => void;
}> = ({ label, placeholder, value, onChange, type = "text", className = "", step, onWheel }) => (
    <div className={className}>
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          step={step}
          onWheel={onWheel}
          className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
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
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          rows={3}
          className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
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
        <label className="text-sm font-medium text-gray-600 mb-2 block">{label}</label>
        <select
          value={value}
          onChange={onChange}
          className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
        >
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

// Utility functions for currency formatting (Brazilian Real)
const formatMoneyBR = (value: number | null | undefined) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0,00';
    return n.toFixed(2).replace('.', ',');
};

const maskMoneyBRInput = (raw: string) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) {
        return { display: '', value: 0 };
    }
    const cents = parseInt(digits, 10);
    const value = cents / 100;
    return { display: value.toFixed(2).replace('.', ','), value };
};

interface CreateExtraServicePageProps {
  setActiveView: (view: string) => void;
}

const CreateExtraServicePage: React.FC<CreateExtraServicePageProps> = ({ setActiveView }) => {
    const toast = useToast();
    // Hook para gerenciar serviços extras
    const {
        services,
        loading,
        error,
        createExtraService
    } = useExtraServiceManagement();

    // Estados do formulário
    const [nome, setNome] = useState('');
    const [descricao, setDescricao] = useState('');
    const [duracaoMinutos, setDuracaoMinutos] = useState(0);
    const [preco, setPreco] = useState(0);
    const [precoText, setPrecoText] = useState(formatMoneyBR(0));
    const [quantidadeMaxima, setQuantidadeMaxima] = useState(1);
    const [status, setStatus] = useState<'Ativo' | 'Inativo'>('Ativo');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Estado dos serviços conectados (baseado nos serviços reais)
    const [checkedServices, setCheckedServices] = useState<Record<number, boolean>>({});

    // Inicializar serviços conectados quando os serviços carregarem
    useEffect(() => {
        if (services.length > 0) {
            const initialCheckedState = services.reduce((acc, service) => {
                acc[service.id] = false; // Por padrão, nenhum serviço selecionado
                return acc;
            }, {} as Record<number, boolean>);
            setCheckedServices(initialCheckedState);
        }
    }, [services]);

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

            const result = await createExtraService(extraServiceData);

            if (result.success) {
                toast.success('Serviço Extra Criado!', `O serviço extra "${nome}" foi adicionado com sucesso.`);
                setActiveView('services-extra'); // Voltar para a lista
            } else {
                toast.error('Erro ao Criar Serviço Extra', result.error || 'Não foi possível criar o serviço extra. Tente novamente.');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            toast.error('Erro ao Criar Serviço Extra', errorMessage);
        } finally{
            setSubmitting(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-800">Criar novo serviço extra</h1>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <p className="text-gray-600">Carregando dados...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 -mb-2">
              <h1 className="text-3xl font-bold text-gray-800">Criar novo serviço extra</h1>
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
                <div className="space-y-6">
                    <FormCard title="Informações básicas">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                           <TextInput
                             label="Nome do serviço extra"
                             className="md:col-span-2"
                             value={nome}
                             onChange={(e) => setNome(e.target.value)}
                             placeholder="Ex: Sobrancelha"
                           />
                           <TextInput
                             label="Duração (minutos)"
                             type="number"
                             step="1"
                             value={String(duracaoMinutos)}
                             onChange={(e) => {
                                 const val = parseInt(e.target.value, 10);
                                 setDuracaoMinutos(Number.isFinite(val) && val >= 0 ? val : 0);
                             }}
                             onWheel={(e) => e.currentTarget.blur()}
                           />
                           <TextInput
                             label="Valor de cobrança (R$)"
                             type="text"
                             value={precoText}
                             onChange={(e) => {
                                 const masked = maskMoneyBRInput(e.target.value);
                                 setPrecoText(masked.display);
                                 setPreco(masked.value);
                             }}
                           />
                           <TextInput
                             label="Quantidade Máxima"
                             type="number"
                             step="1"
                             value={String(quantidadeMaxima)}
                             onChange={(e) => {
                                 const val = parseInt(e.target.value, 10);
                                 setQuantidadeMaxima(Number.isFinite(val) && val >= 1 ? val : 1);
                             }}
                             onWheel={(e) => e.currentTarget.blur()}
                           />
                           <SelectInput
                             label="Status"
                             value={status}
                             onChange={(e) => setStatus(e.target.value as 'Ativo' | 'Inativo')}
                           >
                                <option value="Ativo">Ativo</option>
                                <option value="Inativo">Inativo</option>
                           </SelectInput>
                        </div>
                        <TextArea
                          label="Descrição curta"
                          value={descricao}
                          onChange={(e) => setDescricao(e.target.value)}
                          placeholder="Descreva brevemente o serviço extra..."
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
                        {submitting ? 'Criando...' : 'Adicionar serviço extra'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveView('services-extra')}
                        className="ml-4 bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateExtraServicePage;
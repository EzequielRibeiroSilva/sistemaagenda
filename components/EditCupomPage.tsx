import React, { useState, useEffect, useRef } from 'react';
import { useCupomManagement } from '../hooks/useCupomManagement';
import { useServiceManagement } from '../hooks/useServiceManagement';
import { useUnitManagement } from '../hooks/useUnitManagement';
import { useToast } from '../contexts/ToastContext';
import { ChevronDown, Check } from './Icons';

// Componentes reutilizáveis de formulário
const FormCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <h2 className="text-lg font-semibold text-gray-800 mb-4">{title}</h2>
    {children}
  </div>
);

interface TextInputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  step?: string;
  required?: boolean;
  disabled?: boolean;
}

const TextInput: React.FC<TextInputProps> = ({ label, placeholder, value, onChange, type = 'text', step, required = false, disabled = false }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      step={step}
      required={required}
      disabled={disabled}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
    />
  </div>
);

interface TextAreaProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const TextArea: React.FC<TextAreaProps> = ({ label, placeholder, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={3}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  </div>
);

interface SelectInputProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  required?: boolean;
}

const SelectInput: React.FC<SelectInputProps> = ({ label, value, onChange, children, required = false }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <select
      value={value}
      onChange={onChange}
      required={required}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      {children}
    </select>
  </div>
);

// MultiSelect Dropdown Component
interface MultiSelectOption {
  id: number;
  nome: string;
  preco?: number;
  endereco?: string;
}

const MultiSelectDropdown: React.FC<{
  label: string;
  options: MultiSelectOption[];
  selectedOptions: number[];
  onChange: (selected: number[]) => void;
  placeholder: string;
  showPrice?: boolean;
  showAddress?: boolean;
}> = ({ label, options, selectedOptions, onChange, placeholder, showPrice = false, showAddress = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggleOption = (optionId: number) => {
    const newSelectedOptions = selectedOptions.includes(optionId)
      ? selectedOptions.filter(item => item !== optionId)
      : [...selectedOptions, optionId];
    onChange(newSelectedOptions);
  };

  const displayValue = selectedOptions.length > 0
    ? selectedOptions.map(id => {
        const foundOption = options.find(opt => opt.id === id);
        return foundOption?.nome;
      }).filter(Boolean).join(', ')
    : placeholder;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex justify-between items-center text-left"
        >
          <span className="truncate">{displayValue}</span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-60 overflow-y-auto">
            {options.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 text-center">Nenhuma opção disponível</div>
            ) : (
              options.map(option => (
                <label key={option.id} className="flex items-center p-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedOptions.includes(option.id)}
                    onChange={() => handleToggleOption(option.id)}
                    className="sr-only peer"
                  />
                  <div className="w-4 h-4 mr-3 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-sm peer-checked:bg-blue-600 peer-checked:border-blue-600">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{option.nome}</div>
                    {showPrice && option.preco !== undefined && (
                      <div className="text-xs text-gray-500">R$ {Number(option.preco).toFixed(2)}</div>
                    )}
                    {showAddress && option.endereco && (
                      <div className="text-xs text-gray-500 truncate">{option.endereco}</div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        )}
      </div>
      {selectedOptions.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">
          {selectedOptions.length} selecionado(s)
        </p>
      )}
    </div>
  );
};

interface EditCupomPageProps {
  setActiveView: (view: string) => void;
  cupomId: number | null;
}

const EditCupomPage: React.FC<EditCupomPageProps> = ({ setActiveView, cupomId }) => {
  const toast = useToast();
  const { fetchCupomById, updateCupom } = useCupomManagement();
  const { fetchServicesList } = useServiceManagement();
  const { units, fetchUnits } = useUnitManagement();

  // Estados do formulário - Informações Básicas
  const [codigo, setCodigo] = useState('');
  const [valorDesconto, setValorDesconto] = useState(0);
  const [status, setStatus] = useState<'Ativo' | 'Inativo' | 'Expirado'>('Ativo');

  // Estados do formulário - Validade Temporal
  const [temValidade, setTemValidade] = useState(false);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Estados do formulário - Limites de Uso
  const [limiteUsoPorCliente, setLimiteUsoPorCliente] = useState<number | ''>('');
  const [limiteUsoTotal, setLimiteUsoTotal] = useState<number | ''>('');

  // Estados do formulário - Serviços e Locais
  const [servicosDisponiveis, setServicosDisponiveis] = useState<any[]>([]);
  const [servicosSelecionados, setServicosSelecionados] = useState<number[]>([]);
  const [locaisSelecionados, setLocaisSelecionados] = useState<number[]>([]);

  // Estados de controle
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Carregar serviços e locais
  useEffect(() => {
    const loadData = async () => {
      const servicos = await fetchServicesList();
      setServicosDisponiveis(servicos);
      await fetchUnits();
    };
    loadData();
  }, [fetchServicesList, fetchUnits]);

  // Carregar dados do cupom
  useEffect(() => {
    const loadCupom = async () => {
      if (!cupomId) {
        setSubmitError('ID do cupom não fornecido');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setSubmitError(null);

        const cupom = await fetchCupomById(cupomId);

        if (cupom) {
          setCodigo(cupom.codigo);
          setValorDesconto(cupom.valor_desconto);
          setStatus(cupom.status);

          // Configurar validade temporal
          if (cupom.data_inicio || cupom.data_fim) {
            setTemValidade(true);
            if (cupom.data_inicio) {
              const dataInicioFormatted = new Date(cupom.data_inicio).toISOString().slice(0, 10);
              setDataInicio(dataInicioFormatted);
            }
            if (cupom.data_fim) {
              const dataFimFormatted = new Date(cupom.data_fim).toISOString().slice(0, 10);
              setDataFim(dataFimFormatted);
            }
          }

          // Configurar limites de uso
          setLimiteUsoPorCliente(cupom.limite_uso_por_cliente || '');
          setLimiteUsoTotal(cupom.limite_uso_total || '');

          // Configurar serviços e locais selecionados
          setServicosSelecionados(cupom.servico_ids || []);
          setLocaisSelecionados(cupom.unidade_ids || []);
        } else {
          setSubmitError('Cupom não encontrado');
        }
      } catch (error) {
        setSubmitError('Erro ao carregar dados do cupom');
      } finally {
        setLoading(false);
      }
    };

    loadCupom();
  }, [cupomId, fetchCupomById]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cupomId) {
      setSubmitError('ID do cupom não fornecido');
      return;
    }

    // Validações
    if (!codigo.trim()) {
      toast.warning('Campo Obrigatório', 'Código do cupom é obrigatório.');
      return;
    }

    if (valorDesconto <= 0) {
      toast.warning('Valor Inválido', 'O valor do desconto deve ser maior que zero.');
      return;
    }

    if (valorDesconto > 100) {
      toast.warning('Desconto Inválido', 'O desconto percentual não pode ser maior que 100%.');
      return;
    }

    if (temValidade && (!dataInicio || !dataFim)) {
      toast.warning('Datas Incompletas', 'Informe as datas de início e fim do cupom.');
      return;
    }

    if (temValidade && dataInicio && dataFim && new Date(dataInicio) > new Date(dataFim)) {
      toast.warning('Datas Inválidas', 'A data de início não pode ser posterior à data de fim.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      const cupomData = {
        codigo: codigo.trim().toUpperCase(),
        tipo_desconto: 'percentual',
        valor_desconto: parseFloat(String(valorDesconto)),
        data_inicio: temValidade && dataInicio ? new Date(dataInicio).toISOString() : undefined,
        data_fim: temValidade && dataFim ? new Date(dataFim).toISOString() : undefined,
        limite_uso_por_cliente: limiteUsoPorCliente ? parseInt(String(limiteUsoPorCliente)) : undefined,
        limite_uso_total: limiteUsoTotal ? parseInt(String(limiteUsoTotal)) : undefined,
        servico_ids: servicosSelecionados.length > 0 ? servicosSelecionados : undefined,
        unidade_ids: locaisSelecionados.length > 0 ? locaisSelecionados : undefined,
        status
      };

      const success = await updateCupom(cupomId, cupomData);

      if (success) {
        toast.success('Cupom Atualizado!', `As alterações no cupom "${codigo}" foram salvas com sucesso.`);
        setActiveView('cupons-list');
      } else {
        toast.error('Erro ao Atualizar Cupom', 'Não foi possível atualizar o cupom. Verifique os dados e tente novamente.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao Atualizar Cupom', errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Editar Cupom</h1>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-gray-600">Carregando dados do cupom...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Editar Cupom</h1>

      {/* Exibir erro de submissão */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm">❌ {submitError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Informações Básicas */}
          <FormCard title="Informações Básicas">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TextInput
                label="Código do Cupom"
                placeholder="Ex: PRIMEIRACOMPRA, VERAO2025"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                required
                disabled
              />

              <TextInput
                label="Desconto (%)"
                placeholder="Ex: 10"
                value={String(valorDesconto)}
                onChange={(e) => setValorDesconto(Number(e.target.value))}
                type="number"
                step="1"
                required
              />

              <SelectInput
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Ativo' | 'Inativo' | 'Expirado')}
                required
              >
                <option value="Ativo">Ativo</option>
                <option value="Inativo">Inativo</option>
                <option value="Expirado">Expirado</option>
              </SelectInput>
            </div>
          </FormCard>

          {/* Validade Temporal */}
          <FormCard title="Validade Temporal">
            <div className="mb-4">
              <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={temValidade}
                  onChange={(e) => setTemValidade(e.target.checked)}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                Definir período de validade
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-6">
                Se desmarcado, o cupom será válido até ser excluído manualmente
              </p>
            </div>

            {temValidade && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextInput
                  label="Data de Início"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  type="date"
                  required={temValidade}
                />
                <TextInput
                  label="Data de Fim"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  type="date"
                  required={temValidade}
                />
              </div>
            )}
          </FormCard>

          {/* Serviços Aplicáveis */}
          <FormCard title="Serviços Aplicáveis">
            <p className="text-sm text-gray-600 mb-4">
              Selecione os serviços onde este cupom poderá ser utilizado. Se nenhum serviço for selecionado, o cupom será válido para todos os serviços.
            </p>
            <MultiSelectDropdown
              label="Serviços"
              options={servicosDisponiveis}
              selectedOptions={servicosSelecionados}
              onChange={setServicosSelecionados}
              placeholder="Selecione um ou mais serviços..."
              showPrice={true}
            />
          </FormCard>

          {/* Locais Aplicáveis */}
          <FormCard title="Locais Aplicáveis">
            <p className="text-sm text-gray-600 mb-4">
              Selecione os locais onde este cupom poderá ser utilizado. Se nenhum local for selecionado, o cupom será válido para todos os locais.
            </p>
            <MultiSelectDropdown
              label="Locais"
              options={units}
              selectedOptions={locaisSelecionados}
              onChange={setLocaisSelecionados}
              placeholder="Selecione um ou mais locais..."
              showAddress={true}
            />
          </FormCard>

          {/* Limites de Uso */}
          <FormCard title="Limites de Uso">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <TextInput
                  label="Limite de Uso por Cliente - Opcional"
                  placeholder="Ex: 1, 3, ou deixe vazio para ilimitado"
                  value={String(limiteUsoPorCliente)}
                  onChange={(e) => setLimiteUsoPorCliente(e.target.value ? Number(e.target.value) : '')}
                  type="number"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Quantas vezes um mesmo cliente pode usar este cupom
                </p>
              </div>

              <div>
                <TextInput
                  label="Limite de Uso Total - Opcional"
                  placeholder="Ex: 50, 100, ou deixe vazio para ilimitado"
                  value={String(limiteUsoTotal)}
                  onChange={(e) => setLimiteUsoTotal(e.target.value ? Number(e.target.value) : '')}
                  type="number"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Quantas vezes o cupom pode ser usado por todos os clientes
                </p>
              </div>
            </div>
          </FormCard>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting || !codigo.trim() || valorDesconto <= 0}
            className={`font-semibold px-6 py-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              submitting || !codigo.trim() || valorDesconto <= 0
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {submitting ? 'Salvando...' : 'Salvar Alterações'}
          </button>
          <button
            type="button"
            onClick={() => setActiveView('cupons-list')}
            className="ml-4 bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditCupomPage;

import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from './Icons';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCalendarData } from '../hooks/useCalendarData';
import { useServiceManagement } from '../hooks/useServiceManagement';
import { useSubscriptionPlanManagement, PlanoAssinaturaDetalhe, PlanoAssinaturaItemInput } from '../hooks/useSubscriptionPlanManagement';

 const formatCurrencyBRLInput = (value: number) => {
   if (!Number.isFinite(value)) return '0,00';
   return new Intl.NumberFormat('pt-BR', {
     minimumFractionDigits: 2,
     maximumFractionDigits: 2
   }).format(value);
 };

 const parseCurrencyBRLInput = (value: string) => {
   const normalized = String(value)
     .trim()
     .replace(/\s/g, '')
     .replace(/\./g, '')
     .replace(',', '.');
   const num = parseFloat(normalized);
   return Number.isFinite(num) ? num : NaN;
 };

const FormCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <h2 className="text-xl font-semibold text-gray-800 mb-6">{title}</h2>
    {children}
  </div>
);

const TextInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', step, placeholder }) => (
  <div>
    <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
    <input
      type={type}
      step={step}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
);

const SelectInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <div>
    <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500"
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
    </div>
  </div>
);

 const CurrencyInput: React.FC<{
   label: string;
   value: string;
   onChange: (v: string) => void;
 }> = ({ label, value, onChange }) => (
   <div>
     <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
     <input
       type="text"
       inputMode="decimal"
       placeholder="0,00"
       value={value}
       onChange={(e) => {
         const raw = e.target.value;
         const cleaned = raw.replace(/[^0-9.,]/g, '');
         onChange(cleaned);
       }}
       onBlur={() => {
         const num = parseCurrencyBRLInput(value);
         onChange(formatCurrencyBRLInput(Number.isFinite(num) ? num : 0));
       }}
       className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
     />
   </div>
 );

interface EditSubscriptionPlanPageProps {
  setActiveView: (view: string) => void;
  planoId: number | null;
}

const EditSubscriptionPlanPage: React.FC<EditSubscriptionPlanPageProps> = ({ setActiveView, planoId }) => {
  const toast = useToast();
  const { user } = useAuth();
  const { locations: backendLocations } = useCalendarData();
  const { fetchServicesList, fetchExtraServices, extraServices } = useServiceManagement();
  const { fetchPlan, updatePlan, loading, error } = useSubscriptionPlanManagement();

  const [isRedirecting, setIsRedirecting] = useState(false);

  const locations = useMemo(() => backendLocations.map(l => ({ id: l.id, name: l.name })), [backendLocations]);

  const [servicesList, setServicesList] = useState<Array<{ id: number; nome: string }>>([]);

  const [loaded, setLoaded] = useState<PlanoAssinaturaDetalhe | null>(null);
  const [nome, setNome] = useState('');
  const [validadeDias, setValidadeDias] = useState('31');
  const [valor, setValor] = useState('0,00');
  const [status, setStatus] = useState<'Ativo' | 'Bloqueado'>('Ativo');
  const [submitting, setSubmitting] = useState(false);

  const [serviceSelected, setServiceSelected] = useState<Record<number, boolean>>({});
  const [serviceQuota, setServiceQuota] = useState<Record<number, string>>({});

  const [extraSelected, setExtraSelected] = useState<Record<number, boolean>>({});
  const [extraQuota, setExtraQuota] = useState<Record<number, string>>({});

  useEffect(() => {
    if (planoId) return;

    // Blindagem UX: após refresh, o planoId pode não existir (estado em memória).
    // Redirecionar imediatamente para a lista do Clube para evitar a tela "Plano não selecionado".
    setIsRedirecting(true);
    setActiveView('subscriptions-list');
  }, [planoId, setActiveView]);

  useEffect(() => {
    const loadLists = async () => {
      const data = await fetchServicesList();
      setServicesList(Array.isArray(data) ? data : []);
      await fetchExtraServices();
    };
    loadLists();
  }, [fetchServicesList, fetchExtraServices]);

  useEffect(() => {
    const load = async () => {
      if (!planoId) return;
      const plan = await fetchPlan(planoId);
      if (!plan) return;

      setLoaded(plan);
      setNome(plan.nome);
      setValidadeDias(String(plan.validade_dias ?? 31));
      setValor(formatCurrencyBRLInput(Number(plan.valor ?? 0)));
      setStatus(plan.status);

      const svcSelected: Record<number, boolean> = {};
      const svcQuota: Record<number, string> = {};
      const extSelected: Record<number, boolean> = {};
      const extQuota: Record<number, string> = {};

      plan.itens.forEach(i => {
        if (i.tipo === 'SERVICO' && i.servico_id) {
          svcSelected[i.servico_id] = true;
          svcQuota[i.servico_id] = i.quantidade_por_ciclo === null ? '' : String(i.quantidade_por_ciclo);
        }
        if (i.tipo === 'EXTRA' && i.servico_extra_id) {
          extSelected[i.servico_extra_id] = true;
          extQuota[i.servico_extra_id] = i.quantidade_por_ciclo === null ? '' : String(i.quantidade_por_ciclo);
        }
      });

      setServiceSelected(svcSelected);
      setServiceQuota(svcQuota);
      setExtraSelected(extSelected);
      setExtraQuota(extQuota);
    };
    load();
  }, [planoId, fetchPlan]);

  const buildItens = (): PlanoAssinaturaItemInput[] => {
    const itens: PlanoAssinaturaItemInput[] = [];

    servicesList.forEach(s => {
      if (!serviceSelected[s.id]) return;
      const q = serviceQuota[s.id];
      const qNum = q === undefined || q === '' ? null : parseInt(q);
      itens.push({
        tipo: 'SERVICO',
        servico_id: s.id,
        servico_extra_id: null,
        quantidade_por_ciclo: qNum === null || Number.isNaN(qNum) ? null : qNum
      });
    });

    (extraServices || []).forEach(e => {
      if (!extraSelected[e.id]) return;
      const q = extraQuota[e.id];
      const qNum = q === undefined || q === '' ? null : parseInt(q);
      itens.push({
        tipo: 'EXTRA',
        servico_id: null,
        servico_extra_id: e.id,
        quantidade_por_ciclo: qNum === null || Number.isNaN(qNum) ? null : qNum
      });
    });

    return itens;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!planoId) return;

    if (!nome.trim()) {
      toast.warning('Campo Obrigatório', 'Nome do plano é obrigatório.');
      return;
    }

    const valorNum = parseCurrencyBRLInput(valor);
    if (Number.isNaN(valorNum) || valorNum < 0) {
      toast.warning('Valor Inválido', 'Informe um valor válido (maior ou igual a zero).');
      return;
    }

    const validadeNum = parseInt(validadeDias);
    if (Number.isNaN(validadeNum) || validadeNum <= 0) {
      toast.warning('Validade Inválida', 'Informe uma validade em dias (maior que zero).');
      return;
    }

    const itens = buildItens();

    try {
      setSubmitting(true);
      const result = await updatePlan(planoId, {
        nome: nome.trim(),
        validade_dias: validadeNum,
        valor: valorNum,
        status,
        renovacao_automatica: true,
        itens
      });

      if (result.success) {
        toast.success('Plano Atualizado!', `As alterações em "${nome}" foram salvas com sucesso.`);
        setActiveView('subscriptions-list');
      } else {
        toast.error('Erro ao Atualizar Plano', result.error || 'Não foi possível atualizar o plano.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderItemRow = (
    key: string,
    checked: boolean,
    onToggle: () => void,
    quotaValue: string,
    onQuotaChange: (v: string) => void
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center border border-gray-200 rounded-lg p-3">
      <label className="flex items-center gap-3 cursor-pointer md:col-span-2">
        <div className="relative flex items-center">
          <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
          <div className={`w-5 h-5 flex items-center justify-center border-2 rounded ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
            {checked && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
        <span className="font-medium text-gray-800 text-sm">{key}</span>
      </label>

      <div>
        <input
          type="number"
          value={quotaValue}
          onChange={(e) => onQuotaChange(e.target.value)}
          placeholder="Ilimitado"
          className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
          disabled={!checked}
        />
        <p className="text-xs text-gray-500 mt-1">Deixe vazio para ilimitado</p>
      </div>
    </div>
  );

  if (!planoId || isRedirecting) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Editar Plano</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm">❌ {error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <FormCard title="Informações Gerais">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TextInput label="Nome do Plano" value={nome} onChange={setNome} placeholder="Nome do Plano" />
              <TextInput label="Validade (dias)" value={validadeDias} onChange={setValidadeDias} type="number" step="1" />
              <CurrencyInput label="Valor (R$)" value={valor} onChange={setValor} />
              <SelectInput label="Status" value={status} onChange={(v) => setStatus(v as any)}>
                <option value="Ativo">Ativo</option>
                <option value="Bloqueado">Bloqueado</option>
              </SelectInput>
              <div className="md:col-span-2">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-900">Vigência e renovação</p>
                  <p className="text-sm text-blue-800 mt-1">
                    A vigência é controlada automaticamente via integração de pagamento.
                  </p>
                </div>
              </div>
            </div>
          </FormCard>

          <FormCard title="Serviços incluídos e cotas">
            <div className="space-y-3">
              {servicesList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">Nenhum serviço encontrado.</p>
                </div>
              ) : (
                servicesList.map(s => (
                  <div key={`servico-${s.id}`}>
                    {renderItemRow(
                      s.nome,
                      Boolean(serviceSelected[s.id]),
                      () => setServiceSelected(prev => ({ ...prev, [s.id]: !prev[s.id] })),
                      serviceQuota[s.id] || '',
                      (v) => setServiceQuota(prev => ({ ...prev, [s.id]: v }))
                    )}
                  </div>
                ))
              )}
            </div>
          </FormCard>

          <FormCard title="Serviços extras incluídos e cotas">
            <div className="space-y-3">
              {(extraServices || []).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">Nenhum serviço extra encontrado.</p>
                </div>
              ) : (
                (extraServices || []).map(e => (
                  <div key={`extra-${e.id}`}>
                    {renderItemRow(
                      e.nome,
                      Boolean(extraSelected[e.id]),
                      () => setExtraSelected(prev => ({ ...prev, [e.id]: !prev[e.id] })),
                      extraQuota[e.id] || '',
                      (v) => setExtraQuota(prev => ({ ...prev, [e.id]: v }))
                    )}
                  </div>
                ))
              )}
            </div>
          </FormCard>

          <div className="pt-2 flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting || loading || !nome.trim()}
              className={`font-semibold px-6 py-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                submitting || loading || !nome.trim()
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {submitting ? 'Salvando...' : 'Salvar Alterações'}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('subscriptions-list')}
              className="bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
              disabled={submitting}
            >
              Cancelar
            </button>
          </div>
        </div>
      </form>

      {!loading && !loaded && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-gray-600">Plano não encontrado.</p>
        </div>
      )}
    </div>
  );
};

export default EditSubscriptionPlanPage;

import React, { useEffect, useState } from 'react';
import { useClientManagement } from '../hooks/useClientManagement';
import { useToast } from '../contexts/ToastContext';
import { useSubscriptionPlanManagement, type PlanoAssinaturaListItem } from '../hooks/useSubscriptionPlanManagement';

interface AddClientPageProps {
  setActiveView?: (view: string) => void;
}

const AddClientPage: React.FC<AddClientPageProps> = ({ setActiveView }) => {
  const toast = useToast();
  // Estados do formulário
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [mpCustomerEmail, setMpCustomerEmail] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [birthDateText, setBirthDateText] = useState('');
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [subscriptionStartDate, setSubscriptionStartDate] = useState<Date | null>(null);
  const [subscriptionStartDateText, setSubscriptionStartDateText] = useState('');
  const [subscriptionPlanId, setSubscriptionPlanId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [subscriptionPlans, setSubscriptionPlans] = useState<PlanoAssinaturaListItem[]>([]);

  // Hook de gerenciamento de clientes
  const { createClient, error, clearError } = useClientManagement();

  const { fetchPlans } = useSubscriptionPlanManagement();

  const formatDateToDDMMYYYY = (date: Date): string => {
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  };

  const parseDDMMYYYYToDate = (value: string): Date | null => {
    const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);

    if (year < 1900) return null;
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year > currentYear) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const selected = new Date(year, month - 1, day);
    if (selected > today) return null;

    return date;
  };

  const maskBirthDate = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    const d = digits.slice(0, 2);
    const m = digits.slice(2, 4);
    const y = digits.slice(4, 8);
    if (digits.length <= 2) return d;
    if (digits.length <= 4) return `${d}/${m}`;
    return `${d}/${m}/${y}`;
  };

  const handleSubscriberToggle = () => {
    const newIsSubscriber = !isSubscriber;
    setIsSubscriber(newIsSubscriber);
    if (newIsSubscriber) {
      const now = new Date();
      setSubscriptionStartDate(now);
      setSubscriptionStartDateText(formatDateToDDMMYYYY(now));
    } else {
      setSubscriptionStartDate(null);
      setSubscriptionStartDateText('');
      setSubscriptionPlanId('');
    }
  };

  useEffect(() => {
    const loadPlans = async () => {
      if (!isSubscriber) return;
      const plans = await fetchPlans();
      setSubscriptionPlans(Array.isArray(plans) ? plans : []);
    };
    loadPlans();
  }, [isSubscriber, fetchPlans]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validações básicas
    if (!firstName.trim()) {
      toast.warning('Campo Obrigatório', 'Primeiro nome é obrigatório.');
      return;
    }

    if (!phone.trim()) {
      toast.warning('Campo Obrigatório', 'Telefone é obrigatório.');
      return;
    }

    if (isSubscriber && !subscriptionPlanId) {
      toast.warning('Campo Obrigatório', 'Selecione um plano de assinatura para o cliente assinante.');
      return;
    }

    // Limpar erro anterior
    clearError();

    setIsSubmitting(true);

    try {
      // Preparar dados para envio
      const clientData = {
        primeiro_nome: firstName.trim(),
        ultimo_nome: lastName.trim(),
        telefone: phone.trim().startsWith('+55') ? phone.trim() : `+55${phone.trim()}`,
        mp_customer_email: mpCustomerEmail.trim() ? mpCustomerEmail.trim() : null,
        data_nascimento: birthDate ? birthDate.toISOString().split('T')[0] : undefined,
        is_assinante: isSubscriber,
        data_inicio_assinatura: isSubscriber && subscriptionStartDate ? subscriptionStartDate.toISOString().split('T')[0] : undefined,
        assinatura_plano_id: isSubscriber ? parseInt(subscriptionPlanId) : null,
        status: 'Ativo' as const
      };

      const success = await createClient(clientData);

      if (success) {
        // Sucesso - redirecionar para lista
        toast.success('Cliente Criado!', `O cliente "${firstName} ${lastName}" foi adicionado com sucesso.`);
        if (setActiveView) {
          setActiveView('clients-list');
        }
      } else {
        toast.error('Erro ao Criar Cliente', 'Não foi possível criar o cliente. Tente novamente.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao Criar Cliente', errorMessage);
    } finally{
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (setActiveView) {
      setActiveView('clients-list');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Novo Cliente</h1>
        <button
          onClick={handleCancel}
          className="text-gray-600 hover:text-gray-800 text-sm underline"
          disabled={isSubmitting}
        >
          Voltar para Lista
        </button>
      </div>

      {/* Mensagem de erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="text-red-600 text-sm">
              <strong>Erro:</strong> {error}
            </div>
            <button
              onClick={clearError}
              className="text-red-600 hover:text-red-800 text-sm underline"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-700 mb-8">Informações Gerais</h2>

          <div className="space-y-6">

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                      <label className="text-sm font-medium text-gray-600 mb-2 block">
                        Primeiro Nome <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                        disabled={isSubmitting}
                        required
                      />
                  </div>

                  <div>
                      <label className="text-sm font-medium text-gray-600 mb-2 block">Último Nome</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                        disabled={isSubmitting}
                      />
                  </div>

                  <div>
                      <label className="text-sm font-medium text-gray-600 mb-2 block">
                        Telefone (WhatsApp) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                          <div className="flex items-center w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                              <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                              <span className="text-gray-600 pr-2">+55</span>
                              <input
                                type="tel"
                                placeholder="(00) 90000-0000"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400 disabled:opacity-50"
                                disabled={isSubmitting}
                                required
                              />
                          </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                          Este número será usado para notificações e contato via WhatsApp.
                      </p>
                  </div>

                  <div>
                      <label className="text-sm font-medium text-gray-600 mb-2 block">E-mail</label>
                      <input
                        type="email"
                        value={mpCustomerEmail}
                        onChange={(e) => setMpCustomerEmail(e.target.value)}
                        placeholder="cliente@exemplo.com"
                        className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                        disabled={isSubmitting}
                      />
                  </div>

                  <div>
                      <label className="text-sm font-medium text-gray-600 mb-2 block">Data de nascimento</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={birthDateText}
                        onChange={(e) => {
                          const masked = maskBirthDate(e.target.value);
                          setBirthDateText(masked);
                          setBirthDate(parseDDMMYYYYToDate(masked));
                        }}
                        placeholder="DD/MM/AAAA"
                        className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                        disabled={isSubmitting}
                      />
                  </div>

                  <div>
                      <label className="text-sm font-medium text-gray-600 mb-2 block">Assinante</label>
                      <div className="flex items-center space-x-4">
                          <button
                              type="button"
                              className={`${isSubscriber ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
                              role="switch"
                              aria-checked={isSubscriber}
                              onClick={handleSubscriberToggle}
                              disabled={isSubmitting}
                          >
                              <span
                                  aria-hidden="true"
                                  className={`${isSubscriber ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                              />
                          </button>
                          <span className={`font-semibold ${isSubscriber ? 'text-green-700 bg-green-100 px-2.5 py-1 rounded-full text-xs' : 'text-red-700 bg-red-100 px-2.5 py-1 rounded-full text-xs'}`}>
                              {isSubscriber ? 'Assinante' : 'Não Assinante'}
                          </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                          Assinantes têm acesso a recursos premium e notificações especiais.
                      </p>
                  </div>

                  {isSubscriber && (
                      <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-600 mb-2 block">Data de Início da Assinatura</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={subscriptionStartDateText}
                            onChange={(e) => {
                              const masked = maskBirthDate(e.target.value);
                              setSubscriptionStartDateText(masked);
                              setSubscriptionStartDate(parseDDMMYYYYToDate(masked));
                            }}
                            placeholder="DD/MM/AAAA"
                            className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                            disabled={isSubmitting}
                          />
                      </div>
                  )}

                  {isSubscriber && (
                      <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-600 mb-2 block">Plano de Assinatura</label>
                          <select
                            value={subscriptionPlanId}
                            onChange={(e) => setSubscriptionPlanId(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                            disabled={isSubmitting}
                          >
                            <option value="">Selecione um plano</option>
                            {subscriptionPlans.map(p => (
                              <option key={p.id} value={String(p.id)}>
                                {p.nome}
                              </option>
                            ))}
                          </select>
                      </div>
                  )}

              </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            type="submit"
            className="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            )}
            {isSubmitting ? 'Salvando...' : 'Salvar Cliente'}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            className="bg-gray-100 text-gray-800 font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddClientPage;
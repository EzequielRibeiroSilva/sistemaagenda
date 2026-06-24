import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Search, Plus, RotateCw, ChevronDown, Check, Tag } from './Icons';
import type { ScheduleSlot, Agent, AppointmentStatus } from '../types';
import AvailabilityModal from './AvailabilityModal';
import {
  useInternalBooking,
  InternalServico,
  InternalServicoExtra,
  InternalAgente,
  InternalCliente
} from '../hooks/useInternalBooking';
import { useAuth } from '../contexts/AuthContext';
import { useSettingsManagement } from '../hooks/useSettingsManagement';
import { useToast } from '../contexts/ToastContext';
import { useUnitManagement } from '../hooks/useUnitManagement';
import { API_BASE_URL } from '../utils/api';

type ProdutoRow = { id: number; nome: string; preco_custo_medio?: number | string | null; preco_venda?: number | string | null; unidade_medida?: string | null };

type EstoqueSnapshotRow = {
    produto_id: number;
    saldo_atual: number;
};

type ProdutoCartItem = {
    uid: string;
    produto_id: number;
    nome: string;
    unidade_medida?: string | null;
    quantidade: string;
    preco_aplicado: string;
    agente_id: string;
};

type PaymentLine = {
    uid: string;
    metodo: string;
    valor: string;
};

const toMoneyFixedString = (value: unknown) => {
    const normalized = String(value ?? '').trim().replace(',', '.');
    if (!normalized) return '';
    const n = Number(normalized);
    if (!Number.isFinite(n)) return '';
    return n.toFixed(2);
};

const toNumber = (value: unknown) => {
    const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
    return Number.isFinite(n) ? n : 0;
};

// Helper components for styling consistency
const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
        className={`w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${className}`}
        {...props}
    />
);

const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <div className="relative">
        <select
            className={`appearance-none w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500 ${className}`}
            {...props}
        >
            {children}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
    </div>
);

const Textarea = ({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea
        className={`w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 ${className}`}
        rows={2}
        {...props}
    />
);

const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label className={`text-sm font-medium text-gray-600 mb-1 block ${className}`} {...props} />
);

const FormField: React.FC<{ label: string; children: React.ReactNode, className?: string }> = ({ label, children, className }) => (
    <div className={className}>
        <Label>{label}</Label>
        {children}
    </div>
);

const FormSection: React.FC<{ title: string; children: React.ReactNode; actions?: React.ReactNode; }> = ({ title, children, actions }) => (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-blue-600">{title}</h3>
            {actions && <div className="flex items-center gap-4">{actions}</div>}
        </div>
        {children}
    </div>
);

const Toggle: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}> = ({ checked, onChange, disabled }) => (
    <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            checked ? 'bg-blue-600' : 'bg-gray-200'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        aria-pressed={checked}
        aria-disabled={disabled}
    >
        <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                checked ? 'translate-x-5' : 'translate-x-0'
            }`}
        />
    </button>
);

// MultiSelect Dropdown Component para Serviços
const ServiceMultiSelectDropdown: React.FC<{
    label: string;
    options: InternalServico[];
    selectedOptions: number[];
    onChange: (selected: number[]) => void;
    placeholder: string;
}> = ({ label, options, selectedOptions, onChange, placeholder }) => {


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
            // ✅ CORREÇÃO CRÍTICA: Comparação robusta de IDs (string vs number)
            const foundService = options.find(opt => String(opt.id) === String(id));

            return foundService?.nome;
        }).filter(Boolean).join(', ')
        : placeholder;



    return (
        <FormField label={label}>
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 flex justify-between items-center text-left"
                >
                    <span className="truncate">{displayValue}</span>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-48 overflow-y-auto">
                        {options.map(option => (
                            <label key={option.id} className="flex items-center p-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedOptions.some(selectedId => String(selectedId) === String(option.id))}
                                    onChange={() => handleToggleOption(option.id)}
                                    className="sr-only peer"
                                />
                                <div className="w-4 h-4 mr-3 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-sm peer-checked:bg-blue-600 peer-checked:border-blue-600">
                                   <Check className="w-2.5 h-2.5 text-white hidden peer-checked:block" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">{option.nome}</div>
                                    <div className="text-xs text-gray-500">{option.duracao_minutos} min - R$ {parseFloat(option.preco.toString()).toFixed(2)}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </FormField>
    );
};

// MultiSelect Dropdown Component para Extras
const ExtraMultiSelectDropdown: React.FC<{
    label: string;
    options: InternalServicoExtra[];
    selectedOptions: number[];
    onChange: (selected: number[]) => void;
    placeholder: string;
}> = ({ label, options, selectedOptions, onChange, placeholder }) => {
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
        ? selectedOptions.map(id => options.find(opt => opt.id === id)?.nome).filter(Boolean).join(', ')
        : placeholder;

    return (
        <FormField label={label}>
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 flex justify-between items-center text-left"
                >
                    <span className="truncate">{displayValue}</span>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-48 overflow-y-auto">
                        {options.map(option => (
                            <label key={option.id} className="flex items-center p-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedOptions.includes(option.id)}
                                    onChange={() => handleToggleOption(option.id)}
                                    className="sr-only peer"
                                />
                                <div className="w-4 h-4 mr-3 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-sm peer-checked:bg-blue-600 peer-checked:border-blue-600">
                                   <Check className="w-2.5 h-2.5 text-white hidden peer-checked:block" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">{option.nome}</div>
                                    <div className="text-xs text-gray-500">{option.duracao_minutos} min - R$ {parseFloat(option.preco.toString()).toFixed(2)}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </FormField>
    );
};


interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentData?: ScheduleSlot['details'];
  newSlotData?: { agent: Agent, start: number, date: Date };
  selectedLocationId?: string; // ✅ CRÍTICO: ID do local selecionado no CalendarPage
  onSuccess?: () => void; // ✅ NOVO: Callback para atualizar dados após sucesso
  // ✅ NOVO: Permite passar apenas o ID para buscar dados do agendamento internamente
  appointmentId?: number;
}

// Dados mock removidos - agora usando dados reais do useInternalBooking

const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({ isOpen, onClose, appointmentData: externalAppointmentData, newSlotData, selectedLocationId, onSuccess, appointmentId: propAppointmentId }) => {
    
    useEffect(() => {
        // Modal opened - initialization complete
    }, [isOpen]);
    
    const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

    // Hook para dados reais
    const {
        fetchServicos,
        fetchServicosExtras,
        fetchAgentes,
        searchClientes,
        createCliente,
        fetchAgendamentoDetalhes,
        createAgendamento,
        updateAgendamento,
        finalizeAgendamento,
        isLoading,
        error
    } = useInternalBooking();

    // ✅ NOVO: Estado para dados carregados via appointmentId (prop)
    const [loadedAppointmentData, setLoadedAppointmentData] = useState<ScheduleSlot['details'] | null>(null);
    const [isLoadingFromProp, setIsLoadingFromProp] = useState(false);

    // ✅ NOVO: Usar dados externos ou carregados internamente
    const appointmentData = externalAppointmentData || loadedAppointmentData;

    // Hook para autenticação e configurações
    const { user, token, isAuthenticated } = useAuth();
    const { settings, loadSettings } = useSettingsManagement();
    const toast = useToast();
    const { units, fetchUnits } = useUnitManagement();

    const isAdminFinanceRole = user?.role === 'ADMIN' || user?.role === 'MASTER';
    const isAgentRole = user?.role === 'AGENTE';

    // ✅ NOVO: Estado para seleção manual de local (quando modal aberto sem contexto)
    const [manualSelectedLocationId, setManualSelectedLocationId] = useState<string | null>(null);
    
    // ✅ NOVO: Determinar qual locationId usar (prop ou seleção manual)
    const effectiveLocationId = selectedLocationId || manualSelectedLocationId;

    // Estados para dados reais
    const [allServices, setAllServices] = useState<InternalServico[]>([]);
    const [allExtras, setAllExtras] = useState<InternalServicoExtra[]>([]);
    const [allAgents, setAllAgents] = useState<InternalAgente[]>([]); // TODOS os agentes
    const [filteredAgents, setFilteredAgents] = useState<InternalAgente[]>([]); // ✅ Agentes filtrados por unidade
    const [filteredClients, setFilteredClients] = useState<InternalCliente[]>([]);
    const [selectedClient, setSelectedClient] = useState<InternalCliente | null>(null);
    const [assinaturaInfo, setAssinaturaInfo] = useState<any | null>(null);
    const [isLoadingAssinaturaSaldo, setIsLoadingAssinaturaSaldo] = useState(false);
    const [usarCotaAssinatura, setUsarCotaAssinatura] = useState(false);
    const assinaturaSaldoDebounceRef = useRef<number | null>(null);
    const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
    const [unitSchedule, setUnitSchedule] = useState<{ inicio: string; fim: string }[]>([]); // ✅ Horários da unidade

    const [isAvailabilityModalOpen, setAvailabilityModalOpen] = useState(false);
    const [selectedServices, setSelectedServices] = useState<number[]>([]);
    const [selectedExtras, setSelectedExtras] = useState<number[]>([]);

    const [isSubmitting, setIsSubmitting] = useState(false);


    const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [clientFirstName, setClientFirstName] = useState('');
    const [clientLastName, setClientLastName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [status, setStatus] = useState<AppointmentStatus>('Aprovado');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [observacoes, setObservacoes] = useState('');

    // ✅ FASE 4: Recorrência (UI)
    const [repeatAppointment, setRepeatAppointment] = useState(false);
    const [repeatFrequency, setRepeatFrequency] = useState<'weekly' | 'biweekly'>('weekly');
    const [repeatCount, setRepeatCount] = useState<number>(2);

    const [isSearchingClient, setIsSearchingClient] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [totalPrice, setTotalPrice] = useState(0);
    const [appointmentId, setAppointmentId] = useState<number | null>(null);
    const [isLoadingAppointment, setIsLoadingAppointment] = useState(false);

    const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
    const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<string>('');
    const [produtosCarrinho, setProdutosCarrinho] = useState<ProdutoCartItem[]>([]);
    const [pagamentos, setPagamentos] = useState<PaymentLine[]>([{ uid: `pay-${Date.now()}-${Math.random()}`, metodo: 'PIX', valor: '' }]);

    const [estoqueByProdutoId, setEstoqueByProdutoId] = useState<Map<number, number>>(new Map());

    const handleAddProdutoToCarrinho = () => {
        const produtoId = parseInt(produtoSelecionadoId, 10);
        if (!Number.isFinite(produtoId)) return;
        const produto = produtos.find((p) => Number(p.id) === produtoId);
        if (!produto) return;

        const saldoAtual = estoqueByProdutoId.get(produtoId);
        if (saldoAtual !== undefined && Number(saldoAtual) <= 0) {
            toast.error('Saldo insuficiente no estoque', `Erro: A ${produto.nome} não possui saldo suficiente no estoque.`);
            return;
        }

        const precoDefault = toNumber((produto as any).preco_venda);

        setProdutosCarrinho((prev) => [
            ...prev,
            {
                uid: `prod-${Date.now()}-${Math.random()}`,
                produto_id: produtoId,
                nome: produto.nome,
                unidade_medida: (produto as any).unidade_medida ?? null,
                quantidade: '1',
                preco_aplicado: precoDefault ? Number(precoDefault).toFixed(2) : '0.00',
                agente_id: selectedAgentId ? String(selectedAgentId) : ''
            }
        ]);
        setProdutoSelecionadoId('');
    };

    // Estados para sistema de pontos
    const [clienteId, setClienteId] = useState<number | null>(null);
    const [pontosDisponiveis, setPontosDisponiveis] = useState<number>(0);
    const [pontosUsados, setPontosUsados] = useState<number>(0);
    const [pontosUsadosDraft, setPontosUsadosDraft] = useState<string>('0');
    const [descontoCalculado, setDescontoCalculado] = useState<number>(0);
    const [valorFinal, setValorFinal] = useState<number>(0);
    const [podeUsarPontos, setPodeUsarPontos] = useState<boolean>(false);
    const [isLoadingPontos, setIsLoadingPontos] = useState<boolean>(false);

    // ✅ NOVO: Estados para cupom de desconto
    const [cupomCodigo, setCupomCodigo] = useState('');
    const [cupomAplicado, setCupomAplicado] = useState<{
        codigo: string;
        tipo_desconto: string;
        valor_desconto: number;
        desconto_calculado: number;
        cupom_id: number;
    } | null>(null);
    const [cupomErro, setCupomErro] = useState<string | null>(null);
    const [isValidatingCupom, setIsValidatingCupom] = useState(false);

    // ✅ NOVO: Configurações de pontos
    const pontosAtivo = Boolean(settings?.pontos_ativo && String(settings.pontos_ativo) !== 'false' && String(settings.pontos_ativo) !== '0');
    const taxaConversao = Number(settings?.reais_por_pontos) || 15;
    const reaisPorPontos = taxaConversao;

    const isConcluido = status === 'Concluído';

    const isEditing = !!appointmentData;

    const coberturaSugerida = useMemo(() => {
        const cobertura = assinaturaInfo?.cobertura_sugerida;
        return {
            servico_ids: Array.isArray(cobertura?.servico_ids) ? cobertura.servico_ids : [],
            servico_extra_ids: Array.isArray(cobertura?.servico_extra_ids) ? cobertura.servico_extra_ids : []
        };
    }, [assinaturaInfo]);

    const hasCoberturaDisponivel = (coberturaSugerida.servico_ids.length > 0 || coberturaSugerida.servico_extra_ids.length > 0);
    const assinaturaStatusSelecionado = (selectedClient as any)?.assinatura_status ?? null;
    const assinaturaBloqueada = Boolean((selectedClient as any)?.is_assinante) && assinaturaStatusSelecionado && assinaturaStatusSelecionado !== 'Ativo';

    const assinaturaStatusLabel = String((assinaturaInfo as any)?.cliente?.assinatura_status ?? assinaturaStatusSelecionado ?? '').trim();
    const isAssinaturaStatusAtivo = assinaturaStatusLabel === 'Ativo';
    const isAssinaturaLiberada = Boolean((assinaturaInfo as any)?.assinatura_ativa) && isAssinaturaStatusAtivo;

    const durationMinutes = useMemo(() => {
        let total = 0;
        selectedServices.forEach(id => {
            const s = allServices.find(x => x.id === id);
            if (s?.duracao_minutos) total += Number(s.duracao_minutos) || 0;
        });
        selectedExtras.forEach(id => {
            const e = allExtras.find(x => x.id === id);
            if (e?.duracao_minutos) total += Number(e.duracao_minutos) || 0;
        });
        return total > 0 ? total : 60;
    }, [selectedServices, selectedExtras, allServices, allExtras]);
    
    // Verificar dados recebidos ao abrir modal
    useEffect(() => {
        if (isOpen) {
            // Modal aberto - dados carregados
        }
    }, [isOpen, isEditing, appointmentData, newSlotData, propAppointmentId]);

    useEffect(() => {
        if (!isOpen) return;
        // Em modo edição, não permitir recorrência (MVP)
        if (isEditing) {
            setRepeatAppointment(false);
            return;
        }
        // Defaults consistentes ao abrir o modal
        setRepeatAppointment(false);
        setRepeatFrequency('weekly');
        setRepeatCount(2);
    }, [isOpen, isEditing]);

    // ✅ NOVO: Buscar dados do agendamento quando appointmentId for passado via prop
    useEffect(() => {
        const loadAppointmentFromId = async () => {
            if (!isOpen || !propAppointmentId || externalAppointmentData) {
                return; // Não buscar se já temos dados externos
            }

            setIsLoadingFromProp(true);

            try {
                const detalhes = await fetchAgendamentoDetalhes(propAppointmentId);

                if (detalhes) {

                    // ✅ CORREÇÃO: Extrair apenas a data (YYYY-MM-DD) do formato ISO
                    // Backend pode retornar: "2025-12-06" ou "2025-12-06T03:00:00.000Z"
                    let dateISOClean = detalhes.data_agendamento;
                    if (dateISOClean && dateISOClean.includes('T')) {
                        dateISOClean = dateISOClean.split('T')[0]; // Pega apenas "2025-12-06"
                    }

                    // Converter dados do backend para formato ScheduleSlot['details']
                    const formattedDate = new Date(dateISOClean + 'T12:00:00').toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                    });
                    const formattedTime = `${detalhes.hora_inicio} - ${detalhes.hora_fim}`;

                    const convertedData: ScheduleSlot['details'] = {
                        id: detalhes.id.toString(),
                        service: detalhes.servicos?.[0]?.nome || 'Serviço não encontrado',
                        client: detalhes.cliente?.nome_completo || '',
                        agentName: detalhes.agente?.nome || '',
                        agentAvatar: '',
                        agentEmail: '',
                        agentPhone: '',
                        date: formattedDate,
                        time: formattedTime,
                        serviceId: detalhes.servicos?.[0]?.id?.toString() || '',
                        locationId: detalhes.unidade_id?.toString() || selectedLocationId || '', // ✅ USAR unidade_id do agendamento
                        agentId: detalhes.agente_id?.toString() || '',
                        startTime: detalhes.hora_inicio,
                        endTime: detalhes.hora_fim,
                        dateISO: dateISOClean, // ✅ CORREÇÃO: Usar data limpa (YYYY-MM-DD)
                        status: detalhes.status as any || 'Aprovado',
                        clientPhone: detalhes.cliente?.telefone || '',
                        observacoes: detalhes.observacoes
                    };

                    setLoadedAppointmentData(convertedData);
                }
            } catch (err) {
                // Erro ao buscar agendamento
            } finally {
                setIsLoadingFromProp(false);
            }
        };

        loadAppointmentFromId();
    }, [isOpen, propAppointmentId, externalAppointmentData, fetchAgendamentoDetalhes, selectedLocationId]);

    // ✅ NOVO: Carregar unidades quando modal abre
    useEffect(() => {
        if (isOpen) {
            fetchUnits();
        }
    }, [isOpen, fetchUnits]);

    // Carregar dados iniciais
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [servicos, extras, agentes] = await Promise.all([
                    fetchServicos(),
                    fetchServicosExtras(),
                    fetchAgentes()
                ]);

                setAllServices(servicos);
                setAllExtras(extras);
                setAllAgents(agentes);
                
                // ✅ NOVO: Carregar configurações de pontos
                await loadSettings();
            } catch (error) {
            }
        };

        if (isOpen) {
            loadInitialData();
        }
    }, [isOpen, fetchServicos, fetchServicosExtras, fetchAgentes, loadSettings]);

    useEffect(() => {
        if (!isOpen) return;
        if (settings) return;
        loadSettings();
    }, [isOpen, settings, loadSettings]);

    // ✅ FILTRAR AGENTES POR UNIDADE SELECIONADA
    useEffect(() => {
        if (!effectiveLocationId || allAgents.length === 0) {
            setFilteredAgents([]);
            return;
        }

        const locationIdNumber = parseInt(effectiveLocationId);
        const locationIdStr = String(effectiveLocationId);

        // Filtrar agentes que trabalham na unidade selecionada
        const agentesNaUnidade = allAgents.filter(agente => {
            // Verificar se o agente tem a propriedade unidades (array de IDs)
            // Ou se tem unidade_id (ID único)
            const agenteUnidadesRaw = (agente as any).unidades || (agente as any).unidades_ids || [];
            const agenteUnidades = Array.isArray(agenteUnidadesRaw)
                ? agenteUnidadesRaw
                    .map((u: any) => {
                        if (u === null || u === undefined) return NaN;
                        if (typeof u === 'object') {
                            const id = (u as any).id ?? (u as any).unidade_id;
                            return parseInt(id);
                        }
                        return parseInt(u);
                    })
                    .filter((n: number) => Number.isFinite(n))
                : [];

            const agenteUnidadesStr = new Set(
                (Array.isArray(agenteUnidadesRaw) ? agenteUnidadesRaw : [])
                    .map((u: any) => {
                        if (u === null || u === undefined) return null;
                        if (typeof u === 'object') {
                            const id = (u as any).id ?? (u as any).unidade_id;
                            return id !== undefined && id !== null ? String(id) : null;
                        }
                        return String(u);
                    })
                    .filter(Boolean)
            );

            const agenteUnidadeIdRaw = (agente as any).unidade_id;
            const agenteUnidadeId = agenteUnidadeIdRaw !== undefined && agenteUnidadeIdRaw !== null
                ? parseInt(agenteUnidadeIdRaw)
                : undefined;
            const agenteUnidadeIdStr = agenteUnidadeIdRaw !== undefined && agenteUnidadeIdRaw !== null
                ? String(agenteUnidadeIdRaw)
                : undefined;
            
            // Verificar se o agente trabalha nesta unidade
            const isAssociatedToUnit = (
                agenteUnidades.includes(locationIdNumber) ||
                agenteUnidadesStr.has(locationIdStr) ||
                agenteUnidadeId === locationIdNumber ||
                agenteUnidadeIdStr === locationIdStr
            );

            // ✅ CORREÇÃO: No modal de agendamento, mostrar TODOS os agentes associados à unidade
            // A validação de horários será feita no momento de buscar disponibilidade
            return isAssociatedToUnit;
        });


        setFilteredAgents(agentesNaUnidade);

        // ✅ CORREÇÃO CRÍTICA: NÃO sobrescrever agente se estamos em modo de edição
        // O agente já foi definido pelo useEffect de carregamento de dados
        if (isEditing && selectedAgentId) {
            return;
        }

        // ✅ CORREÇÃO: Auto-seleção inteligente (APENAS para novos agendamentos)
        // 1. Se usuário é AGENTE, selecionar ele mesmo
        if (user?.role === 'AGENTE' && user?.agentId) {
            const agenteLogado = agentesNaUnidade.find(a => a.id.toString() === user.agentId);
            if (agenteLogado) {
                setSelectedAgentId(agenteLogado.id);
                return;
            }
        }
        
        // 2. Se há apenas um agente na unidade, selecionar automaticamente
        if (agentesNaUnidade.length === 1) {
            setSelectedAgentId(agentesNaUnidade[0].id);
        }
    }, [effectiveLocationId, allAgents, user, isEditing, selectedAgentId]);

    // ✅ BUSCAR HORÁRIOS DE FUNCIONAMENTO DA UNIDADE SELECIONADA
    useEffect(() => {
        const fetchUnitSchedule = async () => {
            if (!effectiveLocationId || effectiveLocationId === 'all') {
                setUnitSchedule([]);
                return;
            }

            try {
                const token = localStorage.getItem('authToken');
                if (!token) return;

                const response = await fetch(`${API_BASE_URL}/unidades/${effectiveLocationId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                if (data.success && data.data.horarios_funcionamento) {
                    // Extrair horários de todos os dias da semana
                    const todosHorarios: { inicio: string; fim: string }[] = [];
                    data.data.horarios_funcionamento.forEach((dia: any) => {
                        if (dia.is_aberto && dia.horarios_json) {
                            todosHorarios.push(...dia.horarios_json);
                        }
                    });

                    setUnitSchedule(todosHorarios);
                }
            } catch (error) {
                // Erro ao buscar horários da unidade
            }
        };

        fetchUnitSchedule();
    }, [effectiveLocationId]);

    // Busca dinâmica de clientes
    useEffect(() => {
        const searchClientsDebounced = async () => {
            if (clientSearchQuery.trim().length >= 2) {
                try {
                    const clientes = await searchClientes(clientSearchQuery.trim());
                    setFilteredClients(clientes);
                } catch (error) {
                    setFilteredClients([]);
                }
            } else {
                setFilteredClients([]);
            }
        };

        const timeoutId = setTimeout(searchClientsDebounced, 300); // Debounce de 300ms
        return () => clearTimeout(timeoutId);
    }, [clientSearchQuery, searchClientes]);

    // ✅ ETAPA 3 (CLUBE): consultar saldo automaticamente quando cliente + itens existirem
    useEffect(() => {
        if (!isOpen) return;

        if (assinaturaSaldoDebounceRef.current) {
            window.clearTimeout(assinaturaSaldoDebounceRef.current);
            assinaturaSaldoDebounceRef.current = null;
        }

        if (!selectedClient?.id) {
            setAssinaturaInfo(null);
            setUsarCotaAssinatura(false);
            return;
        }

        if (!effectiveLocationId) {
            setAssinaturaInfo(null);
            setUsarCotaAssinatura(false);
            return;
        }

        const servicos = Array.isArray(selectedServices) ? selectedServices : [];
        const extras = Array.isArray(selectedExtras) ? selectedExtras : [];
        if (servicos.length === 0 && extras.length === 0) {
            setAssinaturaInfo(null);
            setUsarCotaAssinatura(false);
            return;
        }

        // Se o cliente já estiver com pagamento pendente/inativo, não precisamos consultar saldo
        if (assinaturaBloqueada) {
            setAssinaturaInfo(null);
            setUsarCotaAssinatura(false);
            return;
        }

        assinaturaSaldoDebounceRef.current = window.setTimeout(async () => {
            setIsLoadingAssinaturaSaldo(true);
            try {
                const token = localStorage.getItem('authToken');
                if (!token) {
                    setAssinaturaInfo(null);
                    setUsarCotaAssinatura(false);
                    return;
                }

                const params = new URLSearchParams();
                params.append('unidade_id', String(parseInt(effectiveLocationId)));
                if (servicos.length > 0) params.append('servico_ids', servicos.join(','));
                if (extras.length > 0) params.append('servico_extra_ids', extras.join(','));

                const response = await fetch(`${API_BASE_URL}/clientes/${selectedClient.id}/assinatura-saldo?${params.toString()}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    setAssinaturaInfo(null);
                    setUsarCotaAssinatura(false);
                    return;
                }

                const payload = await response.json();
                const data = payload?.data || null;
                setAssinaturaInfo(data);

                const cobertura = data?.cobertura_sugerida;
                const hasCobertura = (Array.isArray(cobertura?.servico_ids) && cobertura.servico_ids.length > 0)
                    || (Array.isArray(cobertura?.servico_extra_ids) && cobertura.servico_extra_ids.length > 0);

                const statusLabel = String(data?.cliente?.assinatura_status ?? assinaturaStatusSelecionado ?? '').trim();
                const gateOpen = Boolean(data?.assinatura_ativa) && statusLabel === 'Ativo';

                setUsarCotaAssinatura(Boolean(hasCobertura) && gateOpen);
            } catch (e) {
                setAssinaturaInfo(null);
                setUsarCotaAssinatura(false);
            } finally {
                setIsLoadingAssinaturaSaldo(false);
            }
        }, 350);
    }, [
        isOpen,
        selectedClient?.id,
        effectiveLocationId,
        selectedServices,
        selectedExtras,
        assinaturaBloqueada,
        assinaturaStatusSelecionado
    ]);

    useEffect(() => {
        if (!isOpen) return;
        if (!isAssinaturaLiberada) {
            setUsarCotaAssinatura(false);
        }
    }, [isOpen, isAssinaturaLiberada]);

    const calculateEndTime = (startTimeStr: string, serviceIds: number[], extraIds: number[]): string => {
        if (!startTimeStr) return '';

        const totalDuration = serviceIds.reduce((acc, serviceId) => {
            const service = allServices.find(s => s.id === serviceId);
            return acc + (service?.duracao_minutos || 0);
        }, 0) + extraIds.reduce((acc, extraId) => {
            const extra = allExtras.find(e => e.id === extraId);
            return acc + (extra?.duracao_minutos || 0);
        }, 0);

        if (totalDuration === 0) return '';

        const [hours, minutes] = startTimeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return '';

        const startDate = new Date();
        startDate.setHours(hours, minutes, 0, 0);

        const endDate = new Date(startDate.getTime() + totalDuration * 60000);

        const endHours = String(endDate.getHours()).padStart(2, '0');
        const endMinutes = String(endDate.getMinutes()).padStart(2, '0');

        return `${endHours}:${endMinutes}`;
    };

    // ✅ Função para gerar horários disponíveis baseados nos horários da unidade
    const generateAvailableTimeSlots = (selectedDate: string, agentId: number | null): string[] => {
        if (!selectedDate || !agentId) return [];

        // ✅ CORREÇÃO CRÍTICA: Usar horários reais da unidade ao invés de hardcoded
        if (unitSchedule.length === 0) {
            return [];
        }

        const timeSlots: string[] = [];
        
        // ✅ CORREÇÃO CRÍTICA: Usar duracao_servico_horas das configurações ao invés de hardcoded
        // Converter horas para minutos (ex: 1 hora = 60 minutos, 0.5 horas = 30 minutos)
        const intervalMinutes = settings?.duracao_servico_horas 
            ? Math.round(settings.duracao_servico_horas * 60) 
            : 30; // Fallback para 30 minutos se configuração não estiver disponível

        // Gerar slots baseados nos horários reais da unidade
        for (const periodo of unitSchedule) {
            const [startHour, startMinute] = periodo.inicio.split(':').map(Number);
            const [endHour, endMinute] = periodo.fim.split(':').map(Number);
            
            const startTotalMinutes = startHour * 60 + startMinute;
            const endTotalMinutes = endHour * 60 + endMinute;

            for (let totalMinutes = startTotalMinutes; totalMinutes < endTotalMinutes; totalMinutes += intervalMinutes) {
                const hour = Math.floor(totalMinutes / 60);
                const minute = totalMinutes % 60;
                const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                
                // Evitar duplicatas
                if (!timeSlots.includes(timeString)) {
                    timeSlots.push(timeString);
                }
            }
        }

        // TODO: Filtrar horários já ocupados consultando agendamentos existentes
        return timeSlots.sort();
    };

    const handleRecalculate = useCallback(() => {
        let currentTotal = 0;

        selectedServices.forEach(serviceId => {
            const service = allServices.find(s => s.id === serviceId);
            if (service) {
                const preco = parseFloat(service.preco.toString());
                currentTotal += preco;
            }
        });

        selectedExtras.forEach(extraId => {
            const extra = allExtras.find(e => e.id === extraId);
            if (extra) {
                const preco = parseFloat(extra.preco.toString());
                currentTotal += preco;
            }
        });

        setTotalPrice(currentTotal);
    }, [selectedServices, selectedExtras, allServices, allExtras]);

    // ✅ CORREÇÃO CRÍTICA: Resetar formulário ANTES de carregar dados (APENAS para novos agendamentos)
    useEffect(() => {
        // ✅ FASE 2 + FASE 14: Limpeza COMPLETA de estados ao fechar modal
        if (!isOpen) {
            setLoadedAppointmentData(null);
            
            // ✅ RESET FINANCEIRO: Limpar estados de pontos
            setClienteId(null);
            setPontosDisponiveis(0);
            setPontosUsados(0);
            setPontosUsadosDraft('0');
            setPodeUsarPontos(false);
            setDescontoCalculado(0);
            setValorFinal(0);
            
            // ✅ RESET FINANCEIRO: Limpar estados de cupom
            setCupomCodigo('');
            setCupomAplicado(null);
            setCupomErro(null);
            
            // ✅ RESET FINANCEIRO: Limpar método de pagamento
            setPaymentMethod('');
            
            // ✅ RESET FINANCEIRO: Resetar pagamentos para estado inicial
            setPagamentos([{ uid: `pay-${Date.now()}-${Math.random()}`, metodo: 'PIX', valor: '' }]);
            
            // ✅ FASE 14: Limpar campos de texto/metadados para prevenir vazamento de estado
            setObservacoes('');
            setClientFirstName('');
            setClientLastName('');
            setClientPhone('');
            setClientSearchQuery('');
            
            // ✅ FASE 14: Limpar carrinho de produtos e seleções
            setProdutosCarrinho([]);
            setProdutoSelecionadoId('');
            
            // ✅ FASE 14: Limpar estados de agendamento (data, hora, agente, status)
            setDate('');
            setStartTime('');
            setEndTime('');
            setSelectedAgentId(null);
            setStatus('Aprovado');
            setAppointmentId(null);
            
            // ✅ FASE 14: Limpar seleções de serviços e cliente
            setSelectedServices([]);
            setSelectedExtras([]);
            setSelectedClient(null);
            setFilteredClients([]);
            setIsSearchingClient(false);
            
            // ✅ FASE 14: Limpar estados de assinatura/clube
            setAssinaturaInfo(null);
            setUsarCotaAssinatura(false);
            
            // ✅ FASE 14: Limpar preço
            setTotalPrice(0);
            
            // ✅ FASE 14: Limpar estados de UI/modais
            setAvailabilityModalOpen(false);
            setIsSubmitting(false);
            setAvailableTimeSlots([]);
            setManualSelectedLocationId(null);
            
            return;
        }

        // ⚠️ IMPORTANTE: Só resetar se NÃO for edição
        if (isEditing) {
            return;
        }
        setIsSearchingClient(false);
        setClientSearchQuery('');
        setTotalPrice(0);

        // Se é novo slot (não é edição)
        if (newSlotData) {
            setSelectedServices([]);
            setSelectedExtras([]);

            // ✅ CORREÇÃO: Preencher horário E data
            setStartTime(`${String(newSlotData.start).padStart(2,'0')}:00`);
            setEndTime('');

            // ✅ CORREÇÃO CRÍTICA: Garantir que a data seja preenchida corretamente
            const dateObj = newSlotData.date;
            const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
            setDate(formattedDate);

            // ✅ NOVA CORREÇÃO: Pré-selecionar o agente baseado no slot clicado
            if (newSlotData.agent && newSlotData.agent.id) {
                // Converter string para number se necessário
                const agentId = typeof newSlotData.agent.id === 'string'
                    ? parseInt(newSlotData.agent.id)
                    : newSlotData.agent.id;
                setSelectedAgentId(agentId);
            }

            setClientFirstName('');
            setClientLastName('');
            setClientPhone('');
            setSelectedClient(null);
            setStatus('Aprovado');
            setObservacoes('');
            setProdutosCarrinho([]);
            setProdutoSelecionadoId('');
        }
        // Se não é edição nem novo slot, resetar tudo
        else {
            setSelectedServices([]);
            setSelectedExtras([]);
            setSelectedAgentId(allAgents.length === 1 ? allAgents[0]?.id : null);
            setDate('');
            setStartTime('');
            setEndTime('');
            setClientFirstName('');
            setClientLastName('');
            setClientPhone('');
            setSelectedClient(null);
            setStatus('Aprovado');
            setAppointmentId(null);
            setObservacoes('');
            setProdutosCarrinho([]);
            setProdutoSelecionadoId('');
        }
    }, [isOpen, isEditing, newSlotData, allAgents]);

    // ✅ CORREÇÃO CRÍTICA: Preencher formulário com dados passados pelo CalendarPage
    // Elimina necessidade de buscar no backend, resolvendo problema de 403 para AGENTE
    useEffect(() => {
        const loadAppointmentDetails = async () => {
            if (!isOpen || !isEditing || !appointmentData) {
                return;
            }

            // ✅ AGUARDAR SERVIÇOS SEREM CARREGADOS ANTES DE DEFINIR selectedServices
            if (allServices.length === 0) {
                return;
            }


            setIsLoadingAppointment(true);
            try {
                // ✅ SOLUÇÃO: Usar dados passados pelo CalendarPage ao invés de buscar no backend
                // Isso evita erro 403 quando AGENTE tenta editar agendamento
                
                const parsedId = parseInt(appointmentData.id);
                setAppointmentId(parsedId);
                
                // ✅ Preencher agente
                if (appointmentData.agentId) {
                    const agentIdNumber = typeof appointmentData.agentId === 'string' 
                        ? parseInt(appointmentData.agentId) 
                        : appointmentData.agentId;
                    setSelectedAgentId(agentIdNumber);
                }
                
                // ✅ Preencher status
                if (appointmentData.status) {
                    setStatus(appointmentData.status as AppointmentStatus);
                }
                
                // ✅ Preencher horários
                if (appointmentData.startTime) {
                    setStartTime(appointmentData.startTime);
                }
                if (appointmentData.endTime) {
                    setEndTime(appointmentData.endTime);
                }
                
                // ✅ Preencher data (converter de ISO para DD/MM/YYYY)
                if (appointmentData.dateISO) {
                    const [ano, mes, dia] = appointmentData.dateISO.split('-');
                    const formattedDate = `${dia}/${mes}/${ano}`;
                    setDate(formattedDate);
                }
                
                // ✅ Preencher cliente
                if (appointmentData.client) {
                    const nameParts = appointmentData.client.split(' ');
                    const firstName = nameParts[0] || '';
                    const lastName = nameParts.slice(1).join(' ') || '';
                    
                    setClientFirstName(firstName);
                    setClientLastName(lastName);
                    setClientPhone((appointmentData.clientPhone || '').replace('+55', '').trim());
                }
                
                // ✅ FASE 14: Preencher observações (se existirem, ou forçar vazio)
                if (appointmentData.observacoes) {
                    setObservacoes(appointmentData.observacoes);
                } else {
                    setObservacoes(''); // Forçar vazio se não houver observações
                }
                
                // ⚠️ TEMPORÁRIO: NÃO usar serviceId passado se não existir nos serviços disponíveis
                // Deixar vazio e aguardar busca do backend
                if (appointmentData.serviceId) {
                    const serviceIdNumber = typeof appointmentData.serviceId === 'string' 
                        ? parseInt(appointmentData.serviceId) 
                        : appointmentData.serviceId;
                    
                    // ✅ VERIFICAR se o serviço existe antes de definir
                    const serviceExists = allServices.some(s => s.id === serviceIdNumber);
                    if (serviceExists) {
                        setSelectedServices([serviceIdNumber]);
                    } else {
                        setSelectedServices([]); // Deixar vazio para ser preenchido pelo backend
                    }
                }
                
                // ✅ CORREÇÃO CRÍTICA: AGENTE agora pode buscar detalhes do backend
                // O backend já valida que AGENTE só pode acessar seus próprios agendamentos
                if (appointmentData.id) {
                    try {
                        const details = await fetchAgendamentoDetalhes(parseInt(appointmentData.id));

                        if (details) {
                            // Extrair IDs dos serviços e extras
                            const servicoIds = details.servicos?.map(s => s.id) || [];
                            const extraIds = details.extras?.map(e => e.id) || [];

                            // ✅ Atualizar serviços apenas se a busca retornou dados
                            if (servicoIds.length > 0) {
                                setSelectedServices(servicoIds);
                            }
                            setSelectedExtras(extraIds);

                            // Calcular preço total
                            let calculatedTotal = 0;
                            
                            if (details.servicos && details.servicos.length > 0) {
                                details.servicos.forEach(servico => {
                                    const preco = servico.preco_aplicado || servico.preco;
                                    calculatedTotal += parseFloat(preco.toString());
                                });
                            }

                            if (details.extras && details.extras.length > 0) {
                                details.extras.forEach(extra => {
                                    const preco = extra.preco_aplicado || extra.preco;
                                    calculatedTotal += parseFloat(preco.toString());
                                });
                            }

                            setTotalPrice(calculatedTotal);
                            
                            // ✅ FASE 14: Preencher observações do backend (ou forçar vazio se não houver)
                            if (details.observacoes) {
                                setObservacoes(details.observacoes);
                            } else {
                                setObservacoes(''); // Forçar vazio se não houver observações
                            }
                            
                            // ✅ FASE 14: Preencher telefone do cliente do backend (ou forçar vazio se não houver)
                            if (details.cliente && details.cliente.telefone) {
                                setClientPhone(details.cliente.telefone.replace('+55', '').trim());
                            } else {
                                setClientPhone(''); // Forçar vazio se não houver telefone
                            }
                            
                            // ✅ CORREÇÃO: Apenas armazenar ID do cliente e unidade_id
                            // A busca de pontos agora é feita em um useEffect separado que depende de settings
                            const clienteIdFromDetails = Number((details as any).cliente_id) || Number((details as any)?.cliente?.id);
                            if (Number.isFinite(clienteIdFromDetails) && clienteIdFromDetails > 0) {
                                setClienteId(clienteIdFromDetails);
                            }

                            // ✅ REGRA DE NEGÓCIO (FINANCEIRO): preencher pagamento apenas se Concluído
                            // (backend pode usar nomenclatura diferente: payment_method ou metodo_pagamento)
                            const metodo = (details as any).metodo_pagamento || (details as any).payment_method;
                            if ((details as any).status === 'Concluído') {
                                setPaymentMethod(metodo || '');
                            } else {
                                setPaymentMethod('');
                            }

                            // ✅ PDV (E2E): hidratar carrinho e split payment ao reabrir
                            try {
                                const produtosVendidosRows = Array.isArray((details as any).produtos_vendidos)
                                    ? (details as any).produtos_vendidos
                                    : [];

                                if (produtosVendidosRows.length > 0) {
                                    setProdutosCarrinho(
                                        produtosVendidosRows.map((p: any) => ({
                                            uid: `prod-hyd-${Date.now()}-${Math.random()}`,
                                            produto_id: Number(p.produto_id),
                                            nome: String(p.nome || p.produto_nome || ''),
                                            quantidade: String(p.quantidade ?? '1'),
                                            preco_aplicado: toMoneyFixedString(p.preco_aplicado) || '0.00',
                                            agente_id: p.agente_id ? String(p.agente_id) : ''
                                        }))
                                    );
                                } else {
                                    setProdutosCarrinho([]);
                                }

                                const pagamentosRows = Array.isArray((details as any).pagamentos)
                                    ? (details as any).pagamentos
                                    : [];

                                if (pagamentosRows.length > 0) {
                                    setPagamentos(
                                        pagamentosRows.map((pg: any) => ({
                                            uid: `pay-hyd-${Date.now()}-${Math.random()}`,
                                            metodo: String(pg.metodo || 'PIX'),
                                            valor: toMoneyFixedString(pg.valor)
                                        }))
                                    );
                                } else {
                                    setPagamentos([
                                        {
                                            uid: `pay-${Date.now()}-${Math.random()}`,
                                            metodo: 'PIX',
                                            valor: valorFinal > 0 ? Number(valorFinal).toFixed(2) : ''
                                        }
                                    ]);
                                }
                            } catch (e) {
                                // não bloquear edição por falha de hidratação
                            }
                        }
                    } catch (error) {
                        // ✅ NÃO BLOQUEAR: Mesmo sem serviços/extras, o usuário pode finalizar o agendamento
                        // Os serviços já foram preenchidos com serviceId passado
                    }
                }
            } catch (error) {
                // Erro ao preencher formulário
            } finally {
                setIsLoadingAppointment(false);
            }
        };

        loadAppointmentDetails();
    }, [isOpen, isEditing, appointmentData, fetchAgendamentoDetalhes, allServices]);

    // ✅ REGRA DE NEGÓCIO (FINANCEIRO): ao trocar status para NÃO Concluído, limpar campos financeiros
    useEffect(() => {
        if (!isEditing) return;

        // ✅ FASE 2: Limpar campos financeiros quando status deixa de ser Concluído
        if (!isConcluido) {
            setPaymentMethod('');
            setCupomAplicado(null);
            setCupomCodigo('');
            setCupomErro(null);
            setPagamentos([{ uid: `pay-${Date.now()}-${Math.random()}`, metodo: 'PIX', valor: '' }]);
        }
    }, [isEditing, isConcluido]);



    useEffect(() => {
        if (startTime && (selectedServices.length > 0 || selectedExtras.length > 0)) {
            const newEndTime = calculateEndTime(startTime, selectedServices, selectedExtras);
            setEndTime(newEndTime);
        } else {
            setEndTime('');
        }
    }, [startTime, selectedServices, selectedExtras, allServices, allExtras]);

    // Atualizar horários disponíveis quando agente ou data mudarem
    useEffect(() => {
        if (date && selectedAgentId) {
            const slots = generateAvailableTimeSlots(date, selectedAgentId);
            setAvailableTimeSlots(slots);
        } else {
            setAvailableTimeSlots([]);
        }
    }, [date, selectedAgentId]);

    // ✅ RESTAURADO: useEffect dedicado ao cálculo de preço (com lógica corrigida)
    useEffect(() => {
        // Só calcular se as listas de serviços/extras JÁ estiverem carregadas
        if (allServices.length > 0 || allExtras.length > 0) {
            handleRecalculate();
        }
        // Depender de TUDO que afeta o preço
    }, [selectedServices, selectedExtras, allServices, allExtras, handleRecalculate]);

    const clienteIdForPontos = useMemo(() => {
        const direct = Number(clienteId);
        if (Number.isFinite(direct) && direct > 0) return direct;
        const fallback = Number((selectedClient as any)?.id);
        if (Number.isFinite(fallback) && fallback > 0) return fallback;
        return null;
    }, [clienteId, selectedClient]);

    const fetchSaldoPontos = useCallback(async () => {
        if (!isOpen || !clienteIdForPontos || !settings) {
            return;
        }

        const unidadeId = appointmentData?.locationId || selectedLocationId || effectiveLocationId;
        if (!unidadeId) {
            return;
        }

        try {
            setIsLoadingPontos(true);
            const token = localStorage.getItem('authToken');
            const response = await fetch(
                `${API_BASE_URL}/clientes/${clienteIdForPontos}/pontos?unidade_id=${unidadeId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                setPontosDisponiveis(data.pontos_disponiveis || 0);
                setPodeUsarPontos(data.pode_usar_pontos || false);
                return data;
            }
        } catch (error) {
            // Erro ao buscar pontos do cliente
        } finally {
            setIsLoadingPontos(false);
        }
    }, [isOpen, clienteIdForPontos, settings, appointmentData?.locationId, selectedLocationId, effectiveLocationId]);

    // ✅ CORREÇÃO CRÍTICA: Buscar pontos do cliente DEPOIS que settings estiver carregado
    // Este useEffect separado garante que pontosAtivo esteja correto antes de fazer a busca
    useEffect(() => {
        fetchSaldoPontos();
    }, [fetchSaldoPontos, pontosAtivo]);

    useEffect(() => {
        let cancelled = false;

        const loadProdutos = async () => {
            if (!isOpen || !isAuthenticated || !token) return;
            try {
                const res = await fetch(`${API_BASE_URL}/produtos`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                const rows = Array.isArray(data?.data) ? data.data : [];
                setProdutos(rows);
            } catch {
                if (!cancelled) setProdutos([]);
            }
        };

        loadProdutos();

        return () => {
            cancelled = true;
        };
    }, [isOpen, isAuthenticated, token]);

    useEffect(() => {
        let cancelled = false;

        const loadSnapshot = async () => {
            if (!isOpen || !isAuthenticated || !token) return;

            const unidadeIdNum = effectiveLocationId ? Number(effectiveLocationId) : null;
            if (!unidadeIdNum || !Number.isFinite(unidadeIdNum)) {
                setEstoqueByProdutoId(new Map());
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/estoque/snapshot?unidade_id=${unidadeIdNum}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                const data = await res.json().catch(() => ({}));
                if (cancelled) return;

                const rows = Array.isArray(data?.data) ? data.data : [];
                const map = new Map<number, number>();
                for (const r of rows as EstoqueSnapshotRow[]) {
                    const pid = Number((r as any)?.produto_id);
                    const saldo = Number((r as any)?.saldo_atual);
                    if (Number.isFinite(pid)) {
                        map.set(pid, Number.isFinite(saldo) ? saldo : 0);
                    }
                }
                setEstoqueByProdutoId(map);
            } catch {
                if (!cancelled) setEstoqueByProdutoId(new Map());
            }
        };

        loadSnapshot();
        return () => {
            cancelled = true;
        };
    }, [isOpen, isAuthenticated, token, effectiveLocationId]);

    const totalProdutosCarrinho = useMemo(() => {
        return produtosCarrinho.reduce((sum, p) => {
            const qty = parseFloat(String(p.quantidade || '0').replace(',', '.')) || 0;
            const unit = parseFloat(String(p.preco_aplicado || '0').replace(',', '.')) || 0;
            return sum + qty * unit;
        }, 0);
    }, [produtosCarrinho]);

    // Total bruto (antes de pontos/cupom): Serviços + Extras + Produtos do carrinho
    const totalBruto = useMemo(() => {
        const total = (Number(totalPrice) || 0) + (Number(totalProdutosCarrinho) || 0);
        return total;
    }, [totalPrice, totalProdutosCarrinho]);

    const tetoDescontoReais = (Number(totalBruto) || 0) * (Number(settings?.limite_desconto_percentual || 100) / 100);
    const limiteMaximoPontos = useMemo(() => {
        const saldo = Math.floor(Number(pontosDisponiveis) || 0);
        if (!pontosAtivo) return 0;
        if (!Number.isFinite(saldo) || saldo <= 0) return 0;
        const maxPorTeto = Math.floor((Number(tetoDescontoReais) || 0) * (Number(taxaConversao) || 0));
        return Math.max(0, Math.min(saldo, maxPorTeto));
    }, [pontosDisponiveis, pontosAtivo, tetoDescontoReais, taxaConversao]);

    const saldoEstimado = Math.max(0, Math.floor(Number(pontosDisponiveis) || 0) - Math.floor(Number(pontosUsados) || 0));

    // ✅ FASE 5: Sincronizar valorFinal com totalBruto automaticamente
    useEffect(() => {
        const descontoCupom = cupomAplicado?.desconto_calculado || 0;
        const descontoPontos = descontoCalculado || 0;
        const valorCalculado = Math.max(0, totalBruto - descontoPontos - descontoCupom);
        setValorFinal(valorCalculado);
    }, [totalBruto, descontoCalculado, cupomAplicado]);

    const handleAplicarPontos = async (quantidadeDesejada?: number) => {

        const valorParaAplicar = quantidadeDesejada ?? (parseInt(String(pontosUsadosDraft || '0'), 10) || 0);

        const totalBrutoLocal = (Number(totalPrice) || 0) + (Number(totalProdutosCarrinho) || 0);
        const tetoDescontoReaisLocal = totalBrutoLocal * (Number(settings?.limite_desconto_percentual || 100) / 100);
        const limiteMaximoPontosLocal = Math.min(
            Math.floor(Number(pontosDisponiveis) || 0),
            Math.floor(tetoDescontoReaisLocal * (Number(taxaConversao) || 0))
        );

        const pontosFinais = Math.max(0, Math.min(valorParaAplicar, limiteMaximoPontosLocal));

        const deltaPontos = pontosFinais - (Number(pontosUsados) || 0);

        setPontosUsados(pontosFinais);
        setPontosUsadosDraft(String(pontosFinais));

        setPontosDisponiveis((prev) => {
            const next = (Number(prev) || 0) - deltaPontos;
            const clamped = Math.max(0, next);
            return clamped;
        });

        const descontoAplicado = pontosFinais / taxaConversao;
        setDescontoCalculado(descontoAplicado);

        const descontoCupom = cupomAplicado?.desconto_calculado || 0;
        setValorFinal(Math.max(0, totalBrutoLocal - descontoAplicado - descontoCupom));


        try {
            const response = await fetchSaldoPontos();
            if (response && typeof (response as any).pontos_disponiveis !== 'undefined') {
                setPontosDisponiveis((response as any).pontos_disponiveis || 0);
                setPodeUsarPontos((response as any).pode_usar_pontos || false);
            }
        } catch (err) {
        }
    };

    const totalPago = useMemo(() => {
        return pagamentos.reduce((sum, p) => {
            const v = parseFloat(String(p.valor || '0').replace(',', '.')) || 0;
            return sum + v;
        }, 0);
    }, [pagamentos]);

    const restantePagamento = useMemo(() => {
        const total = valorFinal;
        return Number((total - totalPago).toFixed(2));
    }, [valorFinal, totalPago]);

    useEffect(() => {
        if (!isConcluido) return;
        if (!pagamentos || pagamentos.length !== 1) return;
        if (!Number.isFinite(valorFinal) || valorFinal < 0) return;

        const first = pagamentos[0];
        if (!first) return;

        const currentValue = parseFloat(String(first.valor || '0').replace(',', '.')) || 0;
        const desiredValue = Number((valorFinal || 0).toFixed(2));

        if (Math.abs(currentValue - desiredValue) < 0.005) return;

        setPagamentos((prev) =>
            prev.length === 1
                ? [{ ...prev[0], valor: desiredValue.toFixed(2) }]
                : prev
        );
    }, [isConcluido, pagamentos, valorFinal]);

    const podeConcluirFinanceiro = useMemo(() => {
        if (!isConcluido) return true;
        return Math.abs((totalPago || 0) - (valorFinal || 0)) < 0.01;
    }, [isConcluido, totalPago, valorFinal]);

    // ✅ NOVO: Função para validar cupom
    const handleValidarCupom = async () => {
        if (!cupomCodigo.trim() || !effectiveLocationId) return;
        setIsValidatingCupom(true);
        setCupomErro(null);

        try {
            const response = await fetch(`${API_BASE_URL}/public/cupons/validar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    codigo: cupomCodigo.trim().toUpperCase(),
                    cliente_id: clienteId || selectedClient?.id || null,
                    valor_pedido: totalBruto,
                    unidade_id: parseInt(effectiveLocationId),
                    servico_ids: selectedServices
                })
            });

            const data = await response.json();

            if (data.success && data.valido) {
                setCupomAplicado({
                    codigo: cupomCodigo.trim().toUpperCase(),
                    tipo_desconto: data.cupom.tipo_desconto,
                    valor_desconto: parseFloat(data.cupom.valor_desconto),
                    desconto_calculado: data.desconto.valor_desconto,
                    cupom_id: data.cupom.id
                });
                setCupomErro(null);
                toast.success('Cupom Aplicado!', `Desconto de R$ ${data.desconto.valor_desconto.toFixed(2).replace('.', ',')} aplicado.`);
            } else {
                setCupomErro(data.error || 'Cupom inválido');
                setCupomAplicado(null);
            }
        } catch (error) {
            setCupomErro('Erro ao validar cupom. Tente novamente.');
            setCupomAplicado(null);
        } finally {
            setIsValidatingCupom(false);
        }
    };

    // ✅ NOVO: Função para remover cupom
    const handleRemoverCupom = () => {
        setCupomAplicado(null);
        setCupomCodigo('');
        setCupomErro(null);
    };

    const handleDateTimeSelect = (selectedDateTime: { date: Date, time: string }) => {

        if (!selectedDateTime) {
            return;
        }

        const { date: selectedDate, time: selectedTime } = selectedDateTime;

        if (!selectedDate) {
            return;
        }

        if (!selectedTime) {
            return;
        }

        setDate(`${String(selectedDate.getDate()).padStart(2, '0')}/${String(selectedDate.getMonth() + 1).padStart(2, '0')}/${selectedDate.getFullYear()}`);
        setStartTime(selectedTime);
    };

    const handleModalContentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const selectedDateISO = useMemo(() => {
        if (!date) return null;
        const parts = date.split('/');
        if (parts.length !== 3) return null;
        const [dia, mes, ano] = parts;
        if (!dia || !mes || !ano) return null;
        return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }, [date]);

    const todayStr = new Date().toISOString().split('T')[0];
    const isHoje = Boolean(selectedDateISO && selectedDateISO === todayStr);

    const modalTitle = (() => {
        if (!isEditing) return 'Novo Agendamento';
        if (appointmentId && isHoje) return `Comanda #${appointmentId}`;
        return 'Editar Agendamento';
    })();

    const submitButtonText = (() => {
        if (!isEditing) return 'Criar Agendamento';
        if (isAgentRole) return 'Salvar Comanda';
        if (status === 'Concluído') return 'Cobrar e Fechar Comanda';
        return 'Salvar Alterações';
    })();

    const handleSelectClient = async (client: InternalCliente) => {
        setSelectedClient(client);
        setClientFirstName(client.primeiro_nome);
        setClientLastName(client.ultimo_nome);
        setClientPhone(client.telefone.replace('+55', '').trim());
        setIsSearchingClient(false);
        setClientSearchQuery('');

        // Reset do estado do Clube ao trocar cliente
        setAssinaturaInfo(null);
        setUsarCotaAssinatura(false);
        
        // ✅ NOVO: Armazenar ID do cliente e buscar pontos
        setClienteId(client.id);
        setPontosUsadosDraft('0');
        
        if (pontosAtivo && selectedLocationId) {
            try {
                const token = localStorage.getItem('authToken');
                const response = await fetch(
                    `${API_BASE_URL}/clientes/${client.id}/pontos?unidade_id=${selectedLocationId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    setPontosDisponiveis(data.pontos_disponiveis || 0);
                    setPodeUsarPontos(data.pode_usar_pontos || false);
                }
            } catch (error) {
                // Erro ao buscar pontos do cliente
            }
        }
    }

    const handleCreateNewClient = async () => {
        const nomeCompleto = clientSearchQuery.trim();
        const nomePartes = nomeCompleto.split(' ');
        const primeiroNome = nomePartes[0] || '';
        const ultimoNome = nomePartes.slice(1).join(' ') || '';

        // Preencher os campos do formulário com os dados do novo cliente
        setClientFirstName(primeiroNome);
        setClientLastName(ultimoNome);
        setClientPhone(''); // Usuário precisará inserir o telefone
        setIsSearchingClient(false);
        setClientSearchQuery('');
        setSelectedClient(null); // Indica que é um novo cliente

        setPontosUsadosDraft('0');
    }

    const handleSubmit = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            // Validações básicas
            if (!selectedAgentId) {
                toast.warning('Campo Obrigatório', 'Por favor, selecione um agente.');
                return;
            }

            if (selectedServices.length === 0) {
                toast.warning('Campo Obrigatório', 'Por favor, selecione pelo menos um serviço.');
                return;
            }

            if (!date || !startTime) {
                toast.warning('Campos Obrigatórios', 'Por favor, preencha a data e horário.');
                return;
            }

            if (!clientFirstName.trim() || !clientPhone.trim()) {
                toast.warning('Dados do Cliente', 'Por favor, preencha o nome e telefone do cliente.');
                return;
            }

            // Converter data do formato DD/MM/AAAA para AAAA-MM-DD
            const derivedSelectedDateISO = selectedDateISO;

            // ✅ CORREÇÃO CRÍTICA: Usar effectiveLocationId (selectedLocationId OU manualSelectedLocationId)
            if (!effectiveLocationId) {
                toast.error('Local Não Selecionado', 'Por favor, selecione um local.');
                return;
            }

            // Validar se endTime foi calculado
            if (!endTime) {
                toast.error('Erro de Cálculo', 'Horário de fim não foi calculado. Verifique os serviços selecionados.');
                return;
            }

            // ✅ REGRA DE NEGÓCIO (FINANCEIRO): somente ADMIN/MASTER conclui e lança pagamento via Drawer
            if (isEditing && isConcluido && isAdminFinanceRole) {
                const pagamentosValidos = pagamentos
                    .map((p) => ({ metodo: String(p.metodo || '').trim(), valor: toNumber(p.valor) }))
                    .filter((p) => p.metodo && Number.isFinite(p.valor) && p.valor > 0);

                if (pagamentosValidos.length === 0) {
                    toast.warning('Pagamento Obrigatório', 'Para finalizar como Concluído, adicione pelo menos 1 pagamento.');
                    return;
                }

                if (!podeConcluirFinanceiro) {
                    toast.warning('Pagamento incompleto', 'A soma dos pagamentos precisa ser igual ao total para concluir.');
                    return;
                }

                // ✅ FASE 3: Blindagem final de pontos antes do fechamento da comanda
                // Se o atendente digitar acima do permitido, forçar o teto antes do payload.
                if (pontosUsados > limiteMaximoPontos) {
                    setPontosUsados(limiteMaximoPontos);
                    setPontosUsadosDraft(String(limiteMaximoPontos));
                }
            }

            const agendamentoData = {
                agente_id: selectedAgentId,
                servico_ids: selectedServices,
                servico_extra_ids: selectedExtras,
                data_agendamento: derivedSelectedDateISO,
                hora_inicio: startTime,
                hora_fim: endTime,
                unidade_id: parseInt(effectiveLocationId),
                observacoes: observacoes.trim() || '',
                ...(usarCotaAssinatura && hasCoberturaDisponivel && isAssinaturaLiberada
                    ? { usar_assinatura_itens: { servico_ids: coberturaSugerida.servico_ids, servico_extra_ids: coberturaSugerida.servico_extra_ids } }
                    : {}),
                ...(repeatAppointment
                    ? {
                        recorrencia: {
                            frequency: repeatFrequency,
                            range: { mode: 'count', count: repeatCount }
                        }
                    }
                    : {}),
                ...(selectedClient
                    ? { cliente_id: selectedClient.id }
                    : {
                        cliente_nome: `${clientFirstName.trim()} ${clientLastName.trim()}`.trim(),
                        cliente_telefone: `+55${clientPhone.replace(/\D/g, '')}`
                    }
                )
            };

            if (isEditing && appointmentId) {

                const formaPagamentoFinal = pagamentos.length > 1 ? 'Split' : (pagamentos?.[0]?.metodo || paymentMethod);

                const pontosUsadosParaPayload = Math.max(0, Math.min(pontosUsados, limiteMaximoPontos));

                const updateData = {
                    agente_id: selectedAgentId,
                    servico_ids: selectedServices,
                    servico_extra_ids: selectedExtras,
                    data_agendamento: derivedSelectedDateISO,
                    hora_inicio: startTime,
                    hora_fim: endTime,
                    status: isAgentRole ? 'Aprovado' : status,
                    pontos_usados: isConcluido ? (Number(pontosUsados) || 0) : 0,
                    forma_pagamento: (isAdminFinanceRole && isConcluido) ? formaPagamentoFinal : undefined,
                    pagamentos: (isAdminFinanceRole && isConcluido) ? pagamentos.map(p => ({ metodo: p.metodo, valor: parseFloat(String(p.valor || '0').replace(',', '.')) || 0 })).filter(p => p.metodo && p.valor > 0) : undefined,
                    produtos_vendidos: produtosCarrinho.map(p => ({ produto_id: p.produto_id, quantidade: parseFloat(String(p.quantidade || '0').replace(',', '.')) || 0, preco_aplicado: parseFloat(String(p.preco_aplicado || '0').replace(',', '.')) || 0, agente_id: p.agente_id ? parseInt(p.agente_id) : null })),
                    observacoes: observacoes.trim() || '',
                    usar_assinatura_itens: (usarCotaAssinatura && hasCoberturaDisponivel && isAssinaturaLiberada) ? { servico_ids: coberturaSugerida.servico_ids, servico_extra_ids: coberturaSugerida.servico_extra_ids } : undefined,
                    cupom_id: (isAdminFinanceRole && isConcluido && cupomAplicado) ? cupomAplicado.cupom_id : undefined,
                    desconto_cupom: (isAdminFinanceRole && isConcluido && cupomAplicado) ? cupomAplicado.desconto_calculado : undefined,
                    cliente_id: selectedClient?.id || clienteId || undefined,
                    cliente_nome: !selectedClient ? `${clientFirstName.trim()} ${clientLastName.trim()}`.trim() : undefined,
                    cliente_telefone: !selectedClient ? ('+55' + clientPhone.replace(/\D/g, '')) : undefined
                };

                console.log('📦 [PAYLOAD FINAL]:', updateData);
                
                try {
                    const resultado = await updateAgendamento(appointmentId, updateData);

                    if (resultado) {
                        if (isAdminFinanceRole && isConcluido) {
                            await fetchSaldoPontos();
                        }
                        toast.success('Agendamento Atualizado!', 'As alterações foram salvas com sucesso.');
                        onClose();
                        // ✅ NOVO: Chamar callback de sucesso para atualizar dados
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        throw new Error('Resposta vazia do servidor');
                    }
                } catch (updateError) {
                    throw updateError;
                }
            } else {
                const resultado = await createAgendamento(agendamentoData);

                if (resultado && resultado.success) {
                    toast.success('Agendamento Criado!', 'O agendamento foi criado com sucesso.');
                    onClose();
                    // ✅ NOVO: Chamar callback de sucesso para atualizar dados
                    if (onSuccess) {
                        onSuccess();
                    }
                } else {
                    throw new Error(resultado?.message || 'Erro ao criar agendamento');
                }
            }
        } catch (error) {
            const anyErr = error as any;

            if (anyErr && (anyErr.code === 'SALDO_INSUFICIENTE' || anyErr?.data?.code === 'SALDO_INSUFICIENTE')) {
                const produtoId = Number(anyErr?.produto_id ?? anyErr?.data?.produto_id);
                const produtoNome = Number.isFinite(produtoId)
                    ? (produtosCarrinho.find((p) => Number(p.produto_id) === produtoId)?.nome || `Produto ${produtoId}`)
                    : 'Produto';

                toast.error('Saldo insuficiente no estoque', `Erro: ${produtoNome} não possui saldo suficiente no estoque para realizar esta venda.`);
                return;
            }

            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            toast.error('Erro ao Salvar', `Não foi possível salvar o agendamento: ${errorMessage}`);
        } finally {
            setIsSubmitting(false);
        }
    }

    const renderClientContent = () => {
        if (isSearchingClient) {
            return (
                <div>
                    <div className="relative mb-4">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Comece a digitar para pesquisar..."
                            value={clientSearchQuery}
                            onChange={(e) => setClientSearchQuery(e.target.value)}
                            className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pl-10 pr-24 focus:ring-blue-500 focus:border-blue-500"
                        />
                         <button 
                            onClick={() => { setIsSearchingClient(false); setClientSearchQuery(''); }}
                            className="absolute inset-y-0 right-0 px-3 text-sm font-semibold text-red-600 hover:text-red-800"
                        >
                            x cancelar
                        </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                        {filteredClients.length > 0 ? (
                            filteredClients.map(client => (
                                <div
                                    key={client.id}
                                    onClick={() => handleSelectClient(client)}
                                    className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-200"
                                >
                                    <p className="font-bold text-gray-800">{client.nome_completo}</p>
                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span>ID: {client.id}</span>
                                        <span>Telefone: {client.telefone}</span>
                                        {client.is_assinante && <span className="text-green-600">✓ Assinante</span>}
                                    </div>
                                </div>
                            ))
                        ) : clientSearchQuery.trim().length >= 2 ? (
                            <div className="p-4 text-center">
                                <p className="text-gray-500 mb-3">Nenhum cliente encontrado para "{clientSearchQuery}"</p>
                                <button
                                    onClick={() => handleCreateNewClient()}
                                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Criar Novo Cliente
                                </button>
                            </div>
                        ) : (
                            <div className="p-4 text-center text-gray-500">
                                Digite pelo menos 2 caracteres para buscar
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Primeiro Nome">
                        <Input placeholder="Primeiro Nome" value={clientFirstName} onChange={e => setClientFirstName(e.target.value)} />
                    </FormField>
                    <FormField label="Último Nome">
                        <Input placeholder="Último Nome" value={clientLastName} onChange={e => setClientLastName(e.target.value)} />
                    </FormField>
                </div>
                <FormField label="Número De Telefone">
                    <div className="flex items-center w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg focus-within:ring-blue-500 focus-within:border-blue-500">
                        <span className="pl-3 pr-2 text-lg">🇧🇷</span>
                        <span className="text-gray-600 pr-2">+55</span>
                        <input 
                            type="tel" 
                            placeholder="11 96123-4567" 
                            className="w-full bg-transparent p-2.5 focus:outline-none placeholder-gray-400"
                            value={clientPhone}
                            onChange={e => setClientPhone(e.target.value)}
                         />
                    </div>
                </FormField>
            </div>
        );
    };

    if (!isOpen || !portalRoot) return null;

    return createPortal(
        <>
            <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose} aria-labelledby="modal-title" role="dialog" aria-modal="true">
                <div 
                    className="relative flex w-full max-w-2xl flex-col bg-gray-50 shadow-xl transform transition-transform duration-300 ease-in-out" 
                    onClick={handleModalContentClick}
                    style={{ animation: 'slideInFromRight 0.3s forwards' }}
                >
                    <style>{`
                        @keyframes slideInFromRight {
                            from { transform: translateX(100%); }
                            to { transform: translateX(0); }
                        }
                    `}</style>
                    
                    <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white flex-shrink-0">
                        <h2 className="text-xl font-bold text-gray-800" id="modal-title">{modalTitle}</h2>
                        <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Loading Indicator */}
                        {(isLoadingAppointment || isLoadingFromProp) && (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                                <span className="ml-3 text-gray-600 font-medium">Carregando detalhes do agendamento...</span>
                            </div>
                        )}

                        {/* Service Section */}
                        {!isLoadingAppointment && !isLoadingFromProp && (
                        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
                            {/* ✅ NOVO: Seletor de Local (apenas quando modal aberto sem contexto) */}
                            {!selectedLocationId && units.length > 0 && (
                                <FormField label="Selecione o Local">
                                    <Select
                                        value={manualSelectedLocationId || ''}
                                        onChange={e => setManualSelectedLocationId(e.target.value || null)}
                                    >
                                        <option value="">Escolha um local...</option>
                                        {units.map(unit => (
                                            <option key={unit.id} value={unit.id.toString()}>
                                                {unit.nome}
                                            </option>
                                        ))}
                                    </Select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Selecione o local onde o agendamento será realizado
                                    </p>
                                </FormField>
                            )}

                            <ServiceMultiSelectDropdown
                                label="Escolha Do Serviço"
                                options={allServices}
                                selectedOptions={selectedServices}
                                onChange={setSelectedServices}
                                placeholder="Selecione um ou mais serviços..."
                            />
                            <ExtraMultiSelectDropdown
                                label="Serviço Extra"
                                options={allExtras}
                                selectedOptions={selectedExtras}
                                onChange={setSelectedExtras}
                                placeholder="Clique para selecionar..."
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="Equipe" className={!isEditing ? 'md:col-span-2' : ''}>
                                    <Select
                                        value={selectedAgentId || ''}
                                        onChange={e => setSelectedAgentId(e.target.value ? parseInt(e.target.value) : null)}
                                        disabled={user?.role === 'AGENTE' || (!isEditing && !effectiveLocationId)} // ✅ exigir local na criação
                                    >
                                        <option value="">Selecione um agente...</option>
                                        {/* ✅ CORREÇÃO: Usar filteredAgents ao invés de allAgents */}
                                        {filteredAgents.map(agente => (
                                            <option key={agente.id} value={agente.id}>{agente.nome}</option>
                                        ))}
                                    </Select>
                                    {user?.role === 'AGENTE' && (
                                        <p className="text-xs text-gray-500 mt-1">Você só pode criar agendamentos para si mesmo</p>
                                    )}
                                </FormField>
                                {isEditing && !isAgentRole && (
                                    <FormField label="Estado">
                                        <Select value={status} onChange={e => setStatus(e.target.value as AppointmentStatus)}>
                                            <option value="Aprovado">Aprovado</option>
                                            <option value="Concluído">Concluído</option>
                                            <option value="Cancelado">Cancelado</option>
                                            <option value="Não Compareceu">Não Compareceu</option>
                                        </Select>
                                    </FormField>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                <FormField label="Data De Início">
                                    <Input value={date} onChange={e => setDate(e.target.value)} placeholder="DD/MM/AAAA" />
                                </FormField>
                                <button
                                    type="button"
                                    onClick={() => setAvailabilityModalOpen(true)}
                                    className="flex items-center justify-center bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors h-[44px] disabled:bg-blue-400 disabled:cursor-not-allowed"
                                    disabled={!selectedAgentId}
                                >
                                    <Calendar className="h-5 w-5 mr-2" />
                                    Mostrar Calendário
                                </button>
                            </div>

                            {/* ✅ FASE 4: Recorrência */}
                            {!isEditing && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label>Repetir agendamento?</Label>
                                            <p className="text-xs text-gray-500">Cria uma série de agendamentos com o mesmo horário e serviços</p>
                                        </div>
                                        <Toggle
                                            checked={repeatAppointment}
                                            onChange={(checked) => {
                                                setRepeatAppointment(checked);
                                                if (!checked) {
                                                    setRepeatFrequency('weekly');
                                                    setRepeatCount(2);
                                                }
                                            }}
                                        />
                                    </div>

                                    {repeatAppointment && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField label="Frequência">
                                                <Select
                                                    value={repeatFrequency}
                                                    onChange={(e) => setRepeatFrequency(e.target.value as 'weekly' | 'biweekly')}
                                                >
                                                    <option value="weekly">Semanal</option>
                                                    <option value="biweekly">Quinzenal</option>
                                                </Select>
                                            </FormField>
                                            <FormField label="Quantidade">
                                                <Select
                                                    value={repeatCount}
                                                    onChange={(e) => setRepeatCount(parseInt(e.target.value, 10))}
                                                >
                                                    {Array.from({ length: 11 }, (_, idx) => idx + 2).map((n) => (
                                                        <option key={n} value={n}>{n} vezes</option>
                                                    ))}
                                                </Select>
                                            </FormField>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Hora De Início">
                                    {availableTimeSlots.length > 0 ? (
                                        <Select value={startTime} onChange={e => setStartTime(e.target.value)}>
                                            <option value="">Selecione um horário...</option>
                                            {availableTimeSlots.map(slot => (
                                                <option key={slot} value={slot}>{slot}</option>
                                            ))}
                                        </Select>
                                    ) : (
                                        <Input
                                            type="text"
                                            value={startTime}
                                            onChange={e => setStartTime(e.target.value)}
                                            placeholder="Selecione agente e data primeiro"
                                            disabled={!selectedAgentId || !date}
                                        />
                                    )}
                                </FormField>
                                <FormField label="Horário de Fim">
                                    <Input type="text" value={endTime} onChange={e => setEndTime(e.target.value)} placeholder="HH:MM" readOnly />
                                </FormField>
                            </div>
                        </div>
                        )}

                        {/* Client Section */}
                        {!isLoadingAppointment && !isLoadingFromProp && (
                        <FormSection
                            title="Cliente"
                            actions={!isSearchingClient && (
                                <button onClick={() => setIsSearchingClient(true)} className="flex items-center text-sm font-semibold text-gray-600 hover:text-gray-800">
                                    <Search className="h-4 w-4 mr-1.5" />
                                    Encontrar
                                </button>
                            )}
                        >
                           {renderClientContent()}

                           {/* ✅ ETAPA 3 (CLUBE): Área contextual de assinatura */}
                           {selectedClient && (
                               <div className="mt-4">
                                   {assinaturaBloqueada ? (
                                       <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                                           Plano bloqueado por pendência financeira
                                       </div>
                                   ) : isLoadingAssinaturaSaldo ? (
                                       <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
                                           Verificando saldo do Clube...
                                       </div>
                                   ) : Boolean((selectedClient as any)?.is_assinante) && Boolean(assinaturaInfo) && !isAssinaturaLiberada ? (
                                       <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                                           Plano bloqueado por pendência financeira
                                       </div>
                                   ) : hasCoberturaDisponivel ? (
                                       <div className="bg-[#F0F6FF] border border-blue-200 rounded-lg p-3">
                                           <div className="flex items-center justify-between gap-4">
                                               <div>
                                                   <div className="text-sm font-semibold text-gray-800">Clube disponível</div>
                                                   <div className="text-xs text-gray-600">Itens cobertos serão zerados automaticamente</div>
                                               </div>
                                               <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
                                                   <input
                                                       type="checkbox"
                                                       checked={usarCotaAssinatura}
                                                       onChange={(e) => setUsarCotaAssinatura(e.target.checked)}
                                                       className="h-4 w-4"
                                                   />
                                                   Consumir cota
                                               </label>
                                           </div>
                                       </div>
                                   ) : (
                                       <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
                                           Clube: sem cobertura disponível para os itens selecionados.
                                       </div>
                                   )}
                               </div>
                           )}
                        </FormSection>
                        )}

                        {/* Payment/Checkout Section - Only shows on edit */}
                        {!isLoadingAppointment && !isLoadingFromProp && isEditing && (
                            <FormSection title="Finalizar Agendamento">
                                <div className="space-y-4">
                                     <div className="text-sm space-y-2 text-gray-600 p-3 bg-gray-50 rounded-lg">
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Cliente:</span> <span>{clientFirstName} {clientLastName}</span></div>
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Agente:</span> <span>{allAgents.find(a => a.id === selectedAgentId)?.nome || 'N/A'}</span></div>
                                        <div className="flex justify-between"><span className="font-medium text-gray-500">Serviços:</span> <span className="text-right">{selectedServices.map(id => allServices.find(s => s.id === id)?.nome).filter(Boolean).join(', ')}</span></div>
                                        {selectedExtras.length > 0 && <div className="flex justify-between"><span className="font-medium text-gray-500">Extras:</span> <span>{selectedExtras.map(id => allExtras.find(e => e.id === id)?.nome).filter(Boolean).join(', ')}</span></div>}
                                    </div>
                                    
                                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
                                        <div className="flex justify-between items-center text-sm text-gray-700">
                                            <p className="font-semibold">Subtotal Serviços</p>
                                            <p>R$ {totalPrice.toFixed(2).replace('.', ',')}</p>
                                        </div>
                                        <div className="flex justify-between items-center text-sm text-gray-700">
                                            <p className="font-semibold">Subtotal Produtos</p>
                                            <p>R$ {totalProdutosCarrinho.toFixed(2).replace('.', ',')}</p>
                                        </div>
                                        <div className="pt-2 border-t border-gray-200 flex justify-between items-center font-bold text-gray-900 text-lg">
                                            <p>Total</p>
                                            <p>R$ {totalBruto.toFixed(2).replace('.', ',')}</p>
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-200 my-3"></div>

                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Produtos (PDV)</h4>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                            <FormField label="Produto">
                                                <Select value={produtoSelecionadoId} onChange={(e) => setProdutoSelecionadoId(e.target.value)}>
                                                    <option value="">Selecione...</option>
                                                    {produtos.map((p) => (
                                                        <option key={p.id} value={String(p.id)}>
                                                            {p.nome}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </FormField>
                                            <div className="md:col-span-2">
                                                <button
                                                    type="button"
                                                    onClick={handleAddProdutoToCarrinho}
                                                    disabled={!produtoSelecionadoId}
                                                    className="w-full h-[42px] bg-white border border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Adicionar ao carrinho
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-4 space-y-3">
                                            {produtosCarrinho.length === 0 ? (
                                                <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4">
                                                    Nenhum produto adicionado.
                                                </div>
                                            ) : (
                                                produtosCarrinho.map((item) => {
                                                    const lineTotal = toNumber(item.quantidade) * toNumber(item.preco_aplicado);
                                                    const quantidadeStep = String(item.unidade_medida || '').toUpperCase() === 'UN' ? '1' : '0.001';
                                                    return (
                                                        <div key={item.uid} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-semibold text-gray-800 truncate">{item.nome}</div>
                                                                    <div className="text-xs text-gray-500">Total linha: R$ {lineTotal.toFixed(2).replace('.', ',')}</div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setProdutosCarrinho((prev) => prev.filter((x) => x.uid !== item.uid))}
                                                                    className="px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50"
                                                                >
                                                                    Remover
                                                                </button>
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                                                                <FormField label="Quantidade">
                                                                    <Input
                                                                        type="number"
                                                                        step={quantidadeStep}
                                                                        min="0"
                                                                        value={item.quantidade}
                                                                        onChange={(e) =>
                                                                            setProdutosCarrinho((prev) =>
                                                                                prev.map((x) => (x.uid === item.uid ? { ...x, quantidade: e.target.value } : x))
                                                                            )
                                                                        }
                                                                    />
                                                                </FormField>

                                                                <FormField label="Preço Aplicado">
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        value={item.preco_aplicado}
                                                                        onChange={(e) =>
                                                                            setProdutosCarrinho((prev) =>
                                                                                prev.map((x) => (x.uid === item.uid ? { ...x, preco_aplicado: e.target.value } : x))
                                                                            )
                                                                        }
                                                                        onBlur={() =>
                                                                            setProdutosCarrinho((prev) =>
                                                                                prev.map((x) =>
                                                                                    x.uid === item.uid
                                                                                        ? { ...x, preco_aplicado: toMoneyFixedString(x.preco_aplicado) || '0.00' }
                                                                                        : x
                                                                                )
                                                                            )
                                                                        }
                                                                    />
                                                                </FormField>

                                                                <FormField label="Vendedor (opcional)">
                                                                    <Select
                                                                        value={item.agente_id}
                                                                        onChange={(e) =>
                                                                            setProdutosCarrinho((prev) =>
                                                                                prev.map((x) => (x.uid === item.uid ? { ...x, agente_id: e.target.value } : x))
                                                                            )
                                                                        }
                                                                    >
                                                                        <option value="">Recepção</option>
                                                                        {allAgents.map((a) => (
                                                                            <option key={a.id} value={String(a.id)}>
                                                                                {a.nome}
                                                                            </option>
                                                                        ))}
                                                                    </Select>
                                                                </FormField>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                     
                                    {isAdminFinanceRole && isConcluido && (
                                        <>
                                            {/* ✅ NOVO: Cupom de Desconto */}
                                            <div className="border-t border-gray-200 my-3"></div>

                                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                                                <h4 className="text-sm font-semibold text-gray-700 mb-3">Cupom de Desconto</h4>

                                                {!cupomAplicado ? (
                                                    <div className="space-y-2">
                                                        <div className="flex gap-2">
                                                            <Input
                                                                type="text"
                                                                value={cupomCodigo}
                                                                onChange={(e) => {
                                                                    setCupomCodigo(e.target.value.toUpperCase());
                                                                    setCupomErro(null);
                                                                }}
                                                                placeholder="Digite o código do cupom"
                                                                className="flex-1 uppercase"
                                                                disabled={isValidatingCupom}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={handleValidarCupom}
                                                                disabled={isValidatingCupom || !cupomCodigo.trim()}
                                                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                                                            >
                                                                {isValidatingCupom ? 'Validando...' : 'Aplicar'}
                                                            </button>
                                                        </div>
                                                        {cupomErro && (
                                                            <p className="text-xs text-red-600 flex items-center gap-1">
                                                                <X className="w-3 h-3" />
                                                                {cupomErro}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="bg-blue-50 border border-[#2663EB] rounded-lg p-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Tag className="w-4 h-4 text-[#2663EB]" />
                                                                <div>
                                                                    <p className="text-sm font-semibold text-[#2663EB]">{cupomAplicado.codigo}</p>
                                                                    <p className="text-xs text-[#2663EB]">
                                                                        {cupomAplicado.tipo_desconto === 'percentual'
                                                                            ? `${cupomAplicado.valor_desconto}% de desconto`
                                                                            : `R$ ${cupomAplicado.valor_desconto.toFixed(2).replace('.', ',')} de desconto`
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={handleRemoverCupom}
                                                                className="p-1 hover:bg-blue-100 rounded-full transition-colors"
                                                            >
                                                                <X className="w-4 h-4 text-[#2663EB]" />
                                                            </button>
                                                        </div>
                                                        <div className="mt-2 pt-2 border-t border-[#2663EB]/30">
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-[#2663EB]">Desconto do cupom:</span>
                                                                <span className="font-bold text-[#2663EB]">- R$ {cupomAplicado.desconto_calculado.toFixed(2).replace('.', ',')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* ✅ NOVO: Clube de Pontos */}
                                            {(
                                                <>
                                                    <div className="border-t border-gray-200 my-3"></div>
                                                    <div className={`${pontosAtivo && podeUsarPontos ? 'bg-[#F0F6FF] border-blue-200' : 'bg-gray-50 border-gray-300'} border rounded-lg p-4 space-y-3`}>
                                                        <h4 className="text-sm font-semibold text-gray-700">Clube de Pontos</h4>

                                                        {(!settings || isLoadingPontos) && (
                                                            <div className="text-xs text-gray-500">
                                                                Carregando pontos...
                                                            </div>
                                                        )}

                                                        {!!settings && settings?.pontos_ativo === false && (
                                                            <div className="text-xs text-gray-500">
                                                                Sistema de pontos inativo nesta unidade.
                                                            </div>
                                                        )}

                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm font-medium text-gray-700">Saldo do cliente</span>
                                                            <div className="text-right">
                                                                <span className={`text-lg font-bold ${pontosAtivo && podeUsarPontos ? 'text-blue-600' : 'text-gray-500'}`}>{Math.floor(pontosDisponiveis)} pts</span>
                                                                {pontosUsados > 0 && (
                                                                    <span className="text-xs text-blue-600 block">
                                                                        (Saldo após uso: {saldoEstimado} pts)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {pontosAtivo && pontosDisponiveis > 0 && (
                                                            <div className="text-xs text-gray-500">
                                                                Equivale a R$ {(Math.floor(pontosDisponiveis) / (Number(reaisPorPontos) || 1)).toFixed(2).replace('.', ',')} de desconto
                                                            </div>
                                                        )}

                                                        {pontosAtivo && !podeUsarPontos && (
                                                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700">
                                                                Pontos só podem ser usados a partir do segundo agendamento. Continue acumulando!
                                                            </div>
                                                        )}

                                                        {pontosDisponiveis > 0 && (
                                                            <FormField label="Quantos pontos deseja usar?">
                                                                <div className="flex items-center gap-2">
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        max={limiteMaximoPontos}
                                                                        value={pontosUsadosDraft}
                                                                        onChange={(e) => setPontosUsadosDraft(e.target.value)}
                                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                        placeholder="0"
                                                                        className="flex-1"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            handleAplicarPontos();
                                                                        }}
                                                                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                                                                    >
                                                                        Aplicar
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            handleAplicarPontos(Math.floor(Number(pontosDisponiveis) || 0));
                                                                        }}
                                                                        className="px-3 py-2 bg-blue-50 text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-100 whitespace-nowrap"
                                                                    >
                                                                        Usar Tudo
                                                                    </button>
                                                                </div>
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    {pontosUsados} pontos = R$ {((pontosUsados || 0) / taxaConversao).toFixed(2).replace('.', ',')} de desconto
                                                                </div>
                                                                {(parseInt(String(pontosUsadosDraft || '0'), 10) || 0) > limiteMaximoPontos && Number(settings?.limite_desconto_percentual ?? 100) < 100 && (
                                                                    <span className="text-blue-600 text-xs">
                                                                        Desconto limitado a {settings?.limite_desconto_percentual}% da comanda.
                                                                    </span>
                                                                )}
                                                            </FormField>
                                                        )}
                                                    </div>
                                                </>
                                            )}

                                            {/* ✅ NOVO: Resumo de Descontos e Valor Final */}
                                            {(pontosUsados > 0 || cupomAplicado) && (
                                                <>
                                                    <div className="border-t border-gray-200 my-3"></div>
                                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-gray-600">Valor Original:</span>
                                                            <span className="text-gray-800">R$ {totalBruto.toFixed(2).replace('.', ',')}</span>
                                                        </div>
                                                        {pontosUsados > 0 && (
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-green-600">Desconto (Pontos):</span>
                                                                <span className="text-green-600">- R$ {descontoCalculado.toFixed(2).replace('.', ',')}</span>
                                                            </div>
                                                        )}
                                                        {cupomAplicado && (
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-[#2663EB]">Desconto (Cupom):</span>
                                                                <span className="text-[#2663EB]">- R$ {cupomAplicado.desconto_calculado.toFixed(2).replace('.', ',')}</span>
                                                            </div>
                                                        )}
                                                        <div className="pt-2 border-t border-blue-300">
                                                            <div className="flex justify-between text-lg font-bold">
                                                                <span className="text-gray-800">Valor Final:</span>
                                                                <span className="text-blue-600">R$ {valorFinal.toFixed(2).replace('.', ',')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            <div className="border-t border-gray-200 my-3"></div>

                                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-semibold text-gray-700">Pagamentos</h4>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPagamentos((prev) => [
                                                                ...prev,
                                                                {
                                                                    uid: `pay-${Date.now()}-${Math.random()}`,
                                                                    metodo: 'PIX',
                                                                    valor: restantePagamento > 0 ? restantePagamento.toFixed(2) : ''
                                                                }
                                                            ])
                                                        }
                                                        className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                                                    >
                                                        + Adicionar
                                                    </button>
                                                </div>

                                                <div className="space-y-3">
                                                    {pagamentos.map((p) => (
                                                        <div key={p.uid} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                                            <div className="sm:col-span-6">
                                                                <FormField label="Método">
                                                                    <Select
                                                                        value={p.metodo}
                                                                        onChange={(e) =>
                                                                            setPagamentos((prev) =>
                                                                                prev.map((x) => (x.uid === p.uid ? { ...x, metodo: e.target.value } : x))
                                                                            )
                                                                        }
                                                                    >
                                                                        <option value="PIX">PIX</option>
                                                                        <option value="Cartão Crédito">Cartão de Crédito</option>
                                                                        <option value="Cartão Débito">Cartão de Débito</option>
                                                                        <option value="Dinheiro">Dinheiro</option>
                                                                    </Select>
                                                                </FormField>
                                                            </div>

                                                            <div className="sm:col-span-4">
                                                                <FormField label="Valor">
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        value={p.valor}
                                                                        onChange={(e) =>
                                                                            setPagamentos((prev) =>
                                                                                prev.map((x) => (x.uid === p.uid ? { ...x, valor: e.target.value } : x))
                                                                            )
                                                                        }
                                                                        onBlur={() =>
                                                                            setPagamentos((prev) =>
                                                                                prev.map((x) =>
                                                                                    x.uid === p.uid
                                                                                        ? { ...x, valor: toMoneyFixedString(x.valor) }
                                                                                        : x
                                                                                )
                                                                            )
                                                                        }
                                                                    />
                                                                </FormField>
                                                            </div>

                                                            <div className="sm:col-span-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPagamentos((prev) => prev.filter((x) => x.uid !== p.uid))}
                                                                    disabled={pagamentos.length === 1}
                                                                    className="w-full h-[42px] bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    Remover
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mt-4 pt-4 border-t border-gray-200">
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                                                        <div className="flex items-center justify-between sm:block">
                                                            <div className="text-gray-600">Total</div>
                                                            <div className="font-semibold text-gray-900">R$ {valorFinal.toFixed(2).replace('.', ',')}</div>
                                                        </div>
                                                        <div className="flex items-center justify-between sm:block">
                                                            <div className="text-gray-600">Pago</div>
                                                            <div className="font-semibold text-gray-900">R$ {totalPago.toFixed(2).replace('.', ',')}</div>
                                                        </div>
                                                        <div className="flex items-center justify-between sm:block">
                                                            <div className="text-gray-600">Restante</div>
                                                            <div className={`font-semibold ${restantePagamento === 0 ? 'text-green-700' : restantePagamento > 0 ? 'text-yellow-700' : 'text-red-700'}`}>
                                                                R$ {restantePagamento.toFixed(2).replace('.', ',')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    
                                    <FormField label="Observações">
                                        <textarea
                                            value={observacoes}
                                            onChange={e => setObservacoes(e.target.value)}
                                            placeholder="Adicione observações sobre o serviço realizado (ex: produtos utilizados, procedimentos específicos, etc.)"
                                            className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 min-h-[100px] resize-y"
                                            rows={4}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Essas observações ficarão registradas no histórico do agendamento
                                        </p>
                                    </FormField>
                                </div>
                            </FormSection>
                        )}
                    </div>

                    <div className="p-6 border-t border-gray-200 bg-white flex-shrink-0">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors text-base disabled:bg-blue-400 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Salvando...' : submitButtonText}
                        </button>
                    </div>
                </div>
            </div>
            <AvailabilityModal
                isOpen={isAvailabilityModalOpen}
                onClose={() => setAvailabilityModalOpen(false)}
                onSelect={handleDateTimeSelect}
                agentName={filteredAgents.find(a => a.id === selectedAgentId)?.nome || ''}
                agentId={selectedAgentId} // ✅ PASSAR ID DO AGENTE PARA BUSCAR DISPONIBILIDADE REAL
                unidadeId={effectiveLocationId ? parseInt(effectiveLocationId) : undefined} // ✅ PASSAR ID DA UNIDADE
                durationMinutes={durationMinutes}
            />
        </>
    , portalRoot);
};

export default NewAppointmentModal;

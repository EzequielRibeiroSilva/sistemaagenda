import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle, ChevronLeft, ChevronRight, Clock, FaUser, MessageSquare } from './Icons';
import { useAgentManagement } from '../hooks/useAgentManagement';
import { useToast } from '../contexts/ToastContext';
import { API_BASE_URL, getAssetUrl } from '../utils/api';
import { BaseCard, AddCard, CardInfoRow, CardStatusBadge } from './BaseCard';
import DatePicker from './DatePicker';
import { useAuth } from '../contexts/AuthContext';

// Tipo Agent do hook
interface Agent {
  id: number;
  name: string;
  phone: string;
  avatar?: string;
  status: string;
  todayHours?: string;
  reservations: number;
  availability: Array<{ day: string; available: boolean }>;
}

interface AgentCardProps {
  agent: Agent;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isConfirmingDelete?: boolean;
}

type EquipeTab = 'Membros' | 'Comissões';

interface ComissaoResumoRow {
  agente_id: number;
  agente_nome: string;
  total_pago: number;
  total_pendente: number;
}

interface ComissaoPendenteItem {
  agendamento_servico_id: number;
  agendamento_id: number;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  cliente_nome: string;
  servico_nome: string;
  preco_aplicado: number;
  comissao_percentual: number;
  comissao_valor: number;
  data_pagamento_comissao?: string | null;
  observacao_pagamento?: string | null;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onEdit, onDelete, isConfirmingDelete = false }) => {
  // Avatar do membro para o header
  const avatarContent = (
    <div className="flex items-center">
      <div className="relative w-14 h-14">
        {agent.avatar ? (
          <img
            src={getAssetUrl(agent.avatar)}
            alt={agent.name}
            className="w-14 h-14 rounded-full object-cover border-2 border-[#2663EB] shadow-sm"
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
        <div className={`w-14 h-14 rounded-full bg-gray-300 flex items-center justify-center border-2 border-[#2663EB] ${agent.avatar ? 'hidden' : ''}`}>
          <FaUser className="w-7 h-7 text-gray-600" />
        </div>
      </div>
      <div className="ml-3">
        <p className="text-sm text-gray-500">{agent.phone}</p>
      </div>
    </div>
  );

  return (
    <BaseCard
      title={agent.name}
      onEdit={() => onEdit(agent.id)}
      onDelete={() => onDelete(agent.id)}
      isConfirmingDelete={isConfirmingDelete}
      editLabel="Editar Equipe"
      showTopBar={true}
      headerContent={avatarContent}
    >
      {/* Indicadores de disponibilidade por dia */}
      <div className="flex justify-between items-center text-xs text-center text-gray-500 mb-3">
        {agent.availability.map(day => (
          <div key={day.day}>
            <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${day.available ? 'bg-green-500' : 'bg-gray-300'}`}></div>
            {day.day}
          </div>
        ))}
      </div>

      {/* Divisor */}
      <div className="border-t border-gray-100 my-2"></div>

      {/* Horários de hoje (se disponível) */}
      {agent.todayHours && agent.todayHours.trim() !== '' && (
        <CardInfoRow 
          label="Horários Hoje" 
          value={agent.todayHours}
          valueClassName="text-xs"
        />
      )}

      {/* Status */}
      <CardInfoRow 
        label="Status" 
        value={
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-green-500"></span>
            {agent.status}
          </span>
        }
      />

      {/* Reservas */}
      <CardInfoRow 
        label="Reservas" 
        value={agent.reservations.toString()}
        valueClassName="text-lg font-bold"
      />
    </BaseCard>
  );
};

const AddAgentCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <AddCard 
    onClick={onClick} 
    label="Criar Equipe" 
  />
);

interface AgentsPageProps {
  setActiveView: (view: string) => void;
  onEditAgent: (agentId: string) => void;
}

const AgentsPage: React.FC<AgentsPageProps> = ({ setActiveView, onEditAgent }) => {
    const { agents, loading, error, deleteAgent, availableUnits, adminPlan } = useAgentManagement();
    const { user, token, isAuthenticated } = useAuth();
    const toast = useToast();
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

    const [activeTab, setActiveTab] = useState<EquipeTab>('Membros');

    const [selectedLocationFilter, setSelectedLocationFilter] = useState('all');

    const defaultRange = useMemo(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { startDate: start, endDate: end };
    }, []);

    const [selectedRange, setSelectedRange] = useState<{ startDate: Date | null; endDate: Date | null }>(defaultRange);

    const formatDateYYYYMMDD = useCallback((date: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }, []);

    const formatMoney = useCallback((value: number) => {
        return `R$ ${(Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }, []);

    const isSinglePlan = adminPlan === 'Single' || availableUnits.length === 1;
    const isMultiPlan = adminPlan === 'Multi' && availableUnits.length > 1;

    useEffect(() => {
        if (availableUnits.length === 0) return;
        if (selectedLocationFilter !== 'all') return;

        let newLocationId: string | null = null;

        if (isSinglePlan) {
            newLocationId = String(availableUnits[0].id);
        } else if (isMultiPlan) {
            if (user?.unidade_id) {
                const found = availableUnits.find(u => u.id === user.unidade_id);
                if (found) newLocationId = String(found.id);
            }
            if (!newLocationId) {
                newLocationId = String(availableUnits[0].id);
            }
        }

        if (newLocationId) {
            setSelectedLocationFilter(newLocationId);
        }
    }, [availableUnits, selectedLocationFilter, isSinglePlan, isMultiPlan, user?.unidade_id]);

    const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
        if (!token || !isAuthenticated) {
            throw new Error('Token de autenticação não encontrado');
        }

        const response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...options.headers,
            },
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.message || payload?.error || `Erro HTTP ${response.status}`);
        }
        if (payload?.success === false) {
            throw new Error(payload?.message || payload?.error || 'Erro na requisição');
        }
        return payload;
    }, [token, isAuthenticated]);

    const [resumoLoading, setResumoLoading] = useState(false);
    const [resumoError, setResumoError] = useState<string | null>(null);
    const [ranking, setRanking] = useState<ComissaoResumoRow[]>([]);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(12);

    const fetchResumo = useCallback(async () => {
        if (selectedLocationFilter === 'all') return;
        if (!selectedRange.startDate || !selectedRange.endDate) return;

        try {
            setCurrentPage(1);
            setResumoLoading(true);
            setResumoError(null);

            const unidadeId = Number(selectedLocationFilter);
            const data_inicio = formatDateYYYYMMDD(selectedRange.startDate);
            const data_fim = formatDateYYYYMMDD(selectedRange.endDate);

            const result = await authenticatedFetch(`/comissoes/resumo?unidade_id=${unidadeId}&data_inicio=${data_inicio}&data_fim=${data_fim}`);
            const rows = result?.data?.ranking;
            setRanking(Array.isArray(rows) ? rows : []);
        } catch (err: any) {
            setResumoError(err?.message || 'Erro ao buscar resumo de comissões');
            setRanking([]);
        } finally {
            setResumoLoading(false);
        }
    }, [authenticatedFetch, formatDateYYYYMMDD, selectedLocationFilter, selectedRange.endDate, selectedRange.startDate]);

    const totalRankingItems = ranking.length;
    const totalPages = Math.ceil(totalRankingItems / itemsPerPage) || 1;
    const pagedRanking = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return ranking.slice(startIndex, startIndex + itemsPerPage);
    }, [currentPage, itemsPerPage, ranking]);

    useEffect(() => {
        if (activeTab !== 'Comissões') return;
        setCurrentPage(1);
    }, [activeTab, selectedLocationFilter, selectedRange.startDate, selectedRange.endDate]);

    const handlePageChange = useCallback((newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    }, [totalPages]);

    useEffect(() => {
        if (activeTab !== 'Comissões') return;
        void fetchResumo();
    }, [activeTab, fetchResumo]);

    useEffect(() => {
        if (activeTab !== 'Comissões') return;
        void fetchResumo();
    }, [activeTab, selectedLocationFilter, selectedRange.startDate, selectedRange.endDate, fetchResumo]);

    const handleLocationSelect = useCallback((locationName: string) => {
        const found = availableUnits.find(u => u.nome === locationName);
        if (found) {
            setSelectedLocationFilter(String(found.id));
        }
    }, [availableUnits]);

    const selectedLocationName = useMemo(() => {
        const found = availableUnits.find(u => String(u.id) === selectedLocationFilter);
        return found ? found.nome : 'Selecione um Local';
    }, [availableUnits, selectedLocationFilter]);

    const locationOptionsForHeaderDropdown = useMemo(() => {
        return availableUnits.map(u => u.nome);
    }, [availableUnits]);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerAgent, setDrawerAgent] = useState<ComissaoResumoRow | null>(null);
    const [drawerExtratoTab, setDrawerExtratoTab] = useState<'pendentes' | 'historico'>('pendentes');
    const [pendentesLoading, setPendentesLoading] = useState(false);
    const [pendentesError, setPendentesError] = useState<string | null>(null);
    const [pendentesItens, setPendentesItens] = useState<ComissaoPendenteItem[]>([]);
    const [pendentesTotal, setPendentesTotal] = useState<number>(0);
    const [historicoLoading, setHistoricoLoading] = useState(false);
    const [historicoError, setHistoricoError] = useState<string | null>(null);
    const [historicoItens, setHistoricoItens] = useState<ComissaoPendenteItem[]>([]);
    const [historicoFetched, setHistoricoFetched] = useState(false);
    const [pagarLoading, setPagarLoading] = useState(false);
    const [observacaoPagamento, setObservacaoPagamento] = useState('');

    const formatDateBR = useCallback((value?: string | null) => {
        if (!value) return '';
        const raw = String(value);
        const ymdMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
        const ymd = ymdMatch ? ymdMatch[0] : null;
        if (!ymd) return raw;
        const [yyyy, mm, dd] = ymd.split('-');
        if (!yyyy || !mm || !dd) return raw;
        return `${dd}/${mm}/${yyyy}`;
    }, []);

    const formatTimeHM = useCallback((value?: string | null) => {
        if (!value) return '';
        const raw = String(value);
        return raw.slice(0, 5);
    }, []);

    const formatTimeRange = useCallback((start?: string | null, end?: string | null) => {
        const s = formatTimeHM(start);
        const e = formatTimeHM(end);
        if (!s && !e) return '';
        if (!s) return e;
        if (!e) return s;
        return `${s} às ${e}`;
    }, [formatTimeHM]);

    const formatPaidAt = useCallback((value?: string | null) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);

        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = String(date.getFullYear());
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');

        return `${dd}/${mm}/${yyyy} às ${hh}:${min}`;
    }, []);

    const fetchExtrato = useCallback(async (row: ComissaoResumoRow, statusComissao: 'pendente' | 'pago') => {
        if (selectedLocationFilter === 'all') return;
        if (!selectedRange.startDate || !selectedRange.endDate) return;

        const unidadeId = Number(selectedLocationFilter);
        const data_inicio = formatDateYYYYMMDD(selectedRange.startDate);
        const data_fim = formatDateYYYYMMDD(selectedRange.endDate);

        const result = await authenticatedFetch(
            `/comissoes/pendentes?unidade_id=${unidadeId}&agente_id=${row.agente_id}&data_inicio=${data_inicio}&data_fim=${data_fim}&status_comissao=${statusComissao}`
        );

        const itens = result?.data?.itens;
        const total = result?.data?.total_pendente;

        return {
            itens: Array.isArray(itens) ? itens : [],
            total: Number(total) || 0
        };
    }, [authenticatedFetch, formatDateYYYYMMDD, selectedLocationFilter, selectedRange.endDate, selectedRange.startDate]);

    const openExtrato = useCallback(async (row: ComissaoResumoRow) => {
        if (selectedLocationFilter === 'all') {
            toast.warning('Selecione um Local', 'Selecione um local para visualizar o extrato.');
            return;
        }
        if (!selectedRange.startDate || !selectedRange.endDate) {
            toast.warning('Selecione o Período', 'Selecione um período válido para visualizar o extrato.');
            return;
        }

        setDrawerAgent(row);
        setDrawerOpen(true);
        setDrawerExtratoTab('pendentes');
        setObservacaoPagamento('');
        setPendentesLoading(true);
        setPendentesError(null);
        setPendentesItens([]);
        setPendentesTotal(0);
        setHistoricoLoading(false);
        setHistoricoError(null);
        setHistoricoItens([]);
        setHistoricoFetched(false);

        try {
            const result = await fetchExtrato(row, 'pendente');
            setPendentesItens(result?.itens || []);
            setPendentesTotal(result?.total || 0);
        } catch (err: any) {
            setPendentesError(err?.message || 'Erro ao buscar extrato pendente');
        } finally {
            setPendentesLoading(false);
        }
    }, [fetchExtrato, selectedLocationFilter, selectedRange.endDate, selectedRange.startDate, toast]);

    const closeDrawer = useCallback(() => {
        if (pagarLoading) return;
        setDrawerOpen(false);
        setDrawerAgent(null);
        setPendentesItens([]);
        setPendentesTotal(0);
        setPendentesError(null);
        setHistoricoItens([]);
        setHistoricoError(null);
        setHistoricoFetched(false);
        setDrawerExtratoTab('pendentes');
        setObservacaoPagamento('');
    }, [pagarLoading]);

    const pagarPorPeriodo = useCallback(async () => {
        if (!drawerAgent) return;
        if (selectedLocationFilter === 'all') return;
        if (!selectedRange.startDate || !selectedRange.endDate) return;

        try {
            setPagarLoading(true);
            const unidadeId = Number(selectedLocationFilter);
            const data_inicio = formatDateYYYYMMDD(selectedRange.startDate);
            const data_fim = formatDateYYYYMMDD(selectedRange.endDate);

            await authenticatedFetch('/comissoes/pagar', {
                method: 'POST',
                body: JSON.stringify({
                    unidade_id: unidadeId,
                    agente_id: drawerAgent.agente_id,
                    data_inicio,
                    data_fim,
                    observacao: observacaoPagamento
                })
            });

            toast.success('Saldo zerado!', `Comissões de "${drawerAgent.agente_nome}" foram pagas com sucesso.`);
            closeDrawer();
            await fetchResumo();
        } catch (err: any) {
            toast.error('Erro ao pagar', err?.message || 'Não foi possível efetuar o pagamento.');
        } finally {
            setPagarLoading(false);
        }
    }, [authenticatedFetch, closeDrawer, drawerAgent, fetchResumo, formatDateYYYYMMDD, observacaoPagamento, selectedLocationFilter, selectedRange.endDate, selectedRange.startDate, toast]);

    useEffect(() => {
        if (!drawerOpen) return;
        if (!drawerAgent) return;
        if (drawerExtratoTab !== 'historico') return;
        if (historicoLoading) return;
        if (historicoFetched) return;

        (async () => {
            try {
                setHistoricoLoading(true);
                setHistoricoError(null);
                const result = await fetchExtrato(drawerAgent, 'pago');
                setHistoricoItens(result?.itens || []);
            } catch (err: any) {
                setHistoricoError(err?.message || 'Erro ao buscar histórico');
            } finally {
                setHistoricoFetched(true);
                setHistoricoLoading(false);
            }
        })();
    }, [drawerAgent, drawerExtratoTab, drawerOpen, fetchExtrato, historicoFetched, historicoLoading]);

    const handleEditAgent = (agentId: number) => {
        onEditAgent(agentId.toString());
    };

    const handleDeleteAgent = async (agentId: number) => {
        const agent = agents.find(a => a.id === agentId);
        if (!agent) return;

        // Se já está confirmando este item, executar a exclusão
        if (confirmingDelete === agentId) {
            setDeleteLoading(agentId);
            setConfirmingDelete(null);

            const success = await deleteAgent(agentId);
            setDeleteLoading(null);

            if (success) {
                toast.success('Membro removido!', `"${agent.name}" foi removido com sucesso do sistema.`);
            } else {
                toast.error('Erro ao Excluir', 'Não foi possível excluir o membro. Tente novamente.');
            }
        } else {
            // Primeira vez clicando: mostrar toast de aviso e marcar para confirmação
            setConfirmingDelete(agentId);
            toast.warning('Confirme a exclusão', `Clique novamente no ícone de lixeira para confirmar a exclusão de "${agent.name}". Esta ação não pode ser desfeita.`);

            // Resetar confirmação após 5 segundos
            setTimeout(() => {
                setConfirmingDelete(null);
            }, 5000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Carregando equipe...</p>
                </div>
            </div>
        );
    }

    // Não bloquear a página inteira por erro de serviços
    // Mostrar erro como banner no topo, mas permitir uso da página

    return (
        <div className="space-y-6">
            {/* Banner de erro (não bloqueia a página) */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center">
                        <div className="text-red-500 text-xl mr-3">⚠️</div>
                        <div className="flex-1">
                            <p className="text-red-700 font-medium">Aviso</p>
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                        >
                            Recarregar
                        </button>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Equipe</h1>

                {activeTab === 'Comissões' ? (
                    <div className="flex items-center gap-4">
                        <div className="w-64 min-w-[250px]">
                            <DatePicker
                                mode="range"
                                selectedRange={selectedRange}
                                onDateChange={(range) => {
                                    const next = range as { startDate: Date | null; endDate: Date | null };
                                    setSelectedRange(next);
                                }}
                            />
                        </div>

                        <div className="w-40 min-w-[140px]">
                            <div className="relative">
                                <select
                                    value={selectedLocationName}
                                    onChange={(e) => handleLocationSelect(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                                >
                                    {locationOptionsForHeaderDropdown.length === 0 && (
                                        <option>Sem locais</option>
                                    )}
                                    {locationOptionsForHeaderDropdown.map((name) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        

                        <button
                            onClick={() => fetchResumo()}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
                            disabled={resumoLoading}
                            type="button"
                        >
                            {resumoLoading ? 'Atualizando...' : 'Atualizar'}
                        </button>
                    </div>
                ) : (
                    <div className="text-sm text-gray-600">
                        {agents.length} membro{agents.length !== 1 ? 's' : ''} encontrado{agents.length !== 1 ? 's' : ''}
                    </div>
                )}
            </div>

            <div className="flex items-center border-b border-gray-200 mb-6">
                {( ['Membros', 'Comissões'] as EquipeTab[] ).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-1 py-4 text-lg font-semibold mr-8 transition-colors duration-200 relative focus:outline-none ${
                            activeTab === tab ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
                        }`}
                        type="button"
                    >
                        {tab}
                        {activeTab === tab && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"></div>
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'Membros' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {agents.map(agent => (
                        <div key={agent.id} className={deleteLoading === agent.id ? 'opacity-50 pointer-events-none' : ''}>
                            <AgentCard
                                agent={agent}
                                onEdit={handleEditAgent}
                                onDelete={handleDeleteAgent}
                                isConfirmingDelete={confirmingDelete === agent.id}
                            />
                        </div>
                    ))}
                    <AddAgentCard onClick={() => setActiveView('agents-create')} />
                </div>
            )}

            {activeTab === 'Comissões' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-w-0 max-w-full">
                        <div className="overflow-x-auto max-w-full">
                            <table className="w-full min-w-[900px] text-sm table-fixed">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="p-3 w-[40%] text-left font-semibold text-gray-600 whitespace-nowrap">BARBEIRO</th>
                                        <th className="p-3 w-[20%] text-right font-semibold text-gray-600 whitespace-nowrap">TOTAL PAGO</th>
                                        <th className="p-3 w-[20%] text-right font-semibold text-gray-600 whitespace-nowrap">SALDO A PAGAR</th>
                                        <th className="p-3 w-[20%] text-right font-semibold text-gray-600 whitespace-nowrap">AÇÕES</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resumoLoading ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-gray-500">
                                                Carregando...
                                            </td>
                                        </tr>
                                    ) : resumoError ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-red-600">
                                                {resumoError}
                                            </td>
                                        </tr>
                                    ) : ranking.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-gray-500">
                                                Sem dados no período.
                                            </td>
                                        </tr>
                                    ) : (
                                        pagedRanking.map((row) => (
                                            <tr key={row.agente_id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors">
                                                <td className="p-3 w-[40%] font-medium text-gray-800 whitespace-nowrap">
                                                    <span className="truncate block">{row.agente_nome}</span>
                                                </td>
                                                <td className="p-3 w-[20%] text-right text-gray-900 font-medium whitespace-nowrap">{formatMoney(row.total_pago)}</td>
                                                <td className={`p-3 w-[20%] text-right whitespace-nowrap ${row.total_pendente > 0 ? 'text-red-700 font-semibold' : 'text-gray-900 font-medium'}`}>{formatMoney(row.total_pendente)}</td>
                                                <td className="p-3 w-[20%] text-right whitespace-nowrap">
                                                    <button
                                                        onClick={() => openExtrato(row)}
                                                        className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700"
                                                        type="button"
                                                    >
                                                        Ver Extrato
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {(() => {
                            const totalItems = totalRankingItems;
                            const totalPagesSafe = Math.max(1, Math.ceil(totalItems / itemsPerPage));
                            const start = totalItems === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1;
                            const end = totalItems === 0 ? 0 : Math.min(currentPage * itemsPerPage, totalItems);

                            return (
                                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                                    <div className="text-sm text-gray-700">
                                        Mostrando{' '}
                                        <span className="font-medium">{start}</span>{' '}
                                        a{' '}
                                        <span className="font-medium">{end}</span>{' '}
                                        de <span className="font-medium">{totalItems}</span> registros
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            type="button"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>

                                        <span className="text-sm text-gray-700">
                                            Página <span className="font-medium">{currentPage}</span> de{' '}
                                            <span className="font-medium">{totalPagesSafe}</span>
                                        </span>

                                        <button
                                            onClick={() => setCurrentPage((p) => Math.min(totalPagesSafe, p + 1))}
                                            disabled={currentPage === totalPagesSafe}
                                            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            type="button"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {drawerOpen && (
                        <div className="fixed inset-0 z-50">
                            <div className="fixed inset-0 bg-black/40" onClick={closeDrawer} />

                            <div className="fixed inset-y-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
                                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <div className="text-sm text-gray-500">Extrato de Comissões</div>
                                        <div className="text-lg font-semibold text-gray-800 truncate">{drawerAgent?.agente_nome || ''}</div>
                                    </div>
                                    <button
                                        onClick={closeDrawer}
                                        className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-md"
                                        type="button"
                                    >
                                        Fechar
                                    </button>
                                </div>

                                <div className="px-5 py-3 border-b border-gray-200 bg-white">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setDrawerExtratoTab('pendentes')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${drawerExtratoTab === 'pendentes' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                            disabled={pagarLoading}
                                            type="button"
                                        >
                                            Pendentes
                                        </button>
                                        <button
                                            onClick={() => setDrawerExtratoTab('historico')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${drawerExtratoTab === 'historico' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                            disabled={pagarLoading}
                                            type="button"
                                        >
                                            Histórico
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto px-5 py-4">
                                    {drawerExtratoTab === 'pendentes' && pendentesError && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                                            {pendentesError}
                                        </div>
                                    )}

                                    {drawerExtratoTab === 'pendentes' && !pendentesError && pendentesLoading && (
                                        <div className="text-sm text-gray-600">Carregando extrato...</div>
                                    )}

                                    {drawerExtratoTab === 'pendentes' && !pendentesError && !pendentesLoading && pendentesItens.length === 0 && (
                                        <div className="text-sm text-gray-600">Nenhuma comissão pendente no período.</div>
                                    )}

                                    {drawerExtratoTab === 'pendentes' && !pendentesError && !pendentesLoading && pendentesItens.length > 0 && (
                                        <div className="space-y-3">
                                            {pendentesItens.map((item) => (
                                                <div key={item.agendamento_servico_id} className="border border-gray-200 rounded-lg p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-gray-800 truncate">{item.servico_nome}</div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span>{formatDateBR(item.data_agendamento)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                                <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span>{formatTimeRange(item.hora_inicio, item.hora_fim)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 truncate">
                                                                <FaUser className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span className="truncate">Cliente: {item.cliente_nome}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-sm font-bold text-gray-900">{formatMoney(item.comissao_valor)}</div>
                                                            <div className="text-xs text-gray-500">{Number(item.comissao_percentual || 0).toFixed(2)}%</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {drawerExtratoTab === 'historico' && historicoError && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                                            {historicoError}
                                        </div>
                                    )}

                                    {drawerExtratoTab === 'historico' && !historicoError && historicoLoading && (
                                        <div className="text-sm text-gray-600">Carregando histórico...</div>
                                    )}

                                    {drawerExtratoTab === 'historico' && !historicoError && !historicoLoading && historicoItens.length === 0 && (
                                        <div className="text-sm text-gray-600">Nenhuma comissão paga no período.</div>
                                    )}

                                    {drawerExtratoTab === 'historico' && !historicoError && !historicoLoading && historicoItens.length > 0 && (
                                        <div className="space-y-3">
                                            {historicoItens.map((item) => (
                                                <div key={item.agendamento_servico_id} className="border border-gray-200 rounded-lg p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-gray-800 truncate">{item.servico_nome}</div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span>{formatDateBR(item.data_agendamento)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                                <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span>{formatTimeRange(item.hora_inicio, item.hora_fim)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 truncate">
                                                                <FaUser className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span className="truncate">Cliente: {item.cliente_nome}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                                                                <CheckCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                                <span>Pago em {formatPaidAt(item.data_pagamento_comissao)}</span>
                                                            </div>
                                                            {item.observacao_pagamento && (
                                                                <div className="flex items-start gap-2 text-xs text-gray-600 mt-1 break-words">
                                                                    <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                                                    <span>{item.observacao_pagamento}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-sm font-bold text-gray-900">{formatMoney(item.comissao_valor)}</div>
                                                            <div className="text-xs text-gray-500">{Number(item.comissao_percentual || 0).toFixed(2)}%</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {drawerExtratoTab === 'pendentes' && (
                                    <div className="border-t border-gray-200 px-5 py-4 bg-white">
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                value={observacaoPagamento}
                                                onChange={(e) => setObservacaoPagamento(e.target.value)}
                                                placeholder="Observação (ex: Pagamento ref. 01 a 15/04) - Opcional"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                                disabled={pagarLoading}
                                            />
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-xs text-gray-500">Total a Pagar</div>
                                                    <div className="text-xl font-bold text-gray-900">{formatMoney(pendentesTotal)}</div>
                                                </div>
                                                <button
                                                    onClick={pagarPorPeriodo}
                                                    disabled={pagarLoading || pendentesTotal <= 0}
                                                    className={`px-5 py-3 rounded-md text-sm font-bold text-white ${pagarLoading || pendentesTotal <= 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                    type="button"
                                                >
                                                    {pagarLoading ? 'Pagando...' : 'Zerar Saldo (Pagar)'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AgentsPage;
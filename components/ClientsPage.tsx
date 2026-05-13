import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, CheckCircle, Lock, X } from './Icons';
import { useClientManagement, type ClientFilters, type AssinaturaSaldoResponse } from '../hooks/useClientManagement';
import { useSettingsManagement } from '../hooks/useSettingsManagement';
import { BaseTable, TableColumn } from './BaseTable';
import ToggleSwitch from './common/ToggleSwitch';

let lastClientsPageRequestKey: string | null = null;
let lastClientsPageRequestAt = 0;

interface ClientsPageProps {
  setActiveView: (view: string) => void;
  onEditClient: (clientId: number) => void;
}

const ClientsPage: React.FC<ClientsPageProps> = ({ setActiveView, onEditClient }) => {
    // Estados locais para filtros (compatível com BaseTable)
    const [filters, setFilters] = useState<Record<string, string>>({
        id: '',
        name: '',
        phone: '',
    });

    // ✅ NOVO: Estados de paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(12); // ✅ 12 itens por página

    const hasLoadedInitialDataRef = useRef(false);

    // Hook de gerenciamento de clientes
    const {
        clients,
        stats,
        loading,
        error,
        pagination, // ✅ NOVO: Paginação do backend
        applyFilters,
        clearFilters,
        clearError,
        totalCount,
        subscriberCount,
        fetchClientAssinaturaSaldo,
        updateClient
    } = useClientManagement();

    const [assinaturaSaldoByClientId, setAssinaturaSaldoByClientId] = useState<Record<number, AssinaturaSaldoResponse | null>>({});
    const [assinaturaSaldoLoadingByClientId, setAssinaturaSaldoLoadingByClientId] = useState<Record<number, boolean>>({});
    const [assinaturaModalClientId, setAssinaturaModalClientId] = useState<number | null>(null);
    const [statusSavingByClientId, setStatusSavingByClientId] = useState<Record<number, boolean>>({});

    // Hook de configurações para verificar se sistema de pontos está ativo
    const { settings, loadSettings } = useSettingsManagement();
    const pontosAtivo = settings?.pontos_ativo || false;

    // ✅ Carregar configurações (não deve disparar reload da lista)
    useEffect(() => {
        loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const renderAssinaturaStatusBadge = useCallback((status?: any) => {
        if (!status) return null;

        const normalized = String(status);
        if (normalized === 'Ativo') {
            return (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    Ativo
                </span>
            );
        }
        if (normalized === 'Pagamento Pendente') {
            return (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                    Pagamento Pendente
                </span>
            );
        }
        if (normalized === 'Cancelado') {
            return (
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                    Cancelado
                </span>
            );
        }

        return (
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                {normalized}
            </span>
        );
    }, []);

    // ✅ CORREÇÃO: Memoizar para não recriar a cada render
    const buildAssinaturaResumo = useCallback((saldo: AssinaturaSaldoResponse | null) => {
        if (!saldo?.assinatura_ativa || !Array.isArray(saldo.saldos) || saldo.saldos.length === 0) return '';

        const parts = saldo.saldos
            .map(item => {
                const nome = item.nome || (item.tipo === 'SERVICO' ? 'Serviço' : 'Extra');
                const quota = item.quantidade_por_ciclo;
                const restantes = item.restantes;

                const quotaLabel = quota === null ? '∞' : String(quota);
                const restantesLabel = restantes === null ? '∞' : String(restantes);

                return `${nome}: ${restantesLabel}/${quotaLabel}`;
            })
            .filter(Boolean);

        return parts.join(' • ');
    }, []);

    const selectedAssinaturaSaldo = useMemo(() => {
        if (!assinaturaModalClientId) return null;
        return assinaturaSaldoByClientId[assinaturaModalClientId] || null;
    }, [assinaturaModalClientId, assinaturaSaldoByClientId]);

    const openAssinaturaModal = useCallback(async (clientId: number) => {
        if (!Number.isFinite(clientId)) return;

        setAssinaturaModalClientId(clientId);
        setAssinaturaSaldoLoadingByClientId(prev => ({ ...prev, [clientId]: true }));
        const saldo = await fetchClientAssinaturaSaldo(clientId);
        setAssinaturaSaldoByClientId(prev => ({ ...prev, [clientId]: saldo }));
        setAssinaturaSaldoLoadingByClientId(prev => ({ ...prev, [clientId]: false }));
    }, [fetchClientAssinaturaSaldo]);

    const closeAssinaturaModal = useCallback(() => {
        setAssinaturaModalClientId(null);
    }, []);

    useEffect(() => {
        const subscriberIds = (clients || [])
            .filter((c: any) => c?.isSubscriber)
            .map((c: any) => Number(c.id))
            .filter((n: number) => Number.isFinite(n));

        if (subscriberIds.length === 0) return;

        const missing = subscriberIds.filter(id => assinaturaSaldoByClientId[id] === undefined);
        if (missing.length === 0) return;

        let cancelled = false;

        const load = async () => {
            for (const id of missing) {
                if (cancelled) return;
                setAssinaturaSaldoLoadingByClientId(prev => ({ ...prev, [id]: true }));
                const saldo = await fetchClientAssinaturaSaldo(id);
                if (cancelled) return;
                setAssinaturaSaldoByClientId(prev => ({ ...prev, [id]: saldo }));
                setAssinaturaSaldoLoadingByClientId(prev => ({ ...prev, [id]: false }));
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [clients, fetchClientAssinaturaSaldo, assinaturaSaldoByClientId]);

    // ✅ Aplicar filtros: 1a carga imediata, mudanças com debounce
    useEffect(() => {
        const apiFilters: ClientFilters = {
            page: currentPage,
            limit: itemsPerPage
        };

        if (filters.id) {
            apiFilters.id = parseInt(filters.id);
        }

        if (filters.name) {
            apiFilters.nome = filters.name;
        }

        if (filters.phone) {
            apiFilters.telefone = filters.phone;
        }

        const requestKey = JSON.stringify({
            page: apiFilters.page,
            limit: apiFilters.limit,
            id: apiFilters.id || null,
            nome: apiFilters.nome || '',
            telefone: apiFilters.telefone || ''
        });

        // Primeira carga: sem debounce (evita double fetch + flicker)
        // ✅ DEDUPE LOCAL: Em dev/StrictMode o componente pode montar 2x e disparar 2 requests.
        // Essa janela curta evita a 2a requisição idêntica sem impactar o fluxo de voltar de criar/editar.
        const now = Date.now();
        if (lastClientsPageRequestKey === requestKey && now - lastClientsPageRequestAt < 800) {
            return;
        }
        lastClientsPageRequestKey = requestKey;
        lastClientsPageRequestAt = now;

        if (!hasLoadedInitialDataRef.current) {
            hasLoadedInitialDataRef.current = true;
            applyFilters(apiFilters);
            return;
        }

        const timeoutId = setTimeout(() => {
            applyFilters(apiFilters);
        }, 300); // ✅ Debounce de 300ms para resposta mais rápida (igual COMPROMISSOS)

        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, currentPage]);

    // ✅ Handlers compatíveis com BaseTable
    const handleFilterChange = useCallback((filterKey: string, value: string) => {
        setFilters(prev => ({ ...prev, [filterKey]: value }));
        setCurrentPage(1); // ✅ NOVO: Reset para primeira página ao filtrar
    }, []);

    const handleClearFilters = useCallback(() => {
        setFilters({ id: '', name: '', phone: '' });
        setCurrentPage(1); // ✅ NOVO: Reset para primeira página
        clearFilters();
    }, [clearFilters]);

    // ✅ NOVO: Handler de mudança de página
    const handlePageChange = useCallback((newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.pages) {
            setCurrentPage(newPage);
        }
    }, [pagination.pages]);

    // ✅ Memoizar valores computados
    const hasActiveFilters = useMemo(() => {
        return !!(filters.id || filters.name || filters.phone);
    }, [filters]);

    const displayText = useMemo(() => {
        if (loading) return 'Carregando...';
        return `Mostrando ${clients.length} de ${totalCount}`;
    }, [loading, clients.length, totalCount]);

    const getWhatsAppWebLink = useCallback((phone?: string) => {
        if (!phone) return null;
        // WhatsApp espera DDI+DDD+Número sem caracteres especiais
        // Ex: 5585999999999
        let digits = phone.toString().trim().replace(/\D/g, '');
        if (!digits) return null;
        if (!digits.startsWith('55')) {
            digits = `55${digits}`;
        }
        return `https://web.whatsapp.com/send?phone=${digits}`;
    }, []);

    const formatBirthDate = useCallback((birthDate?: any) => {
        if (!birthDate) return '-';

        // Pode vir como Date (dependendo do parser do PG/Knex)
        if (birthDate instanceof Date) {
            if (Number.isNaN(birthDate.getTime())) return '-';
            return birthDate.toLocaleDateString('pt-BR');
        }

        // Pode vir como string (YYYY-MM-DD) ou ISO completo
        if (typeof birthDate === 'string') {
            const trimmed = birthDate.trim();
            if (!trimmed) return '-';
            const candidate = trimmed.includes('T') ? trimmed : `${trimmed}T12:00:00`;
            const parsed = new Date(candidate);
            if (Number.isNaN(parsed.getTime())) return '-';
            return parsed.toLocaleDateString('pt-BR');
        }

        // Fallback defensivo
        try {
            const parsed = new Date(birthDate);
            if (Number.isNaN(parsed.getTime())) return '-';
            return parsed.toLocaleDateString('pt-BR');
        } catch {
            return '-';
        }
    }, []);

    // ✅ CORREÇÃO CRÍTICA: Definir colunas da tabela com dependências estáveis
    // Remover assinaturaSaldoByClientId e assinaturaSaldoLoadingByClientId das dependências
    // pois eles são acessados dentro do render mas não afetam a ESTRUTURA das colunas
    const tableColumns: TableColumn[] = useMemo(() => {
        const columns: TableColumn[] = [
            {
                key: 'id',
                label: 'ID',
                width: 'w-32 min-w-[120px]',
                filterType: 'text',
                filterPlaceholder: 'ID',
                render: (client: any) => (
                    <span className="text-gray-500 font-medium">{client.id}</span>
                ),
            },
            {
                key: 'name',
                label: 'NOME COMPLETO',
                width: 'w-1/3',
                filterType: 'text',
                filterPlaceholder: 'Pesquisar por nome',
                render: (client: any) => (
                    <div>
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                onEditClient(client.id);
                            }}
                            className={client.status === 'Bloqueado'
                                ? 'text-gray-500 hover:underline font-bold'
                                : 'text-blue-600 hover:underline font-bold'
                            }
                        >
                            {client.name}
                        </a>
                        {client.status === 'Bloqueado' && (
                            <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                                Bloqueado
                            </span>
                        )}
                    </div>
                ),
            },
            {
                key: 'access',
                label: 'ACESSO',
                width: 'w-32',
                align: 'center',
                filterType: 'none',
                render: (client: any) => {
                    const clientId = Number(client.id);
                    const isSaving = Number.isFinite(clientId) ? Boolean(statusSavingByClientId[clientId]) : false;
                    const isBlocked = client.status === 'Bloqueado';

                    return (
                        <div className="flex items-center justify-center">
                            <ToggleSwitch
                                enabled={isBlocked}
                                disabled={isSaving}
                                setEnabled={async (enabled) => {
                                    if (!Number.isFinite(clientId)) return;
                                    if (isSaving) return;

                                    setStatusSavingByClientId(prev => ({ ...prev, [clientId]: true }));
                                    try {
                                        const nextStatus = enabled ? 'Bloqueado' : 'Ativo';
                                        await updateClient(clientId, { status: nextStatus });
                                    } finally {
                                        setStatusSavingByClientId(prev => ({ ...prev, [clientId]: false }));
                                    }
                                }}
                            />
                        </div>
                    );
                },
            },
            {
                key: 'phone',
                label: 'TELEFONE',
                width: 'w-1/5',
                filterType: 'text',
                filterPlaceholder: 'Telefone...',
                render: (client: any) => {
                    const whatsappLink = getWhatsAppWebLink(client.phone);
                    if (!whatsappLink) {
                        return <span className="text-blue-600 font-bold">{client.phone || '-'}</span>;
                    }
                    return (
                        <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-bold"
                            title="Abrir conversa no WhatsApp"
                        >
                            {client.phone}
                        </a>
                    );
                },
            },
            {
                key: 'birthDate',
                label: 'ANIVERSÁRIO',
                width: 'w-40',
                align: 'center',
                filterType: 'none',
                render: (client: any) => (
                    <span className="text-gray-600">{formatBirthDate(client.birthDate)}</span>
                ),
            },
        ];

        // ✅ Adicionar coluna PONTOS se sistema de pontos estiver ativo
        if (pontosAtivo) {
            columns.push({
                key: 'pontos',
                label: 'PONTOS',
                width: 'w-24',
                align: 'center',
                filterType: 'none',
                render: (client: any) => (
                    <div className="flex items-center justify-center gap-1">
                        <span className="text-lg font-bold" style={{ color: '#2663EB' }}>
                            {client.pontosDisponiveis || 0}
                        </span>
                        <span className="text-xs text-gray-500">pts</span>
                    </div>
                ),
            });
        }

        // ✅ Adicionar coluna ASSINANTES
        columns.push({
            key: 'assinante',
            label: `${subscriberCount} ASSINANTES`,
            width: 'w-1/4',
            align: 'center',
            filterType: 'none',
            render: (client: any) => {
                if (!client.isSubscriber) return null;

                const clientId = Number(client.id);
                const saldo = Number.isFinite(clientId) ? (assinaturaSaldoByClientId[clientId] || null) : null;
                const assinaturaStatus = String(client.assinaturaStatus || '').trim();
                const assinaturaAtiva = Boolean(saldo?.assinatura_ativa);
                const podeExibirSaldo = assinaturaStatus === 'Ativo' && assinaturaAtiva;
                const resumo = podeExibirSaldo ? buildAssinaturaResumo(saldo) : '';

                return (
                    <button
                        type="button"
                        className="flex flex-row items-center justify-center gap-2 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                        onClick={() => {
                            if (Number.isFinite(clientId)) openAssinaturaModal(clientId);
                        }}
                        title={resumo || 'Ver detalhes da assinatura'}
                    >
                        <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#2663EB' }} />
                        {renderAssinaturaStatusBadge(client.assinaturaStatus)}
                    </button>
                );
            },
        });

        return columns;
    }, [pontosAtivo, subscriberCount, onEditClient, formatBirthDate, getWhatsAppWebLink, buildAssinaturaResumo, assinaturaSaldoByClientId, assinaturaSaldoLoadingByClientId, statusSavingByClientId, updateClient, renderAssinaturaStatusBadge]);

    return (
        <div className="space-y-6">
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Clientes</h1>
                    <p className="text-sm text-gray-500">
                        {displayText}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveView('clients-add')}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        disabled={loading}
                    >
                        <Plus className="w-4 h-4" />
                        Novo Cliente
                    </button>
                </div>
            </div>

            {/* ✅ NOVO: Tabela Padronizada com BaseTable */}
            <BaseTable
                data={clients}
                columns={tableColumns}
                isLoading={loading}
                loadingMessage="Carregando clientes..."
                emptyMessage={hasActiveFilters ? '🔍 Nenhum cliente encontrado com esses filtros' : ''}
                error={error}
                rowClassName={(client: any) => (client?.status === 'Bloqueado' ? 'opacity-60' : '')}
                pagination={{
                    currentPage,
                    totalPages: pagination.pages,
                    totalItems: pagination.total,
                    itemsPerPage,
                    onPageChange: handlePageChange,
                }}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                minWidth="min-w-[900px]"
                enableRowHover={true}
            />

            {(() => {
                if (!assinaturaModalClientId) return null;
                const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;
                if (!portalRoot) return null;

                return createPortal(
                    <div
                        className="fixed inset-0 z-50 bg-black/60 flex justify-end"
                        onClick={closeAssinaturaModal}
                        aria-modal="true"
                        role="dialog"
                    >
                        <div
                            className="relative flex w-full max-w-2xl flex-col bg-gray-50 shadow-xl transform transition-transform duration-300 ease-in-out"
                            onClick={(e) => e.stopPropagation()}
                            style={{ animation: 'slideInFromRight 0.3s forwards' }}
                        >
                            <style>{`
                                @keyframes slideInFromRight {
                                    from { transform: translateX(100%); }
                                    to { transform: translateX(0); }
                                }
                            `}</style>

                            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white flex-shrink-0">
                                <h2 className="text-xl font-bold text-gray-800">Detalhes da Assinatura</h2>
                                <button
                                    type="button"
                                    onClick={closeAssinaturaModal}
                                    className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                >
                                    <X className="h-6 w-6" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                <div className="bg-white border border-gray-200 rounded-lg p-4">
                                    <div className="text-sm font-semibold text-gray-800 truncate">
                                        {selectedAssinaturaSaldo?.cliente?.nome || 'Cliente'}
                                    </div>
                                    <div className="text-sm text-gray-500 truncate">Telefone: {selectedAssinaturaSaldo?.cliente?.telefone || '-'}</div>
                                </div>

                                {(() => {
                                    const statusLabel = String(selectedAssinaturaSaldo?.cliente?.assinatura_status || '').trim();
                                    const isBlocked = selectedAssinaturaSaldo?.assinatura_ativa === false || (statusLabel && statusLabel !== 'Ativo');
                                    if (!selectedAssinaturaSaldo || !isBlocked) return null;

                                    return (
                                    <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 flex items-start gap-3">
                                        <Lock className="w-5 h-5 mt-0.5" />
                                        <div>
                                            <div className="text-sm font-bold">ASSINATURA INATIVA</div>
                                            <div className="text-sm">Pendência de pagamento detectada. As cotas ficam bloqueadas até regularização.</div>
                                        </div>
                                    </div>
                                    );
                                })()}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                        <div className="text-xs text-gray-500">Plano</div>
                                        <div className="text-sm font-semibold text-gray-800">
                                            {selectedAssinaturaSaldo?.plano?.nome || '-'}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Validade do ciclo: {selectedAssinaturaSaldo?.plano?.validade_dias ? `${selectedAssinaturaSaldo.plano.validade_dias} dias` : '-'}
                                        </div>
                                    </div>

                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                        <div className="text-xs text-gray-500">Ciclo atual</div>
                                        <div className="text-sm font-semibold text-gray-800">
                                            {selectedAssinaturaSaldo?.ciclo?.inicio && selectedAssinaturaSaldo?.ciclo?.fim
                                                ? `${new Date(`${selectedAssinaturaSaldo.ciclo.inicio}T12:00:00`).toLocaleDateString('pt-BR')} até ${new Date(`${selectedAssinaturaSaldo.ciclo.fim}T12:00:00`).toLocaleDateString('pt-BR')}`
                                                : '-'
                                            }
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Índice: {typeof selectedAssinaturaSaldo?.ciclo?.indice === 'number' ? selectedAssinaturaSaldo.ciclo.indice : '-'}
                                        </div>
                                    </div>
                                </div>

                                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <div className="bg-white px-4 py-3 border-b border-gray-200">
                                        <div className="text-sm font-semibold text-gray-800">Itens do plano</div>
                                    </div>
                                    <div className="divide-y divide-gray-200">
                                        {(selectedAssinaturaSaldo?.saldos || []).map((item) => {
                                            const nome = item.nome || (item.tipo === 'SERVICO' ? 'Serviço' : 'Extra');
                                            const quotaLabel = item.quantidade_por_ciclo === null ? '∞' : String(item.quantidade_por_ciclo);

                                            const statusLabel = String(selectedAssinaturaSaldo?.cliente?.assinatura_status || '').trim();
                                            const isBlocked = selectedAssinaturaSaldo?.assinatura_ativa === false || (statusLabel && statusLabel !== 'Ativo');

                                            const usadosLabel = String(isBlocked ? 0 : (item.usados || 0));
                                            const restantesValue = isBlocked ? 0 : item.restantes;
                                            const restantesLabel = restantesValue === null ? '∞' : String(restantesValue);

                                            return (
                                                <div key={item.plano_item_id} className="px-4 py-3 flex items-center justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium text-gray-800 truncate">{nome}</div>
                                                        <div className="text-xs text-gray-500">{item.tipo === 'SERVICO' ? 'Serviço' : 'Extra'}</div>
                                                    </div>

                                                    <div className="flex items-center gap-6 flex-shrink-0">
                                                        <div className="text-right">
                                                            <div className="text-xs text-gray-500">Usado</div>
                                                            <div className="text-sm font-semibold text-gray-800">{usadosLabel}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-gray-500">Total</div>
                                                            <div className="text-sm font-semibold text-gray-800">{quotaLabel}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-gray-500">Restante</div>
                                                            <div className={`text-sm font-semibold flex items-center justify-end gap-2 ${isBlocked ? 'text-gray-500' : ''}`}>
                                                                {isBlocked && <Lock className="w-4 h-4" />}
                                                                <span style={isBlocked ? undefined : { color: '#2663EB' }}>{restantesLabel}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {(selectedAssinaturaSaldo?.saldos || []).length === 0 && (
                                            <div className="px-4 py-6 text-sm text-gray-500 text-center">
                                                Nenhum item encontrado
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t border-gray-200 bg-white flex-shrink-0 flex items-center justify-end">
                                <button
                                    type="button"
                                    onClick={closeAssinaturaModal}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>,
                    portalRoot
                );
            })()}
        </div>
    );
};

export default ClientsPage;

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, CheckCircle } from './Icons';
import { useClientManagement, type ClientFilters } from '../hooks/useClientManagement';
import { useSettingsManagement } from '../hooks/useSettingsManagement';
import { BaseTable, TableColumn } from './BaseTable';

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
        subscriberCount
    } = useClientManagement();

    // Hook de configurações para verificar se sistema de pontos está ativo
    const { settings, loadSettings } = useSettingsManagement();
    const pontosAtivo = settings?.pontos_ativo || false;

    // ✅ CORREÇÃO: Carregar dados iniciais APENAS UMA VEZ
    useEffect(() => {
        applyFilters({ page: 1, limit: itemsPerPage });
        loadSettings(); // Carregar configurações para verificar se pontos está ativo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Array vazio = executa apenas uma vez

    // ✅ Aplicar filtros com debounce otimizado
    useEffect(() => {
        // Não aplicar filtros se todos estiverem vazios (já carregado no mount)
        if (!filters.id && !filters.name && !filters.phone) {
            return;
        }

        const timeoutId = setTimeout(() => {
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

            applyFilters(apiFilters);
        }, 500); // Debounce de 500ms

        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, currentPage]); // ✅ NOVO: Incluir currentPage

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

    // 🔍 DEBUG: Log de paginação
    useEffect(() => {
        console.log('🔍 [ClientsPage] Estado da paginação:', {
            currentPage,
            itemsPerPage,
            paginationFromHook: pagination,
            clientsCount: clients.length
        });
    }, [pagination, currentPage, itemsPerPage, clients.length]);

    // ✅ NOVO: Definir colunas da tabela dinamicamente
    const tableColumns: TableColumn[] = useMemo(() => {
        const columns: TableColumn[] = [
            {
                key: 'id',
                label: 'ID',
                width: 'w-20',
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
                            className="text-blue-600 hover:underline font-medium"
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
                key: 'phone',
                label: 'TELEFONE',
                width: 'w-1/5',
                filterType: 'text',
                filterPlaceholder: 'Telefone...',
                render: (client: any) => (
                    <span className="text-gray-600">{client.phone}</span>
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
            render: (client: any) => (
                client.isSubscriber ? (
                    <div className="flex items-center justify-center gap-2">
                        <CheckCircle className="w-5 h-5" style={{ color: '#2663EB' }} />
                        <span className="text-xs font-medium" style={{ color: '#2663EB' }}>
                            Assinante
                            {client.subscriptionStartDate && (
                                <span className="text-gray-500 ml-1">
                                    desde {new Date(client.subscriptionStartDate).toLocaleDateString('pt-BR')}
                                </span>
                            )}
                        </span>
                    </div>
                ) : null
            ),
        });

        return columns;
    }, [pontosAtivo, subscriberCount, onEditClient]);

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
                emptyMessage={hasActiveFilters ? '🔍 Nenhum cliente encontrado com esses filtros' : '👥 Nenhum cliente cadastrado'}
                emptyIcon={
                    !hasActiveFilters ? (
                        <button
                            onClick={() => setActiveView('clients-add')}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                        >
                            <Plus className="w-4 h-4" />
                            Cadastrar Primeiro Cliente
                        </button>
                    ) : undefined
                }
                error={error}
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
        </div>
    );
};

export default ClientsPage;

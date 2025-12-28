import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
        subscriberCount
    } = useClientManagement();

    // Hook de configurações para verificar se sistema de pontos está ativo
    const { settings, loadSettings } = useSettingsManagement();
    const pontosAtivo = settings?.pontos_ativo || false;

    // ✅ Carregar configurações (não deve disparar reload da lista)
    useEffect(() => {
        loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

        // Primeira carga: sem debounce (evita double fetch + flicker)
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

    // ✅ NOVO: Definir colunas da tabela dinamicamente
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
                            className="text-blue-600 hover:underline font-bold"
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
    }, [pontosAtivo, subscriberCount, onEditClient, formatBirthDate, getWhatsAppWebLink]);

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

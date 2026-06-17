

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Edit, Slash, Search } from '../Icons';
import NewUserModal from './NewUserModal';
import ManageUnitsModal from './ManageUnitsModal';
import { BaseTable, type TableColumn } from '../BaseTable';

// Tipos para compatibilidade com os modais existentes
interface AdminUser {
  id: number;
  name: string;
  email: string;
  contact: string;
  status: 'Ativo' | 'Bloqueado';
  plan: 'Single' | 'Multi';
  unitLimit: number;
  iaEnabled?: boolean; // ✅ Feature Flag IA
  activeUnits?: number;
  units: Array<{ id: number; name: string; status: 'Ativo' | 'Bloqueado' }>;
  clientCount: number;
  tokens_30d?: number; // 🎯 TASK 3.3 - Tokens dos últimos 30 dias
  custo_est_usd?: number; // 🎯 TASK 3.3 - Custo estimado em USD
}

interface AdminDashboardPageProps {
  users: AdminUser[];
  loading: boolean;
  error: string | null;
  searchQuery: string; // ✅ Query de busca do backend
  setSearchQuery: (query: string) => void; // ✅ Setter da busca
  statusFilter: string; // ✅ Filtro de status do backend
  setStatusFilter: (status: string) => void; // ✅ Setter do filtro
  createUser: (userData: { nome: string; email: string; senha: string; telefone: string; plano: 'Single' | 'Multi'; limite_unidades?: number; ia_enabled?: boolean; }) => Promise<any>;
  updateUser: (id: number, userData: { nome?: string; email?: string; senha?: string; telefone?: string; plano?: 'Single' | 'Multi'; limite_unidades?: number; ia_enabled?: boolean; }) => Promise<any>;
  updateUserStatus: (id: number, status: 'Ativo' | 'Bloqueado') => Promise<any>;
  toggleUserIA: (id: number, iaEnabled?: boolean) => Promise<any>; // ✅ Nova prop para toggle IA
  getUserUnits: (userId: number) => Promise<Array<{ id: number; name: string; status: 'Ativo' | 'Bloqueado' }>>;
  updateUnitStatus: (unitId: number, status: 'Ativo' | 'Bloqueado') => Promise<any>;
}

// Tipo para dados do modal
type UserDataPayload = {
  id?: number;
  name: string;
  email: string;
  contact: string;
  plan: 'Single' | 'Multi';
  unitLimit: number;
  iaEnabled?: boolean; // ✅ Feature Flag IA
  password?: string;
};

const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
    users,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    createUser,
    updateUser,
    updateUserStatus,
    toggleUserIA, // ✅ Receber função de toggle IA
    getUserUnits,
    updateUnitStatus
}) => {
    // 🔍 DEBUG CRÍTICO: Verificar se os dados já chegam "mortos" nas props
    console.log('🔍 [DEBUG PROPS] Total users recebidos:', users.length);
    console.log('🔍 [DEBUG PROPS] Primeiro usuário completo:', users[0]);
    
    const user468 = users.find(u => u.id === 468);
    if (user468) {
        console.log('🔍 [DEBUG PROPS] Usuário 468 nas PROPS:', user468);
        console.log('🔍 [DEBUG PROPS] user468.tokens_30d:', user468.tokens_30d, 'tipo:', typeof user468.tokens_30d);
        console.log('🔍 [DEBUG PROPS] user468.custo_est_usd:', user468.custo_est_usd, 'tipo:', typeof user468.custo_est_usd);
        console.log('🔍 [DEBUG PROPS] Campos existem?', {
            has_tokens: user468.hasOwnProperty('tokens_30d'),
            has_custo: user468.hasOwnProperty('custo_est_usd')
        });
    } else {
        console.log('⚠️ [DEBUG PROPS] Usuário 468 NÃO encontrado nas props!');
    }

    const [isUserModalOpen, setUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [managingUnitsUser, setManagingUnitsUser] = useState<AdminUser | null>(null);
    const [managingUnitsData, setManagingUnitsData] = useState<Array<{ id: number; name: string; status: 'Ativo' | 'Bloqueado' }>>([]);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12;

    useEffect(() => {
        setCurrentPage(1);
    }, [users]);

    const toggleUserStatus = async (id: number) => {
        try {
            const user = users.find(u => u.id === id);
            if (!user) return;

            const newStatus = user.status === 'Ativo' ? 'Bloqueado' : 'Ativo';
            await updateUserStatus(id, newStatus);
        } catch (error) {
            // Erro ao alterar status
        }
    };
    
    const handleToggleIA = async (id: number) => {
        try {
            await toggleUserIA(id); // Toggle automático (inverte estado atual)
        } catch (error) {
            console.error('Erro ao alternar IA:', error);
        }
    };
    
    const handleOpenNewModal = () => {
        setEditingUser(null);
        setUserModalOpen(true);
    };

    const handleOpenEditModal = (user: AdminUser) => {
        setEditingUser(user);
        setUserModalOpen(true);
    };
    
    const handleCloseUserModal = () => {
        setUserModalOpen(false);
        setEditingUser(null);
    };

    const handleSaveUser = async (userData: UserDataPayload) => {
        try {
            if (userData.id) {
                // Update
                const updateData = {
                    nome: userData.name,
                    email: userData.email,
                    telefone: userData.contact,
                    plano: userData.plan,
                    limite_unidades: userData.unitLimit,
                    ia_enabled: userData.iaEnabled, // ✅ Incluir IA no update
                    ...(userData.password && { senha: userData.password })
                };
                await updateUser(userData.id, updateData);
            } else {
                // Create
                const createData = {
                    nome: userData.name,
                    email: userData.email,
                    senha: userData.password || '',
                    telefone: userData.contact,
                    plano: userData.plan,
                    limite_unidades: userData.unitLimit,
                    ia_enabled: userData.iaEnabled // ✅ Incluir IA na criação
                };
                await createUser(createData);
            }
            handleCloseUserModal();
        } catch (error) {
            // Erro ao salvar usuário
        }
    };

    const handleToggleUnitStatus = async (userId: number, unitId: number) => {
        try {
            const unit = managingUnitsData.find(u => u.id === unitId);
            if (!unit) return;

            const newStatus = unit.status === 'Ativo' ? 'Bloqueado' : 'Ativo';
            await updateUnitStatus(unitId, newStatus);

            // Atualizar dados locais do modal
            setManagingUnitsData(prevUnits =>
                prevUnits.map(u =>
                    u.id === unitId ? { ...u, status: newStatus } : u
                )
            );
        } catch (error) {
            // Erro ao alterar status da unidade
        }
    };

    const handleOpenManageUnits = async (user: AdminUser) => {
        try {
            const units = await getUserUnits(user.id);
            setManagingUnitsData(units);
            setManagingUnitsUser(user);
        } catch (error) {
            // Erro ao carregar unidades
        }
    };

    const getStatusClass = (status: 'Ativo' | 'Bloqueado') => {
        return status === 'Ativo'
            ? 'bg-green-100 text-green-800'
            : 'bg-gray-100 text-gray-600';
    };

    const getWhatsAppWebLink = useCallback((phone?: string) => {
        if (!phone) return null;
        let digits = phone.toString().trim().replace(/\D/g, '');
        if (!digits) return null;
        if (!digits.startsWith('55')) {
            digits = `55${digits}`;
        }
        return `https://web.whatsapp.com/send?phone=${digits}`;
    }, []);

    const handlePageChange = useCallback((newPage: number) => {
        const totalPages = Math.max(1, Math.ceil(users.length / itemsPerPage));
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    }, [users.length]);

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(users.length / itemsPerPage));
    }, [users.length]);

    const paginatedUsers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return users.slice(startIndex, endIndex);
    }, [users, currentPage]);

    const tableColumns: TableColumn<AdminUser>[] = useMemo(() => {
        // 🔍 DEBUG: Log dos usuários paginados para verificar dados
        if (paginatedUsers.length > 0) {
            console.log('🔍 [DEBUG AdminDashboard] Primeiro usuário da página:', paginatedUsers[0]);
            console.log('🔍 [DEBUG AdminDashboard] Usuário 468:', paginatedUsers.find(u => u.id === 468));
        }

        return [
            {
                key: 'id',
                label: 'ID',
                width: 'w-32 min-w-[120px]',
                align: 'center',
                render: (user) => (
                    <span className="text-gray-500 font-medium">{user.id}</span>
                )
            },
            {
                key: 'name',
                label: 'NOME',
                width: 'w-64',
                render: (user) => (
                    <span className="text-gray-800 font-medium block truncate" title={user.name}>
                        {user.name}
                    </span>
                )
            },
            {
                key: 'email',
                label: 'EMAIL',
                width: 'w-72',
                render: (user) => (
                    <span className="text-gray-600 block truncate" title={user.email}>
                        {user.email}
                    </span>
                )
            },
            {
                key: 'contact',
                label: 'CONTATO',
                width: 'w-40 min-w-[160px]',
                render: (user) => {
                    const whatsappLink = getWhatsAppWebLink(user.contact);
                    if (!whatsappLink) {
                        return (
                            <span className="text-gray-600 block truncate" title={user.contact}>
                                {user.contact}
                            </span>
                        );
                    }

                    return (
                        <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-bold block truncate"
                            title="Abrir conversa no WhatsApp"
                        >
                            {user.contact}
                        </a>
                    );
                }
            },
            {
                key: 'plan',
                label: 'PLANO',
                width: 'w-28',
                render: (user) => (
                    <span className="text-gray-600">{user.plan}</span>
                )
            },
            {
                key: 'unidades',
                label: 'UNIDADES',
                width: 'w-32',
                align: 'center',
                render: (user) => {
                    const activeUnitsDisplay = user.plan === 'Multi'
                        ? (user.activeUnits ?? user.units.filter(u => u.status === 'Ativo').length)
                        : user.unitLimit;

                    return (
                        <div className="text-gray-600 text-center">
                            {user.plan === 'Multi' ? (
                                <button
                                    onClick={() => handleOpenManageUnits(user)}
                                    className="font-medium text-blue-600 hover:underline"
                                    aria-label={`Gerenciar unidades de ${user.name}`}
                                >
                                    {activeUnitsDisplay} / {user.unitLimit}
                                </button>
                            ) : (
                                <span>{user.unitLimit}</span>
                            )}
                        </div>
                    );
                }
            },
            {
                key: 'clientCount',
                label: 'CLIENTES',
                width: 'w-28',
                align: 'center',
                render: (user) => (
                    <span className="text-gray-600">{user.clientCount}</span>
                )
            },
            {
                key: 'iaEnabled',
                label: 'IA',
                width: 'w-24',
                align: 'center',
                render: (user) => (
                    <button
                        onClick={() => handleToggleIA(user.id)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-full transition-colors hover:opacity-80"
                        style={{
                            backgroundColor: user.iaEnabled ? '#2563eb' : '#9ca3af',
                            color: 'white'
                        }}
                        title={user.iaEnabled ? 'IA Habilitada - Clique para desabilitar' : 'IA Desabilitada - Clique para habilitar'}
                    >
                        <span className="text-[10px]">●</span>
                        {user.iaEnabled ? 'ON' : 'OFF'}
                    </button>
                )
            },
            {
                key: 'status',
                label: 'STATUS',
                width: 'w-32',
                render: (user) => (
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusClass(user.status)}`}>
                        {user.status}
                    </span>
                )
            },
            {
                key: 'tokens_30d',
                label: 'TOKENS (30d)',
                width: 'w-36',
                align: 'center',
                render: (user) => {
                    // 🔍 DEBUG AGRESSIVO: Verificar o que está chegando na renderização
                    console.log('🔍 [RENDER DEBUG tokens_30d] Usuário ID:', user.id, 'Nome:', user.name, 'Valor:', user.tokens_30d, 'Tipo:', typeof user.tokens_30d);
                    
                    const tokens = user.tokens_30d || 0;
                    
                    // Debug adicional do valor final
                    if (user.id === 468) {
                        console.log('🎯 [USUÁRIO 468] tokens_30d RAW:', user.tokens_30d);
                        console.log('🎯 [USUÁRIO 468] tokens após || 0:', tokens);
                        console.log('🎯 [USUÁRIO 468] tokens formatado:', tokens.toLocaleString('pt-BR'));
                    }
                    
                    return (
                        <div className="text-gray-700">
                            <span className="font-medium" title={`${tokens} tokens consumidos nos últimos 30 dias`}>
                                {tokens.toLocaleString('pt-BR')}
                            </span>
                            {tokens > 0 && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                    tokens
                                </div>
                            )}
                        </div>
                    );
                }
            },
            {
                key: 'custo_est_usd',
                label: 'CUSTO EST.',
                width: 'w-32',
                align: 'center',
                render: (user) => {
                    // 🔍 DEBUG AGRESSIVO: Verificar o que está chegando na renderização
                    console.log('🔍 [RENDER DEBUG custo_est_usd] Usuário ID:', user.id, 'Valor:', user.custo_est_usd, 'Tipo:', typeof user.custo_est_usd);
                    
                    const custo = user.custo_est_usd || 0;
                    // Converter USD para BRL (estimativa de 5.5 para melhor UX brasileira)
                    const custoBRL = custo * 5.5;
                    
                    // Debug adicional do usuário 468
                    if (user.id === 468) {
                        console.log('🎯 [USUÁRIO 468] custo_est_usd RAW:', user.custo_est_usd);
                        console.log('🎯 [USUÁRIO 468] custo após || 0:', custo);
                        console.log('🎯 [USUÁRIO 468] custoBRL:', custoBRL);
                        console.log('🎯 [USUÁRIO 468] custoBRL < 0.01:', custoBRL < 0.01);
                    }
                    
                    return (
                        <div className="text-gray-700">
                            <div className="font-medium text-green-600" title={`Custo estimado: $${custo.toFixed(4)} USD`}>
                                {custoBRL < 0.01 ? 'R$ < 0,01' : `R$ ${custoBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                ${custo.toFixed(4)} USD
                            </div>
                        </div>
                    );
                }
            },
            {
                key: 'acoes',
                label: 'AÇÕES',
                width: 'w-32',
                render: (user) => (
                    <div className="flex items-center gap-2">
                        <button onClick={() => handleOpenEditModal(user)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-md"><Edit className="w-4 h-4" /></button>
                        <button
                            onClick={() => toggleUserStatus(user.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-md">
                            <Slash className="w-4 h-4" />
                        </button>
                    </div>
                )
            }
        ];
    }, [getStatusClass, handleOpenEditModal, handleOpenManageUnits, toggleUserStatus, getWhatsAppWebLink, users]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Usuários</h1>
                    <p className="text-sm text-gray-500">Mostrando {users.length} usuários</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* ✅ Campo de busca backend */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Buscar por nome ou email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-64"
                        />
                    </div>
                    {/* ✅ Filtro de status */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                    >
                        <option value="todos">Todos os Status</option>
                        <option value="Ativo">Ativos</option>
                        <option value="Bloqueado">Bloqueados</option>
                    </select>
                    <button 
                        onClick={handleOpenNewModal}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700">
                        <UserPlus className="w-4 h-4" />
                        Novo Usuário
                    </button>
                </div>
            </div>

            <BaseTable
                data={paginatedUsers}
                columns={tableColumns}
                isLoading={loading}
                loadingMessage="Carregando usuários..."
                emptyMessage="Nenhum usuário encontrado"
                error={error}
                pagination={{
                    currentPage,
                    totalPages,
                    totalItems: users.length,
                    itemsPerPage,
                    onPageChange: handlePageChange,
                }}
                minWidth="min-w-[1200px]"
                enableRowHover={true}
            />
            <NewUserModal 
                isOpen={isUserModalOpen} 
                onClose={handleCloseUserModal} 
                onSave={handleSaveUser}
                userToEdit={editingUser}
            />
            <ManageUnitsModal
                isOpen={!!managingUnitsUser}
                onClose={() => {
                    setManagingUnitsUser(null);
                    setManagingUnitsData([]);
                }}
                user={managingUnitsUser ? { ...managingUnitsUser, units: managingUnitsData } : null}
                onToggleUnitStatus={handleToggleUnitStatus}
            />
        </div>
    );
};

export default AdminDashboardPage;
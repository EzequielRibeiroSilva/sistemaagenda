

import React, { useState } from 'react';
import { UserPlus, Edit, Slash } from '../Icons';
import NewUserModal from './NewUserModal';
import ManageUnitsModal from './ManageUnitsModal';
import { useMasterUsers } from '../../hooks/useMasterUsers';

// Tipos para compatibilidade com os modais existentes
interface AdminUser {
  id: number;
  name: string;
  email: string;
  contact: string;
  status: 'Ativo' | 'Bloqueado';
  plan: 'Single' | 'Multi';
  unitLimit: number;
  units: Array<{ id: number; name: string; status: 'Ativo' | 'Bloqueado' }>;
  clientCount: number;
}

interface AdminDashboardPageProps {
  searchQuery: string;
}

// Tipo para dados do modal
type UserDataPayload = {
  id?: number;
  name: string;
  email: string;
  contact: string;
  plan: 'Single' | 'Multi';
  unitLimit: number;
  password?: string;
};

const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ searchQuery }) => {
    const {
        users: masterUsers,
        loading,
        error,
        createUser,
        updateUser,
        updateUserStatus,
        getUserUnits,
        updateUnitStatus
    } = useMasterUsers();

    const [isUserModalOpen, setUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [managingUnitsUser, setManagingUnitsUser] = useState<AdminUser | null>(null);
    const [managingUnitsData, setManagingUnitsData] = useState<Array<{ id: number; name: string; status: 'Ativo' | 'Bloqueado' }>>([]);

    // Converter dados do hook para o formato esperado pelos componentes
    const users: AdminUser[] = masterUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        contact: user.contact,
        status: user.status,
        plan: user.plan,
        unitLimit: user.unitLimit,
        units: [], // Será carregado quando necessário
        clientCount: user.clientCount
    }));

    const toggleUserStatus = async (id: number) => {
        try {
            const user = users.find(u => u.id === id);
            if (!user) return;

            const newStatus = user.status === 'Ativo' ? 'Bloqueado' : 'Ativo';
            await updateUserStatus(id, newStatus);
        } catch (error) {
            console.error('Erro ao alterar status:', error);
            // Aqui você pode adicionar uma notificação de erro
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
                    limite_unidades: userData.unitLimit
                };
                await createUser(createData);
            }
            handleCloseUserModal();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            // Aqui você pode adicionar uma notificação de erro
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
            console.error('Erro ao alterar status da unidade:', error);
            // Aqui você pode adicionar uma notificação de erro
        }
    };

    const handleOpenManageUnits = async (user: AdminUser) => {
        try {
            const units = await getUserUnits(user.id);
            setManagingUnitsData(units);
            setManagingUnitsUser(user);
        } catch (error) {
            console.error('Erro ao carregar unidades:', error);
            // Aqui você pode adicionar uma notificação de erro
        }
    };

    const getStatusClass = (status: 'Ativo' | 'Bloqueado') => {
        return status === 'Ativo'
            ? 'bg-green-100 text-green-800'
            : 'bg-gray-100 text-gray-600';
    };

    // Mostrar loading
    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Carregando usuários...</span>
                </div>
            </div>
        );
    }

    // Mostrar erro
    if (error) {
        return (
            <div className="space-y-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex">
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">Erro ao carregar usuários</h3>
                            <div className="mt-2 text-sm text-red-700">
                                <p>{error}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Usuários</h1>
                    <p className="text-sm text-gray-500">Mostrando {users.length} usuários</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleOpenNewModal}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700">
                        <UserPlus className="w-4 h-4" />
                        Novo Usuário
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 text-center font-semibold text-gray-600">ID</th>
                                <th className="p-3 text-left font-semibold text-gray-600">NOME</th>
                                <th className="p-3 text-left font-semibold text-gray-600">EMAIL</th>
                                <th className="p-3 text-left font-semibold text-gray-600">CONTATO</th>
                                <th className="p-3 text-left font-semibold text-gray-600">PLANO</th>
                                <th className="p-3 text-center font-semibold text-gray-600">UNIDADES</th>
                                <th className="p-3 text-center font-semibold text-gray-600">CLIENTES</th>
                                <th className="p-3 text-left font-semibold text-gray-600">STATUS</th>
                                <th className="p-3 text-left font-semibold text-gray-600">AÇÕES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => {
                                // Para usuários Multi, usar activeUnits do backend
                                const activeUnitsDisplay = user.plan === 'Multi'
                                    ? masterUsers.find(mu => mu.id === user.id)?.activeUnits || 0
                                    : user.unitLimit;

                                return (
                                <tr key={user.id} className="border-t border-gray-200 hover:bg-gray-50">
                                    <td className="p-3 font-medium text-gray-700 text-center">{user.id}</td>
                                    <td className="p-3 font-medium text-gray-800">{user.name}</td>
                                    <td className="p-3 text-gray-600">{user.email}</td>
                                    <td className="p-3 text-gray-600">{user.contact}</td>
                                    <td className="p-3 text-gray-600">{user.plan}</td>
                                    <td className="p-3 text-gray-600 text-center">
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
                                    </td>
                                    <td className="p-3 text-gray-600 text-center">{user.clientCount}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusClass(user.status)}`}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleOpenEditModal(user)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-md"><Edit className="w-4 h-4" /></button>
                                            <button
                                                onClick={() => toggleUserStatus(user.id)}
                                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-md">
                                                <Slash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            </div>
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


import React, { useState, useMemo } from 'react';
import type { AdminUser } from '../../types';
import { UserPlus, Edit, Slash } from '../Icons';
import NewUserModal from './NewUserModal';
import ManageUnitsModal from './ManageUnitsModal';

const mockUsers: AdminUser[] = [
  { id: 1, name: 'Salão Exemplo 1', email: 'contato@salao1.com', contact: '+55 11 98765-4321', status: 'Ativo', plan: 'Single', unitLimit: 1, units: [{ id: 101, name: 'Unidade Principal', status: 'Ativo' }], clientCount: 150 },
  { id: 2, name: 'Barbearia do João', email: 'joao@barbearia.com', contact: '+55 21 91234-5678', status: 'Ativo', plan: 'Multi', unitLimit: 5, units: [
      { id: 201, name: 'Unidade Centro', status: 'Ativo' },
      { id: 202, name: 'Unidade Praia', status: 'Ativo' },
      { id: 203, name: 'Unidade Shopping', status: 'Bloqueado' },
      { id: 204, name: 'Unidade Aeroporto', status: 'Ativo' },
  ], clientCount: 320 },
  { id: 3, name: 'Studio de Beleza', email: 'contato@studio.com', contact: '+55 31 95555-4444', status: 'Bloqueado', plan: 'Single', unitLimit: 1, units: [{ id: 301, name: 'Matriz', status: 'Ativo' }], clientCount: 85 },
];

interface AdminDashboardPageProps {
  searchQuery: string;
}

// FIX: Define UserDataPayload to match the data structure from NewUserModal.
type UserDataPayload = Omit<AdminUser, 'status' | 'id' | 'units' | 'clientCount'> & { id?: number; password?: string };

const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ searchQuery }) => {
    const [users, setUsers] = useState(mockUsers);
    const [isUserModalOpen, setUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [managingUnitsUser, setManagingUnitsUser] = useState<AdminUser | null>(null);

    const filteredUsers = useMemo(() => {
        if (!searchQuery) {
            return users;
        }
        const lowercasedQuery = searchQuery.toLowerCase();
        return users.filter(user =>
            user.name.toLowerCase().includes(lowercasedQuery) ||
            user.email.toLowerCase().includes(lowercasedQuery)
        );
    }, [users, searchQuery]);

    const toggleUserStatus = (id: number) => {
        setUsers(users.map(user => 
            user.id === id 
                ? { ...user, status: user.status === 'Ativo' ? 'Bloqueado' : 'Ativo' }
                : user
        ));
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

    // FIX: Correctly type userData and handle object spreading to prevent type errors and logical bugs.
    const handleSaveUser = (userData: UserDataPayload) => {
        if (userData.id) {
            // Update
            const { password, ...restOfUserData } = userData;
            setUsers(users.map(u => u.id === userData.id ? { ...u, ...restOfUserData } : u));
        } else {
            // Create
            const { password, id, ...restOfUserData } = userData;
            const newUser: AdminUser = {
                id: Date.now(),
                status: 'Ativo',
                units: [],
                clientCount: 0,
                ...restOfUserData,
            };
            setUsers([...users, newUser]);
        }
        handleCloseUserModal();
    };

    // FIX: Correctly infer unit status type and fix logic to use unit status instead of user status.
    const handleToggleUnitStatus = (userId: number, unitId: number) => {
        const updateUserState = (userList: AdminUser[]) =>
            userList.map(user => {
                if (user.id === userId) {
                    return {
                        ...user,
                        units: user.units.map(unit => {
                            if (unit.id === unitId) {
                                const newStatus: 'Ativo' | 'Bloqueado' = unit.status === 'Ativo' ? 'Bloqueado' : 'Ativo';
                                return { ...unit, status: newStatus };
                            }
                            return unit;
                        }),
                    };
                }
                return user;
            });

        setUsers(updateUserState);
        setManagingUnitsUser(prevUser => prevUser ? updateUserState([prevUser])[0] : null);
    };

    const getStatusClass = (status: 'Ativo' | 'Bloqueado') => {
        return status === 'Ativo' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-600';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Usuários</h1>
                    <p className="text-sm text-gray-500">Mostrando {filteredUsers.length} usuários</p>
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
                            {filteredUsers.map(user => {
                                const activeUnits = user.units.filter(u => u.status === 'Ativo').length;
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
                                                onClick={() => setManagingUnitsUser(user)} 
                                                className="font-medium text-blue-600 hover:underline"
                                                aria-label={`Gerenciar unidades de ${user.name}`}
                                            >
                                                {activeUnits} / {user.unitLimit}
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
                onClose={() => setManagingUnitsUser(null)}
                user={managingUnitsUser}
                onToggleUnitStatus={handleToggleUnitStatus}
            />
        </div>
    );
};

export default AdminDashboardPage;
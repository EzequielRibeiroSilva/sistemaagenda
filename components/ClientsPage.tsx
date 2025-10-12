import React, { useState, useEffect } from 'react';
import { Download, Plus, CheckCircle, ChevronLeft, ChevronRight, MoreHorizontal } from './Icons';
import { useClientManagement, type ClientFilters } from '../hooks/useClientManagement';

const FilterInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input
        {...props}
        className={`w-full bg-white p-1.5 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${props.className || ''}`}
    />
);

interface ClientsPageProps {
  setActiveView: (view: string) => void;
  onEditClient: (clientId: number) => void;
}

const ClientsPage: React.FC<ClientsPageProps> = ({ setActiveView, onEditClient }) => {
    // Estados locais para filtros
    const [localFilters, setLocalFilters] = useState({
        id: '',
        name: '',
        phone: '',
    });

    // Hook de gerenciamento de clientes
    const {
        clients,
        stats,
        loading,
        error,
        applyFilters,
        clearFilters,
        clearError,
        totalCount,
        subscriberCount
    } = useClientManagement();

    // Aplicar filtros com debounce
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const apiFilters: ClientFilters = {};

            if (localFilters.id) {
                apiFilters.id = parseInt(localFilters.id);
            }

            if (localFilters.name) {
                apiFilters.nome = localFilters.name;
            }

            if (localFilters.phone) {
                apiFilters.telefone = localFilters.phone;
            }

            applyFilters(apiFilters);
        }, 500); // Debounce de 500ms

        return () => clearTimeout(timeoutId);
    }, [localFilters, applyFilters]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleClearFilters = () => {
        setLocalFilters({ id: '', name: '', phone: '' });
        clearFilters();
    };

    return (
        <div className="space-y-6">
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
                    <p className="text-sm text-gray-500">
                        {loading ? 'Carregando...' : `Mostrando ${clients.length} de ${totalCount}`}
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

            {/* Mensagem de erro */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <div className="text-red-600 text-sm">
                                <strong>Erro:</strong> {error}
                            </div>
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

            {/* Tabela de clientes */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 text-left font-semibold text-gray-600">ID</th>
                                <th className="p-3 text-left font-semibold text-gray-600">NOME COMPLETO</th>
                                <th className="p-3 text-left font-semibold text-gray-600">TELEFONE</th>
                                <th className="p-3 text-left font-semibold text-gray-600">
                                    {subscriberCount} ASSINANTES
                                    {subscriberCount > 0 && (
                                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                            {subscriberCount}
                                        </span>
                                    )}
                                </th>
                            </tr>
                            {/* Linha de filtros */}
                            <tr>
                                <td className="p-3 border-t border-gray-200">
                                    <FilterInput
                                        type="text"
                                        name="id"
                                        placeholder="ID"
                                        value={localFilters.id}
                                        onChange={handleFilterChange}
                                        disabled={loading}
                                    />
                                </td>
                                <td className="p-3 border-t border-gray-200">
                                    <FilterInput
                                        type="text"
                                        name="name"
                                        placeholder="Pesquisar por nome"
                                        value={localFilters.name}
                                        onChange={handleFilterChange}
                                        disabled={loading}
                                    />
                                </td>
                                <td className="p-3 border-t border-gray-200">
                                    <FilterInput
                                        type="text"
                                        name="phone"
                                        placeholder="Telefone..."
                                        value={localFilters.phone}
                                        onChange={handleFilterChange}
                                        disabled={loading}
                                    />
                                </td>
                                <td className="p-3 border-t border-gray-200">
                                    <button
                                        onClick={handleClearFilters}
                                        className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                                        disabled={loading}
                                    >
                                        Limpar Filtros
                                    </button>
                                </td>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-gray-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                            Carregando clientes...
                                        </div>
                                    </td>
                                </tr>
                            ) : clients.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-gray-500">
                                        <div className="space-y-2">
                                            <div>Nenhum cliente encontrado</div>
                                            {(localFilters.id || localFilters.name || localFilters.phone) && (
                                                <button
                                                    onClick={handleClearFilters}
                                                    className="text-blue-600 hover:text-blue-800 underline text-sm"
                                                >
                                                    Limpar filtros para ver todos os clientes
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                clients.map(client => (
                                    <tr key={client.id} className="border-t border-gray-200 hover:bg-gray-50">
                                        <td className="p-3 text-gray-500 font-medium">{client.id}</td>
                                        <td className="p-3 font-medium whitespace-nowrap">
                                            <a
                                                href="#"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    onEditClient(client.id);
                                                }}
                                                className="text-blue-600 hover:underline"
                                            >
                                                {client.name}
                                            </a>
                                            {client.status === 'Bloqueado' && (
                                                <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                                                    Bloqueado
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-gray-600 whitespace-nowrap">{client.phone}</td>
                                        <td className="p-3 text-center">
                                            {client.isSubscriber && (
                                                <div className="flex items-center justify-center gap-2">
                                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                                    <span className="text-xs text-green-600 font-medium">
                                                        Assinante
                                                        {client.subscriptionStartDate && (
                                                            <span className="text-gray-500 ml-1">
                                                                desde {new Date(client.subscriptionStartDate).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                         <tfoot className="bg-gray-50">
                            <tr>
                                <th className="p-3 text-left font-semibold text-gray-600">ID</th>
                                <th className="p-3 text-left font-semibold text-gray-600">NOME COMPLETO</th>
                                <th className="p-3 text-left font-semibold text-gray-600">TELEFONE</th>
                                <th className="p-3 text-left font-semibold text-gray-600">{subscriberCount} ASSINANTES</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
                <p>Mostrando {clients.length} de {totalCount}</p>
                <div className="flex items-center gap-2">
                    <span>Página:</span>
                    <span className="font-semibold text-gray-800">1</span>
                    <div className="flex items-center">
                        <button className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50" disabled><ChevronLeft className="w-4 h-4" /></button>
                        <button className="p-2 rounded-md hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientsPage;

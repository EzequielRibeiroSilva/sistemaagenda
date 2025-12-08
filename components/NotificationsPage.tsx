import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationManagement, TipoNotificacao, StatusNotificacao, NotificationFilters } from '../hooks/useNotificationManagement';
import { useCalendarData } from '../hooks/useCalendarData';
import { Bell, ChevronLeft, ChevronRight, X, AlertCircle, CheckCircle, Clock, XCircle } from './Icons';
import NewAppointmentModal from './NewAppointmentModal';

interface Location {
  id: string;
  name: string;
}

const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const { 
    notifications, 
    isLoading, 
    error, 
    pagination, 
    fetchNotifications 
  } = useNotificationManagement();
  
  const { 
    locations: backendLocations,
    isLoading: isLoadingLocations 
  } = useCalendarData();

  // Estados
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('all');
  const [filters, setFilters] = useState<{
    tipo: TipoNotificacao | 'all';
    status: StatusNotificacao | 'all';
    agendamentoId: string;
  }>({
    tipo: 'all',
    status: 'all',
    agendamentoId: ''
  });

  // Estados para o modal de edição de agendamento
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAgendamentoId, setSelectedAgendamentoId] = useState<number | null>(null);

  // Converter locations do backend para formato do componente
  const locations: Location[] = useMemo(() => {
    return backendLocations.map(location => ({
      id: location.id,
      name: location.name
    }));
  }, [backendLocations]);

  // Detectar se é plano Single ou Multi
  const isSinglePlan = user.plano === 'Single' || locations.length === 1;
  const isMultiPlan = user.plano === 'Multi' && locations.length > 1;

  // Auto-seleção de local baseada no PLANO (mesma lógica do AppointmentsPage)
  useEffect(() => {
    if (locations.length === 0) return;
    if (selectedLocationFilter !== 'all') return;

    // Caso 1: Plano Single (sempre seleciona o primeiro)
    if (isSinglePlan) {
      setSelectedLocationFilter(locations[0].id);
      return;
    }

    if (isMultiPlan) {
      // Caso 2: Plano Multi e usuário tem unidade padrão
      if (user.unidade_id) {
        const userLocation = locations.find(l => l.id === user.unidade_id?.toString());
        if (userLocation) {
          setSelectedLocationFilter(userLocation.id);
          return;
        }
      }

      // Caso 3: Plano Multi, sem unidade padrão (ADMIN Master)
      setSelectedLocationFilter(locations[0].id);
    }
  }, [locations, selectedLocationFilter, isSinglePlan, isMultiPlan, user.unidade_id]);

  // Buscar notificações quando filtros, página ou LOCAL mudarem
  useEffect(() => {
    // Não buscar se selectedLocationFilter === 'all' (aguardando auto-seleção)
    if (selectedLocationFilter === 'all') {
      return;
    }

    const apiFilters: NotificationFilters = {
      page: currentPage,
      limit: itemsPerPage,
    };

    if (filters.tipo !== 'all') {
      apiFilters.tipo_notificacao = filters.tipo;
    }

    if (filters.status !== 'all') {
      apiFilters.status = filters.status;
    }

    if (filters.agendamentoId) {
      apiFilters.agendamento_id = parseInt(filters.agendamentoId);
    }

    // Sempre aplicar filtro de unidade_id quando local específico estiver selecionado
    if (selectedLocationFilter !== 'all') {
      apiFilters.unidade_id = parseInt(selectedLocationFilter);
    }

    fetchNotifications(apiFilters);
  }, [currentPage, itemsPerPage, filters, selectedLocationFilter, fetchNotifications]);

  // Handlers
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1); // Reset para primeira página ao filtrar
  };

  const handleClearFilters = () => {
    setFilters({
      tipo: 'all',
      status: 'all',
      agendamentoId: ''
    });
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setCurrentPage(newPage);
    }
  };

  const handleAgendamentoClick = (agendamentoId: string) => {
    setSelectedAgendamentoId(parseInt(agendamentoId));
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedAgendamentoId(null);
  };

  const handleEditSuccess = () => {
    // Recarregar notificações após edição
    const apiFilters: NotificationFilters = {
      page: currentPage,
      limit: itemsPerPage,
    };
    if (selectedLocationFilter !== 'all') {
      apiFilters.unidade_id = parseInt(selectedLocationFilter);
    }
    fetchNotifications(apiFilters);
  };

  // Função para formatar data/hora
  const formatDateTime = (date: Date): string => {
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Função para obter ícone do status
  const getStatusIcon = (status: StatusNotificacao) => {
    switch (status) {
      case 'enviado':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'pendente':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'falha':
      case 'falha_permanente':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  // Função para obter cor do badge do status
  const getStatusBadgeColor = (status: StatusNotificacao): string => {
    switch (status) {
      case 'programado':
        return 'bg-blue-100 text-blue-800'; // ✅ NOVO: Azul para programado
      case 'enviado':
        return 'bg-green-100 text-green-800';
      case 'pendente':
        return 'bg-yellow-100 text-yellow-800';
      case 'falha':
      case 'falha_permanente':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Função para obter cor do badge do tipo
  const getTipoBadgeColor = (tipo: TipoNotificacao): string => {
    switch (tipo) {
      case 'confirmacao':
        return 'bg-blue-100 text-blue-800';
      case 'cancelamento':
        return 'bg-red-100 text-red-800';
      case 'reagendamento':
        return 'bg-purple-100 text-purple-800';
      case 'lembrete_24h':
        return 'bg-orange-100 text-orange-800';
      case 'lembrete_1h':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">Lembretes</h1>
          </div>
          
          {/* Selector de Local (apenas para plano Multi) */}
          {isMultiPlan && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Local:</label>
              <select
                value={selectedLocationFilter}
                onChange={(e) => {
                  setSelectedLocationFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {locations.map(location => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Filtro por Tipo */}
          <select
            name="tipo"
            value={filters.tipo}
            onChange={handleFilterChange}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">Todos os Tipos</option>
            <option value="confirmacao">Agendamento</option>
            <option value="cancelamento">Cancelamento</option>
            <option value="reagendamento">Reagendamento</option>
            <option value="lembrete_24h">Lembrete 24h</option>
            <option value="lembrete_1h">Lembrete 1h</option>
          </select>

          {/* Filtro por Estado */}
          <select
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">Todos os Estados</option>
            <option value="programado">Programado</option>
            <option value="enviado">Enviado</option>
            <option value="pendente">Pendente</option>
            <option value="falha">Falhou</option>
            <option value="falha_permanente">Falha Permanente</option>
          </select>

          {/* Filtro por ID do Agendamento */}
          <input
            type="text"
            name="agendamentoId"
            value={filters.agendamentoId}
            onChange={handleFilterChange}
            placeholder="ID do Agendamento"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-40"
          />

          {/* Botão Limpar Filtros */}
          {(filters.tipo !== 'all' || filters.status !== 'all' || filters.agendamentoId) && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {isLoading || isLoadingLocations ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Bell className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium">Nenhuma notificação encontrada</p>
            <p className="text-sm">Tente ajustar os filtros ou aguarde novas notificações</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mensagem
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Momento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Destinatário
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {notifications.map((notification) => (
                    <tr key={notification.id} className="hover:bg-gray-50 transition-colors">
                      {/* Coluna Mensagem (Tipo) */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTipoBadgeColor(notification.tipo)}`}>
                          {notification.tipoLabel}
                        </span>
                      </td>

                      {/* Coluna ID (Clicável) */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleAgendamentoClick(notification.agendamentoId)}
                          className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                        >
                          #{notification.agendamentoId}
                        </button>
                      </td>

                      {/* Coluna Estado (Status) */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(notification.status)}`}>
                          {notification.statusLabel}
                        </span>
                      </td>

                      {/* Coluna Momento */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {notification.status === 'programado' && notification.enviarEm
                          ? formatDateTime(notification.enviarEm) // ✅ NOVO: Exibir horário programado
                          : notification.enviadoEm 
                            ? formatDateTime(notification.enviadoEm)
                            : formatDateTime(notification.criadoEm)
                        }
                      </td>

                      {/* Coluna Destinatário */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {notification.destinatarioNome || notification.clienteNome || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {pagination.pages > 1 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Mostrando <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> a{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * itemsPerPage, pagination.total)}
                  </span>{' '}
                  de <span className="font-medium">{pagination.total}</span> notificações
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <span className="text-sm text-gray-700">
                    Página <span className="font-medium">{currentPage}</span> de{' '}
                    <span className="font-medium">{pagination.pages}</span>
                  </span>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === pagination.pages}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Edição de Agendamento */}
      {isEditModalOpen && selectedAgendamentoId && (
        <NewAppointmentModal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          selectedLocationId={selectedLocationFilter}
          appointmentId={selectedAgendamentoId}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
};

export default NotificationsPage;

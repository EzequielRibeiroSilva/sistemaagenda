import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationManagement, TipoNotificacao, StatusNotificacao, NotificationFilters } from '../hooks/useNotificationManagement';
import { useCalendarData } from '../hooks/useCalendarData';
import { Bell, X, AlertCircle, CheckCircle, Clock, XCircle } from './Icons';
import NewAppointmentModal from './NewAppointmentModal';
import { BaseTable, TableColumn } from './BaseTable';

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
  const [itemsPerPage] = useState(12); // ✅ NOVO: 12 itens por página
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('all');
  const [filters, setFilters] = useState<Record<string, string>>({
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

  // Buscar notificações quando filtros ou paginação mudarem
  useEffect(() => {
    // ✅ NOVO: Debounce de 300ms para resposta mais rápida (igual COMPROMISSOS)
    const timeoutId = setTimeout(() => {
      // Não buscar se selectedLocationFilter === 'all' (aguardando auto-seleção)
      if (selectedLocationFilter === 'all') {
        return;
      }

      const apiFilters: NotificationFilters = {
        page: currentPage,
        limit: itemsPerPage,
      };

      if (filters.tipo !== 'all') {
        apiFilters.tipo_notificacao = filters.tipo as TipoNotificacao;
      }

      if (filters.status !== 'all') {
        apiFilters.status = filters.status as StatusNotificacao;
      }

      // ✅ CORREÇÃO: Verificar se agendamentoId tem valor antes de converter
      if (filters.agendamentoId && filters.agendamentoId.trim() !== '') {
        const id = parseInt(filters.agendamentoId);
        if (!isNaN(id)) {
          apiFilters.agendamento_id = id;
        }
      }

      // Sempre aplicar filtro de unidade_id quando local específico estiver selecionado
      if (selectedLocationFilter !== 'all') {
        apiFilters.unidade_id = parseInt(selectedLocationFilter);
      }

      fetchNotifications(apiFilters);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [currentPage, itemsPerPage, filters, selectedLocationFilter, fetchNotifications]);

  // Handlers
  const handleFilterChange = (filterKey: string, value: string) => {
    setFilters(prev => ({ ...prev, [filterKey]: value }));
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

  // ✅ NOVO: Definir colunas da tabela (com larguras otimizadas)
  const tableColumns: TableColumn[] = useMemo(() => [
    {
      key: 'tipo',
      label: 'MENSAGEM',
      width: 'w-1/5', // ✅ 20% da largura
      filterType: 'select',
      filterOptions: [
        { value: 'confirmacao', label: 'Agendamento' },
        { value: 'cancelamento', label: 'Cancelamento' },
        { value: 'reagendamento', label: 'Reagendamento' },
        { value: 'lembrete_24h', label: 'Lembrete 24h' },
        { value: 'lembrete_1h', label: 'Lembrete 1h' },
      ],
      render: (notification: any) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTipoBadgeColor(notification.tipo)}`}>
          {notification.tipoLabel}
        </span>
      ),
    },
    {
      key: 'agendamentoId',
      label: 'ID',
      width: 'w-24', // ✅ Mantém estreito (apenas números)
      filterType: 'text',
      filterPlaceholder: 'ID...',
      render: (notification: any) => (
        <button
          onClick={() => handleAgendamentoClick(notification.agendamentoId)}
          className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          #{notification.agendamentoId}
        </button>
      ),
    },
    {
      key: 'status',
      label: 'ESTADO',
      width: 'w-1/6', // ✅ ~16% da largura
      filterType: 'select',
      filterOptions: [
        { value: 'programado', label: 'Programado' },
        { value: 'enviado', label: 'Enviado' },
        { value: 'pendente', label: 'Pendente' },
        { value: 'falha', label: 'Falhou' },
        { value: 'falha_permanente', label: 'Falha Permanente' },
      ],
      render: (notification: any) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(notification.status)}`}>
          {notification.statusLabel}
        </span>
      ),
    },
    {
      key: 'momento',
      label: 'MOMENTO',
      width: 'w-1/5', // ✅ 20% da largura
      filterType: 'none',
      render: (notification: any) => (
        <span className="text-sm text-gray-900">
          {notification.status === 'programado' && notification.enviarEm
            ? formatDateTime(notification.enviarEm)
            : notification.enviadoEm
              ? formatDateTime(notification.enviadoEm)
              : formatDateTime(notification.criadoEm)
          }
        </span>
      ),
    },
    {
      key: 'destinatario',
      label: 'DESTINATÁRIO',
      width: 'w-1/4', // ✅ 25% da largura (maior espaço)
      filterType: 'none',
      render: (notification: any) => (
        <span className="text-sm text-gray-900">
          {notification.destinatarioNome || notification.clienteNome || '-'}
        </span>
      ),
    },
  ], []);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Lembretes</h1>
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

      {/* ✅ NOVO: Tabela Padronizada com BaseTable */}
      <BaseTable
        data={notifications}
        columns={tableColumns}
        isLoading={isLoading || isLoadingLocations}
        loadingMessage="Carregando lembretes..."
        emptyMessage="Nenhuma notificação encontrada"
        emptyIcon={<Bell className="w-16 h-16 mb-4 text-gray-300" />}
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

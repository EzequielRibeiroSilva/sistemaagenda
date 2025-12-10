
import React, { useState } from 'react';
import { MapPin, Phone, AlertCircle, Lock, Unlock } from './Icons';
import { useUnitManagement, Unit } from '../hooks/useUnitManagement';
import { useToast } from '../contexts/ToastContext';
import { BaseCard, AddCard, CardInfoRow, CardStatusBadge } from './BaseCard';

interface LocationCardProps {
  id: number;
  name: string;
  endereco: string;
  telefone: string;
  status: 'Ativo' | 'Bloqueado';
  onEdit: (id: number) => void;
  onToggleStatus: (id: number, currentStatus: 'Ativo' | 'Bloqueado') => void;
  onDelete: (id: number) => void;
  isConfirmingDelete?: boolean;
}

const LocationCard: React.FC<LocationCardProps> = ({ id, name, endereco, telefone, status, onEdit, onToggleStatus, onDelete, isConfirmingDelete = false }) => {
  // Ícone de localização para o header
  const locationIcon = (
    <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-[#2663EB] to-blue-600 rounded-full shadow-md">
      <MapPin className="w-7 h-7 text-white" />
    </div>
  );

  return (
    <BaseCard
      title={name}
      onEdit={() => onEdit(id)}
      onDelete={() => onDelete(id)}
      isConfirmingDelete={isConfirmingDelete}
      editLabel="Editar Local"
      showTopBar={true}
      headerContent={locationIcon}
    >
      {/* Endereço */}
      {endereco && (
        <div className="flex items-start space-x-2 mb-2">
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <span className="text-sm text-gray-600 break-words">{endereco}</span>
        </div>
      )}

      {/* Telefone */}
      {telefone && (
        <div className="flex items-center space-x-2 mb-2">
          <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-600">{telefone}</span>
        </div>
      )}

      {/* Divisor */}
      <div className="border-t border-gray-100 my-2"></div>

      {/* Status com botão de toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">Status</span>
        <div className="flex items-center space-x-2">
          <CardStatusBadge status={status} />
          <button
            onClick={() => onToggleStatus(id, status)}
            className={`p-1.5 rounded-md transition-all duration-200 ${
              status === 'Ativo'
                ? 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
            }`}
            title={status === 'Ativo' ? 'Bloquear' : 'Desbloquear'}
          >
            {status === 'Ativo' ? (
              <Lock className="w-4 h-4" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </BaseCard>
  );
};

const AddLocationCard: React.FC<{ onClick: () => void; disabled?: boolean; limitInfo?: any }> = ({ onClick, disabled = false, limitInfo }) => {
  if (disabled) {
    return (
      <div className="bg-white rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-6 min-h-[280px] text-center cursor-not-allowed">
        <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-gray-500" />
        </div>
        <p className="font-semibold text-gray-400 text-base mb-2">Limite Atingido</p>
        {limitInfo && (
          <p className="text-sm text-gray-500 mb-2">
            {limitInfo.currentCount} de {limitInfo.limit || '∞'} unidades utilizadas
          </p>
        )}
        <p className="text-xs text-gray-500">Upgrade seu plano para criar mais unidades</p>
      </div>
    );
  }

  return (
    <AddCard 
      onClick={onClick} 
      label="Adicionar Local"
      sublabel={limitInfo ? `${limitInfo.currentCount} de ${limitInfo.limit || '∞'} unidades` : undefined}
    />
  );
};

interface LocationsPageProps {
  setActiveView: (view: string) => void;
  onEditLocation: (locationId: number) => void;
}

const LocationsPage: React.FC<LocationsPageProps> = ({ setActiveView, onEditLocation }) => {
  const toast = useToast();
  const {
    units,
    limitInfo,
    loading,
    error,
    updateUnitStatus,
    deleteUnit,
    clearError,
    canCreateNewUnit
  } = useUnitManagement();

  const [statusLoading, setStatusLoading] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const handleToggleStatus = async (id: number, currentStatus: 'Ativo' | 'Bloqueado') => {
    const newStatus = currentStatus === 'Ativo' ? 'Bloqueado' : 'Ativo';
    const unit = units.find(u => u.id === id);

    setStatusLoading(id);
    const success = await updateUnitStatus(id, newStatus);
    setStatusLoading(null);

    if (success) {
      const action = newStatus === 'Ativo' ? 'ativado' : 'bloqueado';
      toast.success('Status Atualizado!', `O local "${unit?.nome}" foi ${action} com sucesso.`);
    } else {
      toast.error('Erro ao Alterar Status', 'Não foi possível alterar o status do local.');
    }
  };

  const handleDeleteLocation = async (id: number) => {
    const unit = units.find(u => u.id === id);
    
    // Se já está confirmando este item, executar a exclusão
    if (confirmingDelete === id) {
      setDeleteLoading(id);
      setConfirmingDelete(null);
      
      const success = await deleteUnit(id);
      setDeleteLoading(null);

      if (success) {
        toast.success('Local Excluído!', `O local "${unit?.nome}" foi removido com sucesso.`);
      } else {
        toast.error('Erro ao Excluir', 'Não foi possível excluir o local. Tente novamente.');
      }
    } else {
      // Primeira vez clicando: mostrar toast de aviso e marcar para confirmação
      setConfirmingDelete(id);
      toast.warning('Confirme a Exclusão', `Clique novamente no X para confirmar a exclusão de "${unit?.nome}".`);
      
      // Resetar confirmação após 5 segundos
      setTimeout(() => {
        setConfirmingDelete(null);
      }, 5000);
    }
  };

  const handleCreateLocation = () => {
    if (canCreateNewUnit()) {
      setActiveView('locations-create');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Locais</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Carregando locais...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Locais</h1>
        {limitInfo && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">{limitInfo.currentCount}</span>
            {limitInfo.limit ? ` de ${limitInfo.limit}` : ''} unidades utilizadas
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
          <button
            onClick={clearError}
            className="text-red-600 hover:text-red-800 font-medium text-sm"
          >
            Fechar
          </button>
        </div>
      )}

      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {units.map((unit) => (
            <LocationCard
              key={unit.id}
              id={unit.id}
              name={unit.nome}
              isConfirmingDelete={confirmingDelete === unit.id}
              endereco={unit.endereco}
              telefone={unit.telefone}
              status={unit.status}
              onEdit={onEditLocation}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDeleteLocation}
            />
          ))}
          <AddLocationCard
            onClick={handleCreateLocation}
            disabled={!canCreateNewUnit()}
            limitInfo={limitInfo}
          />
        </div>

        
      </div>
    </div>
  );
};

export default LocationsPage;

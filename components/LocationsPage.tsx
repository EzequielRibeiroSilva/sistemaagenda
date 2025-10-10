
import React, { useState } from 'react';
import { Plus, Edit, MapPin, Phone, AlertCircle, CheckCircle, XCircle, X } from './Icons';
import { useUnitManagement, Unit } from '../hooks/useUnitManagement';

interface LocationCardProps {
  id: number;
  name: string;
  endereco: string;
  telefone: string;
  status: 'Ativo' | 'Bloqueado';
  onEdit: (id: number) => void;
  onToggleStatus: (id: number, currentStatus: 'Ativo' | 'Bloqueado') => void;
  onDelete: (id: number) => void;
}

const LocationCard: React.FC<LocationCardProps> = ({ id, name, endereco, telefone, status, onEdit, onToggleStatus, onDelete }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
    <div className="h-40 bg-gradient-to-br from-blue-500 to-blue-600 rounded-t-lg flex items-center justify-center">
      <MapPin className="w-12 h-12 text-white opacity-80" />
    </div>
    <div className="p-4">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-gray-800 text-lg mb-1">{name}</h3>
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            status === 'Ativo'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {status === 'Ativo' ? (
              <CheckCircle className="w-3 h-3 mr-1" />
            ) : (
              <XCircle className="w-3 h-3 mr-1" />
            )}
            {status}
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onDelete(id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Excluir"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggleStatus(id, status)}
            className={`p-2 rounded-lg transition-colors ${
              status === 'Ativo'
                ? 'text-red-600 hover:bg-red-50'
                : 'text-green-600 hover:bg-green-50'
            }`}
            title={status === 'Ativo' ? 'Bloquear' : 'Ativar'}
          >
            {status === 'Ativo' ? (
              <XCircle className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => onEdit(id)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Editar"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {endereco && (
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 mr-2 text-gray-400" />
            <span className="truncate">{endereco}</span>
          </div>
        )}
        {telefone && (
          <div className="flex items-center text-sm text-gray-600">
            <Phone className="w-4 h-4 mr-2 text-gray-400" />
            <span>{telefone}</span>
          </div>
        )}
      </div>
    </div>
  </div>
);

const AddLocationCard: React.FC<{ onClick: () => void; disabled?: boolean; limitInfo?: any }> = ({ onClick, disabled = false, limitInfo }) => (
  <div
    onClick={disabled ? undefined : onClick}
    className={`bg-white rounded-lg border-2 border-dashed flex flex-col items-center justify-center p-4 min-h-[300px] text-center transition-colors group ${
      disabled
        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
        : 'border-gray-300 hover:border-blue-500 hover:text-blue-600 cursor-pointer'
    }`}
  >
    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-transform ${
      disabled
        ? 'bg-gray-300'
        : 'bg-blue-600 group-hover:scale-110'
    }`}>
      <Plus className={`w-6 h-6 ${disabled ? 'text-gray-500' : 'text-white'}`} />
    </div>
    <p className={`font-semibold text-lg mb-2 ${disabled ? 'text-gray-400' : 'text-blue-600'}`}>
      {disabled ? 'Limite Atingido' : 'Adicionar Local'}
    </p>
    {limitInfo && (
      <p className="text-sm text-gray-500">
        {limitInfo.currentCount} de {limitInfo.limit || '∞'} unidades utilizadas
      </p>
    )}
    {disabled && (
      <div className="flex items-center mt-2 text-xs text-gray-500">
        <AlertCircle className="w-4 h-4 mr-1" />
        Upgrade seu plano para criar mais unidades
      </div>
    )}
  </div>
);

interface LocationsPageProps {
  setActiveView: (view: string) => void;
  onEditLocation: (locationId: number) => void;
}

const LocationsPage: React.FC<LocationsPageProps> = ({ setActiveView, onEditLocation }) => {
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

  const handleToggleStatus = async (id: number, currentStatus: 'Ativo' | 'Bloqueado') => {
    const newStatus = currentStatus === 'Ativo' ? 'Bloqueado' : 'Ativo';

    setStatusLoading(id);
    const success = await updateUnitStatus(id, newStatus);
    setStatusLoading(null);

    if (!success) {
      // O erro já é tratado pelo hook
      console.error('Erro ao alterar status da unidade');
    }
  };

  const handleDeleteLocation = async (id: number) => {
    console.log("🔍 DEBUG: ID a ser excluído:", id);
    console.log("🔍 DEBUG: Tipo do ID:", typeof id);

    if (!confirm('Tem certeza que deseja excluir este local? Esta ação não pode ser desfeita.')) {
      console.log("🔍 DEBUG: Usuário cancelou a exclusão");
      return;
    }

    console.log("🔍 DEBUG: Usuário confirmou a exclusão, iniciando processo...");
    setDeleteLoading(id);

    console.log("🔍 DEBUG: Chamando deleteUnit com ID:", id);
    const success = await deleteUnit(id);
    console.log("🔍 DEBUG: Resultado do deleteUnit:", success);

    setDeleteLoading(null);

    if (!success) {
      console.error('❌ DEBUG: Erro ao excluir unidade - success =', success);
    } else {
      console.log("✅ DEBUG: Exclusão reportada como sucesso");
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
        <h2 className="text-gray-500 mb-4 text-lg">Suas Unidades</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {units.map((unit) => (
            <LocationCard
              key={unit.id}
              id={unit.id}
              name={unit.nome}
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

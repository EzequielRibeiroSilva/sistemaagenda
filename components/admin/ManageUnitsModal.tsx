import React from 'react';
import { createPortal } from 'react-dom';
import { X } from '../Icons';
import type { AdminUser } from '../../types';

interface ManageUnitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUser | null;
  onToggleUnitStatus: (userId: number, unitId: number) => void;
}

const ManageUnitsModal: React.FC<ManageUnitsModalProps> = ({ isOpen, onClose, user, onToggleUnitStatus }) => {
  const portalRoot = document.getElementById('portal-root');

  if (!isOpen || !portalRoot || !user) return null;
  
  const getStatusClass = (status: 'Ativo' | 'Bloqueado') => {
    return status === 'Ativo' 
        ? 'bg-green-100 text-green-800' 
        : 'bg-gray-100 text-gray-600';
  };

  const getButtonClass = (status: 'Ativo' | 'Bloqueado') => {
    return status === 'Ativo'
        ? 'bg-red-100 text-red-700 hover:bg-red-200'
        : 'bg-green-100 text-green-700 hover:bg-green-200';
  }

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
                <h2 className="text-lg font-bold text-gray-800">Gerenciar Unidades</h2>
                <p className="text-sm text-gray-500">{user.name}</p>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {user.units.length > 0 ? (
            <ul className="space-y-3">
              {user.units.map(unit => (
                <li key={unit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="font-medium text-gray-800">{unit.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusClass(unit.status)}`}>
                        {unit.status}
                    </span>
                    <button 
                        onClick={() => onToggleUnitStatus(user.id, unit.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${getButtonClass(unit.status)}`}>
                        {unit.status === 'Ativo' ? 'Bloquear' : 'Desbloquear'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-gray-500 py-8">Este usuário ainda não cadastrou nenhuma unidade.</p>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end">
          <button type="button" onClick={onClose} className="bg-white text-gray-700 border border-gray-300 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default ManageUnitsModal;

import React, { useState } from 'react';
import { Search } from './Icons';
import SearchResults from './SearchResults';

interface MobileSearchOverlayProps {
  onClose: () => void;
  onAddNewAppointment: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectService: (serviceId: string) => void;
  onSelectClient: (clientId: number) => void;
  onSelectAppointment: (appointmentId: number, appointmentDate: string) => void; // ✅ NOVO: Callback para navegar ao calendário
  userRole: 'ADMIN' | 'AGENTE';
  loggedInAgentId: string | null;
}

const MobileSearchOverlay: React.FC<MobileSearchOverlayProps> = ({
  onClose,
  onAddNewAppointment,
  onSelectAgent,
  onSelectService,
  onSelectClient,
  onSelectAppointment,
  userRole,
  loggedInAgentId
}) => {
  const [query, setQuery] = useState('');

  const handleAddNew = () => {
    onAddNewAppointment();
    onClose();
  };

  const handleSelectAgentWrapper = (agentId: string) => {
    onSelectAgent(agentId);
    onClose();
  };

  const handleSelectServiceWrapper = (serviceId: string) => {
    onSelectService(serviceId);
    onClose();
  };

  // ✅ NOVO: Handler para seleção de cliente
  const handleSelectClientWrapper = (clientId: number) => {
    onSelectClient(clientId);
    onClose();
  };

  // ✅ NOVO: Handler para seleção de agendamento
  const handleSelectAppointmentWrapper = (appointmentId: number, appointmentDate: string) => {
    onSelectAppointment(appointmentId, appointmentDate);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col lg:hidden">
      <div className="flex items-center p-4 border-b border-gray-200 bg-white shrink-0">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar reservas, clientes, equipe ou serviços"
            className="w-full bg-gray-100 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button onClick={onClose} className="ml-4 text-blue-600 font-semibold text-sm shrink-0">
          Cancelar
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {query && (
          <SearchResults
            query={query}
            onAddNewAppointment={handleAddNew}
            onSelectAgent={handleSelectAgentWrapper}
            onSelectService={handleSelectServiceWrapper}
            onSelectClient={handleSelectClientWrapper}
            onSelectAppointment={handleSelectAppointmentWrapper}
            userRole={userRole}
            loggedInAgentId={loggedInAgentId}
          />
        )}
      </div>
    </div>
  );
};

export default MobileSearchOverlay;

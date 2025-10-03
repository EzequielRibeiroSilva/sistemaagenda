
import React from 'react';
import { Plus, Edit } from './Icons';

interface LocationCardProps {
  id: string;
  name: string;
  agents: { avatar: string }[];
  onEdit: (id: string) => void;
}

const LocationCard: React.FC<LocationCardProps> = ({ id, name, agents, onEdit }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
    <div className="h-40 bg-gray-200 rounded-t-lg">
      {/* Placeholder for image */}
    </div>
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-gray-800 text-lg">{name}</h3>
        <button onClick={() => onEdit(id)} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800">
          <Edit className="w-4 h-4 mr-1" />
          Editar
        </button>
      </div>
      <div>
        <span className="text-sm text-gray-500">Agentes:</span>
        <div className="flex -space-x-2 mt-1">
          {agents.map((agent, index) => (
            <img key={index} src={agent.avatar} alt="agent" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const AddLocationCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div onClick={onClick} className="bg-white rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 min-h-[300px] text-center hover:border-blue-500 hover:text-blue-600 cursor-pointer transition-colors group">
    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
      <Plus className="w-6 h-6 text-white" />
    </div>
    <p className="font-semibold text-blue-600 text-lg">Adicionar Local</p>
  </div>
);

const mockLocation = {
  id: 'loc1',
  name: 'Local Principal',
  agents: [
    { avatar: 'https://i.pravatar.cc/150?img=1' },
    { avatar: 'https://i.pravatar.cc/150?img=2' },
    { avatar: 'https://i.pravatar.cc/150?img=3' },
  ],
};

interface LocationsPageProps {
  setActiveView: (view: string) => void;
  onEditLocation: (locationId: string) => void;
}

const LocationsPage: React.FC<LocationsPageProps> = ({ setActiveView, onEditLocation }) => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Locais</h1>
      <div>
        <h2 className="text-gray-500 mb-4 text-lg">Sem Categoria</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <LocationCard 
            id={mockLocation.id}
            name={mockLocation.name} 
            agents={mockLocation.agents} 
            onEdit={onEditLocation}
          />
          <AddLocationCard onClick={() => setActiveView('locations-create')} />
        </div>
      </div>
    </div>
  );
};

export default LocationsPage;

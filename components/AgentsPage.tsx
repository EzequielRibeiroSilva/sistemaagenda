import React from 'react';
import { Plus, Edit } from './Icons';

const agentsData = [
  {
    id: '1',
    name: 'Eduardo Soares',
    phone: '+5585989522202',
    avatar: 'https://i.pravatar.cc/150?img=1',
    availability: [
      { day: 'Seg', available: true },
      { day: 'Ter', available: true },
      { day: 'Qua', available: true },
      { day: 'Qui', available: true },
      { day: 'Sex', available: true },
      { day: 'Sab', available: true },
      { day: 'Dom', available: false },
    ],
    status: 'Ativo',
    reservations: 8,
    todayHours: '08:00 - 12:00  14:00 - 21:00',
  },
  {
    id: '2',
    name: 'Ângelo Paixão',
    phone: '+5585989307925',
    avatar: 'https://i.pravatar.cc/150?img=2',
    availability: [
      { day: 'Seg', available: true },
      { day: 'Ter', available: true },
      { day: 'Qua', available: true },
      { day: 'Qui', available: true },
      { day: 'Sex', available: true },
      { day: 'Sab', available: false },
      { day: 'Dom', available: false },
    ],
    status: 'Ativo',
    reservations: 1,
    todayHours: '14:00 - 21:00',
  },
  {
    id: '3',
    name: 'Snake Filho',
    phone: '+5585989307925',
    avatar: 'https://i.pravatar.cc/150?img=3',
    availability: [
      { day: 'Seg', available: true },
      { day: 'Ter', available: true },
      { day: 'Qua', available: true },
      { day: 'Qui', available: true },
      { day: 'Sex', available: true },
      { day: 'Sab', available: true },
      { day: 'Dom', available: false },
    ],
    status: 'Ativo',
    reservations: 7,
    todayHours: '09:00 - 13:00  14:00 - 21:00',
  },
];

const AgentCard: React.FC<{ agent: typeof agentsData[0]; onEdit: (id: string) => void; }> = ({ agent, onEdit }) => (
    <div className="relative group bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col transition-all duration-200 hover:border-blue-500 hover:shadow-lg">
        <button
            onClick={() => onEdit(agent.id)}
            aria-label={`Editar ${agent.name}`}
            className="absolute top-3 right-3 p-2 bg-white/70 backdrop-blur-sm rounded-full text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
            <Edit className="w-5 h-5" />
        </button>
        <div className="flex items-center">
            <img src={agent.avatar} alt={agent.name} className="w-12 h-12 rounded-full object-cover" />
            <div className="ml-4">
                <h3 className="font-bold text-gray-800">{agent.name}</h3>
                <p className="text-sm text-gray-500">{agent.phone}</p>
            </div>
        </div>
        <div className="my-4 border-t border-gray-200"></div>
        <div className="flex justify-between items-center text-xs text-center text-gray-500">
            {agent.availability.map(day => (
                <div key={day.day}>
                    <div className={`w-1.5 h-1.5 rounded-full mx-auto mb-1 ${day.available ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    {day.day}
                </div>
            ))}
        </div>
        <div className="my-4 border-t border-gray-200"></div>
        <div className="flex items-center justify-between text-sm">
            <div className="flex items-center">
                <span className="text-gray-500 mr-2">Hoje</span>
                <span className="font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded text-xs">{agent.status}</span>
            </div>
            <p className="text-gray-600">{agent.todayHours}</p>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-500">Reservas</span>
            <span className="font-bold text-gray-800 text-lg">{agent.reservations}</span>
        </div>
    </div>
);

const AddAgentCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div 
    onClick={onClick} 
    className="bg-white rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 min-h-[250px] text-center hover:border-blue-500 hover:bg-gray-50/50 cursor-pointer transition-colors group">
    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
      <Plus className="w-8 h-8 text-white" />
    </div>
    <p className="font-semibold text-blue-600 text-lg">Adicionar Agente</p>
  </div>
);

interface AgentsPageProps {
  setActiveView: (view: string) => void;
  onEditAgent: (agentId: string) => void;
}

const AgentsPage: React.FC<AgentsPageProps> = ({ setActiveView, onEditAgent }) => {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Agentes</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {agentsData.map(agent => <AgentCard key={agent.id} agent={agent} onEdit={onEditAgent} />)}
                <AddAgentCard onClick={() => setActiveView('agents-create')} />
            </div>
        </div>
    );
};

export default AgentsPage;
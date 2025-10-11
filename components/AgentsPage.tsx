import React from 'react';
import { Plus, Edit, FaUser } from './Icons';
import { useAgentManagement, Agent } from '../hooks/useAgentManagement';

// Componente removido - usando dados reais do hook

const AgentCard: React.FC<{ agent: Agent; onEdit: (id: number) => void; }> = ({ agent, onEdit }) => (
    <div className="relative group bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col transition-all duration-200 hover:border-blue-500 hover:shadow-lg">
        <button
            onClick={() => onEdit(agent.id)}
            aria-label={`Editar ${agent.name}`}
            className="absolute top-3 right-3 p-2 bg-white/70 backdrop-blur-sm rounded-full text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
            <Edit className="w-5 h-5" />
        </button>
        <div className="flex items-center">
            <div className="relative w-12 h-12">
                {agent.avatar ? (
                    <img
                        src={`http://localhost:3001${agent.avatar}`}
                        alt={agent.name}
                        className="w-12 h-12 rounded-full object-cover"
                        onError={(e) => {
                            // ✅ CORREÇÃO: Fallback melhorado com logs
                            console.error('❌ Erro ao carregar avatar do agente:', agent.name, agent.avatar);
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallbackDiv = target.nextElementSibling as HTMLElement;
                            if (fallbackDiv) {
                                fallbackDiv.classList.remove('hidden');
                            }
                        }}
                    />
                ) : null}
                <div className={`w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center ${agent.avatar ? 'hidden' : ''}`}>
                    <FaUser className="w-6 h-6 text-gray-600" />
                </div>
            </div>
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
    const { agents, loading, error } = useAgentManagement();

    const handleEditAgent = (agentId: number) => {
        onEditAgent(agentId.toString());
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Carregando agentes...</p>
                </div>
            </div>
        );
    }

    // Não bloquear a página inteira por erro de serviços
    // Mostrar erro como banner no topo, mas permitir uso da página

    return (
        <div className="space-y-6">
            {/* Banner de erro (não bloqueia a página) */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center">
                        <div className="text-red-500 text-xl mr-3">⚠️</div>
                        <div className="flex-1">
                            <p className="text-red-700 font-medium">Aviso</p>
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                        >
                            Recarregar
                        </button>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Agentes</h1>
                <div className="text-sm text-gray-600">
                    {agents.length} agente{agents.length !== 1 ? 's' : ''} encontrado{agents.length !== 1 ? 's' : ''}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {agents.map(agent => (
                    <AgentCard key={agent.id} agent={agent} onEdit={handleEditAgent} />
                ))}
                <AddAgentCard onClick={() => setActiveView('agents-create')} />
            </div>
        </div>
    );
};

export default AgentsPage;
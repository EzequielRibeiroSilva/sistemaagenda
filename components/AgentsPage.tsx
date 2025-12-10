import React, { useState } from 'react';
import { FaUser } from './Icons';
import { useAgentManagement } from '../hooks/useAgentManagement';
import { useToast } from '../contexts/ToastContext';
import { getAssetUrl } from '../utils/api';
import { BaseCard, AddCard, CardInfoRow, CardStatusBadge } from './BaseCard';

// Tipo Agent do hook
interface Agent {
  id: number;
  name: string;
  phone: string;
  avatar?: string;
  status: string;
  todayHours?: string;
  reservations: number;
  availability: Array<{ day: string; available: boolean }>;
}

interface AgentCardProps {
  agent: Agent;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isConfirmingDelete?: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onEdit, onDelete, isConfirmingDelete = false }) => {
  // Avatar do agente para o header
  const avatarContent = (
    <div className="flex items-center">
      <div className="relative w-14 h-14">
        {agent.avatar ? (
          <img
            src={getAssetUrl(agent.avatar)}
            alt={agent.name}
            className="w-14 h-14 rounded-full object-cover border-2 border-[#2663EB] shadow-sm"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const fallbackDiv = target.nextElementSibling as HTMLElement;
              if (fallbackDiv) {
                fallbackDiv.classList.remove('hidden');
              }
            }}
          />
        ) : null}
        <div className={`w-14 h-14 rounded-full bg-gray-300 flex items-center justify-center border-2 border-[#2663EB] ${agent.avatar ? 'hidden' : ''}`}>
          <FaUser className="w-7 h-7 text-gray-600" />
        </div>
      </div>
      <div className="ml-3">
        <p className="text-sm text-gray-500">{agent.phone}</p>
      </div>
    </div>
  );

  return (
    <BaseCard
      title={agent.name}
      onEdit={() => onEdit(agent.id)}
      onDelete={() => onDelete(agent.id)}
      isConfirmingDelete={isConfirmingDelete}
      editLabel="Editar Agente"
      showTopBar={true}
      headerContent={avatarContent}
    >
      {/* Indicadores de disponibilidade por dia */}
      <div className="flex justify-between items-center text-xs text-center text-gray-500 mb-3">
        {agent.availability.map(day => (
          <div key={day.day}>
            <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${day.available ? 'bg-green-500' : 'bg-gray-300'}`}></div>
            {day.day}
          </div>
        ))}
      </div>

      {/* Divisor */}
      <div className="border-t border-gray-100 my-2"></div>

      {/* Horários de hoje (se disponível) */}
      {agent.todayHours && agent.todayHours.trim() !== '' && (
        <CardInfoRow 
          label="Horários Hoje" 
          value={agent.todayHours}
          valueClassName="text-xs"
        />
      )}

      {/* Status */}
      <CardInfoRow 
        label="Status" 
        value={
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-green-500"></span>
            {agent.status}
          </span>
        }
      />

      {/* Reservas */}
      <CardInfoRow 
        label="Reservas" 
        value={agent.reservations.toString()}
        valueClassName="text-lg font-bold"
      />
    </BaseCard>
  );
};

const AddAgentCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <AddCard 
    onClick={onClick} 
    label="Adicionar Agente" 
  />
);

interface AgentsPageProps {
  setActiveView: (view: string) => void;
  onEditAgent: (agentId: string) => void;
}

const AgentsPage: React.FC<AgentsPageProps> = ({ setActiveView, onEditAgent }) => {
    const { agents, loading, error, deleteAgent } = useAgentManagement();
    const toast = useToast();
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

    const handleEditAgent = (agentId: number) => {
        onEditAgent(agentId.toString());
    };

    const handleDeleteAgent = async (agentId: number) => {
        const agent = agents.find(a => a.id === agentId);
        if (!agent) return;

        // Se já está confirmando este item, executar a exclusão
        if (confirmingDelete === agentId) {
            setDeleteLoading(agentId);
            setConfirmingDelete(null);

            const success = await deleteAgent(agentId);
            setDeleteLoading(null);

            if (success) {
                toast.success('Agente Excluído!', `O agente "${agent.name}" foi removido com sucesso do sistema.`);
            } else {
                toast.error('Erro ao Excluir', 'Não foi possível excluir o agente. Tente novamente.');
            }
        } else {
            // Primeira vez clicando: mostrar toast de aviso e marcar para confirmação
            setConfirmingDelete(agentId);
            toast.warning('Confirme a Exclusão', `Clique novamente no ícone de lixeira para confirmar a exclusão de "${agent.name}". Esta ação não pode ser desfeita.`);

            // Resetar confirmação após 5 segundos
            setTimeout(() => {
                setConfirmingDelete(null);
            }, 5000);
        }
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

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {agents.map(agent => (
                    <div key={agent.id} className={deleteLoading === agent.id ? 'opacity-50 pointer-events-none' : ''}>
                        <AgentCard
                            agent={agent}
                            onEdit={handleEditAgent}
                            onDelete={handleDeleteAgent}
                            isConfirmingDelete={confirmingDelete === agent.id}
                        />
                    </div>
                ))}
                <AddAgentCard onClick={() => setActiveView('agents-create')} />
            </div>
        </div>
    );
};

export default AgentsPage;
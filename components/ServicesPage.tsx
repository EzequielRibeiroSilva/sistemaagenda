
import React, { useState, useEffect } from 'react';
import ServiceExtrasPage from './ServiceExtrasPage';
import { useServiceManagement } from '../hooks/useServiceManagement';
import { getAssetUrl } from '../utils/api';
import { useToast } from '../contexts/ToastContext';
import { BaseCard, AddCard, CardInfoRow, CardAvatarGroup, CardStatusBadge } from './BaseCard';

interface Service {
  id: number;
  nome: string;
  descricao?: string;
  duracao_minutos: number;
  preco: number;
  comissao_percentual: number;
  status: 'Ativo' | 'Bloqueado';
  agentes_associados?: Array<{ id: number; nome: string; sobrenome: string; avatar?: string }>;
  extras_associados?: Array<{ id: number; nome: string }>;
}

const ServiceCard: React.FC<{ service: Service; onEdit: (id: number) => void; onDelete: (id: number) => void; isConfirmingDelete?: boolean }> = ({ service, onEdit, onDelete, isConfirmingDelete = false }) => {
  // Preparar avatares dos agentes para o CardAvatarGroup
  const agentAvatars = service.agentes_associados?.map((agent, index) => ({
    id: agent.id,
    url: agent.avatar_url ? getAssetUrl(agent.avatar_url) : `https://i.pravatar.cc/150?img=${index + 1}`,
    alt: `${agent.nome} ${agent.sobrenome}`
  })) || [];

  return (
    <BaseCard
      title={service.nome}
      onEdit={() => onEdit(service.id)}
      onDelete={() => onDelete(service.id)}
      isConfirmingDelete={isConfirmingDelete}
      editLabel="Editar Serviço"
      showTopBar={true}
    >
      {/* Avatares dos agentes */}
      <CardAvatarGroup avatars={agentAvatars} label="Agentes" maxVisible={3} />

      {/* Divisor */}
      <div className="border-t border-gray-100 my-2"></div>

      {/* Informações do serviço */}
      <CardInfoRow 
        label="Duração" 
        value={`${service.duracao_minutos} min`} 
      />
      <CardInfoRow 
        label="Preço" 
        value={`R$ ${(Number(service.preco) || 0).toFixed(2)}`} 
      />
      <CardInfoRow 
        label="Comissão" 
        value={`${Number(service.comissao_percentual) || 0}%`} 
      />
      <CardInfoRow 
        label="Status" 
        value={<CardStatusBadge status={service.status} />} 
      />
    </BaseCard>
  );
};

const AddServiceCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <AddCard 
    onClick={onClick} 
    label="Adicionar Serviço" 
  />
);

interface ServicesPageProps {
  initialTab: string;
  setActiveView: (view: string) => void;
  onEditService: (serviceId: number) => void;
  onEditExtraService: (extraServiceId: string) => void;
}

const ServicesPage: React.FC<ServicesPageProps> = ({ initialTab, setActiveView, onEditService, onEditExtraService }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const tabs = ['Serviços', 'Serviços Extras'];
  const toast = useToast();
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  // Hook para gerenciar serviços
  const { services, loading, error, fetchServices, deleteService } = useServiceManagement();

  // Carregar serviços quando o componente montar
  useEffect(() => {
    if (activeTab === 'Serviços') {
      fetchServices();
    }
  }, [activeTab, fetchServices]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabClick = (tabName: string) => {
    setActiveTab(tabName);
    if (tabName === 'Serviços') setActiveView('services-list');
    if (tabName === 'Serviços Extras') setActiveView('services-extra');
  }

  const handleDeleteService = async (id: number) => {
    const service = services.find(s => s.id === id);
    if (!service) return;

    // Se já está confirmando este item, executar a exclusão
    if (confirmingDelete === id) {
      setDeleteLoading(id);
      setConfirmingDelete(null);

      const success = await deleteService(id);
      setDeleteLoading(null);

      if (success) {
        toast.success('Serviço Excluído!', `O serviço "${service.nome}" foi removido com sucesso do sistema.`);
      } else {
        toast.error('Erro ao Excluir', 'Não foi possível excluir o serviço. Tente novamente.');
      }
    } else {
      // Primeira vez clicando: mostrar toast de aviso e marcar para confirmação
      setConfirmingDelete(id);
      toast.warning('Confirme a Exclusão', `Clique novamente no X para confirmar a exclusão de "${service.nome}". Esta ação não pode ser desfeita.`);

      // Resetar confirmação após 5 segundos
      setTimeout(() => {
        setConfirmingDelete(null);
      }, 5000);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Serviços</h1>
      
      <div className="flex items-center border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => handleTabClick(tab)}
            className={`px-1 py-4 text-lg font-semibold mr-8 transition-colors duration-200 relative ${
              activeTab === tab 
              ? 'text-blue-600' 
              : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"></div>}
          </button>
        ))}
      </div>

      {activeTab === 'Serviços' && (
        <div>
          {/* Loading state */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded mb-3"></div>
                  <div className="h-3 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600 text-sm">❌ {error}</p>
            </div>
          )}

          {/* Services grid */}
          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {services.map((service) => (
                <div key={service.id} className={deleteLoading === service.id ? 'opacity-50 pointer-events-none' : ''}>
                  <ServiceCard
                    service={service}
                    onEdit={onEditService}
                    onDelete={handleDeleteService}
                    isConfirmingDelete={confirmingDelete === service.id}
                  />
                </div>
              ))}
              <AddServiceCard onClick={() => setActiveView('services-create')} />
            </div>
          )}
        </div>
      )}
      {activeTab === 'Serviços Extras' && <ServiceExtrasPage setActiveView={setActiveView} onEditExtraService={onEditExtraService} />}
    </div>
  );
};

export default ServicesPage;
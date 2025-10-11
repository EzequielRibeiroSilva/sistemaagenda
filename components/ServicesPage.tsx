
import React, { useState, useEffect } from 'react';
import { Plus, Edit } from './Icons';
import ServiceExtrasPage from './ServiceExtrasPage';
import { useServiceManagement } from '../hooks/useServiceManagement';

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

const ServiceCard: React.FC<{ service: Service; onEdit: (id: number) => void }> = ({ service, onEdit }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
    <div className="p-4 flex-grow">
      <h3 className="font-bold text-gray-800 text-sm uppercase h-10 flex items-center">{service.nome}</h3>
      <hr className="my-3" />
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-500">Agentes:</span>
        {service.agentes_associados && service.agentes_associados.length > 0 ? (
          <>
            <div className="flex -space-x-2">
              {service.agentes_associados.slice(0, 3).map((agent, index) => (
                <img
                  key={agent.id}
                  src={agent.avatar_url ? `http://localhost:3001${agent.avatar_url}` : `https://i.pravatar.cc/150?img=${index + 1}`}
                  alt={`${agent.nome} ${agent.sobrenome}`}
                  className="w-6 h-6 rounded-full border-2 border-white object-cover"
                />
              ))}
            </div>
            {service.agentes_associados.length > 3 && (
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full font-medium text-gray-600">
                +{service.agentes_associados.length - 3} mais
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-400">Nenhum agente</span>
        )}
      </div>
      <hr className="my-3" />
      <div>
        <div className="flex justify-between text-sm text-gray-500">
          <p>Duração:</p>
          <p className="text-gray-700 font-medium">{service.duracao_minutos} min</p>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <p>Preço:</p>
          <p className="text-gray-700 font-medium">R$ {(Number(service.preco) || 0).toFixed(2)}</p>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <p>Comissão:</p>
          <p className="text-gray-700 font-medium">{Number(service.comissao_percentual) || 0}%</p>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <p>Status:</p>
          <p className={`font-medium ${service.status === 'Ativo' ? 'text-green-600' : 'text-red-600'}`}>
            {service.status === 'Ativo' ? 'Disponível' : 'Indisponível'}
          </p>
        </div>
      </div>
    </div>
    <div className="p-4 bg-white rounded-b-lg mt-auto">
      <button
        onClick={() => onEdit(service.id)}
        className="w-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg text-sm transition-colors">
        <Edit className="w-4 h-4 mr-2" />
        Editar Serviço
      </button>
    </div>
  </div>
);

const AddServiceCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div onClick={onClick} className="bg-white rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 min-h-[300px] text-center hover:border-blue-500 hover:text-blue-600 cursor-pointer transition-colors group">
    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
      <Plus className="w-6 h-6 text-white" />
    </div>
    <p className="font-semibold text-blue-600">Adicionar</p>
    <p className="font-semibold text-blue-600">Serviço</p>
  </div>
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

  // Hook para gerenciar serviços
  const { services, loading, error, fetchServices } = useServiceManagement();

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

  return (
    <div>
      <div className="flex items-center border-b border-gray-200 mb-6 -mt-2">
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
          <h2 className="text-gray-500 mb-4">Sem categoria</h2>

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
              {services.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-500 mb-2">Nenhum serviço encontrado</h3>
                  <p className="text-gray-400 text-sm mb-6">Comece criando seu primeiro serviço</p>
                  <button
                    onClick={() => setActiveView('services-create')}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Criar Primeiro Serviço
                  </button>
                </div>
              ) : (
                <>
                  {services.map((service) => (
                    <ServiceCard key={service.id} service={service} onEdit={onEditService} />
                  ))}
                  <AddServiceCard onClick={() => setActiveView('services-create')} />
                </>
              )}
            </div>
          )}
        </div>
      )}
      {activeTab === 'Serviços Extras' && <ServiceExtrasPage setActiveView={setActiveView} onEditExtraService={onEditExtraService} />}
    </div>
  );
};

export default ServicesPage;
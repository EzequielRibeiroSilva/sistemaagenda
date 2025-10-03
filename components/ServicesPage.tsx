
import React, { useState, useEffect } from 'react';
import type { ServiceInfo } from '../types';
import { Plus, Edit } from './Icons';
import ServiceCategoriesPage from './ServiceCategoriesPage';
import ServiceExtrasPage from './ServiceExtrasPage';

const mockServices: (ServiceInfo & { id: string })[] = [
  { id: 's1', name: 'CORTE+BARBA+PIGMENTAÇÃO DA BARBA', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 90, buffer: '0/0 min' },
  { id: 's2', name: 'CORTE+BARBA+PIGMENTAÇÃO BARBA E CABELO', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 75, buffer: '0/0 min' },
  { id: 's3', name: 'ALISAMENTO AMERICANO +CORTE', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 60, buffer: '0/0 min' },
  { id: 's4', name: 'ALISAMENTO AMERICANO', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 60, buffer: '0/0 min' },
  { id: 's5', name: 'LIMPEZA DE PELE', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 30, buffer: '0/0 min' },
  { id: 's6', name: 'CORTE', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 30, buffer: '0/0 min' },
  { id: 's7', name: 'CORTE + PIGMENTAÇÃO', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 50, buffer: '0/0 min' },
  { id: 's8', name: 'CORTE + BARBA', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 45, buffer: '0/0 min' },
  { id: 's9', name: 'BARBA + PIGMENTAÇÃO', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 30, buffer: '0/0 min' },
  { id: 's10', name: 'LUZES + CORTE', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 70, buffer: '0/0 min' },
  { id: 's11', name: 'BARBA', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 20, buffer: '0/0 min' },
  { id: 's12', name: 'BARBOTERAPIA', agents: [{ avatar: 'https://i.pravatar.cc/150?img=58' }, { avatar: 'https://i.pravatar.cc/150?img=60' }], duration: 60, price: 30, buffer: '0/0 min' },
];

const ServiceCard: React.FC<{ service: (ServiceInfo & { id: string }); onEdit: (id: string) => void }> = ({ service, onEdit }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
    <div className="p-4 flex-grow">
      <h3 className="font-bold text-gray-800 text-sm uppercase h-10 flex items-center">{service.name}</h3>
      <hr className="my-3" />
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-500">Agentes:</span>
        <div className="flex -space-x-2">
          {service.agents.map((agent, index) => (
            <img key={index} src={agent.avatar} alt="agent" className="w-6 h-6 rounded-full border-2 border-white object-cover" />
          ))}
        </div>
        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full font-medium text-gray-600">+1 mais</span>
      </div>
      <hr className="my-3" />
      <div>
        <div className="flex justify-between text-sm text-gray-500"><p>Duração:</p> <p className="text-gray-700 font-medium">{service.duration} min</p></div>
        <div className="flex justify-between text-sm text-gray-500"><p>Preço:</p> <p className="text-gray-700 font-medium">R${service.price}</p></div>
        <div className="flex justify-between text-sm text-gray-500"><p>Buffer:</p> <p className="text-gray-700 font-medium">{service.buffer}</p></div>
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
  onEditService: (serviceId: string) => void;
  onEditExtraService: (extraServiceId: string) => void;
}

const ServicesPage: React.FC<ServicesPageProps> = ({ initialTab, setActiveView, onEditService, onEditExtraService }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const tabs = ['Serviços', 'Serviços Extras'];

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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {mockServices.map((service, index) => (
              <ServiceCard key={index} service={service} onEdit={onEditService} />
            ))}
            <AddServiceCard onClick={() => setActiveView('services-create')} />
          </div>
        </div>
      )}
      {activeTab === 'Serviços Extras' && <ServiceExtrasPage setActiveView={setActiveView} onEditExtraService={onEditExtraService} />}
    </div>
  );
};

export default ServicesPage;
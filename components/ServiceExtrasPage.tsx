
import React from 'react';
import { Plus, Edit } from './Icons';

interface ExtraService {
  id: string;
  name: string;
  services: string;
  duration: number;
  price: number;
  maxQty: number;
}

const mockExtraServices: ExtraService[] = [
  {
    id: 'extra1',
    name: 'SOBRANCELHA',
    services: 'Todos Selecionados',
    duration: 0,
    price: 7,
    maxQty: 1,
  },
];

const ExtraServiceCard: React.FC<{ extra: ExtraService; onEdit: (id: string) => void }> = ({ extra, onEdit }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col justify-between min-h-[220px]">
    <div>
      <h3 className="font-bold text-gray-800 uppercase">{extra.name}</h3>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Serviços:</span>
          <span className="font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded text-xs">{extra.services}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Duração:</span>
          <span className="font-medium text-gray-700">{extra.duration} min</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Preço:</span>
          <span className="font-medium text-gray-700">R${extra.price}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Qtd. Máx:</span>
          <span className="font-medium text-gray-700">{extra.maxQty}</span>
        </div>
      </div>
    </div>
    <button onClick={() => onEdit(extra.id)} className="w-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg text-sm transition-colors mt-4">
      <Edit className="w-4 h-4 mr-2" />
      Editar Extra
    </button>
  </div>
);

const AddExtraCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div 
    onClick={onClick} 
    className="bg-white rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 min-h-[220px] text-center hover:border-blue-500 hover:text-blue-600 cursor-pointer transition-colors group">
    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
      <Plus className="w-6 h-6 text-white" />
    </div>
    <p className="font-semibold text-blue-600">Adicionar Extra</p>
  </div>
);

interface ServiceExtrasPageProps {
  setActiveView: (view: string) => void;
  onEditExtraService: (id: string) => void;
}

const ServiceExtrasPage: React.FC<ServiceExtrasPageProps> = ({ setActiveView, onEditExtraService }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {mockExtraServices.map((extra) => (
        <ExtraServiceCard key={extra.id} extra={extra} onEdit={onEditExtraService} />
      ))}
      <AddExtraCard onClick={() => setActiveView('services-extra-create')} />
    </div>
  );
};

export default ServiceExtrasPage;
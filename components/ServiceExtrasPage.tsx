
import React, { useEffect } from 'react';
import { Plus, Edit } from './Icons';
import { useExtraServiceManagement } from '../hooks/useExtraServiceManagement';

interface ExtraService {
  id: number;
  nome: string;
  preco: number | string; // Backend pode retornar como string
  duracao_minutos: number;
  quantidade_maxima: number;
  status: 'Ativo' | 'Inativo';
  servicos_conectados_count?: number;
}

const ExtraServiceCard: React.FC<{ extra: ExtraService; onEdit: (id: string) => void }> = ({ extra, onEdit }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col justify-between min-h-[220px]">
    <div>
      <h3 className="font-bold text-gray-800 uppercase">{extra.nome}</h3>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Status:</span>
          <span className={`font-medium px-2 py-0.5 rounded text-xs ${
            extra.status === 'Ativo'
              ? 'text-green-700 bg-green-100'
              : 'text-red-700 bg-red-100'
          }`}>
            {extra.status}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Duração:</span>
          <span className="font-medium text-gray-700">{extra.duracao_minutos} min</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Preço:</span>
          <span className="font-medium text-gray-700">R$ {typeof extra.preco === 'string' ? parseFloat(extra.preco).toFixed(2) : extra.preco.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Qtd. Máx:</span>
          <span className="font-medium text-gray-700">{extra.quantidade_maxima}</span>
        </div>
      </div>
    </div>
    <button onClick={() => onEdit(extra.id.toString())} className="w-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg text-sm transition-colors mt-4">
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
  const { extraServices, loading, error, fetchExtraServices } = useExtraServiceManagement();

  useEffect(() => {
    fetchExtraServices();
  }, [fetchExtraServices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando serviços extras...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Erro ao carregar serviços extras: {error}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {extraServices.map((extra) => (
        <ExtraServiceCard key={extra.id} extra={extra} onEdit={onEditExtraService} />
      ))}
      <AddExtraCard onClick={() => setActiveView('services-extra-create')} />
    </div>
  );
};

export default ServiceExtrasPage;
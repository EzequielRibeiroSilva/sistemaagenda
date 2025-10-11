
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
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
    <div className="p-4 flex-grow">
      <h3 className="font-bold text-gray-800 text-sm uppercase h-10 flex items-center">{extra.nome}</h3>
      <hr className="my-3" />

      {/* Seção de informações principais */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-500">
          <p>Duração:</p>
          <p className="text-gray-700 font-medium">{extra.duracao_minutos} min</p>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <p>Preço:</p>
          <p className="text-gray-700 font-medium">R$ {typeof extra.preco === 'string' ? parseFloat(extra.preco).toFixed(2) : extra.preco.toFixed(2)}</p>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <p>Qtd. Máx:</p>
          <p className="text-gray-700 font-medium">{extra.quantidade_maxima}</p>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <p>Status:</p>
          <p className={`font-medium ${extra.status === 'Ativo' ? 'text-green-600' : 'text-red-600'}`}>
            {extra.status === 'Ativo' ? 'Disponível' : 'Indisponível'}
          </p>
        </div>
      </div>
    </div>
    <div className="p-4 bg-white rounded-b-lg mt-auto">
      <button
        onClick={() => onEdit(extra.id.toString())}
        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-2"
      >
        <Edit className="w-4 h-4" />
        <span>Editar Extra</span>
      </button>
    </div>
  </div>
);

const AddExtraCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div onClick={onClick} className="bg-white rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 min-h-[300px] text-center hover:border-blue-500 hover:text-blue-600 cursor-pointer transition-colors group">
    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
      <Plus className="w-6 h-6 text-white" />
    </div>
    <p className="font-semibold text-blue-600">Adicionar</p>
    <p className="text-sm text-gray-500 mt-1">Novo serviço extra</p>
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
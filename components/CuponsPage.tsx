import React, { useState, useEffect } from 'react';
import { Plus, Edit, Ticket } from './Icons';
import { useCupomManagement, Cupom } from '../hooks/useCupomManagement';
import { useUnitManagement } from '../hooks/useUnitManagement';

interface CupomCardProps {
  cupom: Cupom;
  onEdit: (id: number) => void;
}

const CupomCard: React.FC<CupomCardProps> = ({ cupom, onEdit }) => {
  const formatarData = (data: string | undefined) => {
    if (!data) return 'Sem validade';
    try {
      const date = new Date(data);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return 'Data inválida';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
      <div className="p-4 flex-grow">
        {/* Título do Cupom */}
        <h3 className="font-bold text-gray-800 text-sm uppercase h-10 flex items-center">
          {cupom.codigo}
        </h3>
        <hr className="my-3" />

        {/* Desconto em destaque */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {cupom.valor_desconto}% OFF
          </p>
        </div>

        {/* Informações do cupom */}
        <div className="space-y-2">
          {cupom.data_fim && (
            <div className="flex justify-between text-sm text-gray-500">
              <p>Validade:</p>
              <p className="text-gray-700 font-medium">{formatarData(cupom.data_fim)}</p>
            </div>
          )}
          
          <div className="flex justify-between text-sm text-gray-500">
            <p>Usos:</p>
            <p className="text-gray-700 font-medium">
              {cupom.uso_atual}{cupom.limite_uso_total ? ` / ${cupom.limite_uso_total}` : ''}
            </p>
          </div>

          {cupom.limite_uso_por_cliente && (
            <div className="flex justify-between text-sm text-gray-500">
              <p>Por cliente:</p>
              <p className="text-gray-700 font-medium">{cupom.limite_uso_por_cliente}x</p>
            </div>
          )}

          <div className="flex justify-between text-sm text-gray-500">
            <p>Status:</p>
            <p className={`font-medium ${
              cupom.status === 'Ativo' ? 'text-green-600' : 
              cupom.status === 'Expirado' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {cupom.status === 'Ativo' ? 'Disponível' : cupom.status}
            </p>
          </div>

          {/* Serviços aplicáveis */}
          {cupom.servico_ids && cupom.servico_ids.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Aplicável em:</p>
              <p className="text-xs text-blue-600 font-medium">
                {cupom.servico_ids.length} serviço{cupom.servico_ids.length > 1 ? 's' : ''} específico{cupom.servico_ids.length > 1 ? 's' : ''}
              </p>
            </div>
          )}
          {(!cupom.servico_ids || cupom.servico_ids.length === 0) && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">Aplicável em:</p>
              <p className="text-xs text-green-600 font-medium">Todos os serviços</p>
            </div>
          )}
        </div>
      </div>

      {/* Botão Editar */}
      <div className="p-4 bg-white rounded-b-lg mt-auto">
        <button
          onClick={() => onEdit(cupom.id)}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-2"
        >
          <Edit className="w-4 h-4" />
          <span>Editar Cupom</span>
        </button>
      </div>
    </div>
  );
};

const AddCupomCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div
    onClick={onClick}
    className="bg-white rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 min-h-[300px] text-center hover:border-blue-500 hover:text-blue-600 cursor-pointer transition-colors group"
  >
    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
      <Plus className="w-6 h-6 text-white" />
    </div>
    <p className="font-semibold text-blue-600">Adicionar</p>
    <p className="font-semibold text-blue-600">Cupom</p>
  </div>
);

interface CuponsPageProps {
  setActiveView: (view: string) => void;
  onEditCupom?: (cupomId: number) => void;
}

const CuponsPage: React.FC<CuponsPageProps> = ({ setActiveView, onEditCupom }) => {
  const { cupons, loading, error, pagination, fetchCupons } = useCupomManagement();
  const { units, fetchUnits } = useUnitManagement();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [localFilter, setLocalFilter] = useState('');

  // Carregar unidades quando o componente montar
  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  // Carregar cupons quando o componente montar ou filtros mudarem
  useEffect(() => {
    fetchCupons(1, 20, {
      search: searchTerm,
      status: statusFilter,
      unidade_id: localFilter
    });
  }, [searchTerm, statusFilter, localFilter, fetchCupons]);

  const handleEditCupom = (cupomId: number) => {
    if (onEditCupom) {
      onEditCupom(cupomId);
    } else {
      setActiveView('cupons-edit');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com Título */}
      <h1 className="text-3xl font-bold text-gray-800">Cupons de Desconto</h1>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className={`grid grid-cols-1 gap-4 ${units.length > 1 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar cupom
            </label>
            <input
              type="text"
              placeholder="Código ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todos os status</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Expirado">Expirado</option>
            </select>
          </div>
          {/* Filtro de Local - só aparece se houver mais de uma unidade */}
          {units.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Local
              </label>
              <select
                value={localFilter}
                onChange={(e) => setLocalFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos os locais</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id.toString()}>
                    {unit.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse">
              <div className="h-20 bg-gray-200 rounded mb-4"></div>
              <div className="h-16 bg-gray-200 rounded mb-4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-600 text-sm">❌ {error}</p>
        </div>
      )}

      {/* Cupons Grid */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {/* Cards dos cupons existentes aparecem primeiro */}
          {cupons.map((cupom) => (
            <CupomCard key={cupom.id} cupom={cupom} onEdit={handleEditCupom} />
          ))}
          
          {/* Card "Adicionar Cupom" aparece por último */}
          <AddCupomCard onClick={() => setActiveView('cupons-create')} />
        </div>
      )}

      {/* Paginação */}
      {!loading && !error && cupons.length > 0 && pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-center space-x-2">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => fetchCupons(page, 20, { search: searchTerm, status: statusFilter, unidade_id: localFilter })}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                page === pagination.page
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CuponsPage;

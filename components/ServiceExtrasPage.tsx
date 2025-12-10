
import React, { useEffect, useState } from 'react';
import { useExtraServiceManagement } from '../hooks/useExtraServiceManagement';
import { useToast } from '../contexts/ToastContext';
import { BaseCard, AddCard, CardInfoRow, CardStatusBadge } from './BaseCard';

interface ExtraService {
  id: number;
  nome: string;
  preco: number | string; // Backend pode retornar como string
  duracao_minutos: number;
  quantidade_maxima: number;
  status: 'Ativo' | 'Inativo';
  servicos_conectados_count?: number;
}

const ExtraServiceCard: React.FC<{ extra: ExtraService; onEdit: (id: string) => void; onDelete: (id: number) => void; isConfirmingDelete?: boolean }> = ({ extra, onEdit, onDelete, isConfirmingDelete = false }) => {
  // Formatar preço corretamente
  const precoFormatado = typeof extra.preco === 'string' 
    ? parseFloat(extra.preco).toFixed(2) 
    : extra.preco.toFixed(2);

  return (
    <BaseCard
      title={extra.nome}
      onEdit={() => onEdit(extra.id.toString())}
      onDelete={() => onDelete(extra.id)}
      isConfirmingDelete={isConfirmingDelete}
      editLabel="Editar Extra"
      showTopBar={true}
    >
      {/* Informações do serviço extra */}
      <CardInfoRow 
        label="Duração" 
        value={`${extra.duracao_minutos} min`} 
      />
      <CardInfoRow 
        label="Preço" 
        value={`R$ ${precoFormatado}`} 
      />
      <CardInfoRow 
        label="Qtd. Máx" 
        value={extra.quantidade_maxima.toString()} 
      />
      <CardInfoRow 
        label="Status" 
        value={<CardStatusBadge status={extra.status} />} 
      />
    </BaseCard>
  );
};

const AddExtraCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <AddCard 
    onClick={onClick} 
    label="Adicionar Serviço Extra" 
    sublabel="Novo serviço extra"
  />
);

interface ServiceExtrasPageProps {
  setActiveView: (view: string) => void;
  onEditExtraService: (id: string) => void;
}

const ServiceExtrasPage: React.FC<ServiceExtrasPageProps> = ({ setActiveView, onEditExtraService }) => {
  const { extraServices, loading, error, fetchExtraServices, deleteExtraService } = useExtraServiceManagement();
  const toast = useToast();
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  useEffect(() => {
    fetchExtraServices();
  }, [fetchExtraServices]);

  const handleDeleteExtraService = async (id: number) => {
    const extraService = extraServices.find(e => e.id === id);
    if (!extraService) return;

    // Se já está confirmando este item, executar a exclusão
    if (confirmingDelete === id) {
      setDeleteLoading(id);
      setConfirmingDelete(null);

      const result = await deleteExtraService(id);
      setDeleteLoading(null);

      if (result.success) {
        toast.success('Serviço Extra Excluído!', `O serviço extra "${extraService.nome}" foi removido com sucesso do sistema.`);
        // Recarregar lista
        await fetchExtraServices();
      } else {
        toast.error('Erro ao Excluir', result.error || 'Não foi possível excluir o serviço extra. Tente novamente.');
      }
    } else {
      // Primeira vez clicando: mostrar toast de aviso e marcar para confirmação
      setConfirmingDelete(id);
      toast.warning('Confirme a Exclusão', `Clique novamente no X para confirmar a exclusão de "${extraService.nome}". Esta ação não pode ser desfeita.`);

      // Resetar confirmação após 5 segundos
      setTimeout(() => {
        setConfirmingDelete(null);
      }, 5000);
    }
  };

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
        <div key={extra.id} className={deleteLoading === extra.id ? 'opacity-50 pointer-events-none' : ''}>
          <ExtraServiceCard
            extra={extra}
            onEdit={onEditExtraService}
            onDelete={handleDeleteExtraService}
            isConfirmingDelete={confirmingDelete === extra.id}
          />
        </div>
      ))}
      <AddExtraCard onClick={() => setActiveView('services-extra-create')} />
    </div>
  );
};

export default ServiceExtrasPage;
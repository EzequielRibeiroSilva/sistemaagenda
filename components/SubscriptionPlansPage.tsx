import React, { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { AddCard, BaseCard, CardInfoRow, CardStatusBadge } from './BaseCard';
import { useSubscriptionPlanManagement, PlanoAssinaturaListItem } from '../hooks/useSubscriptionPlanManagement';

const AddPlanCard: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <AddCard onClick={onClick} label="Adicionar Plano" />
);

const PlanCard: React.FC<{
  plan: PlanoAssinaturaListItem;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isConfirmingDelete?: boolean;
  isDeleting?: boolean;
}> = ({ plan, onEdit, onDelete, isConfirmingDelete = false, isDeleting = false }) => {
  return (
    <div className={isDeleting ? 'opacity-50 pointer-events-none' : ''}>
      <BaseCard
        title={plan.nome}
        onEdit={() => onEdit(plan.id)}
        onDelete={() => onDelete(plan.id)}
        isConfirmingDelete={isConfirmingDelete}
        editLabel="Editar Plano"
        showTopBar={true}
      >
        <CardInfoRow label="Validade" value={`${plan.validade_dias} dias`} />
        <CardInfoRow label="Valor" value={`R$ ${(Number(plan.valor) || 0).toFixed(2)}`} />
        <CardInfoRow label="Clientes" value={String(plan.client_count || 0)} />
        <CardInfoRow label="Status" value={<CardStatusBadge status={plan.status} />} />
      </BaseCard>
    </div>
  );
};

interface SubscriptionPlansPageProps {
  setActiveView: (view: string) => void;
  onEditPlan: (planId: number) => void;
}

const SubscriptionPlansPage: React.FC<SubscriptionPlansPageProps> = ({ setActiveView, onEditPlan }) => {
  const toast = useToast();
  const { fetchPlans, deletePlan, loading, error } = useSubscriptionPlanManagement();
  const [plans, setPlans] = useState<PlanoAssinaturaListItem[]>([]);
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const data = await fetchPlans();
      setPlans(data);
    };
    load();
  }, [fetchPlans]);

  const handleDelete = async (id: number) => {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;

    if (confirmingDelete === id) {
      setDeleteLoading(id);
      setConfirmingDelete(null);

      const success = await deletePlan(id);
      setDeleteLoading(null);

      if (success) {
        toast.success('Plano Excluído!', `O plano "${plan.nome}" foi removido com sucesso.`);
        const refreshed = await fetchPlans();
        setPlans(refreshed);
      } else {
        toast.error('Erro ao Excluir', 'Não foi possível excluir o plano.');
      }
      return;
    }

    setConfirmingDelete(id);
    toast.warning('Confirme a Exclusão', `Clique novamente no X para confirmar a exclusão de "${plan.nome}".`);
    setTimeout(() => setConfirmingDelete(null), 5000);
  };

  const handleEdit = (planId: number) => {
    onEditPlan(planId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Clube de Assinatura</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm">❌ {error}</p>
        </div>
      )}

      {loading && plans.length === 0 && (
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

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isConfirmingDelete={confirmingDelete === plan.id}
              isDeleting={deleteLoading === plan.id}
            />
          ))}

          <AddPlanCard onClick={() => setActiveView('subscriptions-create')} />
        </div>
      )}
    </div>
  );
};

export default SubscriptionPlansPage;

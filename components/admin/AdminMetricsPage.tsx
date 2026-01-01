import React, { useEffect, useMemo, useState } from 'react';
import DatePicker from '../DatePicker';
import type { PerformanceMetric } from '../../types';
import { useNotificationManagement } from '../../hooks/useNotificationManagement';
import { API_BASE_URL } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

interface AdminMetricsPageProps {
  users: Array<{ id: number; status: 'Ativo' | 'Bloqueado' }>;
}

type MasterMetricsStatsResponse = {
  success: boolean;
  data?: {
    agendamentos?: {
      criados: number;
      cancelados: number;
      taxa_cancelamento: number;
    };
  };
  message?: string;
  error?: string;
};

const MetricCard: React.FC<{ metric: PerformanceMetric }> = ({ metric }) => (
  <div className="bg-white p-4 sm:p-6 rounded-lg flex-1 relative border border-gray-200 hover:border-[#2663EB] transition-all duration-200 hover:shadow-md overflow-hidden">
    <div className="absolute top-0 left-0 right-0 h-1 bg-[#2663EB]"></div>

    <div className="flex justify-between items-start mb-2 mt-1">
      <div className="flex-1 min-w-0">
        <p className="text-gray-500 text-xs sm:text-sm font-medium truncate" title={metric.title}>{metric.title}</p>
        <div className="flex items-baseline mt-2">
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{metric.value}</p>
        </div>
        {metric.subtitle && (
          <p className="text-xs text-gray-400 mt-2 truncate" title={metric.subtitle}>{metric.subtitle}</p>
        )}
      </div>
    </div>
  </div>
);

const AdminMetricsPage: React.FC<AdminMetricsPageProps> = ({ users }) => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [dateRange, setDateRange] = useState<{ startDate: Date | null; endDate: Date | null }>({
    startDate: firstDayOfMonth,
    endDate: lastDayOfMonth
  });

  const { stats, fetchStats } = useNotificationManagement();

  const { token } = useAuth();
  const [agendamentoStats, setAgendamentoStats] = useState<{ criados: number; cancelados: number; taxa_cancelamento: number } | null>(null);

  useEffect(() => {
    if (!dateRange.startDate || !dateRange.endDate) return;

    const data_inicio = dateRange.startDate.toISOString().split('T')[0];
    const data_fim = dateRange.endDate.toISOString().split('T')[0];

    fetchStats({ data_inicio, data_fim });
  }, [dateRange.startDate, dateRange.endDate, fetchStats]);

  useEffect(() => {
    if (!dateRange.startDate || !dateRange.endDate) return;
    if (!token) return;

    const data_inicio = dateRange.startDate.toISOString().split('T')[0];
    const data_fim = dateRange.endDate.toISOString().split('T')[0];

    const run = async () => {
      try {
        const queryParams = new URLSearchParams();
        queryParams.append('data_inicio', data_inicio);
        queryParams.append('data_fim', data_fim);

        const response = await fetch(`${API_BASE_URL}/metricas/stats?${queryParams.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const json: MasterMetricsStatsResponse = await response.json().catch(() => ({ success: false }));
        if (response.ok && json.success && json.data?.agendamentos) {
          setAgendamentoStats(json.data.agendamentos);
        } else {
          setAgendamentoStats({ criados: 0, cancelados: 0, taxa_cancelamento: 0 });
        }
      } catch {
        setAgendamentoStats({ criados: 0, cancelados: 0, taxa_cancelamento: 0 });
      }
    };

    run();
  }, [dateRange.startDate, dateRange.endDate, token]);

  const totalUsers = users.length;
  const activeUsers = useMemo(() => users.filter(u => u.status === 'Ativo').length, [users]);
  const blockedUsers = useMemo(() => users.filter(u => u.status === 'Bloqueado').length, [users]);

  const periodLabel = useMemo(() => {
    if (!dateRange.startDate || !dateRange.endDate) return 'Período não selecionado';
    const start = dateRange.startDate.toLocaleDateString('pt-BR');
    const end = dateRange.endDate.toLocaleDateString('pt-BR');
    return `${start} à ${end}`;
  }, [dateRange.startDate, dateRange.endDate]);

  const metrics: PerformanceMetric[] = useMemo(() => {
    const enviados = stats?.totais?.enviados ?? 0;
    const falhas = stats?.totais?.falhas ?? 0;
    const totalNotificacoes = stats?.totais?.total ?? 0;
    const pendentes = stats?.totais?.pendentes ?? 0;

    const agCriados = agendamentoStats?.criados ?? 0;
    const agCancelados = agendamentoStats?.cancelados ?? 0;
    const agTaxaCancelamento = agendamentoStats?.taxa_cancelamento ?? 0;

    return [
      {
        title: 'Contas cadastradas',
        value: String(totalUsers),
        isPositive: true,
        change: '',
        subtitle: 'Total de contas (clientes do Tally)'
      },
      {
        title: 'Contas ativas',
        value: String(activeUsers),
        isPositive: true,
        change: '',
        subtitle: 'Contas com status Ativo'
      },
      {
        title: 'Contas bloqueadas',
        value: String(blockedUsers),
        isPositive: blockedUsers === 0,
        change: '',
        subtitle: 'Contas com status Bloqueado'
      },
      {
        title: 'Notificações registradas',
        value: String(totalNotificacoes),
        isPositive: true,
        change: '',
        subtitle: `Período: ${periodLabel}`
      },
      {
        title: 'Notificações enviadas',
        value: String(enviados),
        isPositive: true,
        change: '',
        subtitle: `Período: ${periodLabel}`
      },
      {
        title: 'Falhas de notificação',
        value: String(falhas),
        isPositive: falhas === 0,
        change: '',
        subtitle: `Período: ${periodLabel}`
      },
      {
        title: 'Notificações pendentes',
        value: String(pendentes),
        isPositive: pendentes === 0,
        change: '',
        subtitle: `Período: ${periodLabel}`
      },
      {
        title: 'Agendamentos criados',
        value: String(agCriados),
        isPositive: true,
        change: '',
        subtitle: `Período: ${periodLabel}`
      },
      {
        title: 'Agendamentos cancelados',
        value: String(agCancelados),
        isPositive: true,
        change: '',
        subtitle: `Período: ${periodLabel}`
      },
      {
        title: 'Taxa de cancelamento',
        value: `${agTaxaCancelamento.toFixed(1)}%`,
        isPositive: agTaxaCancelamento < 10,
        change: '',
        subtitle: `Período: ${periodLabel}`
      }
    ];
  }, [activeUsers, blockedUsers, periodLabel, stats?.totais?.enviados, stats?.totais?.falhas, stats?.totais?.total, stats?.totais?.pendentes, totalUsers, agendamentoStats?.criados, agendamentoStats?.cancelados, agendamentoStats?.taxa_cancelamento]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Métricas</h1>
          <p className="text-sm text-gray-500">Acompanhe indicadores gerais do Tally</p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker
            mode="range"
            selectedRange={dateRange}
            onDateChange={(range) => setDateRange(range as { startDate: Date | null; endDate: Date | null })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {metrics.map((metric, index) => (
          <MetricCard key={index} metric={metric} />
        ))}
      </div>
    </div>
  );
};

export default AdminMetricsPage;

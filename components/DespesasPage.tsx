import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash, X } from './Icons';
import { useCalendarData } from '../hooks/useCalendarData';
import { useToast } from '../contexts/ToastContext';
import { useDespesas, type DespesaRow, type DespesaStatus } from '../hooks/useDespesas';
import { useFluxoCaixa } from '../hooks/useFluxoCaixa';
import { formatMoneyBR, toMoneyFixedString } from '../utils/money';

type DespesasTab = 'A Pagar' | 'Vencidas' | 'Pagas';

type FinanceiroTab = 'Fluxo de Caixa' | 'Despesas';

type CreateDespesaForm = {
  descricao: string;
  categoria: string;
  valor: string;
  data_vencimento: string;
};

type PayForm = {
  data_pagamento: string;
  forma_pagamento: 'PIX' | 'Dinheiro' | 'Boleto';
};

const HeaderDropdown: React.FC<{
  options: Array<{ value: string; label: string }>;
  selectedValue: string;
  onSelect: (value: string) => void;
}> = ({ options, selectedValue, onSelect }) => {
  return (
    <select
      value={selectedValue}
      onChange={(e) => onSelect(e.target.value)}
      className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-50 min-w-[120px] justify-between w-full sm:w-auto"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

const DespesasPage: React.FC = () => {
  const { locations: backendLocations } = useCalendarData();
  const toast = useToast();

  const [financeiroTab, setFinanceiroTab] = useState<FinanceiroTab>('Fluxo de Caixa');

  const [activeTab, setActiveTab] = useState<DespesasTab>('A Pagar');

  const locations = useMemo(() => {
    return backendLocations.map((l) => ({ id: String(l.id), name: l.name }));
  }, [backendLocations]);

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const shouldShowUnitSelector = locations.length > 1;

  const toInputDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const currentMonthRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toInputDate(start), end: toInputDate(end) };
  }, []);

  const [fluxoInicio, setFluxoInicio] = useState<string>(currentMonthRange.start);
  const [fluxoFim, setFluxoFim] = useState<string>(currentMonthRange.end);

  useEffect(() => {
    if (!selectedLocationId && locations.length > 0) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  const statusFilter: DespesaStatus = useMemo(() => {
    if (activeTab === 'A Pagar') return 'PENDING';
    if (activeTab === 'Vencidas') return 'OVERDUE';
    return 'PAID';
  }, [activeTab]);

  const {
    despesas,
    loading,
    error,
    refetch,
    createDespesa,
    updateDespesa,
    deleteDespesa
  } = useDespesas({ unidadeId: selectedLocationId, status: statusFilter });

  const {
    transacoes,
    resumo,
    loading: fluxoLoading,
    error: fluxoError
  } = useFluxoCaixa({
    unidadeId: selectedLocationId,
    dataInicio: fluxoInicio,
    dataFim: fluxoFim
  });

  const [fluxoOrigem, setFluxoOrigem] = useState<'ALL' | 'COMANDAS' | 'BALCAO'>('ALL');

  const [fluxoCurrentPage, setFluxoCurrentPage] = useState(1);
  const fluxoItemsPerPage = 12;

  useEffect(() => {
    setFluxoCurrentPage(1);
  }, [selectedLocationId, fluxoInicio, fluxoFim, fluxoOrigem]);

  const filteredTransacoes = useMemo(() => {
    const origem = String(fluxoOrigem || 'ALL').toUpperCase();
    if (origem === 'COMANDAS') {
      return transacoes.filter((t) => String(t.descricao || '').includes('Comanda'));
    }
    if (origem === 'BALCAO') {
      return transacoes.filter((t) => String(t.descricao || '').includes('Venda Balcão'));
    }
    return transacoes;
  }, [fluxoOrigem, transacoes]);

  const fluxoTotalItems = filteredTransacoes.length;
  const fluxoTotalPages = Math.max(1, Math.ceil(fluxoTotalItems / fluxoItemsPerPage));
  const fluxoStart = fluxoTotalItems === 0 ? 0 : ((fluxoCurrentPage - 1) * fluxoItemsPerPage) + 1;
  const fluxoEnd = fluxoTotalItems === 0 ? 0 : Math.min(fluxoCurrentPage * fluxoItemsPerPage, fluxoTotalItems);

  const pagedTransacoes = useMemo(() => {
    const startIndex = (fluxoCurrentPage - 1) * fluxoItemsPerPage;
    return filteredTransacoes.slice(startIndex, startIndex + fluxoItemsPerPage);
  }, [filteredTransacoes, fluxoCurrentPage]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const totalItems = despesas.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const start = totalItems === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1;
  const end = totalItems === 0 ? 0 : Math.min(currentPage * itemsPerPage, totalItems);

  const pagedDespesas = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return despesas.slice(startIndex, startIndex + itemsPerPage);
  }, [currentPage, despesas]);

  const StatusBadge: React.FC<{ status: DespesaRow['status'] }> = ({ status }) => {
    const normalized = String(status || '').toUpperCase();
    const className =
      normalized === 'PAID'
        ? 'bg-green-100 text-green-800'
        : normalized === 'OVERDUE'
          ? 'bg-red-100 text-red-800'
          : 'bg-yellow-100 text-yellow-800';

    const label = normalized === 'PAID' ? 'Pago' : normalized === 'OVERDUE' ? 'Vencida' : 'A pagar';

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}>
        {label}
      </span>
    );
  };

  const formatDateBR = (isoOrDate: string | null | undefined) => {
    if (!isoOrDate) return '—';
    const raw = String(isoOrDate);
    const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
    const [y, m, d] = datePart.split('-');
    if (!y || !m || !d) return raw;
    return `${d}/${m}/${y}`;
  };

  const formatExtratoValue = (valor: unknown) => {
    const fixed = toMoneyFixedString(valor);
    const n = Number(fixed);
    if (!Number.isFinite(n)) return formatMoneyBR(0);
    return formatMoneyBR(n);
  };

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateDespesaForm>({
    descricao: '',
    categoria: 'Operacional',
    valor: '',
    data_vencimento: ''
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [payDespesa, setPayDespesa] = useState<DespesaRow | null>(null);
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payForm, setPayForm] = useState<PayForm>({
    data_pagamento: toInputDate(new Date()),
    forma_pagamento: 'PIX'
  });

  useEffect(() => {
    if (!payDespesa) return;
    setPayForm({ data_pagamento: toInputDate(new Date()), forma_pagamento: 'PIX' });
    setPayError(null);
  }, [payDespesa]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-3xl font-bold text-gray-800">Financeiro</h1>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
          {shouldShowUnitSelector && (
            <div className="w-full sm:w-auto">
              <HeaderDropdown
                options={locations.map((l) => ({ value: l.id, label: l.name }))}
                selectedValue={selectedLocationId || locations[0]?.id || ''}
                onSelect={(value) => setSelectedLocationId(value)}
              />
            </div>
          )}

          {financeiroTab === 'Despesas' && (
            <button
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 w-full sm:w-auto"
              type="button"
              disabled={(!selectedLocationId && shouldShowUnitSelector) || createSaving}
              onClick={() => {
                setCreateError(null);
                setCreateForm({
                  descricao: '',
                  categoria: 'Operacional',
                  valor: '',
                  data_vencimento: ''
                });
                setIsCreateOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Nova Despesa
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center border-b border-gray-200">
        {(['Fluxo de Caixa', 'Despesas'] as FinanceiroTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFinanceiroTab(tab)}
            className={`px-1 py-4 text-lg font-semibold mr-8 transition-colors duration-200 relative focus:outline-none ${
              financeiroTab === tab ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
            }`}
            type="button"
          >
            {tab}
            {financeiroTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"></div>
            )}
          </button>
        ))}
      </div>

      {financeiroTab === 'Fluxo de Caixa' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-gray-600 mb-1">Início</label>
                <input
                  type="date"
                  value={fluxoInicio}
                  onChange={(e) => setFluxoInicio(e.target.value)}
                  className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-gray-600 mb-1">Fim</label>
                <input
                  type="date"
                  value={fluxoFim}
                  onChange={(e) => setFluxoFim(e.target.value)}
                  className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-gray-600 mb-1">Origem</label>
                <HeaderDropdown
                  options={[
                    { value: 'ALL', label: 'Todas as movimentações' },
                    { value: 'COMANDAS', label: 'Comandas' },
                    { value: 'BALCAO', label: 'Vendas Balcão' }
                  ]}
                  selectedValue={fluxoOrigem}
                  onSelect={(value) => setFluxoOrigem(value as 'ALL' | 'COMANDAS' | 'BALCAO')}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="text-sm font-semibold text-gray-600">Entradas</div>
              <div className="text-2xl font-bold text-green-700 mt-2">{formatMoneyBR(resumo.total_entradas)}</div>
              <div className="text-xs text-gray-500 mt-1">No período</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="text-sm font-semibold text-gray-600">Saídas</div>
              <div className="text-2xl font-bold text-red-700 mt-2">{formatMoneyBR(resumo.total_saidas)}</div>
              <div className="text-xs text-gray-500 mt-1">Pagas no período</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="text-sm font-semibold text-gray-600">Saldo do Período</div>
              <div className={`text-2xl font-bold mt-2 ${resumo.saldo_periodo >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatMoneyBR(resumo.saldo_periodo)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Entradas - Saídas</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-w-0 max-w-full">
            <div className="overflow-x-auto max-w-full">
              <table className="w-full min-w-[1100px] text-sm table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 w-40 text-left font-semibold text-gray-600 whitespace-nowrap">DATA</th>
                    <th className="p-3 w-[520px] text-left font-semibold text-gray-600 whitespace-nowrap">DESCRIÇÃO</th>
                    <th className="p-3 w-40 text-left font-semibold text-gray-600 whitespace-nowrap">MÉTODO</th>
                    <th className="p-3 w-48 text-right font-semibold text-gray-600 whitespace-nowrap">VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxoLoading ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
                          Carregando...
                        </div>
                      </td>
                    </tr>
                  ) : fluxoError ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500">{fluxoError}</td>
                    </tr>
                  ) : filteredTransacoes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500">Nenhuma transação encontrada</td>
                    </tr>
                  ) : (
                    pagedTransacoes.map((t, idx) => {
                      const valorNum = Number(toMoneyFixedString(t.valor));
                      const isEntrada = String(t.tipo).toUpperCase() === 'ENTRADA';
                      const valueClass = isEntrada ? 'text-green-700' : 'text-red-700';

                      const displayValue =
                        Number.isFinite(valorNum)
                          ? `${isEntrada ? '+' : '-'} ${formatMoneyBR(Math.abs(valorNum))}`
                          : formatExtratoValue(t.valor);

                      return (
                        <tr key={`${t.data}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                          <td className="p-3 text-gray-600 whitespace-nowrap">{formatDateBR(t.data)}</td>
                          <td className="p-3 text-gray-700 truncate" title={t.descricao}>
                            {t.descricao || '—'}
                          </td>
                          <td className="p-3 text-gray-600 whitespace-nowrap">{t.metodo || '—'}</td>
                          <td className={`p-3 text-right font-semibold whitespace-nowrap ${valueClass}`}>{displayValue}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Mostrando <span className="font-medium">{fluxoStart}</span> a <span className="font-medium">{fluxoEnd}</span> de{' '}
                <span className="font-medium">{fluxoTotalItems}</span> registros
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFluxoCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={fluxoCurrentPage === 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  type="button"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <span className="text-sm text-gray-700">
                  Página <span className="font-medium">{fluxoCurrentPage}</span> de{' '}
                  <span className="font-medium">{fluxoTotalPages}</span>
                </span>

                <button
                  onClick={() => setFluxoCurrentPage((p) => Math.min(fluxoTotalPages, p + 1))}
                  disabled={fluxoCurrentPage === fluxoTotalPages}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  type="button"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {financeiroTab === 'Despesas' && (
        <div className="space-y-4">
          <div className="flex items-center border-b border-gray-200">
            {(['A Pagar', 'Vencidas', 'Pagas'] as DespesasTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-1 py-4 text-lg font-semibold mr-8 transition-colors duration-200 relative focus:outline-none ${
                  activeTab === tab ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
                }`}
                type="button"
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"></div>
                )}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-w-0 max-w-full">
            <div className="overflow-x-auto max-w-full">
              <table className="w-full min-w-[1200px] text-sm table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 w-40 text-left font-semibold text-gray-600 whitespace-nowrap">VENCIMENTO</th>
                    <th className="p-3 w-[520px] text-left font-semibold text-gray-600 whitespace-nowrap">DESCRIÇÃO</th>
                    <th className="p-3 w-56 text-left font-semibold text-gray-600 whitespace-nowrap">CATEGORIA</th>
                    <th className="p-3 w-48 text-right font-semibold text-gray-600 whitespace-nowrap">VALOR</th>
                    <th className="p-3 w-40 text-left font-semibold text-gray-600 whitespace-nowrap">STATUS</th>
                    <th className="p-3 w-32 text-left font-semibold text-gray-600 whitespace-nowrap">AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
                          Carregando...
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500">{error}</td>
                    </tr>
                  ) : pagedDespesas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500">Nenhuma despesa encontrada</td>
                    </tr>
                  ) : (
                    pagedDespesas.map((d) => {
                      const normalizedStatus = String(d.status || '').toUpperCase();
                      const isPaid = normalizedStatus === 'PAID';
                      return (
                        <tr key={d.id}>
                          <td className="p-3 text-gray-600 whitespace-nowrap">{formatDateBR(d.data_vencimento)}</td>
                          <td className="p-3 text-gray-700 truncate" title={d.descricao}>{d.descricao}</td>
                          <td className="p-3 text-gray-600 whitespace-nowrap">{d.categoria}</td>
                          <td className="p-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                            {formatMoneyBR(Number(d.valor) || 0)}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <StatusBadge status={d.status} />
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {!isPaid && (
                                <button
                                  type="button"
                                  className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                                  onClick={() => {
                                    setPayDespesa(d);
                                  }}
                                >
                                  Pagar
                                </button>
                              )}
                              <button
                                type="button"
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100"
                                onClick={() => setConfirmDeleteId(d.id)}
                              >
                                <Trash className="w-4 h-4 text-gray-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Mostrando <span className="font-medium">{start}</span> a <span className="font-medium">{end}</span> de{' '}
                <span className="font-medium">{totalItems}</span> registros
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  type="button"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <span className="text-sm text-gray-700">
                  Página <span className="font-medium">{currentPage}</span> de{' '}
                  <span className="font-medium">{totalPages}</span>
                </span>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  type="button"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(() => {
        if (!isCreateOpen) return null;
        const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;
        if (!portalRoot) return null;

        const handleClose = () => {
          if (createSaving) return;
          setIsCreateOpen(false);
          setCreateError(null);
        };

        const handleSave = async () => {
          if (createSaving) return;
          if (!selectedLocationId) {
            setCreateError('Selecione uma unidade');
            return;
          }

          const valorNum = Number(String(createForm.valor).replace(',', '.'));
          if (!createForm.descricao.trim()) {
            setCreateError('Descrição é obrigatória');
            return;
          }
          if (!createForm.categoria.trim()) {
            setCreateError('Categoria é obrigatória');
            return;
          }
          if (!Number.isFinite(valorNum) || valorNum <= 0) {
            setCreateError('Valor inválido');
            return;
          }
          if (!createForm.data_vencimento) {
            setCreateError('Vencimento é obrigatório');
            return;
          }

          setCreateSaving(true);
          setCreateError(null);
          try {
            await createDespesa({
              unidade_id: Number(selectedLocationId),
              descricao: createForm.descricao.trim(),
              categoria: createForm.categoria.trim(),
              valor: valorNum,
              data_vencimento: createForm.data_vencimento
            });
            toast.success('Despesa criada', 'A despesa foi criada com sucesso.');
            setIsCreateOpen(false);
            await refetch();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao criar despesa';
            setCreateError(msg);
            toast.error('Erro ao criar despesa', msg);
          } finally {
            setCreateSaving(false);
          }
        };

        return createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/60 flex justify-end"
            onClick={handleClose}
            aria-modal="true"
            role="dialog"
          >
            <div
              className="relative flex w-full max-w-2xl flex-col bg-gray-50 shadow-xl transform transition-transform duration-300 ease-in-out"
              onClick={(e) => e.stopPropagation()}
              style={{ animation: 'slideInFromRight 0.3s forwards' }}
            >
              <style>{`
                @keyframes slideInFromRight {
                  from { transform: translateX(100%); }
                  to { transform: translateX(0); }
                }
              `}</style>

              <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-800">Nova Despesa</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  disabled={createSaving}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {createError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-600 text-sm">{createError}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Descrição</label>
                  <input
                    type="text"
                    value={createForm.descricao}
                    onChange={(e) => setCreateForm((p) => ({ ...p, descricao: e.target.value }))}
                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    placeholder="Conta de luz"
                    disabled={createSaving}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Valor</label>
                  <input
                    type="text"
                    value={createForm.valor}
                    onChange={(e) => setCreateForm((p) => ({ ...p, valor: e.target.value }))}
                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    placeholder="0,00"
                    disabled={createSaving}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Vencimento</label>
                  <input
                    type="date"
                    value={createForm.data_vencimento}
                    onChange={(e) => setCreateForm((p) => ({ ...p, data_vencimento: e.target.value }))}
                    className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    disabled={createSaving}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Categoria</label>
                  <div className="relative">
                    <select
                      value={createForm.categoria}
                      onChange={(e) => setCreateForm((p) => ({ ...p, categoria: e.target.value }))}
                      className="appearance-none w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                      disabled={createSaving}
                    >
                      <option value="Operacional">Operacional</option>
                      <option value="Insumos">Insumos</option>
                      <option value="Pessoal">Pessoal</option>
                      <option value="Impostos">Impostos</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 bg-white flex-shrink-0 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  disabled={createSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={createSaving}
                >
                  {createSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>,
          portalRoot
        );
      })()}

      {(() => {
        if (!confirmDeleteId) return null;
        const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;
        if (!portalRoot) return null;

        const handleClose = () => {
          if (deleteSaving) return;
          setConfirmDeleteId(null);
          setDeleteError(null);
        };

        const handleConfirm = async () => {
          if (deleteSaving) return;
          if (!selectedLocationId) {
            setDeleteError('Selecione uma unidade');
            return;
          }

          setDeleteSaving(true);
          setDeleteError(null);
          try {
            await deleteDespesa(confirmDeleteId, Number(selectedLocationId));
            toast.success('Despesa excluída', 'A despesa foi removida com sucesso.');
            setConfirmDeleteId(null);
            await refetch();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao excluir despesa';
            setDeleteError(msg);
            toast.error('Erro ao excluir despesa', msg);
          } finally {
            setDeleteSaving(false);
          }
        };

        return createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-800">Excluir Despesa</h2>
                  <button type="button" onClick={handleClose} className="p-1 rounded-full hover:bg-gray-200">
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {deleteError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-600 text-sm">{deleteError}</p>
                  </div>
                )}
                <p className="text-sm text-gray-700">Tem certeza que deseja excluir esta despesa?</p>
              </div>

              <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  disabled={deleteSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={deleteSaving}
                >
                  {deleteSaving ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>,
          portalRoot
        );
      })()}

      {(() => {
        if (!payDespesa) return null;
        const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;
        if (!portalRoot) return null;

        const handleClose = () => {
          if (paySaving) return;
          setPayDespesa(null);
          setPayError(null);
        };

        const handleConfirm = async () => {
          if (paySaving) return;
          if (!selectedLocationId) {
            setPayError('Selecione uma unidade');
            return;
          }
          if (!payForm.data_pagamento) {
            setPayError('Data do pagamento é obrigatória');
            return;
          }

          setPaySaving(true);
          setPayError(null);
          try {
            await updateDespesa(Number(payDespesa.id), {
              unidade_id: Number(selectedLocationId),
              status: 'PAID',
              data_pagamento: payForm.data_pagamento,
              forma_pagamento: payForm.forma_pagamento
            });
            toast.success('Despesa paga', 'A despesa foi marcada como paga.');
            setPayDespesa(null);
            await refetch();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao marcar como paga';
            setPayError(msg);
            toast.error('Erro ao pagar despesa', msg);
          } finally {
            setPaySaving(false);
          }
        };

        return createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/60 flex justify-end"
            onClick={handleClose}
            aria-modal="true"
            role="dialog"
            aria-labelledby="drawer-pay-title"
          >
            <div
              className="relative flex w-full max-w-2xl flex-col bg-gray-50 shadow-xl transform transition-transform duration-300 ease-in-out"
              onClick={(e) => e.stopPropagation()}
              style={{ animation: 'slideInFromRight 0.3s forwards' }}
            >
              <style>{`
                @keyframes slideInFromRight {
                  from { transform: translateX(100%); }
                  to { transform: translateX(0); }
                }
              `}</style>

              <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-800" id="drawer-pay-title">Marcar como Paga</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                  disabled={paySaving}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {payError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-600 text-sm">{payError}</p>
                  </div>
                )}

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="font-semibold text-gray-900 truncate">{payDespesa.descricao}</div>
                  <div className="text-sm text-gray-600">Vencimento: {formatDateBR(payDespesa.data_vencimento)}</div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Data do pagamento</label>
                    <input
                      type="date"
                      value={payForm.data_pagamento}
                      onChange={(e) => setPayForm((p) => ({ ...p, data_pagamento: e.target.value }))}
                      className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                      disabled={paySaving}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Forma de pagamento</label>
                    <div className="relative">
                      <select
                        value={payForm.forma_pagamento}
                        onChange={(e) => setPayForm((p) => ({ ...p, forma_pagamento: e.target.value as PayForm['forma_pagamento'] }))}
                        className="appearance-none w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                        disabled={paySaving}
                      >
                        <option value="PIX">PIX</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Boleto">Boleto</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 bg-white flex-shrink-0 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  disabled={paySaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={paySaving}
                >
                  {paySaving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>,
          portalRoot
        );
      })()}
    </div>
  );
};

export default DespesasPage;

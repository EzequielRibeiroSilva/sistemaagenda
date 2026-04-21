import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';
import { useCalendarData } from '../hooks/useCalendarData';
import { Plus, X, ChevronDown } from './Icons';

type EstoqueTab = 'Produtos' | 'Inventário' | 'Movimentações';

type ProdutoRow = {
  id: number;
  nome: string;
  marca?: string | null;
  categoria?: string | null;
  preco_custo_medio?: number | string | null;
};

type CategoriaRow = {
  id: number;
  nome: string;
};

type SnapshotRow = {
  produto_id: number;
  produto_nome: string;
  produto_marca?: string | null;
  produto_categoria?: string | null;
  produto_unidade_medida?: string | null;
  unidade_id: number;
  saldo_atual: number | string;
  estoque_minimo: number | string | null;
  estoque_maximo: number | string | null;
};

type MovRow = {
  id: number;
  tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'CONSUMO' | 'ESTORNO' | string;
  quantidade: number | string;
  motivo?: string | null;
  origem_id?: string | null;
  produto_id: number;
  produto_nome: string;
  produto_marca?: string | null;
  unidade_id: number;
  created_by?: number | null;
  created_at: string;
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
      className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-50 min-w-[120px] justify-between"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

function formatMoneyBR(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function movementDotColor(tipo: MovRow['tipo']) {
  if (tipo === 'ENTRADA' || tipo === 'ESTORNO') return 'bg-green-500';
  if (tipo === 'SAIDA' || tipo === 'CONSUMO') return 'bg-red-500';
  return 'bg-gray-400';
}

function formatMovementType(tipo: MovRow['tipo']) {
  const normalized = String(tipo || '').toUpperCase();
  if (normalized === 'ENTRADA') return 'Entrada';
  if (normalized === 'SAIDA') return 'Saída';
  if (normalized === 'CONSUMO') return 'Consumo';
  if (normalized === 'AJUSTE') return 'Ajuste';
  if (normalized === 'ESTORNO') return 'Estorno';
  return normalized ? normalized.charAt(0) + normalized.slice(1).toLowerCase() : '—';
}

const EstoquePage: React.FC = () => {
  const { token, isAuthenticated } = useAuth();
  const { locations: backendLocations } = useCalendarData();

  const [activeTab, setActiveTab] = useState<EstoqueTab>('Produtos');

  const locations = useMemo(() => {
    return backendLocations.map((l) => ({ id: String(l.id), name: l.name }));
  }, [backendLocations]);

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');

  const shouldShowUnitSelector = locations.length > 1;

  useEffect(() => {
    if (!selectedLocationId && locations.length > 0) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  const makeAuthenticatedRequest = async (url: string, options?: { method?: string; body?: any }) => {
    if (!isAuthenticated || !token) {
      throw new Error('Usuário não autenticado');
    }

    const method = options?.method || 'GET';

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.message || `Erro HTTP: ${res.status}`);
    }

    return res.json();
  };

  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [produtosLoading, setProdutosLoading] = useState(false);
  const [produtosError, setProdutosError] = useState<string | null>(null);

  const [novoProdutoOpen, setNovoProdutoOpen] = useState(false);
  const [novoProdutoNome, setNovoProdutoNome] = useState('');
  const [novoProdutoMarca, setNovoProdutoMarca] = useState('');
  const [novoProdutoUnidadeMedida, setNovoProdutoUnidadeMedida] = useState<'UN' | 'ML' | 'G'>('UN');
  const [novoProdutoPrecoCusto, setNovoProdutoPrecoCusto] = useState('');
  const [novoProdutoCategoriaNome, setNovoProdutoCategoriaNome] = useState('');
  const [novoProdutoSaving, setNovoProdutoSaving] = useState(false);
  const [novoProdutoError, setNovoProdutoError] = useState<string | null>(null);

  const [categorias, setCategorias] = useState<CategoriaRow[]>([]);
  const [categoriasLoading, setCategoriasLoading] = useState(false);

  const [snapshot, setSnapshot] = useState<SnapshotRow[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [movs, setMovs] = useState<MovRow[]>([]);
  const [movsLoading, setMovsLoading] = useState(false);
  const [movsError, setMovsError] = useState<string | null>(null);

  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaProdutoId, setEntradaProdutoId] = useState<string>('');
  const [entradaQuantidade, setEntradaQuantidade] = useState('');
  const [entradaMotivo, setEntradaMotivo] = useState('');
  const [entradaSaving, setEntradaSaving] = useState(false);
  const [entradaError, setEntradaError] = useState<string | null>(null);

  const fetchProdutos = async (opts?: { signal?: AbortSignal }) => {
    setProdutosLoading(true);
    setProdutosError(null);

    try {
      const payload = await makeAuthenticatedRequest(`${API_BASE_URL}/produtos`);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      if (opts?.signal?.aborted) return;
      setProdutos(rows);
    } catch (e) {
      if (opts?.signal?.aborted) return;
      setProdutosError(e instanceof Error ? e.message : 'Erro ao carregar produtos');
      setProdutos([]);
    } finally {
      if (!opts?.signal?.aborted) setProdutosLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const ac = new AbortController();
    fetchProdutos({ signal: ac.signal });
    return () => ac.abort();
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (!novoProdutoOpen) return;
    if (!isAuthenticated || !token) return;

    let cancelled = false;
    (async () => {
      try {
        setCategoriasLoading(true);
        const payload = await makeAuthenticatedRequest(`${API_BASE_URL}/categorias`);
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setCategorias(rows);
      } catch {
        if (cancelled) return;
        setCategorias([]);
      } finally {
        if (!cancelled) setCategoriasLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [novoProdutoOpen, isAuthenticated, token]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (!selectedLocationId) return;
    let cancelled = false;

    const fetchSnapshot = async () => {
      try {
        setSnapshotLoading(true);
        setSnapshotError(null);

        const payload = await makeAuthenticatedRequest(
          `${API_BASE_URL}/estoque/snapshot?unidade_id=${encodeURIComponent(selectedLocationId)}`
        );
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setSnapshot(rows);
      } catch (e) {
        if (cancelled) return;
        setSnapshotError(e instanceof Error ? e.message : 'Erro ao carregar inventário');
        setSnapshot([]);
      } finally {
        if (!cancelled) setSnapshotLoading(false);
      }
    };

    (async () => {
      await fetchSnapshot();
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token, selectedLocationId]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (!selectedLocationId) return;
    let cancelled = false;

    const fetchMovs = async () => {
      try {
        setMovsLoading(true);
        setMovsError(null);

        const payload = await makeAuthenticatedRequest(
          `${API_BASE_URL}/estoque/movimentacoes?unidade_id=${encodeURIComponent(selectedLocationId)}&limit=200`
        );
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setMovs(rows);
      } catch (e) {
        if (cancelled) return;
        setMovsError(e instanceof Error ? e.message : 'Erro ao carregar movimentações');
        setMovs([]);
      } finally {
        if (!cancelled) setMovsLoading(false);
      }
    };

    (async () => {
      await fetchMovs();
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token, selectedLocationId]);

  const refetchSnapshot = async () => {
    if (!isAuthenticated || !token) return;
    if (!selectedLocationId) return;

    setSnapshotLoading(true);
    setSnapshotError(null);

    try {
      const payload = await makeAuthenticatedRequest(
        `${API_BASE_URL}/estoque/snapshot?unidade_id=${encodeURIComponent(selectedLocationId)}`
      );
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      setSnapshot(rows);
    } catch (e) {
      setSnapshotError(e instanceof Error ? e.message : 'Erro ao carregar inventário');
      setSnapshot([]);
    } finally {
      setSnapshotLoading(false);
    }
  };

  const refetchMovs = async () => {
    if (!isAuthenticated || !token) return;
    if (!selectedLocationId) return;

    setMovsLoading(true);
    setMovsError(null);

    try {
      const payload = await makeAuthenticatedRequest(
        `${API_BASE_URL}/estoque/movimentacoes?unidade_id=${encodeURIComponent(selectedLocationId)}&limit=200`
      );
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      setMovs(rows);
    } catch (e) {
      setMovsError(e instanceof Error ? e.message : 'Erro ao carregar movimentações');
      setMovs([]);
    } finally {
      setMovsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Estoque</h1>

        <div className="flex items-center gap-3">
          {shouldShowUnitSelector && (
            <div>
              <HeaderDropdown
                options={locations.map((l) => ({ value: l.id, label: l.name }))}
                selectedValue={selectedLocationId || locations[0]?.id || ''}
                onSelect={(value) => setSelectedLocationId(value)}
              />
            </div>
          )}

          {activeTab === 'Inventário' && (
            <button
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              type="button"
              onClick={() => {
                setEntradaError(null);
                setEntradaProdutoId('');
                setEntradaQuantidade('');
                setEntradaMotivo('');
                setEntradaOpen(true);
              }}
              disabled={!selectedLocationId}
            >
              <Plus className="w-4 h-4" />
              Lançar Entrada
            </button>
          )}

          {activeTab === 'Produtos' && (
            <button
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              type="button"
              onClick={() => {
                setNovoProdutoError(null);
                setNovoProdutoNome('');
                setNovoProdutoMarca('');
                setNovoProdutoUnidadeMedida('UN');
                setNovoProdutoPrecoCusto('');
                setNovoProdutoCategoriaNome('');
                setNovoProdutoOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Novo Produto
            </button>
          )}
        </div>
      </div>

      {(() => {
        if (!entradaOpen) return null;
        const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;
        if (!portalRoot) return null;

        const handleClose = () => {
          if (entradaSaving) return;
          setEntradaOpen(false);
        };

        const handleSave = async () => {
          if (entradaSaving) return;
          setEntradaError(null);

          if (!selectedLocationId) {
            setEntradaError('Selecione uma unidade');
            return;
          }

          const produtoId = Number(entradaProdutoId);
          if (!Number.isFinite(produtoId) || produtoId <= 0) {
            setEntradaError('Selecione um produto');
            return;
          }

          const qty = Number(entradaQuantidade);
          if (!Number.isFinite(qty) || qty <= 0) {
            setEntradaError('Quantidade inválida');
            return;
          }

          setEntradaSaving(true);
          try {
            await makeAuthenticatedRequest(`${API_BASE_URL}/estoque/movimentacoes`, {
              method: 'POST',
              body: {
                unidade_id: Number(selectedLocationId),
                produto_id: produtoId,
                quantidade: qty,
                motivo: entradaMotivo.trim() ? entradaMotivo.trim() : null
              }
            });

            setEntradaOpen(false);
            await refetchSnapshot();
            await refetchMovs();
          } catch (e) {
            setEntradaError(e instanceof Error ? e.message : 'Erro ao lançar entrada');
          } finally {
            setEntradaSaving(false);
          }
        };

        return createPortal(
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            aria-modal="true"
            role="dialog"
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-800">Lançar Entrada</h2>
                  <button type="button" onClick={handleClose} className="p-1 rounded-full hover:bg-gray-200">
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {entradaError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-600 text-sm">{entradaError}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Produto</label>
                  <div className="relative">
                    <select
                      value={entradaProdutoId}
                      onChange={(e) => setEntradaProdutoId(e.target.value)}
                      className="appearance-none w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500"
                      disabled={entradaSaving}
                    >
                      <option value="">Selecione...</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.nome}{p.marca ? ` - ${p.marca}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Quantidade</label>
                  <input
                    type="number"
                    value={entradaQuantidade}
                    onChange={(e) => setEntradaQuantidade(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    step="0.001"
                    min="0"
                    disabled={entradaSaving}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Motivo</label>
                  <input
                    type="text"
                    value={entradaMotivo}
                    onChange={(e) => setEntradaMotivo(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    placeholder="Compra Fornecedor"
                    disabled={entradaSaving}
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  disabled={entradaSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={entradaSaving}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>,
          portalRoot
        );
      })()}

      {(() => {
        if (!novoProdutoOpen) return null;
        const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;
        if (!portalRoot) return null;

        const handleClose = () => {
          if (novoProdutoSaving) return;
          setNovoProdutoOpen(false);
        };

        const handleSave = async () => {
          if (novoProdutoSaving) return;
          setNovoProdutoError(null);

          const nomeFinal = novoProdutoNome.trim();
          if (!nomeFinal) {
            setNovoProdutoError('Nome é obrigatório');
            return;
          }

          const preco = novoProdutoPrecoCusto.trim() === '' ? 0 : Number(novoProdutoPrecoCusto);
          if (!Number.isFinite(preco) || preco < 0) {
            setNovoProdutoError('Preço de custo médio inválido');
            return;
          }

          setNovoProdutoSaving(true);

          try {
            let categoriaId: number | null = null;
            const catNome = novoProdutoCategoriaNome.trim();

            if (catNome) {
              const existing = categorias.find((c) => c.nome.toLowerCase() === catNome.toLowerCase());
              if (existing) {
                categoriaId = existing.id;
              } else {
                const payload = await makeAuthenticatedRequest(`${API_BASE_URL}/categorias`, {
                  method: 'POST',
                  body: { nome: catNome }
                });
                const created = payload?.data;
                if (created?.id) {
                  categoriaId = Number(created.id);
                  setCategorias((prev) => {
                    const next = prev.some((p) => p.id === created.id) ? prev : [...prev, created];
                    return next.sort((a, b) => a.nome.localeCompare(b.nome));
                  });
                }
              }
            }

            await makeAuthenticatedRequest(`${API_BASE_URL}/produtos`, {
              method: 'POST',
              body: {
                nome: nomeFinal,
                marca: novoProdutoMarca.trim() ? novoProdutoMarca.trim() : null,
                unidade_medida: novoProdutoUnidadeMedida,
                preco_custo_medio: preco,
                categoria_id: categoriaId
              }
            });

            setNovoProdutoOpen(false);
            await fetchProdutos();
          } catch (e) {
            setNovoProdutoError(e instanceof Error ? e.message : 'Erro ao criar produto');
          } finally {
            setNovoProdutoSaving(false);
          }
        };

        return createPortal(
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            aria-modal="true"
            role="dialog"
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-800">Novo Produto</h2>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-1 rounded-full hover:bg-gray-200"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {novoProdutoError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-600 text-sm">{novoProdutoError}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Nome</label>
                  <input
                    type="text"
                    value={novoProdutoNome}
                    onChange={(e) => setNovoProdutoNome(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    required
                    disabled={novoProdutoSaving}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Marca</label>
                  <input
                    type="text"
                    value={novoProdutoMarca}
                    onChange={(e) => setNovoProdutoMarca(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    disabled={novoProdutoSaving}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Categoria</label>
                  <input
                    type="text"
                    value={novoProdutoCategoriaNome}
                    onChange={(e) => setNovoProdutoCategoriaNome(e.target.value)}
                    list="categorias-datalist"
                    className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                    disabled={novoProdutoSaving}
                  />
                  <datalist id="categorias-datalist">
                    {categorias.map((c) => (
                      <option key={c.id} value={c.nome} />
                    ))}
                  </datalist>
                  {categoriasLoading && (
                    <p className="text-xs text-gray-500 mt-1">Carregando categorias...</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Unidade de Medida</label>
                    <div className="relative">
                      <select
                        value={novoProdutoUnidadeMedida}
                        onChange={(e) => setNovoProdutoUnidadeMedida(e.target.value as 'UN' | 'ML' | 'G')}
                        className="appearance-none w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500"
                        disabled={novoProdutoSaving}
                      >
                        <option value="UN">UN</option>
                        <option value="ML">ML</option>
                        <option value="G">G</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Preço de Custo Médio</label>
                    <input
                      type="number"
                      value={novoProdutoPrecoCusto}
                      onChange={(e) => setNovoProdutoPrecoCusto(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                      step="0.01"
                      min="0"
                      disabled={novoProdutoSaving}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  disabled={novoProdutoSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={novoProdutoSaving}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>,
          portalRoot
        );
      })()}

      <div className="flex items-center border-b border-gray-200 mb-4">
        {(['Produtos', 'Inventário', 'Movimentações'] as EstoqueTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-1 py-4 text-lg font-semibold mr-8 transition-colors duration-200 relative focus:outline-none ${
              activeTab === tab ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"></div>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'Produtos' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-w-0 max-w-full">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[1600px] text-sm table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 w-28 text-left font-semibold text-gray-600 whitespace-nowrap">ID</th>
                  <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">NOME</th>
                  <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">MARCA</th>
                  <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">CATEGORIA</th>
                  <th className="p-3 w-64 text-left font-semibold text-gray-600 whitespace-nowrap">CUSTO MÉDIO</th>
                </tr>
              </thead>
              <tbody>
                {produtosLoading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      Carregando produtos...
                    </td>
                  </tr>
                ) : produtosError ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-red-600">
                      Erro: {produtosError}
                    </td>
                  </tr>
                ) : produtos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      Nenhum produto encontrado
                    </td>
                  </tr>
                ) : (
                  produtos.map((p) => {
                    const custo = toNumber(p.preco_custo_medio);
                    return (
                      <tr key={p.id} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="p-3 w-28 whitespace-nowrap">{p.id}</td>
                        <td className="p-3 w-64 font-medium text-gray-800 whitespace-nowrap">
                          <span className="truncate block">{p.nome}</span>
                        </td>
                        <td className="p-3 w-64 text-gray-600 whitespace-nowrap">
                          <span className="truncate block">{p.marca || '—'}</span>
                        </td>
                        <td className="p-3 w-64 text-gray-600 whitespace-nowrap">
                          <span className="truncate block">{p.categoria || '—'}</span>
                        </td>
                        <td className="p-3 w-64 text-gray-600 whitespace-nowrap">
                          {custo === null ? '—' : formatMoneyBR(custo)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Inventário' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-w-0 max-w-full">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">ID</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">PRODUTO</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">MARCA</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">SALDO</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">MÍNIMO</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">MÁXIMO</th>
                </tr>
              </thead>
              <tbody>
                {!selectedLocationId ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Selecione uma unidade
                    </td>
                  </tr>
                ) : snapshotLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Carregando inventário...
                    </td>
                  </tr>
                ) : snapshotError ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-red-600">
                      Erro: {snapshotError}
                    </td>
                  </tr>
                ) : snapshot.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Nenhum saldo encontrado
                    </td>
                  </tr>
                ) : (
                  snapshot.map((row) => {
                    const saldo = toNumber(row.saldo_atual) ?? 0;
                    const min = toNumber(row.estoque_minimo);
                    const max = toNumber(row.estoque_maximo);
                    const belowMin = min !== null && saldo < min;

                    return (
                      <tr
                        key={row.produto_id}
                        className="border-t border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <td className="p-4 whitespace-nowrap text-gray-700">{row.produto_id}</td>
                        <td className="p-4 font-medium text-gray-800 whitespace-nowrap">
                          <span className="truncate block">{row.produto_nome}</span>
                        </td>
                        <td className="p-4 text-gray-600 whitespace-nowrap">
                          <span className="truncate block">{row.produto_marca || '—'}</span>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={belowMin ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                            {saldo.toFixed(3)}
                          </span>
                          <span className="text-gray-400 ml-2">{row.produto_unidade_medida || ''}</span>
                        </td>
                        <td className="p-4 text-gray-600 whitespace-nowrap">{min === null ? '—' : min.toFixed(3)}</td>
                        <td className="p-4 text-gray-600 whitespace-nowrap">{max === null ? '—' : max.toFixed(3)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Movimentações' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-w-0 max-w-full">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">ID</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">TIPO</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">PRODUTO</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">QTD</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">MOTIVO</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">ORIGEM</th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">DATA</th>
                </tr>
              </thead>
              <tbody>
                {!selectedLocationId ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      Selecione uma unidade
                    </td>
                  </tr>
                ) : movsLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      Carregando movimentações...
                    </td>
                  </tr>
                ) : movsError ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-red-600">
                      Erro: {movsError}
                    </td>
                  </tr>
                ) : movs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      Nenhuma movimentação encontrada
                    </td>
                  </tr>
                ) : (
                  movs.map((m) => {
                    const qtd = toNumber(m.quantidade) ?? 0;
                    const date = new Date(m.created_at);
                    const dateStr = Number.isNaN(date.getTime())
                      ? m.created_at
                      : `${date.toLocaleDateString('pt-BR')} - ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

                    return (
                      <tr
                        key={m.id}
                        className="border-t border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <td className="p-4 whitespace-nowrap text-gray-700">{m.id}</td>
                        <td className="p-4 whitespace-nowrap text-gray-800">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${movementDotColor(m.tipo)}`}
                            ></span>
                            <span className="truncate font-medium">{formatMovementType(m.tipo)}</span>
                          </div>
                        </td>
                        <td className="p-4 text-gray-600 whitespace-nowrap">
                          <span className="truncate block">{m.produto_nome}</span>
                        </td>
                        <td className="p-4 text-gray-600 whitespace-nowrap">{qtd.toFixed(3)}</td>
                        <td className="p-4 text-gray-600 whitespace-nowrap">
                          <span className="truncate block">{m.motivo || '—'}</span>
                        </td>
                        <td className="p-4 text-gray-600 whitespace-nowrap">{m.origem_id || '—'}</td>
                        <td className="p-4 text-gray-600 whitespace-nowrap">{dateStr}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstoquePage;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Trash } from './Icons';
import { API_BASE_URL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useInternalBooking, InternalAgente, InternalCliente } from '../hooks/useInternalBooking';

interface VendaRapidaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProdutoRow = {
  id: number;
  nome: string;
  preco_custo_medio?: number | string | null;
  preco_venda?: number | string | null;
  unidade_medida?: string | null;
};

type EstoqueSnapshotRow = {
  produto_id: number;
  saldo_atual: number;
};

type UnidadeOption = {
  id: string;
  nome: string;
};

type CartItem = {
  uid: string;
  produto_id: number;
  nome: string;
  unidade_medida?: string | null;
  quantidade: string;
  preco_unitario: string;
  agente_id: string;
};

type PaymentLine = {
  uid: string;
  metodo: string;
  valor: string;
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={`w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${className || ''}`}
    {...props}
  />
);

const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select
      className={`appearance-none w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500 ${className || ''}`}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
  </div>
);

const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={`text-sm font-medium text-gray-600 mb-1 block ${className || ''}`} {...props} />
);

const FormField: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={className}>
    <Label>{label}</Label>
    {children}
  </div>
);

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white p-6 rounded-lg border border-gray-200">
    <div className="flex justify-between items-center mb-6">
      <h3 className="text-lg font-semibold text-blue-600">{title}</h3>
    </div>
    {children}
  </div>
);

const toNumber = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toMoneyFixedString = (value: unknown) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return '';
  const n = Number(normalized);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
};

const formatCurrency = (value: number) => {
  return value.toFixed(2).replace('.', ',');
};

const VendaRapidaModal: React.FC<VendaRapidaModalProps> = ({ isOpen, onClose }) => {
  const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;
  const { token, isAuthenticated } = useAuth();
  const toast = useToast();
  const { searchClientes, fetchAgentes } = useInternalBooking();

  const idempotencyKeyRef = useRef<string | null>(null);

  const generateIdempotencyKey = () => {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch {
      // ignore
    }
    return `idemp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const [unidadeId, setUnidadeId] = useState<string>('');
  const [unidades, setUnidades] = useState<UnidadeOption[]>([]);

  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteSelecionado, setClienteSelecionado] = useState<InternalCliente | null>(null);
  const [clienteResultados, setClienteResultados] = useState<InternalCliente[]>([]);
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false);
  const clienteBoxRef = useRef<HTMLDivElement>(null);

  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<string>('');

  const [estoqueByProdutoId, setEstoqueByProdutoId] = useState<Map<number, number>>(new Map());

  const [agentes, setAgentes] = useState<InternalAgente[]>([]);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [pagamentos, setPagamentos] = useState<PaymentLine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clienteBoxRef.current && !clienteBoxRef.current.contains(event.target as Node)) {
        setClienteDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    idempotencyKeyRef.current = generateIdempotencyKey();
    setClienteQuery('');
    setClienteSelecionado(null);
    setClienteResultados([]);
    setClienteDropdownOpen(false);
    setProdutoSelecionadoId('');
    setCartItems([]);
    setPagamentos([{ uid: `pay-${Date.now()}-${Math.random()}`, metodo: 'PIX', valor: '' }]);
    setIsSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!isOpen || !isAuthenticated || !token) return;

      try {
        const res = await fetch(`${API_BASE_URL}/unidades`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : [];
        const options = rows
          .map((u: any) => ({
            id: u?.id ? String(u.id) : '',
            nome: String(u?.nome || u?.name || '').trim()
          }))
          .filter((u: UnidadeOption) => u.id && u.nome);

        setUnidades(options);

        const firstId = options?.[0]?.id || '';
        setUnidadeId((prev) => prev || firstId);
      } catch {
        if (!cancelled) {
          setUnidades([]);
          setUnidadeId('');
        }
      }

      try {
        const res = await fetch(`${API_BASE_URL}/produtos`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : [];
        setProdutos(rows);
      } catch {
        if (!cancelled) setProdutos([]);
      }

      try {
        const unidadeIdNum = unidadeId ? Number(unidadeId) : null;
        if (!unidadeIdNum || !Number.isFinite(unidadeIdNum)) {
          if (!cancelled) setEstoqueByProdutoId(new Map());
        } else {
          const res = await fetch(`${API_BASE_URL}/estoque/snapshot?unidade_id=${unidadeIdNum}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          const rows = Array.isArray(data?.data) ? data.data : [];
          const map = new Map<number, number>();
          for (const r of rows as any[]) {
            const pid = Number((r as any)?.produto_id);
            const saldo = Number((r as any)?.saldo_atual);
            if (Number.isFinite(pid)) {
              map.set(pid, Number.isFinite(saldo) ? saldo : 0);
            }
          }
          setEstoqueByProdutoId(map);
        }
      } catch {
        if (!cancelled) setEstoqueByProdutoId(new Map());
      }

      try {
        const rows = await fetchAgentes();
        if (!cancelled) setAgentes(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setAgentes([]);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthenticated, token, fetchAgentes]);

  useEffect(() => {
    let cancelled = false;

    const loadSnapshot = async () => {
      if (!isOpen || !isAuthenticated || !token) return;
      const unidadeIdNum = unidadeId ? Number(unidadeId) : null;
      if (!unidadeIdNum || !Number.isFinite(unidadeIdNum)) {
        setEstoqueByProdutoId(new Map());
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/estoque/snapshot?unidade_id=${unidadeIdNum}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        const rows = Array.isArray(data?.data) ? data.data : [];
        const map = new Map<number, number>();
        for (const r of rows as EstoqueSnapshotRow[]) {
          const pid = Number((r as any)?.produto_id);
          const saldo = Number((r as any)?.saldo_atual);
          if (Number.isFinite(pid)) {
            map.set(pid, Number.isFinite(saldo) ? saldo : 0);
          }
        }
        setEstoqueByProdutoId(map);
      } catch {
        if (!cancelled) setEstoqueByProdutoId(new Map());
      }
    };

    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthenticated, token, unidadeId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!isOpen) return;
      if (!clienteQuery || clienteQuery.trim().length < 2) {
        setClienteResultados([]);
        return;
      }

      try {
        const results = await searchClientes(clienteQuery.trim());
        if (cancelled) return;
        setClienteResultados(results);
        setClienteDropdownOpen(true);
      } catch {
        if (!cancelled) setClienteResultados([]);
      }
    };

    const t = window.setTimeout(run, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [clienteQuery, isOpen, searchClientes]);

  const handleAddProduct = () => {
    const produtoId = parseInt(produtoSelecionadoId, 10);
    if (!Number.isFinite(produtoId)) return;

    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return;

    const saldoAtual = Number(estoqueByProdutoId.get(produtoId) ?? 0);
    if (!Number.isFinite(saldoAtual) || saldoAtual <= 0) {
      toast.error('Saldo insuficiente no estoque', `Erro: A ${produto.nome} não possui saldo suficiente no estoque.`);
      return;
    }

    const precoDefault = toNumber((produto as any).preco_venda);

    setCartItems((prev) => [
      ...prev,
      {
        uid: `item-${Date.now()}-${Math.random()}`,
        produto_id: produto.id,
        nome: produto.nome,
        unidade_medida: (produto as any).unidade_medida ?? null,
        quantidade: '1',
        preco_unitario: precoDefault ? precoDefault.toFixed(2) : '0.00',
        agente_id: ''
      }
    ]);

    setProdutoSelecionadoId('');
  };

  const total = useMemo(() => {
    return Number(
      cartItems
        .reduce((sum, item) => {
          const qty = toNumber(item.quantidade);
          const unit = toNumber(item.preco_unitario);
          return sum + qty * unit;
        }, 0)
        .toFixed(2)
    );
  }, [cartItems]);

  useEffect(() => {
    if (pagamentos.length !== 1) return;
    const valorAtual = toNumber(pagamentos[0]?.valor);
    if (Math.abs(valorAtual - total) < 0.01) return;
    setPagamentos((prev) => {
      if (prev.length !== 1) return prev;
      return [{ ...prev[0], valor: total > 0 ? total.toFixed(2) : '' }];
    });
  }, [total, pagamentos.length]);

  const totalPago = useMemo(() => {
    return Number(
      pagamentos
        .reduce((sum, p) => {
          return sum + toNumber(p.valor);
        }, 0)
        .toFixed(2)
    );
  }, [pagamentos]);

  const restante = useMemo(() => {
    return Number((total - totalPago).toFixed(2));
  }, [total, totalPago]);

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    if (cartItems.length === 0) return false;
    if (pagamentos.length === 0) return false;
    return Math.abs(totalPago - total) < 0.01;
  }, [cartItems.length, pagamentos.length, total, totalPago, isSubmitting]);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (cartItems.length === 0) {
      toast.warning('Carrinho vazio', 'Adicione pelo menos 1 produto para concluir a venda.');
      return;
    }

    if (!unidadeId || !Number.isFinite(parseInt(unidadeId, 10))) {
      toast.warning('Unidade não definida', 'Não foi possível determinar a unidade para registrar a venda.');
      return;
    }

    if (pagamentos.length === 0) {
      toast.warning('Pagamento pendente', 'Adicione pelo menos 1 linha de pagamento.');
      return;
    }

    if (Math.abs(totalPago - total) >= 0.01) {
      toast.warning('Pagamento incompleto', 'A soma dos pagamentos precisa ser igual ao total.');
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }

    setIsSubmitting(true);

    try {
      const payload = {
        unidade_id: parseInt(unidadeId, 10),
        cliente_id: clienteSelecionado?.id || null,
        idempotency_key: idempotencyKeyRef.current,
        itens: cartItems.map((i) => ({
          produto_id: i.produto_id,
          quantidade: toNumber(i.quantidade),
          preco_aplicado: toNumber(i.preco_unitario),
          agente_id: i.agente_id ? parseInt(i.agente_id, 10) : null
        })),
        pagamentos: pagamentos.map((p) => ({
          metodo: p.metodo,
          valor: toNumber(p.valor)
        }))
      };

      const res = await fetch(`${API_BASE_URL}/vendas`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        if (data?.code === 'SALDO_INSUFICIENTE') {
          const produtoNome = String(data?.produto_nome || '').trim();
          const produtoId = Number(data?.produto_id);
          const fallbackNome = Number.isFinite(produtoId)
            ? (cartItems.find((i) => i.produto_id === produtoId)?.nome || `Produto ${produtoId}`)
            : 'Produto';
          toast.error('Saldo insuficiente no estoque', `Erro: A ${produtoNome || fallbackNome} não possui saldo suficiente no estoque.`);
          return;
        }

        const msg = data?.error || data?.message || 'Erro ao concluir venda';
        toast.error('Falha ao concluir venda', msg);
        return;
      }

      toast.success('Venda concluída', 'Venda registrada com sucesso.');

      try {
        window.dispatchEvent(
          new CustomEvent('tally:estoque_updated', {
            detail: {
              unidade_id: parseInt(unidadeId, 10)
            }
          })
        );
      } catch {
        // ignore
      }

      setClienteQuery('');
      setClienteSelecionado(null);
      setClienteResultados([]);
      setClienteDropdownOpen(false);
      setProdutoSelecionadoId('');
      setCartItems([]);
      setPagamentos([{ uid: `pay-${Date.now()}-${Math.random()}`, metodo: 'PIX', valor: '' }]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !portalRoot) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose} aria-labelledby="modal-title" role="dialog" aria-modal="true">
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
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-800" id="modal-title">Nova Venda / PDV</h2>
              <div className="mt-2">
                <div className="flex items-center gap-3">
                  <div className="text-xs font-semibold text-gray-600">Unidade</div>
                  <div className="w-[260px] max-w-full">
                    <Select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex flex-col gap-6">
              <FormSection title="Cliente (opcional)">
                <div ref={clienteBoxRef} className="relative">
                  <FormField label="Buscar cliente">
                    <Input
                      value={clienteSelecionado ? clienteSelecionado.nome_completo : clienteQuery}
                      onChange={(e) => {
                        setClienteSelecionado(null);
                        setClienteQuery(e.target.value);
                      }}
                      onFocus={() => {
                        if (clienteResultados.length > 0) setClienteDropdownOpen(true);
                      }}
                      placeholder="Digite nome ou telefone"
                    />
                  </FormField>

                  {clienteSelecionado && (
                    <div className="mt-2 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-sm text-blue-800 font-semibold truncate">{clienteSelecionado.nome_completo}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setClienteSelecionado(null);
                          setClienteQuery('');
                          setClienteResultados([]);
                        }}
                        className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                      >
                        Remover
                      </button>
                    </div>
                  )}

                  {clienteDropdownOpen && !clienteSelecionado && clienteResultados.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-56 overflow-y-auto">
                      {clienteResultados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left p-3 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            setClienteSelecionado(c);
                            setClienteDropdownOpen(false);
                            setClienteQuery('');
                            setClienteResultados([]);
                          }}
                        >
                          <div className="font-medium">{c.nome_completo}</div>
                          {c.telefone && <div className="text-xs text-gray-500">{c.telefone}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FormSection>

              <FormSection title="Carrinho (Produtos)">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <FormField label="Produto">
                    <Select value={produtoSelecionadoId} onChange={(e) => setProdutoSelecionadoId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.nome}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddProduct}
                      disabled={!produtoSelecionadoId}
                      className="w-full h-[42px] bg-white border border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Adicionar ao carrinho
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {cartItems.length === 0 ? (
                    <div className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-lg p-4">
                      Nenhum produto no carrinho.
                    </div>
                  ) : (
                    cartItems.map((item) => {
                      const lineTotal = toNumber(item.quantidade) * toNumber(item.preco_unitario);
                      const quantidadeStep = String(item.unidade_medida || '').toUpperCase() === 'UN' ? '1' : '0.001';
                      return (
                        <div key={item.uid} className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-800 truncate">{item.nome}</div>
                              <div className="text-xs text-gray-500">Total linha: R$ {formatCurrency(lineTotal)}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCartItems((prev) => prev.filter((x) => x.uid !== item.uid))}
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                              aria-label="Remover item"
                            >
                              <Trash className="h-5 w-5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
                            <FormField label="Quantidade">
                              <Input
                                type="number"
                                step={quantidadeStep}
                                min="0"
                                value={item.quantidade}
                                onChange={(e) =>
                                  setCartItems((prev) =>
                                    prev.map((x) => (x.uid === item.uid ? { ...x, quantidade: e.target.value } : x))
                                  )
                                }
                              />
                            </FormField>

                            <FormField label="Preço Unitário">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.preco_unitario}
                                onChange={(e) =>
                                  setCartItems((prev) =>
                                    prev.map((x) => (x.uid === item.uid ? { ...x, preco_unitario: e.target.value } : x))
                                  )
                                }
                                onBlur={() =>
                                  setCartItems((prev) =>
                                    prev.map((x) =>
                                      x.uid === item.uid
                                        ? { ...x, preco_unitario: toMoneyFixedString(x.preco_unitario) || '0.00' }
                                        : x
                                    )
                                  )
                                }
                              />
                            </FormField>

                            <FormField label="Vendedor">
                              <Select
                                value={item.agente_id}
                                onChange={(e) =>
                                  setCartItems((prev) =>
                                    prev.map((x) => (x.uid === item.uid ? { ...x, agente_id: e.target.value } : x))
                                  )
                                }
                              >
                                <option value="">Recepção</option>
                                {agentes.map((a) => (
                                  <option key={a.id} value={String(a.id)}>
                                    {a.nome}
                                  </option>
                                ))}
                              </Select>
                            </FormField>

                            <div className="sm:flex sm:flex-col sm:justify-end">
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm text-gray-700 font-semibold text-right">
                                R$ {formatCurrency(lineTotal)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </FormSection>
              <FormSection title="Fechamento">
                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600">Total</div>
                      <div className="text-2xl font-bold text-gray-900">R$ {formatCurrency(total)}</div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-gray-700">Pagamentos</div>
                      <button
                        type="button"
                        onClick={() =>
                          setPagamentos((prev) => [
                            ...prev,
                            {
                              uid: `pay-${Date.now()}-${Math.random()}`,
                              metodo: 'PIX',
                              valor: restante > 0 ? restante.toFixed(2) : ''
                            }
                          ])
                        }
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                      >
                        + Adicionar
                      </button>
                    </div>

                    <div className="space-y-3">
                      {pagamentos.map((p) => (
                        <div key={p.uid} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                          <div className="sm:col-span-6">
                            <FormField label="Método">
                              <Select
                                value={p.metodo}
                                onChange={(e) =>
                                  setPagamentos((prev) =>
                                    prev.map((x) => (x.uid === p.uid ? { ...x, metodo: e.target.value } : x))
                                  )
                                }
                              >
                                <option value="PIX">PIX</option>
                                <option value="Cartão Crédito">Cartão de Crédito</option>
                                <option value="Cartão Débito">Cartão de Débito</option>
                                <option value="Dinheiro">Dinheiro</option>
                              </Select>
                            </FormField>
                          </div>

                          <div className="sm:col-span-4">
                            <FormField label="Valor">
                              <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-600">R$</div>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={p.valor}
                                  onChange={(e) =>
                                    setPagamentos((prev) =>
                                      prev.map((x) => (x.uid === p.uid ? { ...x, valor: e.target.value } : x))
                                    )
                                  }
                                  onBlur={() =>
                                    setPagamentos((prev) =>
                                      prev.map((x) =>
                                        x.uid === p.uid
                                          ? { ...x, valor: toMoneyFixedString(x.valor) }
                                          : x
                                      )
                                    )
                                  }
                                  className="pl-10"
                                />
                              </div>
                            </FormField>
                          </div>

                          <div className="sm:col-span-2">
                            <button
                              type="button"
                              onClick={() => setPagamentos((prev) => prev.filter((x) => x.uid !== p.uid))}
                              disabled={pagamentos.length === 1}
                              className="w-full h-[42px] bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                        <div className="flex items-center justify-between sm:block">
                          <div className="text-gray-600">Total</div>
                          <div className="font-semibold text-gray-900">R$ {formatCurrency(total)}</div>
                        </div>
                        <div className="flex items-center justify-between sm:block">
                          <div className="text-gray-600">Pago</div>
                          <div className="font-semibold text-gray-900">R$ {formatCurrency(totalPago)}</div>
                        </div>
                        <div className="flex items-center justify-between sm:block">
                          <div className="text-gray-600">Restante</div>
                          <div className={`font-semibold ${restante === 0 ? 'text-green-700' : restante > 0 ? 'text-yellow-700' : 'text-red-700'}`}>
                            R$ {formatCurrency(restante)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors text-base disabled:bg-blue-400 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Concluindo...' : 'Concluir Venda'}
                  </button>
                </div>
              </FormSection>
            </div>
          </div>
        </div>
      </div>
    </>,
    portalRoot
  );
};

export default VendaRapidaModal;

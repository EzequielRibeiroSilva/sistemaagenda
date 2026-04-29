import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

export type DespesaStatus = 'PENDING' | 'OVERDUE' | 'PAID' | string;

export type DespesaRow = {
  id: number;
  unidade_id: number;
  usuario_id: number;
  descricao: string;
  categoria: string;
  valor: number | string;
  data_vencimento: string;
  data_pagamento: string | null;
  status: DespesaStatus;
  forma_pagamento: string | null;
  created_at: string;
  updated_at: string;
};

type FetchState = {
  loading: boolean;
  error: string | null;
};

export const useDespesas = (params: { unidadeId: string; status: DespesaStatus }) => {
  const { token, isAuthenticated } = useAuth();
  const { unidadeId, status } = params;

  const [despesas, setDespesas] = useState<DespesaRow[]>([]);
  const [state, setState] = useState<FetchState>({ loading: false, error: null });

  const abortRef = useRef<AbortController | null>(null);

  const makeAuthenticatedRequest = useCallback(
    async (
      url: string,
      options?: { method?: string; body?: any; signal?: AbortSignal }
    ) => {
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
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options?.signal
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.error || payload?.message || `Erro HTTP: ${res.status}`);
      }

      return payload;
    },
    [isAuthenticated, token]
  );

  const fetchDespesas = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!isAuthenticated || !token) return;
      if (!unidadeId) return;

      setState({ loading: true, error: null });

      const qs = new URLSearchParams({
        unidade_id: unidadeId,
        status: String(status || '').trim(),
        limit: '200'
      });

      try {
        const payload = await makeAuthenticatedRequest(`${API_BASE_URL}/financeiro/despesas?${qs.toString()}`, {
          signal: opts?.signal
        });

        if (opts?.signal?.aborted) return;

        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setDespesas(rows);
        setState({ loading: false, error: null });
      } catch (e) {
        if (opts?.signal?.aborted) return;
        const msg = e instanceof Error ? e.message : 'Erro ao carregar despesas';
        setDespesas([]);
        setState({ loading: false, error: msg });
      }
    },
    [API_BASE_URL, isAuthenticated, makeAuthenticatedRequest, status, token, unidadeId]
  );

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (!unidadeId) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    fetchDespesas({ signal: ac.signal });

    return () => {
      ac.abort();
    };
  }, [fetchDespesas, isAuthenticated, token, unidadeId, status]);

  const refetch = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    await fetchDespesas({ signal: ac.signal });
  }, [fetchDespesas]);

  const createDespesa = useCallback(
    async (payload: { unidade_id: number; descricao: string; categoria: string; valor: number; data_vencimento: string }) => {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/financeiro/despesas`, {
        method: 'POST',
        body: {
          ...payload,
          status: 'PENDING'
        }
      });
      return res?.data as DespesaRow;
    },
    [API_BASE_URL, makeAuthenticatedRequest]
  );

  const updateDespesa = useCallback(
    async (id: number, payload: { unidade_id: number } & Record<string, any>) => {
      const res = await makeAuthenticatedRequest(`${API_BASE_URL}/financeiro/despesas/${id}`, {
        method: 'PUT',
        body: payload
      });
      return res?.data as DespesaRow;
    },
    [API_BASE_URL, makeAuthenticatedRequest]
  );

  const deleteDespesa = useCallback(
    async (id: number, unidade_id: number) => {
      const qs = new URLSearchParams({ unidade_id: String(unidade_id) });
      await makeAuthenticatedRequest(`${API_BASE_URL}/financeiro/despesas/${id}?${qs.toString()}`, {
        method: 'DELETE'
      });
    },
    [API_BASE_URL, makeAuthenticatedRequest]
  );

  const computed = useMemo(() => {
    return {
      despesas,
      loading: state.loading,
      error: state.error
    };
  }, [despesas, state.error, state.loading]);

  return {
    ...computed,
    refetch,
    createDespesa,
    updateDespesa,
    deleteDespesa
  };
};

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

type CountState = {
  count: number;
  loading: boolean;
  error: string | null;
};

/**
 * Hook otimizado para contagem de despesas vencidas
 * Utilizado para badges de alerta no menu lateral (Orange Standard)
 * 
 * Performance:
 * - Endpoint retorna apenas COUNT(*) sem payload de dados
 * - Refetch automático a cada 5 minutos
 * - Invalidação manual via refetch() após mutações
 */
export const useDespesasVencidasCount = (params: { unidadeId: string }) => {
  const { token, isAuthenticated } = useAuth();
  const { unidadeId } = params;

  const [state, setState] = useState<CountState>({
    count: 0,
    loading: false,
    error: null
  });

  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCount = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!isAuthenticated || !token) return;
      if (!unidadeId) return;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      const qs = new URLSearchParams({
        unidade_id: unidadeId
      });

      try {
        const res = await fetch(`${API_BASE_URL}/financeiro/despesas/vencidas/count?${qs.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: opts?.signal
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(payload?.error || payload?.message || `Erro HTTP: ${res.status}`);
        }

        if (opts?.signal?.aborted) return;

        const count = typeof payload?.count === 'number' ? payload.count : 0;
        setState({ count, loading: false, error: null });
      } catch (e) {
        if (opts?.signal?.aborted) return;
        const msg = e instanceof Error ? e.message : 'Erro ao contar despesas vencidas';
        setState({ count: 0, loading: false, error: msg });
      }
    },
    [API_BASE_URL, isAuthenticated, token, unidadeId]
  );

  // Fetch inicial e setup de intervalo
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (!unidadeId) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Fetch inicial
    fetchCount({ signal: ac.signal });

    // Refetch a cada 5 minutos (300000ms)
    intervalRef.current = setInterval(() => {
      fetchCount();
    }, 300000);

    return () => {
      ac.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchCount, isAuthenticated, token, unidadeId]);

  const refetch = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    await fetchCount({ signal: ac.signal });
  }, [fetchCount]);

  return {
    count: state.count,
    loading: state.loading,
    error: state.error,
    refetch
  };
};

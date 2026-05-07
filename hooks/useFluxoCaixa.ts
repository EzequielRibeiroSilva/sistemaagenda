import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

export type FluxoCaixaTipo = 'ENTRADA' | 'SAIDA' | string;

export type FluxoCaixaTransacao = {
  tipo: FluxoCaixaTipo;
  valor: number;
  data: string;
  metodo: string | null;
  descricao: string;
};

export type FluxoCaixaResumo = {
  total_entradas: number;
  total_saidas: number;
  saldo_periodo: number;
};

type FetchState = {
  loading: boolean;
  error: string | null;
};

export const useFluxoCaixa = (params: {
  unidadeId: string;
  dataInicio: string;
  dataFim: string;
}) => {
  const { token, isAuthenticated } = useAuth();
  const { unidadeId, dataInicio, dataFim } = params;

  const [transacoes, setTransacoes] = useState<FluxoCaixaTransacao[]>([]);
  const [resumo, setResumo] = useState<FluxoCaixaResumo>({
    total_entradas: 0,
    total_saidas: 0,
    saldo_periodo: 0
  });

  const [state, setState] = useState<FetchState>({ loading: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const makeAuthenticatedRequest = useCallback(
    async (url: string, options?: { signal?: AbortSignal }) => {
      if (!isAuthenticated || !token) {
        throw new Error('Usuário não autenticado');
      }

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
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

  const fetchExtrato = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!isAuthenticated || !token) return;
      if (!unidadeId || !dataInicio || !dataFim) return;

      setState({ loading: true, error: null });

      const qs = new URLSearchParams({
        unidade_id: unidadeId,
        data_inicio: dataInicio,
        data_fim: dataFim
      });

      try {
        const payload = await makeAuthenticatedRequest(`${API_BASE_URL}/financeiro/extrato?${qs.toString()}`, {
          signal: opts?.signal
        });

        if (opts?.signal?.aborted) return;

        const rows = Array.isArray(payload?.transacoes) ? payload.transacoes : [];
        const resumoPayload = payload?.resumo && typeof payload.resumo === 'object' ? payload.resumo : null;

        setTransacoes(rows);
        setResumo({
          total_entradas: Number(resumoPayload?.total_entradas) || 0,
          total_saidas: Number(resumoPayload?.total_saidas) || 0,
          saldo_periodo: Number(resumoPayload?.saldo_periodo) || 0
        });

        setState({ loading: false, error: null });
      } catch (e) {
        if (opts?.signal?.aborted) return;
        const msg = e instanceof Error ? e.message : 'Erro ao carregar extrato';
        setTransacoes([]);
        setResumo({ total_entradas: 0, total_saidas: 0, saldo_periodo: 0 });
        setState({ loading: false, error: msg });
      }
    },
    [API_BASE_URL, dataFim, dataInicio, isAuthenticated, makeAuthenticatedRequest, token, unidadeId]
  );

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (!unidadeId || !dataInicio || !dataFim) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    fetchExtrato({ signal: ac.signal });

    return () => {
      ac.abort();
    };
  }, [fetchExtrato, isAuthenticated, token, unidadeId, dataInicio, dataFim]);

  const refetch = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    await fetchExtrato({ signal: ac.signal });
  }, [fetchExtrato]);

  const computed = useMemo(() => {
    return {
      transacoes,
      resumo,
      loading: state.loading,
      error: state.error
    };
  }, [resumo, state.error, state.loading, transacoes]);

  return {
    ...computed,
    refetch
  };
};

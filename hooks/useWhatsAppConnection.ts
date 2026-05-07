import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

export type WhatsAppConnectionState = 'open' | 'close' | 'connecting' | 'unknown';

export interface WhatsAppStatusData {
  whatsapp_instance_name: string | null;
  whatsapp_status: WhatsAppConnectionState;
  whatsapp_number: string | null;
}

export interface UseWhatsAppConnectionOptions {
  autoPoll?: boolean;
  pollIntervalMs?: number;
}

type FetchStatusOptions = {
  silent?: boolean;
};

type StopReason = 'none' | 'auth_critical';

const normalizeStatus = (value: any): WhatsAppConnectionState => {
  if (value === 'open' || value === 'close' || value === 'connecting') return value;
  return 'unknown';
};

export const useWhatsAppConnection = (options: UseWhatsAppConnectionOptions = {}) => {
  const { token, isAuthenticated } = useAuth();
  const autoPoll = options.autoPoll ?? true;
  const pollIntervalMs = options.pollIntervalMs ?? 12000;

  const [status, setStatus] = useState<WhatsAppStatusData>({
    whatsapp_instance_name: null,
    whatsapp_status: 'unknown',
    whatsapp_number: null
  });
  const [statusLoading, setStatusLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [qrcodeBase64, setQrcodeBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastStatusFetchAt, setLastStatusFetchAt] = useState<number | null>(null);
  const [lastStatusRaw, setLastStatusRaw] = useState<any>(null);

  const pollTimerRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number>(pollIntervalMs);
  const abortRef = useRef<AbortController | null>(null);
  const inflightRef = useRef(false);

  const attemptRef = useRef(0);
  const authFailStreakRef = useRef(0);
  const stopReasonRef = useRef<StopReason>('none');
  const lastErrorRef = useRef<string | null>(null);

  const AUTH_FAIL_THRESHOLD = 5;
  const BACKOFF_BASE_MS = 2000;
  const BACKOFF_MAX_MS = 30000;

  const computeDelayMs = useCallback((attempt: number) => {
    const exp = BACKOFF_BASE_MS * Math.pow(2, attempt);
    const capped = Math.min(exp, BACKOFF_MAX_MS);
    const jitterFactor = 0.7 + Math.random() * 0.6;
    return Math.round(capped * jitterFactor);
  }, []);

  const fetchStatus = useCallback(async (opts: FetchStatusOptions = {}) => {
    if (!isAuthenticated || !token) return;

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    if (inflightRef.current) return;
    inflightRef.current = true;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (!opts.silent) setStatusLoading(true);
    try {
      setLastStatusFetchAt(Date.now());

      const resp = await fetch(`${API_BASE_URL}/whatsapp/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: ac.signal
      });

      const json = await resp.json().catch(() => null);
      setLastStatusRaw(json);

      if (!resp.ok || !json?.success) {
        const httpStatus = resp?.status;
        const code = json?.error || json?.code;
        const message = json?.message || 'Erro ao buscar status do WhatsApp';

        const isAuthError = httpStatus === 401 || httpStatus === 403 || code === 'AUTH_FAILED';

        if (isAuthError) {
          authFailStreakRef.current += 1;
          const msgFriendly = 'Falha na conexão com o serviço de WhatsApp. Clique em "Gerar novo QR" para tentar novamente ou entre em contato com o suporte.';
          lastErrorRef.current = msgFriendly;
          setError(msgFriendly);

          if (authFailStreakRef.current >= AUTH_FAIL_THRESHOLD) {
            stopReasonRef.current = 'auth_critical';
            return;
          }
        } else {
          authFailStreakRef.current = 0;
          lastErrorRef.current = message;
          setError(message);
        }

        return;
      }

      // sucesso: resetar backoff e streak
      attemptRef.current = 0;
      authFailStreakRef.current = 0;
      stopReasonRef.current = 'none';
      lastErrorRef.current = null;
      setError(null);

      setStatus({
        whatsapp_instance_name: json?.data?.whatsapp_instance_name ?? null,
        whatsapp_status: normalizeStatus(json?.data?.whatsapp_status),
        whatsapp_number: json?.data?.whatsapp_number ?? null
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      authFailStreakRef.current = 0;
      const msgFriendly = 'Falha de rede ao comunicar com o servidor';
      lastErrorRef.current = msgFriendly;
      setError(msgFriendly);
    } finally {
      inflightRef.current = false;
      if (!opts.silent) setStatusLoading(false);
    }
  }, [isAuthenticated, token]);

  const disconnect = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setError('Você precisa estar autenticado');
      return false;
    }

    setDisconnectLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/whatsapp/disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        setError(json?.message || 'Erro ao desconectar WhatsApp');
        return false;
      }

      setStatus(prev => ({
        ...prev,
        whatsapp_status: 'close',
        whatsapp_number: null
      }));
      setQrcodeBase64(null);
      return true;
    } finally {
      setDisconnectLoading(false);
    }
  }, [isAuthenticated, token]);

  const connect = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setError('Você precisa estar autenticado');
      return null;
    }

    // reset manual
    attemptRef.current = 0;
    authFailStreakRef.current = 0;
    stopReasonRef.current = 'none';
    lastErrorRef.current = null;

    setConnectLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/whatsapp/connect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        const httpStatus = resp?.status;
        const code = json?.error || json?.code;
        const isAuthError = httpStatus === 401 || httpStatus === 403 || code === 'AUTH_FAILED';

        if (isAuthError) {
          authFailStreakRef.current += 1;
          const msgFriendly = 'Falha na conexão com o serviço de WhatsApp. Clique em "Gerar novo QR" para tentar novamente ou entre em contato com o suporte.';
          lastErrorRef.current = msgFriendly;
          setError(msgFriendly);
          if (authFailStreakRef.current >= AUTH_FAIL_THRESHOLD) {
            stopReasonRef.current = 'auth_critical';
          }
        } else {
          lastErrorRef.current = json?.message || 'Erro ao conectar WhatsApp';
          setError(json?.message || 'Erro ao conectar WhatsApp');
        }
        return null;
      }

      const qr = json?.data?.qrcodeBase64 || null;
      setQrcodeBase64(qr);
      lastErrorRef.current = null;
      setError(null);

      setStatus(prev => ({
        ...prev,
        whatsapp_instance_name: json?.data?.instanceName ?? prev.whatsapp_instance_name
      }));

      // comando humano: tentar status imediatamente (reset manual já foi aplicado no início)
      // Observação: se cair no circuit breaker, o scheduleNext irá interromper o polling.
      setTimeout(() => {
        try {
          fetchStatus();
        } catch {}
      }, 0);

      return qr;
    } finally {
      setConnectLoading(false);
    }
  }, [fetchStatus, isAuthenticated, token]);

  const stopPolling = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback((opts?: { immediate?: boolean }) => {
    const intervalChanged = pollIntervalRef.current !== pollIntervalMs;
    if (intervalChanged) {
      stopPolling();
    }

    if (!autoPoll || !isAuthenticated || !token) {
      stopPolling();
      return;
    }

    if (stopReasonRef.current === 'auth_critical') {
      stopPolling();
      return;
    }

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      stopPolling();
      return;
    }

    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    pollIntervalRef.current = pollIntervalMs;

    const delay = opts?.immediate ? 0 : computeDelayMs(attemptRef.current);

    const id = window.setTimeout(async () => {
      await fetchStatus({ silent: true });

      if (stopReasonRef.current === 'auth_critical') {
        stopPolling();
        return;
      }

      // Se houve erro e não é auth critical => backoff progressivo
      if (lastErrorRef.current) {
        attemptRef.current = Math.min(attemptRef.current + 1, 10);
      } else {
        attemptRef.current = 0;
      }

      scheduleNext();
    }, delay);

    pollTimerRef.current = id;
  }, [autoPoll, computeDelayMs, fetchStatus, isAuthenticated, pollIntervalMs, stopPolling, token]);

  const startPolling = useCallback(() => {
    scheduleNext({ immediate: true });
  }, [scheduleNext]);

  const resetAndRunNow = useCallback(() => {
    attemptRef.current = 0;
    authFailStreakRef.current = 0;
    stopReasonRef.current = 'none';
    lastErrorRef.current = null;
    setError(null);
    scheduleNext({ immediate: true });
  }, [scheduleNext]);

  useEffect(() => {
    if (!autoPoll) return;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopPolling();
        return;
      }
      scheduleNext({ immediate: true });
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoPoll, scheduleNext, stopPolling]);

  useEffect(() => {
    if (!autoPoll || !isAuthenticated || !token) {
      stopPolling();
      return;
    }

    startPolling();

    return () => {
      stopPolling();
    };
  }, [autoPoll, fetchStatus, isAuthenticated, startPolling, stopPolling, token]);

  const isConnected = status.whatsapp_status === 'open';

  const statusLabel = useMemo(() => {
    if (status.whatsapp_status === 'open') return 'Conectado';
    if (status.whatsapp_status === 'connecting') return 'Conectando';
    if (status.whatsapp_status === 'close') return 'Desconectado';
    return 'Indisponível';
  }, [status.whatsapp_status]);

  return {
    status,
    statusLabel,
    statusLoading,
    connectLoading,
    disconnectLoading,
    qrcodeBase64,
    setQrcodeBase64,
    error,
    lastStatusFetchAt,
    lastStatusRaw,
    fetchStatus,
    connect,
    disconnect,
    isConnected,
    startPolling,
    stopPolling,
    resetAndRunNow
  };
};

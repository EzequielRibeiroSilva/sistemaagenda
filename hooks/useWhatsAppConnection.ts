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

  const fetchStatus = useCallback(async () => {
    if (!isAuthenticated || !token) return;

    setStatusLoading(true);
    setError(null);
    try {
      setLastStatusFetchAt(Date.now());
      const resp = await fetch(`${API_BASE_URL}/whatsapp/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const json = await resp.json().catch(() => null);
      setLastStatusRaw(json);
      if (!resp.ok || !json?.success) {
        setError(json?.message || 'Erro ao buscar status do WhatsApp');
        return;
      }

      setStatus({
        whatsapp_instance_name: json?.data?.whatsapp_instance_name ?? null,
        whatsapp_status: normalizeStatus(json?.data?.whatsapp_status),
        whatsapp_number: json?.data?.whatsapp_number ?? null
      });
    } finally {
      setStatusLoading(false);
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
        setError(json?.message || 'Erro ao conectar WhatsApp');
        return null;
      }

      const qr = json?.data?.qrcodeBase64 || null;
      setQrcodeBase64(qr);

      setStatus(prev => ({
        ...prev,
        whatsapp_instance_name: json?.data?.instanceName ?? prev.whatsapp_instance_name
      }));

      return qr;
    } finally {
      setConnectLoading(false);
    }
  }, [isAuthenticated, token]);

  const startPolling = useCallback(() => {
    const intervalChanged = pollIntervalRef.current !== pollIntervalMs;

    if (pollTimerRef.current && intervalChanged) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (pollTimerRef.current) return;

    pollIntervalRef.current = pollIntervalMs;
    const id = window.setInterval(() => {
      fetchStatus();
    }, pollIntervalMs);
    pollTimerRef.current = id;
  }, [fetchStatus, pollIntervalMs]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!autoPoll || !isAuthenticated || !token) {
      stopPolling();
      return;
    }

    fetchStatus();
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
    stopPolling
  };
};

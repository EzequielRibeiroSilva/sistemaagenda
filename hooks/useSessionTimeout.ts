/**
 * Hook: useSessionTimeout
 * FASE 2.7 - Timeout de Sessão
 * 
 * Gerencia timeout de sessão por inatividade com:
 * - Detecção de atividade do usuário
 * - Renovação automática de token
 * - Aviso antes de expirar
 * - Logout automático
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface SessionTimeoutConfig {
  // Tempo de inatividade antes de avisar (em minutos)
  warningTime?: number;
  // Tempo total de inatividade antes de logout (em minutos)
  logoutTime?: number;
  // Tempo antes da expiração do token para renovar (em minutos)
  renewBeforeExpiry?: number;
  // Eventos que contam como atividade
  activityEvents?: string[];
  // Habilitar logs de debug
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<SessionTimeoutConfig> = {
  warningTime: 25, // Avisar após 25 minutos de inatividade
  logoutTime: 30, // Logout após 30 minutos de inatividade
  renewBeforeExpiry: 10, // Renovar token 10 minutos antes de expirar
  activityEvents: [
    'mousedown',
    'mousemove',
    'keypress',
    'scroll',
    'touchstart',
    'click'
  ],
  debug: false
};

export const useSessionTimeout = (config: SessionTimeoutConfig = {}) => {
  const { isAuthenticated, token, logout, updateToken } = useAuth();
  const { addToast } = useToast();
  
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Refs para timers
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const renewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);
  
  // Log de debug
  const debugLog = useCallback((message: string, data?: any) => {
    if (finalConfig.debug) {
      void message;
      void data;
    }
  }, [finalConfig.debug]);

  /**
   * Renovar token automaticamente
   */
  const renewToken = useCallback(async () => {
    if (!token) return;

    try {
      debugLog('Renovando token...');
      
      // @ts-ignore - Vite env typing
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Atualizar token no AuthContext e localStorage
        updateToken(data.data.token);
        
        debugLog('Token renovado com sucesso');
        
        // Agendar próxima renovação
        scheduleTokenRenewal();
      } else {
        debugLog('Falha ao renovar token, fazendo logout');
        handleLogout('Token expirado');
      }
    } catch (error) {
      debugLog('Erro ao renovar token:', error);
      handleLogout('Erro de conexão');
    }
  }, [token, debugLog]);

  /**
   * Agendar renovação de token
   */
  const scheduleTokenRenewal = useCallback(() => {
    // Limpar timer anterior
    if (renewTimerRef.current) {
      clearTimeout(renewTimerRef.current);
    }

    // Token JWT expira em 2h (configurado no backend)
    // Renovar 10 minutos antes de expirar
    const tokenExpiryMs = 2 * 60 * 60 * 1000; // 2 horas
    const renewBeforeMs = finalConfig.renewBeforeExpiry * 60 * 1000;
    const renewInMs = tokenExpiryMs - renewBeforeMs;

    debugLog(`Agendando renovação de token em ${renewInMs / 1000 / 60} minutos`);

    renewTimerRef.current = setTimeout(() => {
      renewToken();
    }, renewInMs);
  }, [finalConfig.renewBeforeExpiry, renewToken, debugLog]);

  /**
   * Fazer logout com mensagem
   */
  const handleLogout = useCallback((reason: string) => {
    debugLog(`Fazendo logout: ${reason}`);
    
    addToast({
      type: 'warning',
      message: `Sessão encerrada: ${reason}`,
      duration: 5000
    });
    
    logout();
  }, [logout, addToast, debugLog]);

  /**
   * Mostrar aviso de inatividade
   */
  const showInactivityWarning = useCallback(() => {
    if (warningShownRef.current) return;
    
    warningShownRef.current = true;
    
    const remainingMinutes = finalConfig.logoutTime - finalConfig.warningTime;
    
    debugLog(`Mostrando aviso de inatividade (${remainingMinutes} minutos restantes)`);
    
    addToast({
      type: 'warning',
      message: `⚠️ Você está inativo há ${finalConfig.warningTime} minutos. Sua sessão expirará em ${remainingMinutes} minutos.`,
      duration: 10000
    });
  }, [finalConfig.warningTime, finalConfig.logoutTime, addToast, debugLog]);

  /**
   * Resetar timers de inatividade
   */
  const resetInactivityTimers = useCallback(() => {
    // Atualizar timestamp de última atividade
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    
    // Limpar timers existentes
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
    }

    // Agendar aviso de inatividade
    const warningMs = finalConfig.warningTime * 60 * 1000;
    warningTimerRef.current = setTimeout(() => {
      showInactivityWarning();
    }, warningMs);

    // Agendar logout por inatividade
    const logoutMs = finalConfig.logoutTime * 60 * 1000;
    logoutTimerRef.current = setTimeout(() => {
      handleLogout('Inatividade prolongada');
    }, logoutMs);

    debugLog('Timers de inatividade resetados');
  }, [
    finalConfig.warningTime,
    finalConfig.logoutTime,
    showInactivityWarning,
    handleLogout,
    debugLog
  ]);

  /**
   * Handler de atividade do usuário
   */
  const handleActivity = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityRef.current;
    
    // Throttle: só resetar se passou mais de 1 segundo desde a última atividade
    if (timeSinceLastActivity > 1000) {
      resetInactivityTimers();
    }
  }, [resetInactivityTimers]);

  /**
   * Inicializar listeners de atividade
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    debugLog('Inicializando detecção de inatividade', {
      warningTime: finalConfig.warningTime,
      logoutTime: finalConfig.logoutTime,
      renewBeforeExpiry: finalConfig.renewBeforeExpiry
    });

    // Adicionar listeners de atividade
    finalConfig.activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Iniciar timers
    resetInactivityTimers();
    scheduleTokenRenewal();

    // Cleanup
    return () => {
      debugLog('Limpando listeners e timers');
      
      // Remover listeners
      finalConfig.activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });

      // Limpar timers
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (renewTimerRef.current) clearTimeout(renewTimerRef.current);
    };
  }, [
    isAuthenticated,
    finalConfig.activityEvents,
    handleActivity,
    resetInactivityTimers,
    scheduleTokenRenewal,
    debugLog
  ]);

  /**
   * Retornar informações úteis
   */
  return {
    lastActivity: lastActivityRef.current,
    resetTimers: resetInactivityTimers,
    renewToken
  };
};

export default useSessionTimeout;

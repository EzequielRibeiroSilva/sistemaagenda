import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../utils/api';

// Interfaces para gerenciamento de agendamentos
export interface AgendamentoDetalhes {
  id: number;
  status: string;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  valor_total: number;
  observacoes?: string;
  cliente: {
    nome: string;
    telefone: string;
  };
  agente: {
    id?: number;
    nome: string;
    avatar_url?: string;
  };
  unidade: {
    id: number;
    nome: string;
    endereco?: string;
  };
  servicos: {
    id: number;
    nome: string;
    preco: number;
    duracao_minutos: number;
  }[];
  extras: {
    id: number;
    nome: string;
    preco: number;
    duracao_minutos: number;
  }[];
}

export interface ReagendarData {
  telefone: string;
  data_agendamento: string;
  hora_inicio: string;
}

export interface CancelarData {
  telefone: string;
  motivo?: string;
}

export const useManageBooking = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar detalhes do agendamento
  const fetchAgendamento = useCallback(async (id: number, telefone: string): Promise<AgendamentoDetalhes | null> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log(`[useManageBooking] Buscando agendamento #${id}`);

      const response = await fetch(`${API_BASE_URL}/public/agendamento/${id}?telefone=${encodeURIComponent(telefone)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao buscar agendamento');
      }

      if (!data.success) {
        throw new Error(data.message || 'Agendamento não encontrado');
      }

      console.log('[useManageBooking] Agendamento carregado:', data.data);
      return data.data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[useManageBooking] Erro ao buscar agendamento:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reagendar agendamento
  const reagendarAgendamento = useCallback(async (id: number, data: ReagendarData): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log(`[useManageBooking] Reagendando agendamento #${id}`, data);

      const response = await fetch(`${API_BASE_URL}/public/agendamento/${id}/reagendar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || 'Erro ao reagendar agendamento');
      }

      if (!responseData.success) {
        throw new Error(responseData.message || 'Falha ao reagendar agendamento');
      }

      console.log('[useManageBooking] Agendamento reagendado com sucesso');
      return true;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[useManageBooking] Erro ao reagendar agendamento:', errorMessage);
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cancelar agendamento
  const cancelarAgendamento = useCallback(async (id: number, data: CancelarData): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log(`[useManageBooking] Cancelando agendamento #${id}`);

      const response = await fetch(`${API_BASE_URL}/public/agendamento/${id}/cancelar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || 'Erro ao cancelar agendamento');
      }

      if (!responseData.success) {
        throw new Error(responseData.message || 'Falha ao cancelar agendamento');
      }

      console.log('[useManageBooking] Agendamento cancelado com sucesso');
      return true;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[useManageBooking] Erro ao cancelar agendamento:', errorMessage);
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    fetchAgendamento,
    reagendarAgendamento,
    cancelarAgendamento,
  };
};

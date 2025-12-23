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

export interface MutationResult {
  success: boolean;
  error?: string;
}

// Interface para horários de funcionamento da unidade
export interface HorarioFuncionamentoUnidade {
  dia_semana: number;
  is_aberto: boolean;
  horarios_json: { inicio: string; fim: string }[];
}

export const useManageBooking = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseResponse = async (response: Response): Promise<any> => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  };

  // Buscar detalhes do agendamento
  const fetchAgendamento = useCallback(async (id: number, telefone: string): Promise<AgendamentoDetalhes | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/public/agendamento/${id}?telefone=${encodeURIComponent(telefone)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao buscar agendamento');
      }

      if (!data.success) {
        throw new Error(data.message || 'Agendamento não encontrado');
      }

      return data.data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reagendar agendamento
  const reagendarAgendamento = useCallback(async (id: number, data: ReagendarData): Promise<MutationResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/public/agendamento/${id}/reagendar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await parseResponse(response);

      if (!response.ok) {
        throw new Error(responseData.message || 'Erro ao reagendar agendamento');
      }

      if (!responseData.success) {
        throw new Error(responseData.message || 'Falha ao reagendar agendamento');
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cancelar agendamento
  const cancelarAgendamento = useCallback(async (id: number, data: CancelarData): Promise<MutationResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/public/agendamento/${id}/cancelar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await parseResponse(response);

      if (!response.ok) {
        throw new Error(responseData.message || 'Erro ao cancelar agendamento');
      }

      if (!responseData.success) {
        throw new Error(responseData.message || 'Falha ao cancelar agendamento');
      }

      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ✅ NOVO: Buscar horários de funcionamento da unidade
  const fetchHorariosUnidade = useCallback(async (unidadeId: number): Promise<HorarioFuncionamentoUnidade[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/public/salao/${unidadeId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        return [];
      }

      // Retornar horários de funcionamento da unidade
      const horarios = data.data?.horarios_unidade || [];
      return horarios;

    } catch (err) {
      return [];
    }
  }, []);

  return {
    isLoading,
    error,
    fetchAgendamento,
    reagendarAgendamento,
    cancelarAgendamento,
    fetchHorariosUnidade, // ✅ NOVO: Exportar função
  };
};

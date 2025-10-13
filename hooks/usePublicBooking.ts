import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Interfaces para dados da API pública
export interface PublicUnidade {
  id: number;
  nome: string;
  endereco: string;
  telefone: string;
  slug_url: string;
}

export interface PublicAgente {
  id: number;
  nome: string;
  nome_exibicao?: string;
  biografia?: string;
  avatar_url?: string;
}

export interface PublicServico {
  id: number;
  nome: string;
  descricao?: string;
  preco: number;
  duracao_minutos: number;
  categoria_id?: number;
}

export interface PublicConfiguracoes {
  nome_negocio: string;
  logo_url?: string;
  duracao_servico_horas: number;
  tempo_limite_agendar_horas: number;
  permitir_cancelamento: boolean;
  tempo_limite_cancelar_horas: number;
  periodo_futuro_dias: number;
}

export interface HorarioFuncionamento {
  dia_semana: number;
  horarios_json: { inicio: string; fim: string }[];
  is_aberto: boolean;
}

export interface SalonData {
  unidade: PublicUnidade;
  configuracoes: PublicConfiguracoes;
  agentes: PublicAgente[];
  servicos: PublicServico[];
  horarios_funcionamento: HorarioFuncionamento[];
}

export interface SlotDisponivel {
  hora_inicio: string;
  hora_fim: string;
  disponivel: boolean;
}

export interface DisponibilidadeData {
  agente_id: number;
  data: string;
  dia_semana: number;
  slots_disponiveis: SlotDisponivel[];
}

export interface AgendamentoData {
  unidade_id: number;
  agente_id: number;
  servico_ids: number[];
  data_agendamento: string;
  hora_inicio: string;
  cliente_nome: string;
  cliente_telefone: string;
  observacoes?: string;
}

export interface AgendamentoCriado {
  agendamento_id: number;
  cliente: { nome: string; telefone: string };
  agente: { nome: string };
  unidade: { nome: string };
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  valor_total: number;
  servicos: { nome: string; preco: number }[];
}

export const usePublicBooking = () => {
  const [salonData, setSalonData] = useState<SalonData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar dados do salão por unidade_id
  const loadSalonData = useCallback(async (unidadeId: number) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`[usePublicBooking] Carregando dados da unidade ${unidadeId}`);
      
      const response = await fetch(`${API_BASE_URL}/public/salao/${unidadeId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao carregar dados do salão');
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Dados do salão não encontrados');
      }
      
      setSalonData(data.data);
      console.log(`[usePublicBooking] Dados carregados: ${data.data.agentes.length} agentes, ${data.data.servicos.length} serviços`);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[usePublicBooking] Erro ao carregar dados:', errorMessage);
      setError(errorMessage);
      setSalonData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Buscar unidade por slug
  const findUnidadeBySlug = useCallback(async (slug: string): Promise<{ unidade_id: number; nome: string } | null> => {
    try {
      console.log(`[usePublicBooking] Buscando unidade por slug: ${slug}`);
      
      const response = await fetch(`${API_BASE_URL}/public/salao/slug/${slug}`);
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        return null;
      }
      
      return {
        unidade_id: data.data.unidade_id,
        nome: data.data.nome
      };
      
    } catch (err) {
      console.error('[usePublicBooking] Erro ao buscar por slug:', err);
      return null;
    }
  }, []);

  // Buscar disponibilidade de um agente
  const getAgenteDisponibilidade = useCallback(async (agenteId: number, data: string): Promise<DisponibilidadeData | null> => {
    try {
      console.log(`[usePublicBooking] Buscando disponibilidade do agente ${agenteId} para ${data}`);
      
      const response = await fetch(`${API_BASE_URL}/public/agentes/${agenteId}/disponibilidade?data=${data}`);
      const responseData = await response.json();
      
      if (!response.ok || !responseData.success) {
        console.warn('[usePublicBooking] Erro na disponibilidade:', responseData.message);
        return null;
      }
      
      return responseData.data;
      
    } catch (err) {
      console.error('[usePublicBooking] Erro ao buscar disponibilidade:', err);
      return null;
    }
  }, []);

  // Criar agendamento
  const createAgendamento = useCallback(async (agendamentoData: AgendamentoData): Promise<AgendamentoCriado | null> => {
    try {
      console.log('[usePublicBooking] Criando agendamento:', agendamentoData);
      
      const response = await fetch(`${API_BASE_URL}/public/agendamento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agendamentoData),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao criar agendamento');
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Falha ao criar agendamento');
      }
      
      console.log('[usePublicBooking] Agendamento criado com sucesso:', data.data.agendamento_id);
      return data.data;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[usePublicBooking] Erro ao criar agendamento:', errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  return {
    salonData,
    isLoading,
    error,
    loadSalonData,
    findUnidadeBySlug,
    getAgenteDisponibilidade,
    createAgendamento,
  };
};

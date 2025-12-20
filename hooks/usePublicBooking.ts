import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Interfaces para dados da API pública
export interface PublicUnidade {
  id: number;
  nome: string;
  endereco: string;
  telefone: string;
  slug_url: string;
  usuario_id?: number; // ✅ CRÍTICO: ID do usuário ADMIN dono da unidade
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

export interface PublicExtra {
  id: number;
  name: string;
  description?: string;
  price: number;
  duration: number;
  category?: string;
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

export interface HorarioAgente {
  agente_id: number;
  dia_semana: number;
  ativo: boolean;
  periodos: { inicio: string; fim: string }[];
}

export interface HorarioUnidade {
  dia_semana: number;
  is_aberto: boolean;
  horarios_json: { inicio: string; fim: string }[];
}

export interface PublicAgenteServico {
  agente_id: number;
  servico_id: number;
}

export interface PublicServicoExtra {
  servico_id: number;
  servico_extra_id: number;
}

export interface SalonData {
  unidade: PublicUnidade;
  configuracoes: PublicConfiguracoes;
  agentes: PublicAgente[];
  servicos: PublicServico[];
  extras: PublicExtra[];
  agente_servicos: PublicAgenteServico[];
  servico_extras: PublicServicoExtra[];
  horarios_agentes: HorarioAgente[];
  horarios_unidade: HorarioUnidade[]; // ✅ CRÍTICO: Horários da unidade para interseção
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
  const [availableLocations, setAvailableLocations] = useState<PublicUnidade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ✅ NOVO: Armazenar usuario_id quando unidade não está disponível (para buscar alternativas)
  const [unavailableUsuarioId, setUnavailableUsuarioId] = useState<number | null>(null);

  // Carregar dados do salão por unidade_id
  const loadSalonData = useCallback(async (unidadeId: number) => {
    setIsLoading(true);
    setError(null);
    setUnavailableUsuarioId(null);

    try {
      const response = await fetch(`${API_BASE_URL}/public/salao/${unidadeId}`);
      const data = await response.json();

      if (!response.ok) {
        // ✅ CORREÇÃO: Capturar usuario_id quando unidade não está disponível
        if (data.usuario_id) {
          setUnavailableUsuarioId(data.usuario_id);
        }
        throw new Error(data.message || 'Erro ao carregar dados do salão');
      }

      if (!data.success) {
        throw new Error(data.message || 'Dados do salão não encontrados');
      }

      setSalonData(data.data);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      setSalonData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Buscar unidade por slug
  const findUnidadeBySlug = useCallback(async (slug: string): Promise<{ unidade_id: number; nome: string } | null> => {
    try {
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
      return null;
    }
  }, []);

  // Buscar disponibilidade de um agente com duração dinâmica
  // ✅ CRÍTICO: Adicionado parâmetro unidadeId para suportar agentes multi-unidade
  // ✅ CRÍTICO: Adicionado parâmetro excludeAgendamentoId para excluir agendamento atual (reagendamento)
  const getAgenteDisponibilidade = useCallback(async (agenteId: number, data: string, duracaoMinutos?: number, unidadeId?: number, excludeAgendamentoId?: number): Promise<DisponibilidadeData | null> => {
    try {
      // ✅ CORREÇÃO: Construir URL corretamente usando URLSearchParams
      // A URL relativa /api precisa usar window.location.origin como base
      const baseUrl = API_BASE_URL.startsWith('http')
        ? API_BASE_URL
        : `${window.location.origin}${API_BASE_URL}`;

      const params = new URLSearchParams();
      params.set('data', data);
      if (duracaoMinutos) {
        params.set('duration', duracaoMinutos.toString());
      }
      if (unidadeId) {
        params.set('unidade_id', unidadeId.toString());
      }
      if (excludeAgendamentoId) {
        params.set('exclude_agendamento_id', excludeAgendamentoId.toString());
      }

      const fullUrl = `${baseUrl}/public/agentes/${agenteId}/disponibilidade?${params.toString()}`;
      console.log('🌐 [getAgenteDisponibilidade] URL:', fullUrl);

      const response = await fetch(fullUrl);
      const responseData = await response.json();

      console.log('🌐 [getAgenteDisponibilidade] Response status:', response.status);
      console.log('🌐 [getAgenteDisponibilidade] Response data:', responseData);

      if (!response.ok || !responseData.success) {
        console.error('🌐 [getAgenteDisponibilidade] Erro na resposta:', responseData);
        return null;
      }

      return responseData.data;

    } catch (err) {
      console.error('🌐 [getAgenteDisponibilidade] Exceção:', err);
      return null;
    }
  }, []);

  // Criar agendamento
  const createAgendamento = useCallback(async (agendamentoData: AgendamentoData): Promise<AgendamentoCriado | null> => {
    try {
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
      
      return data.data;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      throw new Error(errorMessage);
    }
  }, []);

  // Buscar extras filtrados por serviços selecionados
  const getExtrasByServices = useCallback(async (unidadeId: number, servicoIds: number[]): Promise<PublicExtra[]> => {
    try {
      const servicoIdsStr = servicoIds.join(',');
      const response = await fetch(`${API_BASE_URL}/public/salao/${unidadeId}/extras?servico_ids=${servicoIdsStr}`);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao buscar extras');
      }

      if (!data.success) {
        throw new Error(data.message || 'Falha ao buscar extras');
      }

      return data.data;

    } catch (err) {
      return [];
    }
  }, []);

  // Buscar todos os locais disponíveis por usuario_id (extraído da primeira unidade)
  const loadAvailableLocations = useCallback(async (usuarioId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/public/usuario/${usuarioId}/unidades`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao carregar locais');
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Falha ao carregar locais');
      }
      
      setAvailableLocations(data.data);
      return data.data;
      
    } catch (err) {
      setAvailableLocations([]);
      return [];
    }
  }, []);

  return {
    salonData,
    availableLocations,
    isLoading,
    error,
    unavailableUsuarioId, // ✅ NOVO: Permitir buscar alternativas quando unidade não está disponível
    loadSalonData,
    loadAvailableLocations,
    findUnidadeBySlug,
    getAgenteDisponibilidade,
    createAgendamento,
    getExtrasByServices,
  };
};

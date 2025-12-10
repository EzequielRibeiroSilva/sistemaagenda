/**
 * Custom Hook: useSettingsManagement
 * Descrição: Gerencia configurações do sistema (RUD - Read, Update, Delete)
 * Funcionalidades: Carregamento, atualização, upload de logo, alteração de senha
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../utils/api';

// Interfaces
export interface SystemSettings {
  unidade_id: number;
  nome_negocio: string;
  logo_url?: string;
  duracao_servico_horas: number;
  tempo_limite_agendar_horas: number;
  permitir_cancelamento: boolean;
  tempo_limite_cancelar_horas: number;
  periodo_futuro_dias: number;
  // Sistema de Pontos
  pontos_ativo?: boolean;
  pontos_por_real?: number;
  reais_por_pontos?: number;
  pontos_validade_meses?: number;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateSettingsData {
  nome_negocio?: string;
  logo_url?: string;
  duracao_servico_horas?: number;
  tempo_limite_agendar_horas?: number;
  permitir_cancelamento?: boolean;
  tempo_limite_cancelar_horas?: number;
  periodo_futuro_dias?: number;
}

export interface PasswordChangeData {
  senha_atual: string;
  nova_senha: string;
  confirmacao_senha: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message: string;
  error?: string;
}

export const useSettingsManagement = () => {
  const { user, token } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Função para fazer requisições autenticadas
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!token) {
      throw new Error('Token de autenticação não encontrado');
    }

    const fullUrl = `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
    }

    return response.json();
  }, [token]);

  // Carregar configurações
  const loadSettings = useCallback(async () => {
    if (!user) {
      setError('Usuário não autenticado');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<SystemSettings> = await authenticatedFetch('/settings');
      
      if (response.success && response.data) {
        setSettings(response.data);
      } else {
        throw new Error(response.message || 'Erro ao carregar configurações');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [user, authenticatedFetch]);

  // Atualizar configurações
  const updateSettings = useCallback(async (data: UpdateSettingsData) => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<SystemSettings> = await authenticatedFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      });

      if (response.success && response.data) {
        setSettings(response.data);
        return response.data;
      } else {
        throw new Error(response.message || 'Erro ao atualizar configurações');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, authenticatedFetch]);

  // Upload de logo
  const uploadLogo = useCallback(async (file: File) => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    if (!token) {
      throw new Error('Token de autenticação não encontrado');
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const response = await fetch(`${API_BASE_URL}/settings/logo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }

      const result: ApiResponse<{ logo_url: string; filename: string }> = await response.json();

      if (result.success && result.data) {
        // Atualizar configurações locais com nova URL do logo
        if (settings) {
          const updatedSettings = { ...settings, logo_url: result.data.logo_url };
          setSettings(updatedSettings);
        }
        return result.data;
      } else {
        throw new Error(result.message || 'Erro ao fazer upload do logo');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, token, settings]);

  // Alterar senha
  const changePassword = useCallback(async (passwordData: PasswordChangeData) => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<any> = await authenticatedFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(passwordData),
      });

      if (response.success) {
        return response;
      } else {
        throw new Error(response.message || 'Erro ao alterar senha');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, authenticatedFetch]);

  // Gerar link de agendamento
  const generateBookingLink = useCallback(() => {
    if (!user?.unidade_id || !settings?.nome_negocio) {
      return '';
    }

    // Gerar slug do nome do negócio
    const slug = settings.nome_negocio
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-') // Substitui espaços por hífens
      .replace(/-+/g, '-') // Remove hífens duplicados
      .trim('-'); // Remove hífens do início e fim

    return `${window.location.origin}/${slug}/booking/${user.unidade_id}`;
  }, [user?.unidade_id, settings?.nome_negocio]);

  // Copiar link para clipboard
  const copyBookingLink = useCallback(async () => {
    const link = generateBookingLink();
    if (link) {
      try {
        await navigator.clipboard.writeText(link);
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }, [generateBookingLink]);

  // Função unificada para salvar todas as definições
  const saveAllSettings = useCallback(async (data: {
    // Configurações
    nome_negocio?: string;
    duracao_servico_horas?: number;
    tempo_limite_agendar_horas?: number;
    permitir_cancelamento?: boolean;
    tempo_limite_cancelar_horas?: number;
    periodo_futuro_dias?: number;
    // Sistema de Pontos
    pontos_ativo?: boolean;
    pontos_por_real?: number;
    reais_por_pontos?: number;
    pontos_validade_meses?: number;
    // Logo
    logoFile?: File;
    // Senha
    senha_atual?: string;
    nova_senha?: string;
    confirmacao_senha?: string;
  }) => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    setLoading(true);
    setError(null);

    try {
      // Criar FormData para suportar multipart/form-data
      const formData = new FormData();

      // Adicionar configurações
      if (data.nome_negocio !== undefined) formData.append('nome_negocio', data.nome_negocio);
      if (data.duracao_servico_horas !== undefined) formData.append('duracao_servico_horas', data.duracao_servico_horas.toString());
      if (data.tempo_limite_agendar_horas !== undefined) formData.append('tempo_limite_agendar_horas', data.tempo_limite_agendar_horas.toString());
      if (data.permitir_cancelamento !== undefined) formData.append('permitir_cancelamento', data.permitir_cancelamento.toString());
      if (data.tempo_limite_cancelar_horas !== undefined) formData.append('tempo_limite_cancelar_horas', data.tempo_limite_cancelar_horas.toString());
      if (data.periodo_futuro_dias !== undefined) formData.append('periodo_futuro_dias', data.periodo_futuro_dias.toString());

      // Adicionar configurações de pontos
      if (data.pontos_ativo !== undefined) formData.append('pontos_ativo', data.pontos_ativo.toString());
      if (data.pontos_por_real !== undefined) formData.append('pontos_por_real', data.pontos_por_real.toString());
      if (data.reais_por_pontos !== undefined) formData.append('reais_por_pontos', data.reais_por_pontos.toString());
      if (data.pontos_validade_meses !== undefined) formData.append('pontos_validade_meses', data.pontos_validade_meses.toString());

      // Adicionar logo (se houver)
      if (data.logoFile) {
        formData.append('logo', data.logoFile);
      }

      // Adicionar senha (se houver)
      if (data.senha_atual && data.nova_senha && data.confirmacao_senha) {
        formData.append('senha_atual', data.senha_atual);
        formData.append('nova_senha', data.nova_senha);
        formData.append('confirmacao_senha', data.confirmacao_senha);
      }

      // Fazer requisição unificada
      const response = await fetch(`${API_BASE_URL}/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          // NÃO definir Content-Type para multipart/form-data (o browser define automaticamente)
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }

      const result: ApiResponse<SystemSettings> = await response.json();

      if (result.success && result.data) {
        setSettings(result.data);
        return result.data;
      } else {
        throw new Error(result.message || 'Erro ao salvar definições');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  return {
    // Estado
    settings,
    loading,
    error,

    // Ações
    loadSettings,
    updateSettings,
    uploadLogo,
    changePassword,
    saveAllSettings, // Nova função unificada

    // Utilitários
    generateBookingLink,
    copyBookingLink,

    // Limpar erro
    clearError: () => setError(null),
  };
};

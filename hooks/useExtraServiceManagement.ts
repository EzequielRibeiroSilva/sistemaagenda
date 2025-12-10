import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ExtraService {
  id: number;
  nome: string;
  descricao?: string;
  duracao_minutos: number;
  preco: number | string; // Backend pode retornar como string
  quantidade_maxima: number;
  status: 'Ativo' | 'Inativo';
  usuario_id: number;
  servicos_conectados?: Array<{ id: number; nome: string }>;
  servicos_conectados_ids?: number[];
}

interface Service {
  id: number;
  nome: string;
  preco: number;
}

interface CreateExtraServiceData {
  nome: string;
  descricao?: string;
  duracao_minutos: number;
  preco: number;
  quantidade_maxima: number;
  status: 'Ativo' | 'Inativo';
  servicos_conectados: number[];
}

interface UpdateExtraServiceData extends CreateExtraServiceData {
  id: number;
}

export const useExtraServiceManagement = () => {
  const { token, isAuthenticated } = useAuth();
  const [extraServices, setExtraServices] = useState<ExtraService[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar lista leve de serviços extras
  const fetchExtraServices = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setExtraServices([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('http://localhost:3000/api/servicos/extras', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        const extraServicesData = Array.isArray(data.data) ? data.data : [];
        setExtraServices(extraServicesData);
      } else {
        throw new Error(data.message || 'Erro ao carregar serviços extras');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro desconhecido');
      setExtraServices([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Buscar lista de serviços principais (para conectar aos extras)
  const fetchServices = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setServices([]);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/servicos/list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        const servicesData = Array.isArray(data.data) ? data.data : [];
        setServices(servicesData);
      } else {
        throw new Error(data.message || 'Erro ao carregar serviços');
      }
    } catch (error) {
      setServices([]);
    }
  }, [isAuthenticated, token]);

  // Buscar serviço extra específico (para edição)
  const fetchExtraService = useCallback(async (id: number): Promise<ExtraService | null> => {
    if (!isAuthenticated || !token) {
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3000/api/servicos/extras/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message || 'Erro ao carregar serviço extra');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro desconhecido');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Criar novo serviço extra
  const createExtraService = useCallback(async (extraServiceData: CreateExtraServiceData) => {
    if (!isAuthenticated || !token) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('http://localhost:3000/api/servicos/extras', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(extraServiceData)
      });

      const data = await response.json();

      if (data.success) {
        return { success: true, data: data.data };
      } else {
        throw new Error(data.message || 'Erro ao criar serviço extra');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Atualizar serviço extra
  const updateExtraService = useCallback(async (id: number, extraServiceData: Partial<CreateExtraServiceData>) => {
    if (!isAuthenticated || !token) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3000/api/servicos/extras/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(extraServiceData)
      });

      const data = await response.json();

      if (data.success) {
        return { success: true, data: data.data };
      } else {
        throw new Error(data.message || 'Erro ao atualizar serviço extra');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Deletar serviço extra
  const deleteExtraService = useCallback(async (id: number) => {
    if (!isAuthenticated || !token) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3000/api/servicos/extras/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        return { success: true };
      } else {
        throw new Error(data.message || 'Erro ao deletar serviço extra');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Effect inicial para carregar dados
  useEffect(() => {
    let isMounted = true;

    if (isAuthenticated && token) {
      const loadData = async () => {
        try {
          if (isMounted) await fetchServices();
          if (isMounted) await fetchExtraServices();
        } catch (error) {
          // Erro ao carregar dados iniciais
        }
      };
      loadData();
    } else {
      if (isMounted) {
        setExtraServices([]);
        setServices([]);
        setError(null);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, token, fetchServices, fetchExtraServices]);

  return {
    extraServices,
    services,
    loading,
    error,
    fetchExtraServices,
    fetchServices,
    fetchExtraService,
    createExtraService,
    updateExtraService,
    deleteExtraService
  };
};
